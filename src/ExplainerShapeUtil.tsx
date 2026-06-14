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
    <div style={{ whiteSpace: 'pre-wrap' }}>
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
                pointerEvents: 'all',
                userSelect: 'text',
              }}
              onPointerDown={(e) => {
                if (isMatched) onTermClick(seg.text, e)
                // Non-matched terms still need to prevent reaching tldraw
                e.stopPropagation()
              }}
            >
              {seg.text}
            </span>
          )
        }
        return (
          <span
            key={i}
            style={{ userSelect: 'text', pointerEvents: 'all' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {seg.text}
          </span>
        )
      })}
    </div>
  )
}

/* ============================================================
   Shape Component
   ============================================================ */

function ExplainerShapeComponent({ shape }: { shape: ExplainerShape }) {
  const editor = useEditor()
  const tokenizerRef = useRef(new Tokenizer())
  const [loadingTerm, setLoadingTerm] = useState<string | null>(null)
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

  /* ---- Flow A: 點擊名詞 → 立即建立 Shape + 串流 LLM 解釋 ---- */
  const handleTermClick = useCallback(
    async (term: string, e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (loadingTerm) return

      // 1. Capture click position SYNCHRONOUSLY (before any async work)
      const clickPagePoint = { ...editor.inputs.currentPagePoint }
      const sourceBounds = editor.getShapePageBounds(shape.id as TLShapeId)
      if (!sourceBounds) return

      const searchCenterX = sourceBounds.minX + sourceBounds.width / 2
      const searchCenterY = sourceBounds.minY + sourceBounds.height / 2

      const baseAngle = Math.atan2(
        clickPagePoint.y - searchCenterY,
        clickPagePoint.x - searchCenterX,
      )

      // 2. Calculate position immediately (SectorSearch)
      const W = 360
      const H = 240

      const currentShapes = editor.getCurrentPageShapes()
      const checkCollision = (cx: number, cy: number) => {
        const testBounds = {
          minX: cx - W / 2,
          minY: cy - H / 2,
          maxX: cx + W / 2,
          maxY: cy + H / 2,
        }
        for (const s of currentShapes) {
          if ((s.type as string) === 'explainer' && s.id !== shape.id) {
            const b = editor.getShapePageBounds(s)
            if (b && boundsCollide(testBounds, b)) return true
          }
        }
        return false
      }

      const initialRadius =
        Math.max(sourceBounds.width, sourceBounds.height) / 2 + 50
      const pos = findPosition(searchCenterX, searchCenterY, baseAngle, checkCollision, initialRadius)

      const newX = pos ? pos.x - W / 2 : searchCenterX + 150
      const newY = pos ? pos.y - H / 2 : searchCenterY + 100

      // 3. IMMEDIATELY create the shape (placeholder, no LLM yet)
      const newShapeId = createShapeId()
      const header = `【${term}】\n\n`
      editor.createShape({
        id: newShapeId,
        type: 'explainer' as any,
        x: newX,
        y: newY,
        props: {
          text: header + '⋯ 正在生成解釋',
          w: W,
          h: H,
          terms: [] as string[],
          userTerms: [] as string[],
        },
      })

      // 4. IMMEDIATELY create AnimatedLine (Flow C)
      const srcShape = editor.getShape(shape.id as TLShapeId)
      const localPoint = srcShape
        ? editor.getPointInShapeSpace(srcShape, clickPagePoint)
        : { x: 0, y: 0 }
      const sourceW = shape.props.w
      const sourceH = shape.props.h
      const anchorX = sourceW > 0 ? localPoint.x / sourceW : 0.5
      const anchorY = sourceH > 0 ? localPoint.y / sourceH : 0.5

      const lineId = createShapeId()
      editor.createShape({
        id: lineId,
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
      // 把連接線移到最底層，讓文字窗覆蓋在線條上方
      editor.sendToBack([lineId])

      // 5. Stream LLM response into the new shape
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      setLoadingTerm(term)

      const shapeIdRef = newShapeId // copy for closure

      try {
        const result = await llmService.explainStream(
          term,
          (fullText) => {
            // onProgress: update shape text as tokens arrive
            if (abort.signal.aborted) return
            const existing = editor.getShape(shapeIdRef as TLShapeId)
            if (existing) {
              editor.updateShape({
                id: shapeIdRef as TLShapeId,
                type: 'explainer' as any,
                props: { text: header + fullText },
              })
            }
          },
          abort.signal,
        )
        if (abort.signal.aborted) return

        // Stream complete — final text + terms
        const existing = editor.getShape(shapeIdRef as TLShapeId)
        if (existing) {
          editor.updateShape({
            id: shapeIdRef as TLShapeId,
            type: 'explainer' as any,
            props: {
              text: header + result.explanation,
              terms: result.technical_terms,
            },
          })
        }
      } catch (err: unknown) {
        if (abort.signal.aborted) return
        console.error('LLM explain error:', err)
        const existing = editor.getShape(shapeIdRef as TLShapeId)
        if (existing) {
          editor.updateShape({
            id: shapeIdRef as TLShapeId,
            type: 'explainer' as any,
            props: {
              text: header + `⚠️ 解釋失敗：${err instanceof Error ? err.message : String(err)}`,
              w: W,
              h: Math.max(H, 180),
            },
          })
        }
      } finally {
        if (!abort.signal.aborted) {
          setLoadingTerm(null)
        }
      }
    },
    [editor, llmService, shape.id, shape.props.w, shape.props.h, loadingTerm],
  )

  /* ---- Flow B: 選取文字 → SelectionPopover（由 SelectionPopover 內部監聽 selectionchange） ---- */
  /* ---- Flow B: 選取文字 → SelectionPopover 移至 App 層級 ---- */

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
    >
      <div ref={containerRef} data-shape-root={shape.id} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <RichTextRenderer
          segments={segments}
          clickableTerms={clickableTermSet}
          onTermClick={handleTermClick}
        />
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
