import { ShapeUtil, T, useEditor, Rectangle2d } from 'tldraw'
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

/**
 * Invisible lifecycle tracker — visual rendering is handled by LineOverlay (SVG overlay).
 * This component only ensures orphaned lines are cleaned up when connected shapes are deleted.
 */
function AnimatedLineTracker({ shape }: { shape: AnimatedLineShape }) {
  const editor = useEditor()

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

  return null
}

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
    // Large bounds to prevent tldraw from culling the lifecycle tracker.
    // Actual rendering is done by LineOverlay.
    return new Rectangle2d({ x: -5000, y: -5000, width: 10000, height: 10000, isFilled: false }) as any
  }

  component(shape: AnimatedLineShape) {
    return <AnimatedLineTracker shape={shape} />
  }

  indicator(_shape: AnimatedLineShape) {
    return null
  }
}
