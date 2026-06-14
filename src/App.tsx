import { useCallback, useState } from 'react'
import { Tldraw, createShapeId, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { ExplainerShapeUtil } from './ExplainerShapeUtil'
import { AnimatedLineShapeUtil } from './AnimatedLineShapeUtil'
import { initialText, demoTerms } from './dictionary'
import { llmService } from './core/services'
import { LLMConfigPanel } from './components/LLMConfigPanel'
import { SelectionPopover } from './components/SelectionPopover'
import type { LLMConfig } from './core/types'

const customShapeUtils = [ExplainerShapeUtil, AnimatedLineShapeUtil]

function App() {
  const [showConfig, setShowConfig] = useState(false)
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => llmService.getConfig())
  const [editor, setEditor] = useState<Editor | null>(null)

  const handleSaveConfig = useCallback((cfg: LLMConfig) => {
    llmService.configure(cfg)
    setLlmConfig(cfg)
  }, [])

  const handleMount = useCallback((editor: Editor) => {
    setEditor(editor)

    editor.setCameraOptions({
      wheelBehavior: 'zoom',
      panSpeed: 1,
      zoomSpeed: 1,
      zoomSteps: [0.1, 0.25, 0.5, 1, 2, 4, 8],
    })

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
          h: 420,
          terms: demoTerms,
          userTerms: [] as string[],
        },
      })
    }

    editor.setCurrentTool('select')
  }, [])

  const providerStatus =
    llmConfig.provider === 'disabled'
      ? '⚫ LLM 未設定'
      : llmConfig.provider === 'openai'
        ? '🟢 OpenAI'
        : '🟢 llama.cpp'

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        hideUi={false}
      />

      {/* 全域 SelectionPopover — 在 App 層級，完全脫離 tldraw 事件/transform 影響 */}
      <SelectionPopover editor={editor} />

      <button
        onClick={() => setShowConfig(!showConfig)}
        title={providerStatus}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 9999,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid #d1d5db',
          backgroundColor: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
          color: '#374151',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ⚙ 設定
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{providerStatus}</span>
      </button>

      {showConfig && (
        <LLMConfigPanel
          config={llmConfig}
          onSave={handleSaveConfig}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  )
}

export default App
