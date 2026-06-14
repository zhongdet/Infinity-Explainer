import type { ILLMService, LLMConfig, ExplanationResult } from '../core/types'

/**
 * 預設 LLM Config（可在設定面板中覆蓋）
 */
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

/**
 * 要求 LLM 以繁體中文解釋名詞，並提取解釋中出現的關鍵技術名詞。
 * 回傳格式為 JSON：{ "explanation": "...", "technical_terms": ["..."] }
 */
function buildPrompt(term: string, context?: string): string {
  const ctx = context ? `（上下文：${context}）` : ''
  return `你是一個技術解釋助手。請用繁體中文、淺顯易懂的方式解釋「${term}」${ctx}。
解釋中如包含其他技術名詞，請一併列出。

請嚴格以 JSON 格式回覆，格式如下：
{
  "explanation": "繁體中文解釋文字",
  "technical_terms": ["名詞1", "名詞2"]
}

只回覆 JSON，不要包含其他文字。`
}

/**
 * 從 LLM 的回應中解析 JSON
 */
function parseResponse(raw: string): ExplanationResult {
  // Try direct parse
  try {
    return JSON.parse(raw) as ExplanationResult
  } catch { /* fall through */ }

  // Try to extract JSON block from markdown
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim()) as ExplanationResult
    } catch { /* fall through */ }
  }

  // Fallback: try to find { } block
  const braceMatch = raw.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as ExplanationResult
    } catch { /* fall through */ }
  }

  // Last resort: use entire response as explanation
  return {
    explanation: raw.trim(),
    technical_terms: [],
  }
}

/**
 * 實體化一個 LLMService。
 * 在同一個 session 中，service 實例讀取同一個 config。
 */
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

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: '你是一個技術知識助手。請以繁體中文回覆，並嚴格按照要求的 JSON 格式輸出。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      stream: false,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      throw new Error(`LLM API error (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    const result = parseResponse(content)

    // 過濾掉空的 technical_terms
    result.technical_terms = result.technical_terms.filter(t => t.trim().length > 0)

    return result
  }
}
