import { useEffect, useState } from 'react'
import type { Editor } from 'tldraw'
import type { AnimatedLineShape } from '../AnimatedLineShapeUtil'

interface LineData {
  id: string
  sx: number
  sy: number
  ex: number
  ey: number
}

/**
 * LineOverlay — 在 tldraw 畫布外部繪製連接線的 SVG overlay。
 *
 * 不受 tldraw shape culling 影響：即使文字窗被拖到視窗外，
 * 只要至少一端在可視範圍內，線條仍會正確繪製。
 */
export function LineOverlay({ editor }: { editor: Editor }) {
  const [, forceUpdate] = useState(0)

  // Subscribe to store changes (shape moves, camera pans, etc.)
  useEffect(() => {
    let timer: number | undefined
    const unsub = editor.store.listen(() => {
      // Throttle to ~60fps
      if (timer) return
      timer = window.setTimeout(() => {
        timer = undefined
        forceUpdate((n) => n + 1)
      }, 16)
    })
    return () => {
      unsub()
      clearTimeout(timer)
    }
  }, [editor])

  const camera = editor.getCamera()
  const shapes = editor.getCurrentPageShapes()

  // Build line geometry
  const lines: LineData[] = []
  for (const shape of shapes) {
    if ((shape as any).type !== 'animatedLine') continue
    const line = shape as unknown as AnimatedLineShape
    const startShape = editor.getShape(line.props.startId as any)
    const endShape = editor.getShape(line.props.endId as any)
    if (!startShape || !endShape) continue

    const startBounds = editor.getShapePageBounds(startShape)
    const endBounds = editor.getShapePageBounds(endShape)
    if (!startBounds || !endBounds) continue

    lines.push({
      id: line.id,
      sx: startBounds.minX + startBounds.width * line.props.startAnchorX,
      sy: startBounds.minY + startBounds.height * line.props.startAnchorY,
      ex: endBounds.minX + endBounds.width * line.props.endAnchorX,
      ey: endBounds.minY + endBounds.height * line.props.endAnchorY,
    })
  }

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        transform: `translate(${-camera.x}px, ${-camera.y}px) scale(${camera.z})`,
        transformOrigin: 'top left',
      }}
    >
      {lines.map((l) => {
        const dx = l.ex - l.sx
        const d = `M ${l.sx} ${l.sy} C ${l.sx + dx / 2} ${l.sy}, ${l.sx + dx / 2} ${l.ey}, ${l.ex} ${l.ey}`
        return (
          <path
            key={l.id}
            d={d}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={Math.max(2, 3 / camera.z)}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}
