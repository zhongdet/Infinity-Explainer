import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** 容器 element（用於判斷選取是否在容器內） */
  containerEl: HTMLElement | null
  /** 文字選取後要執行的動作 */
  onConfirm: (text: string) => void
}

/**
 * SelectionPopover — 在 ExplainerShape 內選取文字後出現的浮動工具列。
 *
 * 使用方式：
 * ```tsx
 * <SelectionPopover containerEl={containerRef.current} onConfirm={handleConfirm} />
 * ```
 *
 * 靈感來自 radix-ui/selection-popover 的設計模式：
 * - 監聽 selectionchange 事件（不限滑鼠/鍵盤）
 * - openDelay / closeDelay 避免閃爍
 * - ESC / scroll / click-outside 關閉
 */
export function SelectionPopover({ containerEl, onConfirm }: Props) {
  const [state, setState] = useState<{
    text: string
    rect: DOMRect
  } | null>(null)
  const openTimerRef = useRef<number>(0)
  const closeTimerRef = useRef<number>(0)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [visible, setVisible] = useState(false)

  const OPEN_DELAY = 150
  const CLOSE_DELAY = 200

  // ── 監聽 selectionchange ──
  useEffect(() => {
    if (!containerEl) return

    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
        // 選取消失 → 延遲關閉
        clearTimeout(openTimerRef.current)
        closeTimerRef.current = window.setTimeout(() => {
          setState(null)
          setVisible(false)
        }, CLOSE_DELAY)
        return
      }

      // 確認選取範圍在 container 內
      if (!containerEl.contains(sel.anchorNode)) {
        setState(null)
        setVisible(false)
        return
      }

      const text = sel.toString().trim()
      if (text.length === 0) return

      clearTimeout(closeTimerRef.current)

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      // 延遲開啟（避免短暫 hover 觸發）
      openTimerRef.current = window.setTimeout(() => {
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
  }, [containerEl])

  // ── 定位計算（viewport 碰撞處理） ──
  useEffect(() => {
    if (!state) return

    const popoverWidth = 220
    const popoverHeight = 40
    const gap = 8 // 與選取區的間距

    const preferredTop = state.rect.top - popoverHeight - gap
    const preferredBottom = state.rect.bottom + gap
    const centerX = state.rect.left + state.rect.width / 2

    let top: number
    if (preferredTop < 8) {
      top = preferredBottom
    } else {
      top = preferredTop
    }

    let left = centerX - popoverWidth / 2
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8))

    setCoords({ top, left })
  }, [state])

  // ── ESC 關閉 ──
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setState(null)
        setVisible(false)
        window.getSelection()?.removeAllRanges()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible])

  // ── 按鈕點擊 ──
  const handleConfirm = useCallback(() => {
    if (!state) return
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
        // 點擊 popover 外部 → 關閉但不清除選取（使用者可以繼續選）
        setVisible(false)
        // 延遲清除 state，讓 selectionchange 有機會重新觸發
        closeTimerRef.current = window.setTimeout(() => {
          setState(null)
        }, CLOSE_DELAY)
      }
    }
    const id = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handler)
    }
  }, [visible])

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
