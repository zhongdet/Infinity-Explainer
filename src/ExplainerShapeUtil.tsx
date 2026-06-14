import {
  BaseBoxShapeUtil,
  HTMLContainer,
  createShapeId,
  useEditor,
} from 'tldraw'
import { T } from 'tldraw'
import type {
  RecordProps,
  TLBaseShape,
  TLShapeId,
} from 'tldraw'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tokenizer } from './core/Tokenizer'
import { getClickableTerms } from './core/types'
import type { ExplainerShapeProps, TextSegment } from './core/types'
import { SelectionPopover } from './components/SelectionPopover'
import { termRegistry, llmService } from './core/services'

/* ============================================================
   Shape Type Definition
   ============================================================ */

export type ExplainerShape = TLBaseShape<'explainer', ExplainerShapeProps>

export const explainerShapeProps: RecordProps<ExplainerShape> = {
  text: T.string,
  w: T.number,
  h: T.number,
  terms: T.arrayOf(T.string),
  userTerms: T.arrayOf(T.string),
}

/* ============================================================
   SectorSearch — 碰撞避讓演算法
   ============================================================ */

function boundsCollide(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  extraPadding = 0,
) {
  const PADDING = 40 + extraPadding
  return !(
    a.maxX + PADDING < b.minX ||
    a.minX - PADDING > b.maxX ||
    a.maxY + PADDING < b.minY ||
    a.minY - PADDING > b.maxY
  )
}

function findPosition(
  centerX: number,
  centerY: number,
  baseAngle: number,
  checkCollision: (cx: number, cy: number) => boolean,
  initialRadius = 0,
): { x: number; y: number } | null {
  let radius = initialRadius || 140
  let searchStep = 0
  const maxAttempts = 1000
  const sweepRange = Math.PI * 0.8
  const radiusStep = 4
  const angleSpeed = 0.15

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const angleOffset = Math.sin(searchStep * 2) * (sweepRange / 2)
    const currentAngle = baseAngle + angleOffset
    const cx = centerX + Math.cos(currentAngle) * radius
    const cy = centerY + Math.sin(currentAngle) * radius

    if (!checkCollision(cx, cy)) {
      return { x: cx, y: cy }
    }

    radius += radiusStep
    searchStep += angleSpeed
  }
  return null
}

/* ============================================================
   RichTextRenderer
   ============================================================ */

interface RichTextRendererProps {
  segments: TextSegment[]
  clickableTerms: Set<string>
  onTermClick: (term: string, e: React.PointerEvent) => void
}

const RichTextRenderer = ({
  segments,
  clickableTerms,
  onTermClick,
}: RichTextRendererProps) => {
  return (
    <div style={{ whiteSpace: 'pre-wrap', pointerEvents: 'none' }}>
      {segments.map((seg, i) => {
        const isClickable = seg.isTerm || seg.isUserTerm
        const isMatched = isClickable && clickableTerms.has(seg.text)
        if (isClickable) {
          return (
            <span
              key={i}
              data-term={seg.text}
              style={{
                color: isMatched ? '#2563eb' : '#6b7280',
                backgroundColor: isMatched ? '#eff6ff' : '#f3f4f6',
                padding: '2px 4px',
                borderRadius: 4,
                cursor: isMatched ? 'pointer' : 'default',
                fontWeight: 600,
                pointerEvents: isMatched ? 'all' : 'none',
              }}
              onPointerDown={(e) => {
                if (isMatched) onTermClick(seg.text, e)
              }}
            >
              {seg.text}
            </span>
          )
        }
        return <span key={i}>{seg.text}</span>
      })}
    </div>
  )
}

/* ============================================================
   LoadingOverlay
   ============================================================ */

const LoadingOverlay = ({ term }: { term: string }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(255,255,255,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      zIndex: 10,
      fontSize: 14,
      color: '#2563eb',
      fontWeight: 500,
      pointerEvents: 'all',
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="loading-spinner" />
      正在解釋「{term}」…
    </span>
  </div>
)

/* ============================================================
   Shape Component
   ============================================================ */

function ExplainerShapeComponent({ shape }: { shape: ExplainerShape }) {
  const editor = useEditor()
  const tokenizerRef = useRef(new Tokenizer())
  const [loadingTerm, setLoadingTerm] = useState<string | null>(null)
  const [selectionState, setSelectionState] = useState<{
    text: string
    rect: DOMRect
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // 目前 shape 的所有可點擊詞彙
  const allTerms = useMemo(
    () => getClickableTerms(shape.props),
    [shape.props.terms, shape.props.userTerms],
  )
  const clickableTermSet = useMemo<Set<string>>(
    () => new Set(allTerms),
    [allTerms],
  )

  // Tokenize 文字
  const segments = useMemo<TextSegment[]>(
    () => tokenizerRef.current.tokenize(shape.props.text, allTerms),
    [shape.props.text, allTerms],
  )

  // 向 TermRegistry 註冊/清除此 shape 的詞彙
  useEffect(() => {
    termRegistry.registerAll(allTerms, shape.id)
    return () => {
      termRegistry.deregisterShape(shape.id)
    }
  }, [shape.id, allTerms, termRegistry])

  /* ---- Flow A: 點擊名詞 → LLM 解釋 → 新 Shape + AnimatedLine ---- */
  const handleTermClick = useCallback(
    async (term: string, e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()

      if (loadingTerm) return

      // ⚠️ Capture click position SYNCHRONOUSLY before any async work.
      // After `await`, editor.inputs.currentPagePoint is stale (mouse moved).
      const clickPagePoint = { ...editor.inputs.currentPagePoint }
      const sourceBounds = editor.getShapePageBounds(shape.id as TLShapeId)
      if (!sourceBounds) return

      const searchCenterX = sourceBounds.minX + sourceBounds.width / 2
      const searchCenterY = sourceBounds.minY + sourceBounds.height / 2

      // baseAngle in page space, matching getShapePageBounds & SectorSearch
      const baseAngle = Math.atan2(
        clickPagePoint.y - searchCenterY,
        clickPagePoint.x - searchCenterX,
      )

      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort

      setLoadingTerm(term)

      try {
        const result = await llmService.explain(term)
        if (abort.signal.aborted) return

        const W = 360
        const H = 240

        const shapes = editor.getCurrentPageShapes()
        const checkCollision = (cx: number, cy: number) => {
          const testBounds = {
            minX: cx - W / 2,
            minY: cy - H / 2,
            maxX: cx + W / 2,
            maxY: cy + H / 2,
          }
          for (const s of shapes) {
            if ((s.type as string) === 'explainer' && s.id !== shape.id) {
              const b = editor.getShapePageBounds(s)
              if (b && boundsCollide(testBounds, b)) return true
            }
          }
          return false
        }

        const initialRadius =
          Math.max(sourceBounds.width, sourceBounds.height) / 2 + 50
        const pos = findPosition(
          searchCenterX,
          searchCenterY,
          baseAngle,
          checkCollision,
          initialRadius,
        )

        const newX = pos ? pos.x - W / 2 : searchCenterX + 150
        const newY = pos ? pos.y - H / 2 : searchCenterY + 100

        if (abort.signal.aborted) return

        // 建立新 ExplainerShape
        const newShapeId = createShapeId()
        editor.createShape({
          id: newShapeId,
          type: 'explainer' as any,
          x: newX,
          y: newY,
          props: {
            text: `【${term}】\n\n${result.explanation}`,
            w: W,
            h: H,
            terms: result.technical_terms,
            userTerms: [] as string[],
          },
        })

        if (abort.signal.aborted) return

        // Flow C: 建立連接線 — anchor 基於同步 capture 的 clickPagePoint
        const srcShape = editor.getShape(shape.id as TLShapeId)
        const localPoint = srcShape
          ? editor.getPointInShapeSpace(srcShape, clickPagePoint)
          : { x: 0, y: 0 }
        const sourceW = shape.props.w
        const sourceH = shape.props.h
        const anchorX = sourceW > 0 ? localPoint.x / sourceW : 0.5
        const anchorY = sourceH > 0 ? localPoint.y / sourceH : 0.5

        editor.createShape({
          id: createShapeId(),
          type: 'animatedLine' as any,
          x: 0,
          y: 0,
          props: {
            startId: shape.id,
            endId: newShapeId,
            startAnchorX: anchorX,
            startAnchorY: anchorY,
            endAnchorX: 0.5,
            endAnchorY: 0.5,
          },
        })
      } catch (err: unknown) {
        if (abort.signal.aborted) return
        console.error('LLM explain error:', err)
        // 顯示錯誤在一個新 shape 上
        const errShapeId = createShapeId()
        editor.createShape({
          id: errShapeId,
          type: 'explainer' as any,
          x: clickPagePoint.x + 20,
          y: clickPagePoint.y + 20,
          props: {
            text: `【${term}】\n\n⚠️ 解釋失敗：${err instanceof Error ? err.message : String(err)}`,
            w: 360,
            h: 180,
            terms: [] as string[],
            userTerms: [] as string[],
          },
        })
      } finally {
        if (!abort.signal.aborted) {
          setLoadingTerm(null)
        }
      }
    },
    [editor, llmService, shape.id, shape.props.w, shape.props.h, loadingTerm],
  )

  /* ---- Flow B: 選取文字 → SelectionPopover ---- */
  const handlePointerUpCapture = useCallback(
    (e: React.PointerEvent) => {
      if (loadingTerm) return
      if (selectionState) return

      const target = e.target as HTMLElement
      if (target.dataset?.term) return

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) return

      const container = containerRef.current
      if (!container || !container.contains(sel.anchorNode)) return

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      e.preventDefault()
      e.stopPropagation()

      setSelectionState({
        text: sel.toString().trim(),
        rect,
      })
    },
    [loadingTerm, selectionState],
  )

  const handleSelectionConfirm = useCallback(
    (text: string) => {
      const shapeData = editor.getShape(shape.id as TLShapeId)
      if (!shapeData) return

      const currentUserTerms: string[] = (shapeData.props as any).userTerms ?? []
      const currentTerms: string[] = (shapeData.props as any).terms ?? []
      if (!currentUserTerms.includes(text) && !currentTerms.includes(text)) {
        editor.updateShape({
          id: shape.id as TLShapeId,
          type: 'explainer' as any,
          props: { userTerms: [...currentUserTerms, text] },
        })
      }
      setSelectionState(null)
      window.getSelection()?.removeAllRanges()
    },
    [editor, shape.id],
  )

  const handleSelectionClose = useCallback(() => {
    setSelectionState(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  /* ---- Render ---- */
  // Use a wrapper div inside HTMLContainer to get a ref
  return (
    <HTMLContainer
      id={shape.id}
      className="animate-pop"
      style={{
        border: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        padding: 24,
        boxShadow:
          '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        borderRadius: 12,
        overflow: 'auto',
        fontSize: 16,
        lineHeight: 1.6,
        fontFamily: 'system-ui, sans-serif',
        color: '#1f2937',
        width: '100%',
        height: '100%',
        pointerEvents: 'all',
        boxSizing: 'border-box',
        position: 'relative',
      }}
      onPointerUpCapture={handlePointerUpCapture}
    >
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        {loadingTerm && <LoadingOverlay term={loadingTerm} />}
        <RichTextRenderer
          segments={segments}
          clickableTerms={clickableTermSet}
          onTermClick={handleTermClick}
        />
        {selectionState && (
          <SelectionPopover
            selectedText={selectionState.text}
            selectionRect={selectionState.rect}
            onConfirm={handleSelectionConfirm}
            onClose={handleSelectionClose}
          />
        )}
      </div>
    </HTMLContainer>
  )
}

/* ============================================================
   Shape Util Class
   ============================================================ */

export class ExplainerShapeUtil extends BaseBoxShapeUtil<any> {
  static type = 'explainer' as const
  static props = explainerShapeProps

  getDefaultProps(): ExplainerShape['props'] {
    return {
      text: '',
      w: 340,
      h: 220,
      terms: [],
      userTerms: [],
    }
  }

  component(shape: ExplainerShape) {
    return <ExplainerShapeComponent shape={shape} />
  }

  indicator(shape: ExplainerShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={12}
        ry={12}
      />
    )
  }
}
