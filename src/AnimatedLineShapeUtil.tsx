import { ShapeUtil, SVGContainer, T, useEditor, Rectangle2d, track } from 'tldraw'
import type { RecordProps, TLBaseShape, TLShapeId } from 'tldraw'
import { useEffect } from 'react'

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

const AnimatedLineRenderer = track(({ shape }: { shape: AnimatedLineShape }) => {
  const editor = useEditor()

  // Auto-delete lifecycle management
  useEffect(() => {
    const unsub = editor.store.listen(() => {
      const s1 = editor.getShape(shape.props.startId as TLShapeId)
      const s2 = editor.getShape(shape.props.endId as TLShapeId)
      if (!s1 || !s2) {
         setTimeout(() => {
            if (editor.getShape(shape.id)) editor.deleteShape(shape.id)
         }, 0)
      }
    })
    return unsub
  }, [editor, shape.id, shape.props.startId, shape.props.endId])

  const startShape = editor.getShape(shape.props.startId as TLShapeId)
  const endShape = editor.getShape(shape.props.endId as TLShapeId)

  if (!startShape || !endShape) return null

  const startBounds = editor.getShapePageBounds(startShape)
  const endBounds = editor.getShapePageBounds(endShape)

  if (!startBounds || !endBounds) return null

  // Fixed Anchors! Absolutely no math deviation!
  const sx = startBounds.minX + startBounds.width * shape.props.startAnchorX
  const sy = startBounds.minY + startBounds.height * shape.props.startAnchorY
  const ex = endBounds.minX + endBounds.width * shape.props.endAnchorX
  const ey = endBounds.minY + endBounds.height * shape.props.endAnchorY

  const localSx = sx - shape.x
  const localSy = sy - shape.y
  const localEx = ex - shape.x
  const localEy = ey - shape.y

  const hoveredShapeId = editor.getHoveredShapeId()
  const isHovered = hoveredShapeId === shape.id || 
                    hoveredShapeId === shape.props.startId || 
                    hoveredShapeId === shape.props.endId;

  const dx = localEx - localSx
  const curve = `M ${localSx} ${localSy} C ${localSx + dx / 2} ${localSy}, ${localSx + dx / 2} ${localEy}, ${localEx} ${localEy}`

  return (
    <svg style={{ overflow: 'visible', width: 1, height: 1 }}>
      <path
        d={curve}
        fill="none"
        stroke={isHovered ? '#1e3a8a' : '#3b82f6'}
        strokeWidth={isHovered ? "5" : "3"}
        strokeDasharray="10000"
        strokeDashoffset="10000"
        style={{
          animation: 'drawPath 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          transition: 'stroke 0.2s, stroke-width 0.2s'
        }}
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
      endAnchorY: 0.5
    }
  }

  getGeometry(_shape: AnimatedLineShape) {
    return new Rectangle2d({ x: 0, y: 0, width: 1, height: 1, isFilled: false }) as any
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
