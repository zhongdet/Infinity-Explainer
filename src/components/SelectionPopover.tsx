import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** 選取的文字 */
  selectedText: string
  /** 選取範圍的 DOM 矩形（用於定位） */
  selectionRect: DOMRect | null
  /** 確認標記 */
  onConfirm: (text: string) => void
  /** 關閉 */
  onClose: () => void
}

/**
 * SelectionPopover：選取文字後出現的浮動視窗。
 * 使用 React Portal 渲染到 document.body，避免 tldraw canvas z-index 問題。
 */
export function SelectionPopover({ selectedText, selectionRect, onConfirm, onClose }: Props) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectionRect) return

    // 預設顯示在選取區上方
    let top = selectionRect.top - 48
    let left = selectionRect.left + selectionRect.width / 2

    // 確保不超出 viewport
    if (top < 8) top = selectionRect.bottom + 8
    if (left < 8) left = 8

    // 使用 requestAnimationFrame 確保 DOM 已渲染
    const raf = requestAnimationFrame(() => {
      if (popoverRef.current) {
        const popoverWidth = popoverRef.current.offsetWidth
        if (left + popoverWidth / 2 > window.innerWidth - 8) {
          left = window.innerWidth - 8 - popoverWidth / 2
        }
        if (left - popoverWidth / 2 < 8) {
          left = 8 + popoverWidth / 2
        }
      }
      setCoords({ top, left })
    })

    return () => cancelAnimationFrame(raf)
  }, [selectionRect])

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Small delay to avoid immediate close on pointerUp
    const id = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handler)
    }
  }, [onClose])

  if (!selectionRect) return null

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        transform: 'translateX(-50%)',
        zIndex: 50000,
        backgroundColor: '#1f2937',
        color: '#fff',
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        cursor: 'default',
        pointerEvents: 'all',
        userSelect: 'none',
      }}
    >
      <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', color: '#d1d5db' }}>
        「{selectedText.length > 20 ? selectedText.slice(0, 20) + '…' : selectedText}」
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onConfirm(selectedText)
        }}
        style={{
          padding: '2px 10px',
          borderRadius: 4,
          border: 'none',
          background: '#3b82f6',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        標記為名詞
      </button>
    </div>,
    document.body
  )
}
