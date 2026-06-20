import { memo } from 'react'
import { useInternalNode } from '@xyflow/react'
import type { AnimatedEdgeData } from '../core/types'

function AnimatedEdge(props: Record<string, unknown>) {
  const source = props.source as string
  const target = props.target as string
  const data = props.data as AnimatedEdgeData | undefined

  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode || !data) return null

  const sPos = sourceNode.internals.positionAbsolute
  const tPos = targetNode.internals.positionAbsolute
  const sW = sourceNode.width ?? sourceNode.measured?.width ?? 360
  const sH = sourceNode.height ?? sourceNode.measured?.height ?? 240
  const tW = targetNode.width ?? targetNode.measured?.width ?? 360
  const tH = targetNode.height ?? targetNode.measured?.height ?? 240

  // Anchor points in flow-space coordinates
  const sx = sPos.x + sW * data.startAnchorX
  const sy = sPos.y + sH * data.startAnchorY
  const ex = tPos.x + tW * data.endAnchorX
  const ey = tPos.y + tH * data.endAnchorY

  const dx = ex - sx
  const pathD = `M ${sx} ${sy} C ${sx + dx / 2} ${sy}, ${sx + dx / 2} ${ey}, ${ex} ${ey}`

  return (
    <path
      d={pathD}
      fill="none"
      stroke="#3b82f6"
      strokeWidth={3}
      strokeLinecap="round"
    />
  )
}

export default memo(AnimatedEdge)
