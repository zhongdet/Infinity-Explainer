import { useCallback, useEffect, useRef, useState } from 'react'
import type { LLMConfig } from '../core/types'

interface Props {
  config: LLMConfig
  onSave: (cfg: LLMConfig) => void
  onClose: () => void
}

const PROVIDER_OPTIONS: { value: LLMConfig['provider']; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'llama.cpp', label: 'llama.cpp (local)' },
  { value: 'disabled', label: 'Disabled' },
]

export function LLMConfigPanel({ config, onSave, onClose }: Props) {
  const [form, setForm] = useState<LLMConfig>({ ...config })
  const panelRef = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay registration to avoid immediate close
    const id = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handler)
    }
  }, [onClose])

  const handleSave = useCallback(() => {
    onSave(form)
    onClose()
  }, [form, onSave, onClose])

  const isDisabled = form.provider === 'disabled'

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 60,
        right: 16,
        zIndex: 10000,
        width: 320,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        color: '#1f2937',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>
        LLM 設定
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          服務 Provider
        </label>
        <select
          value={form.provider}
          onChange={(e) =>
            setForm({ ...form, provider: e.target.value as LLMConfig['provider'] })
          }
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: 14,
          }}
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Endpoint
        </label>
        <input
          type="text"
          value={form.endpoint}
          onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
          disabled={isDisabled}
          placeholder={form.provider === 'llama.cpp' ? 'http://127.0.0.1:8080/v1' : 'https://api.openai.com/v1'}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Model
        </label>
        <input
          type="text"
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          disabled={isDisabled}
          placeholder={form.provider === 'llama.cpp' ? 'qwen3.5-9b' : 'gpt-4o-mini'}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          API Key
        </label>
        <input
          type="password"
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          disabled={isDisabled}
          placeholder={form.provider === 'openai' ? 'sk-...' : '(optional)'}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          取消
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          儲存
        </button>
      </div>
    </div>
  )
}
