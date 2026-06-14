import type { ILLMService, LLMConfig, ExplanationResult } from '../core/types'

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'disabled',
  model: '',
  endpoint: '',
  apiKey: '',
}

const STORAGE_KEY = 'infinity-explainer-llm-config'

function loadConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as LLMConfig
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(cfg: LLMConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

function buildPrompt(term: string, context?: string): string {
  const ctx = context ? `（上下文：${context}）` : ''
  return `你是一個技術解釋助手。請用繁體中文、淺顯易懂的方式解釋「${term}」${ctx}。
直接輸出解釋文字，不需要 JSON 包裝。解釋時如果提到其他技術名詞，請用「」標註起來。`
}

/**
 * 從純文字解釋中提取 technical_terms：
 * - 匹配「」內的文字
 * - 匹配大寫字母開頭的英文技術名詞（含連字號、斜線）
 */
function extractTerms(text: string): string[] {
  const set = new Set<string>()
  // 中文引號內的詞彙
  const quoteRe = /「([^」]+)」/g
  for (const m of text.matchAll(quoteRe)) {
    const t = m[1].trim()
    if (t.length >= 2) set.add(t)
  }
  // 大寫開頭的英文技術名詞（含 CamelCase、連字號）
  const engRe = /[A-Z][a-zA-Z0-9/-]{1,60}/g
  for (const m of text.matchAll(engRe)) {
    set.add(m[0])
  }
  return [...set]
}

export class LLMService implements ILLMService {
  private config: LLMConfig

  constructor() {
    this.config = loadConfig()
  }

  configure(cfg: LLMConfig): void {
    this.config = { ...cfg }
    saveConfig(this.config)
  }

  getConfig(): LLMConfig {
    return { ...this.config }
  }

  async explain(term: string, context?: string): Promise<ExplanationResult> {
    if (this.config.provider === 'disabled') {
      return {
        explanation: `「${term}」的 LLM 解釋功能尚未設定。請先在設定面板中啟用 LLM 服務（右上角 ⚙）。`,
        technical_terms: [],
      }
    }

    const prompt = buildPrompt(term, context)
    const { endpoint, model, apiKey } = this.config

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一個技術知識助手。請以繁體中文回覆。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      throw new Error(`LLM API error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    const terms = extractTerms(content)

    return { explanation: content, technical_terms: terms }
  }

  async explainStream(
    term: string,
    onProgress: (fullText: string) => void,
    signal?: AbortSignal,
    context?: string,
  ): Promise<ExplanationResult> {
    if (this.config.provider === 'disabled') {
      const msg = `「${term}」的 LLM 解釋功能尚未設定。請先在設定面板中啟用 LLM 服務（右上角 ⚙）。`
      onProgress(msg)
      return { explanation: msg, technical_terms: [] }
    }

    const prompt = buildPrompt(term, context)
    const { endpoint, model, apiKey } = this.config

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一個技術知識助手。請以繁體中文回覆。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      // Still report partial progress if any
      throw new Error(`LLM API error (${response.status}): ${errText}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE format: "data: {...}\n\n"
      const lines = buffer.split('\n')
      // Keep the last (potentially incomplete) line in buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const json = JSON.parse(trimmed.slice(6))
          const delta: string | undefined = json.choices?.[0]?.delta?.content
          if (delta) {
            accumulated += delta
            onProgress(accumulated)
          }
        } catch {
          // Skip malformed JSON lines (e.g. trailing metadata)
        }
      }
    }

    // Process any remaining buffer
    if (buffer.startsWith('data: ') && buffer !== 'data: [DONE]') {
      try {
        const json = JSON.parse(buffer.slice(6))
        const delta: string | undefined = json.choices?.[0]?.delta?.content
        if (delta) {
          accumulated += delta
          onProgress(accumulated)
        }
      } catch { /* skip */ }
    }

    const terms = extractTerms(accumulated)
    return { explanation: accumulated, technical_terms: terms }
  }
}
