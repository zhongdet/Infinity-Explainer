import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ExplainerNode from './components/ExplainerNode'
import AnimatedEdge from './components/AnimatedEdge'
import { SelectionPopover } from './components/SelectionPopover'
import { LLMConfigPanel } from './components/LLMConfigPanel'
import { PersistenceService } from './services/PersistenceService'
import { createSeedNode } from './core/seed'
import { llmService } from './core/services'
import type { LLMConfig, ExplainerNodeData } from './core/types'

const nodeTypes = { explainer: ExplainerNode }
const edgeTypes = { animatedEdge: AnimatedEdge }

/**
 * InnerApp — lives inside ReactFlowProvider so useReactFlow() works.
 * Uses uncontrolled mode (defaultNodes/defaultEdges) so reactFlow.setNodes/setEdges
 * called from custom node components work correctly.
 */
function InnerApp() {
  const reactFlow = useReactFlow()
  const [showConfig, setShowConfig] = useState(false)
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => llmService.getConfig())

  // ── Initialize from persistence or seed ──
  const restored = PersistenceService.tryRestore()
  const defaultNodes: FlowNode[] = (restored?.nodes ?? []) as FlowNode[]
  const defaultEdges: FlowEdge[] = (restored?.edges ?? []) as FlowEdge[]

  if (defaultNodes.length === 0) {
    defaultNodes.push(createSeedNode() as unknown as FlowNode)
  }

  // Auto-save & force render tracking
  const [, forceRender] = useState(0)

  useEffect(() => {
    const save = () => {
      PersistenceService.save(
        reactFlow.getNodes(),
        reactFlow.getEdges(),
        reactFlow.getViewport(),
      )
    }
    const interval = setInterval(save, 500)
    return () => {
      clearInterval(interval)
      save()
    }
  }, [reactFlow])

  // ── Import / Export ──
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(() => {
    const blob = PersistenceService.exportToBlob(
      reactFlow.getNodes(),
      reactFlow.getEdges(),
      reactFlow.getViewport(),
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `infinity-explainer-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [reactFlow])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = PersistenceService.importFromString(reader.result as string)
      if (data) {
        reactFlow.setNodes(data.nodes as FlowNode[])
        reactFlow.setEdges(data.edges as FlowEdge[])
        if (data.viewport) {
          reactFlow.setViewport(data.viewport)
        }
        PersistenceService.save(data.nodes, data.edges, data.viewport)
        forceRender((n) => n + 1)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [reactFlow])

  const handleClear = useCallback(() => {
    PersistenceService.clear()
    window.location.reload()
  }, [])

  // ── SelectionPopover ──
  const handleMarkTerm = useCallback(
    (nodeId: string, text: string) => {
      reactFlow.setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as unknown as ExplainerNodeData
          const userTerms = [...(data.userTerms ?? [])]
          const terms = data.terms ?? []
          if (!userTerms.includes(text) && !terms.includes(text)) {
            userTerms.push(text)
          }
          return { ...n, data: { ...n.data, userTerms } }
        }),
      )
    },
    [reactFlow],
  )

  // ── LLM config ──
  const handleSaveConfig = useCallback((cfg: LLMConfig) => {
    llmService.configure(cfg)
    setLlmConfig(cfg)
  }, [])

  const providerStatus =
    llmConfig.provider === 'disabled'
      ? '⚫ LLM 未設定'
      : llmConfig.provider === 'openai'
        ? '🟢 OpenAI'
        : '🟢 llama.cpp'

  const btnStyle: React.CSSProperties = {
    padding: '6px 10px',
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
    gap: 4,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }}>
        <ReactFlow
          defaultNodes={defaultNodes}
          defaultEdges={defaultEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          zoomOnScroll={true}
          panOnScroll={false}
          zoomOnDoubleClick={false}
          panOnDrag={[1, 2]}
          selectNodesOnDrag={false}
          deleteKeyCode="Backspace"
          minZoom={0.1}
          maxZoom={4}
          fitView={false}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        </ReactFlow>
      </div>

      <SelectionPopover onMarkTerm={handleMarkTerm} />

      {/* ── 工具列 ── */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 9999,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <button onClick={() => fileInputRef.current?.click()} title="匯入 .json 檔案" style={btnStyle}>
          📥 匯入
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </button>
        <button onClick={handleExport} title="匯出為 .json" style={btnStyle}>📤 匯出</button>
        <button onClick={handleClear} title="清除存檔並重新開始" style={btnStyle}>🗑</button>

        <div style={{ width: 1, height: 24, background: '#d1d5db' }} />

        <button onClick={() => setShowConfig(!showConfig)} title={providerStatus} style={btnStyle}>
          ⚙ 設定
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{providerStatus}</span>
        </button>
      </div>

      {showConfig && (
        <LLMConfigPanel config={llmConfig} onSave={handleSaveConfig} onClose={() => setShowConfig(false)} />
      )}
    </div>
  )
}

function App() {
  return (
    <ReactFlowProvider>
      <InnerApp />
    </ReactFlowProvider>
  )
}

export default App
