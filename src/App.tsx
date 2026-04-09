import { Tldraw, createShapeId, Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { ExplainerShapeUtil } from './ExplainerShapeUtil'
import { AnimatedLineShapeUtil } from './AnimatedLineShapeUtil'
import { initialText } from './dictionary'

const customShapeUtils = [ExplainerShapeUtil, AnimatedLineShapeUtil]

function App() {
  const handleMount = (editor: Editor) => {
    // Zoom out slightly to see everything
    editor.setCameraOptions({ wheelBehavior: 'zoom', panSpeed: 1, zoomSpeed: 1, zoomSteps: [0.1, 0.25, 0.5, 1, 2, 4, 8] })

    // Create the initial text shape
    const initialShapeId = createShapeId('initial-explainer')
    if (!editor.getShape(initialShapeId)) {
      editor.createShape({
        id: initialShapeId,
        type: 'explainer' as any,
        x: window.innerWidth / 2 - 350,
        y: 100,
        props: {
          text: initialText,
          w: 700,
          h: 400
        }
      })
    }

    // Select the hand tool for easier panning (optional, but good for MVP)
    editor.setCurrentTool('select')
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        // Remove standard UI to make it feel like a clean reading experience
        hideUi={false}
      />
    </div>
  )
}

export default App
