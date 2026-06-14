/* ===== Data Types ===== */

export interface TextSegment {
  text: string
  isTerm: boolean
  isUserTerm: boolean
}

export interface ExplanationResult {
  explanation: string
  technical_terms: string[]
}

export interface LLMConfig {
  provider: 'openai' | 'llama.cpp' | 'disabled'
  model: string
  endpoint: string
  apiKey: string
}

/* ===== Explainer Shape Props (used by tldraw shape) ===== */

export interface ExplainerShapeProps {
  text: string
  w: number
  h: number
  /** LLM 回傳的技術名詞，自動成為可點擊詞彙 */
  terms: string[]
  /** 使用者手動標記的詞彙 */
  userTerms: string[]
}

/* ===== Core Interfaces ===== */

export interface ITermRegistry {
  register(term: string, shapeId?: string): void
  getTerms(shapeId?: string): string[]
  isTerm(text: string, shapeId?: string): boolean
}

export interface ITokenizer {
  /**
   * 將文字切成 TextSegment[]，使用 longest-match-first 策略。
   * terms 為該作用域內的所有可點擊詞彙。
   */
  tokenize(text: string, terms: string[]): TextSegment[]
}

export interface ILLMService {
  configure(cfg: LLMConfig): void
  getConfig(): LLMConfig
  /** 非串流：回傳完整解釋 + 技術名詞列表 */
  explain(term: string, context?: string): Promise<ExplanationResult>
  /**
   * 串流：onProgress(fullText) 在每個 token 抵達時回呼，
   * Promise resolve 時回傳完整 ExplanationResult（含 technical_terms）。
   */
  explainStream(
    term: string,
    onProgress: (fullText: string) => void,
    signal?: AbortSignal,
    context?: string,
  ): Promise<ExplanationResult>
}

/* ===== Helper ===== */

/**
 * 取得某個 shape 的完整可點擊詞彙列表（terms + userTerms）
 */
export function getClickableTerms(props: ExplainerShapeProps): string[] {
  const set = new Set<string>()
  for (const t of props.terms) set.add(t)
  for (const t of props.userTerms) set.add(t)
  return [...set]
}
