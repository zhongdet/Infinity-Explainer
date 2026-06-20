import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onMarkTerm: (shapeId: string, text: string) => void
}

/**
 * SelectionPopover — 在全域 App 層級渲染的選取工具列。
 *
 * 監聽 selectionchange 事件，當選取發生在 data-node-root 容器內時，
 * 在選取區上方顯示「標記為名詞」按鈕。
 *
 * 使用 position: fixed 的 div，不透過 createPortal。
 */
export function SelectionPopover({ onMarkTerm }: Props) {
  const [state, setState] = useState<{
    nodeId: string
    text: string
    rect: DOMRect
  } | null>(null)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const openTimerRef = useRef<number>(0)
  const closeTimerRef = useRef<number>(0)
  const popoverRef = useRef<HTMLDivElement>(null)

  const OPEN_DELAY = 150
  const CLOSE_DELAY = 200

  // 統一的關閉方法
  const doClose = useCallback(() => {
    setVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      setState(null)
    }, CLOSE_DELAY)
  }, [])

  // 用 ref 同步 state 讓 closure 可讀取當前內容
  const stateRef = useRef(state)
  stateRef.current = state

  // 監聽 selectionchange
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection()
      const hasSel = sel && !sel.isCollapsed && sel.toString().trim().length > 0

      if (visible) {
        // Popover 已開啟
        if (hasSel) {
          const t = sel!.toString().trim()
          const rootEl = sel!.anchorNode?.parentElement?.closest('[data-node-root]') as HTMLElement | null
          if (rootEl && t !== stateRef.current?.text) {
            const sid = rootEl.getAttribute('data-node-root') ?? ''
            const range = sel!.getRangeAt(0)
            clearTimeout(closeTimerRef.current)
            setState({ nodeId: sid, text: t, rect: range.getBoundingClientRect() })
          }
        } else {
          setVisible(false)
          closeTimerRef.current = window.setTimeout(() => {
            setState(null)
          }, CLOSE_DELAY)
        }
        return
      }

      // Popover 關閉中
      if (!hasSel) {
        clearTimeout(openTimerRef.current)
        closeTimerRef.current = window.setTimeout(() => {
          setState(null)
          setVisible(false)
        }, CLOSE_DELAY)
        return
      }

      // 確認選取範圍在 data-node-root 容器內
      const rootEl = sel!.anchorNode?.parentElement?.closest('[data-node-root]') as HTMLElement | null
      if (!rootEl) {
        setState(null)
        setVisible(false)
        return
      }

      const nodeId = rootEl.getAttribute('data-node-root') ?? ''
      if (!nodeId) return

      const text = sel!.toString().trim()
      if (text.length === 0) return

      clearTimeout(closeTimerRef.current)
      clearTimeout(openTimerRef.current)

      const range = sel!.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      openTimerRef.current = window.setTimeout(() => {
        setState({ nodeId, text, rect })
        setVisible(true)
      }, OPEN_DELAY)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      clearTimeout(openTimerRef.current)
      clearTimeout(closeTimerRef.current)
    }
  }, [visible])

  // 定位
  useEffect(() => {
    if (!state || !visible) return
    const w = 220, h = 40, gap = 8
    const top = state.rect.top - h - gap < 8
      ? state.rect.bottom + gap
      : state.rect.top - h - gap
    const left = Math.max(8, Math.min(
      state.rect.left + state.rect.width / 2 - w / 2,
      window.innerWidth - w - 8,
    ))
    setCoords({ top, left })
  }, [state, visible])

  // ESC 關閉
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { doClose(); window.getSelection()?.removeAllRanges() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, doClose])

  // 點擊確認
  const handleConfirm = useCallback(() => {
    if (!state) return
    onMarkTerm(state.nodeId, state.text)
    setState(null)
    setVisible(false)
    window.getSelection()?.removeAllRanges()
  }, [state, onMarkTerm])

  // click outside
  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        doClose()
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [visible, doClose])

  if (!state || !visible) return null

  return (
    <div
      ref={popoverRef}
      role="toolbar"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 999999,
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
      <span style={{ color: '#9ca3af', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' }}>
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
    </div>
  )
}
