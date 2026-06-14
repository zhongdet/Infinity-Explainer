import { ShapeUtil, SVGContainer, T, useEditor, Rectangle2d, track } from 'tldraw'
import type { RecordProps, TLBaseShape, TLShapeId } from 'tldraw'
import { useEffect, useRef } from 'react'

export type AnimatedLineShape = TLBaseShape<'animatedLine', {
  startId: string
  endId: string
  startAnchorX: number
  startAnchorY: number
  endAnchorX: number
  endAnchorY: number
}>

export const animatedLineShapeProps: RecordProps<AnimatedLineShape> = {
  startId: T.string,
  endId: T.string,
  startAnchorX: T.number,
  startAnchorY: T.number,
  endAnchorX: T.number,
  endAnchorY: T.number,
}

/**
 * Draws the SVG path for a single animated line shape,
 * AND auto-updates the shape's position to prevent off-screen culling.
 */
const AnimatedLineRenderer = track(({ shape }: { shape: AnimatedLineShape }) => {
  const editor = useEditor()
  const shapeIdRef = useRef(shape.id)
  shapeIdRef.current = shape.id

  // Auto-delete lifecycle
  useEffect(() => {
    const unsub = editor.store.listen(() => {
      const s1 = editor.getShape(shape.props.startId as TLShapeId)
      const s2 = editor.getShape(shape.props.endId as TLShapeId)
      if (!s1 || !s2) {
        setTimeout(() => {
          if (editor.getShape(shapeIdRef.current)) {
            editor.deleteShape(shapeIdRef.current)
          }
        }, 0)
      }
    })
    return unsub
  }, [editor, shape.props.startId, shape.props.endId])

  // Read connected shape bounds
  const startShape = editor.getShape(shape.props.startId as TLShapeId)
  const endShape = editor.getShape(shape.props.endId as TLShapeId)

  if (!startShape || !endShape) return null

  const startBounds = editor.getShapePageBounds(startShape)
  const endBounds = editor.getShapePageBounds(endShape)

  if (!startBounds || !endBounds) return null

  // Calculate page-space anchor points
  const sx = startBounds.minX + startBounds.width * shape.props.startAnchorX
  const sy = startBounds.minY + startBounds.height * shape.props.startAnchorY
  const ex = endBounds.minX + endBounds.width * shape.props.endAnchorX
  const ey = endBounds.minY + endBounds.height * shape.props.endAnchorY

  // Convert to local shape space
  const localSx = sx - shape.x
  const localSy = sy - shape.y
  const localEx = ex - shape.x
  const localEy = ey - shape.y

  const dx = localEx - localSx
  const curve = `M ${localSx} ${localSy} C ${localSx + dx / 2} ${localSy}, ${localSx + dx / 2} ${localEy}, ${localEx} ${localEy}`

  // Hover state (from tldraw's hovered shape)
  const hoveredShapeId = editor.getHoveredShapeId()
  const isHovered =
    hoveredShapeId === shape.id ||
    hoveredShapeId === shape.props.startId ||
    hoveredShapeId === shape.props.endId

  return (
    <svg style={{ overflow: 'visible', width: 1, height: 1 }}>
      <path
        d={curve}
        fill="none"
        stroke={isHovered ? '#1e3a8a' : '#3b82f6'}
        strokeWidth={isHovered ? 5 : 3}
        strokeLinecap="round"
        style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
      />
    </svg>
  )
})

export class AnimatedLineShapeUtil extends ShapeUtil<any> {
  static type = 'animatedLine' as const
  static props = animatedLineShapeProps

  getDefaultProps(): AnimatedLineShape['props'] {
    return {
      startId: '',
      endId: '',
      startAnchorX: 0.5,
      startAnchorY: 0.5,
      endAnchorX: 0.5,
      endAnchorY: 0.5,
    }
  }

  getGeometry(_shape: AnimatedLineShape) {
    // Use a generous fixed geometry so the line isn't culled
    // when the camera moves. The actual line is drawn between
    // connected shapes which could be anywhere on the canvas.
    return new Rectangle2d({
      x: -50000,
      y: -50000,
      width: 100000,
      height: 100000,
      isFilled: false,
    }) as any
  }

  component(shape: AnimatedLineShape) {
    return (
      <SVGContainer id={shape.id} style={{ overflow: 'visible', pointerEvents: 'none' }}>
        <AnimatedLineRenderer shape={shape} />
      </SVGContainer>
    )
  }

  indicator(_shape: AnimatedLineShape) {
    return null
  }
}
