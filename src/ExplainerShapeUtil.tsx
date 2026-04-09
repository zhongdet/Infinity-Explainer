import { BaseBoxShapeUtil, HTMLContainer, createShapeId, useEditor } from 'tldraw'
import type { RecordProps, TLBaseShape, TLShapeId } from 'tldraw'
import { T } from 'tldraw'
import { dictionary } from './dictionary'

export type ExplainerShape = TLBaseShape<'explainer', {
  text: string
  w: number
  h: number
}>

export const explainerShapeProps: RecordProps<ExplainerShape> = {
  text: T.string,
  w: T.number,
  h: T.number,
}

function boundsCollide(a: any, b: any, extraPadding: number = 0) {
  const PADDING = 40 + extraPadding
  const aminX = a.minX - PADDING
  const amaxX = a.maxX + PADDING
  const aminY = a.minY - PADDING
  const amaxY = a.maxY + PADDING

  return !(amaxX < b.minX || aminX > b.maxX || amaxY < b.minY || aminY > b.maxY)
}

class SectorSearch {
  blockSize: number
  sweepRange: number
  radiusStep: number
  angleSpeed: number
  padding: number

  constructor(config: any = {}) {
      this.blockSize = config.blockSize || 40;
      this.sweepRange = config.sweepRange || Math.PI * 0.8;
      this.radiusStep = config.radiusStep || 1.2;
      this.angleSpeed = config.angleSpeed || 0.2;
      this.padding = config.padding || 1.1;
  }

  findPosition(centerX: number, centerY: number, baseAngle: number, checkCollision: (x: number, y: number, r: number) => boolean, initialRadius: number = 0) {
      let radius = initialRadius || (this.blockSize * 3.5); 
      let searchStep = 0;
      let maxAttempts = 1000;
      let attempts = 0;

      while (attempts < maxAttempts) {
          const angleOffset = Math.sin(searchStep * 2) * (this.sweepRange / 2);
          const currentAngle = baseAngle + angleOffset;
          
          const x = centerX + Math.cos(currentAngle) * radius;
          const y = centerY + Math.sin(currentAngle) * radius;

          if (!checkCollision(x, y, this.blockSize * this.padding)) {
              return { x, y, radius, angle: currentAngle };
          }

          radius += this.radiusStep;
          searchStep += this.angleSpeed;
          attempts++;
      }

      return null;
  }
}

const RichTextRenderer = ({ text, shapeId }: { text: string, shapeId: string }) => {
  const editor = useEditor()
  
  const handleNounClick = (e: React.MouseEvent, noun: string) => {
    e.stopPropagation()
    const desc = dictionary[noun]
    if (!desc) return

    const container = document.getElementById(shapeId)
    
    let anchorX = 0.5
    let anchorY = 0.5
    let baseAngle = 0


    if (container) {
      const sourceShape = editor.getShape(shapeId as TLShapeId)
      
      // Instead of reading the DOM bounding box which corrupts heavily on multi-line word wraps,
      // we extract the exact exact geometric pointer coordinate mapped flawlessly from tldraw's engine!
      const pagePoint = editor.inputs.currentPagePoint;
      const localPoint = editor.getPointInShapeSpace(sourceShape as any, pagePoint)
      
      const shapeW = (sourceShape?.props as any)?.w || 350
      const shapeH = (sourceShape?.props as any)?.h || 220
      
      anchorX = localPoint.x / shapeW
      anchorY = localPoint.y / shapeH

      const containerRect = container.getBoundingClientRect()
      const motherCx = containerRect.left + containerRect.width / 2
      const motherCy = containerRect.top + containerRect.height / 2
      
      // Calculate mother to click vector dynamically using client coords 
      // (Since baseAngle is just a search array direction, viewport space is fine for atan2)
      baseAngle = Math.atan2(e.clientY - motherCy, e.clientX - motherCx)
    }
    
    const newShapeId = createShapeId()
    const W = 350
    const H = 220
    
    const sourceShape = editor.getShape(shapeId as TLShapeId)
    const sourceBounds = editor.getShapePageBounds(sourceShape as any)
    
    let endAnchorX = 0.5;
    let endAnchorY = 0.5;

    let finalX = 100;
    let finalY = 100;

    if (sourceBounds) {
      const searchCenterX = sourceBounds.minX + sourceBounds.width / 2;
      const searchCenterY = sourceBounds.minY + sourceBounds.height / 2;

      const shapes = editor.getCurrentPageShapes();
      const checkCollision = (cx: number, cy: number) => {
          const testBounds = { minX: cx - W/2, minY: cy - H/2, maxX: cx + W/2, maxY: cy + H/2 };
          for (const s of shapes) {
              if ((s.type as string) === 'explainer' && s.id !== (shapeId as any)) {
                  const b = editor.getShapePageBounds(s);
                  if (b && boundsCollide(testBounds, b)) {
                      return true;
                  }
              }
          }
          return false;
      };

      const agentSearch = new SectorSearch({
          blockSize: 50,
          sweepRange: Math.PI * 0.8,
          radiusStep: 4,     // larger steps for performance
          angleSpeed: 0.15
      });

      // Calculate safe dynamic radius so it visually completely clears scaling host cards.
      // E.g., if the host is 1000px wide, we start outside it immediately!
      const initialRadius = Math.max(sourceBounds.width, sourceBounds.height) / 2 + 50;

      const pos = agentSearch.findPosition(searchCenterX, searchCenterY, baseAngle, checkCollision, initialRadius);

      if (pos) {
          finalX = pos.x - W/2;
          finalY = pos.y - H/2;
      } else {
          finalX = searchCenterX + 100;
          finalY = searchCenterY + 100;
      }
    }

    editor.createShape({
      id: newShapeId,
      type: 'explainer' as any,
      x: finalX,
      y: finalY,
      props: {
        text: `【${noun}】\n\n${desc}`,
        w: W,
        h: H
      }
    })

    const lineId = createShapeId()
    editor.createShape({
      id: lineId,
      type: 'animatedLine' as any,
      x: 0,
      y: 0,
      props: {
        startId: shapeId,
        endId: newShapeId,
        startAnchorX: anchorX,
        startAnchorY: anchorY,
        endAnchorX: endAnchorX,
        endAnchorY: endAnchorY,
      }
    })
  }

  const keys = Object.keys(dictionary).sort((a,b) => b.length - a.length);
  const regex = new RegExp(`(${keys.join('|')})`, 'g');
  const parts = text.split(regex);

  return (
    <div style={{ whiteSpace: 'pre-wrap', pointerEvents: 'none' }}>
      {parts.map((part, i) => {
        if (dictionary[part]) {
          return (
            <span
              key={i}
              style={{
                color: '#2563eb',
                backgroundColor: '#eff6ff',
                padding: '2px 4px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
                pointerEvents: 'all'
              }}
              onPointerDown={(e) => handleNounClick(e, part)}
            >
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}

export class ExplainerShapeUtil extends BaseBoxShapeUtil<any> {
  static type = 'explainer' as const
  static props = explainerShapeProps

  getDefaultProps(): ExplainerShape['props'] {
    return {
      text: '',
      w: 300,
      h: 200,
    }
  }

  component(shape: ExplainerShape) {
    const { text } = shape.props

    return (
      <HTMLContainer
        id={shape.id}
        className="animate-pop"
        style={{
          border: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
          padding: 24,
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
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
          transformOrigin: 'top left'
        }}
        onPointerDown={(_e) => {}}
      >
        <RichTextRenderer text={text} shapeId={shape.id} />
      </HTMLContainer>
    )
  }

  indicator(shape: ExplainerShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
