import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** ExplainerShape 的 id（用於找容器 element） */
  shapeId: string
  /** 文字選取後要執行的動作 */
  onConfirm: (text: string) => void
}

/**
 * SelectionPopover — 在 ExplainerShape 內選取文字後出現的浮動工具列。
 *
 * 內部監聽 document.selectionchange 事件，不需要外部觸發。
 * 使用 openDelay / closeDelay 避免閃爍。
 */
export function SelectionPopover({ shapeId, onConfirm }: Props) {
  const [state, setState] = useState<{
    text: string
    rect: DOMRect
  } | null>(null)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const openTimerRef = useRef<number>(0)
  const closeTimerRef = useRef<number>(0)
  const popoverRef = useRef<HTMLDivElement>(null)
  /** 同步 tracking 供 closure 內讀取 visibile 狀態 */
  const visibleRef = useRef(false)

  const OPEN_DELAY = 150
  const CLOSE_DELAY = 200

  // ── 統一的關閉方法 ──
  const doClose = useCallback(() => {
    visibleRef.current = false
    setVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      setState(null)
    }, CLOSE_DELAY)
  }, [])

  // ── 監聽 selectionchange ──
  useEffect(() => {
    const containerEl = document.getElementById(shapeId)
    if (!containerEl) return

    const handleSelectionChange = () => {
      // Popover 已開啟時，不自動關閉（讓使用者有時間點擊按鈕）
      if (visibleRef.current) return

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
        clearTimeout(openTimerRef.current)
        closeTimerRef.current = window.setTimeout(() => {
          visibleRef.current = false
          setVisible(false)
          setState(null)
        }, CLOSE_DELAY)
        return
      }

      // 確認選取範圍在 container 內
      if (!containerEl.contains(sel.anchorNode)) {
        visibleRef.current = false
        setVisible(false)
        setState(null)
        return
      }

      const text = sel.toString().trim()
      if (text.length === 0) return

      clearTimeout(closeTimerRef.current)

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      clearTimeout(openTimerRef.current)
      openTimerRef.current = window.setTimeout(() => {
        visibleRef.current = true
        setState({ text, rect })
        setVisible(true)
      }, OPEN_DELAY)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      clearTimeout(openTimerRef.current)
      clearTimeout(closeTimerRef.current)
    }
  }, [shapeId])

  // ── 定位計算（viewport 碰撞處理） ──
  useEffect(() => {
    if (!state || !visible) return

    const popoverWidth = 220
    const popoverHeight = 40
    const gap = 8

    const preferredTop = state.rect.top - popoverHeight - gap
    const preferredBottom = state.rect.bottom + gap
    const centerX = state.rect.left + state.rect.width / 2

    const top = preferredTop < 8 ? preferredBottom : preferredTop
    const left = Math.max(8, Math.min(centerX - popoverWidth / 2, window.innerWidth - popoverWidth - 8))

    setCoords({ top, left })
  }, [state, visible])

  // ── ESC 關閉 ──
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        doClose()
        window.getSelection()?.removeAllRanges()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, doClose])

  // ── 按鈕點擊 ──
  const handleConfirm = useCallback(() => {
    if (!state) return
    visibleRef.current = false
    onConfirm(state.text)
    setState(null)
    setVisible(false)
    window.getSelection()?.removeAllRanges()
  }, [state, onConfirm])

  // ── click outside ──
  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        doClose()
      }
    }
    // Native click listener (not React) so we can check before React re-renders
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [visible, doClose])

  if (!state || !visible) return null

  return createPortal(
    <div
      ref={popoverRef}
      role="toolbar"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 50000,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 6px',
        backgroundColor: '#1f2937',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        pointerEvents: 'all',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          color: '#9ca3af',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '0 4px',
        }}
      >
        {state.text.length > 15 ? state.text.slice(0, 15) + '…' : state.text}
      </span>
      <span style={{ width: 1, height: 16, backgroundColor: '#374151' }} />
      <button
        onClick={handleConfirm}
        style={{
          padding: '3px 10px',
          borderRadius: 4,
          border: 'none',
          background: '#3b82f6',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: '20px',
        }}
      >
        標記為名詞
      </button>
    </div>,
    document.body,
  )
}
