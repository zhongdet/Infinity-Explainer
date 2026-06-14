import { TermRegistry } from './TermRegistry'
import { LLMService } from '../services/LLMService'

/**
 * Global singleton for explainer services.
 * Components import these directly instead of using React Context,
 * which avoids the $RefreshSig$ transform issue with custom hooks.
 */
export const termRegistry = new TermRegistry()
export const llmService = new LLMService()
