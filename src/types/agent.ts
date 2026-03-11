export type LLMProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'ollama'
  | 'claude-oauth'

export interface LLMConfig {
  provider: LLMProviderType
  model: string
  temperature?: number
  maxTokens?: number
  extra?: Record<string, unknown>
}

export interface Agent {
  id: string
  name: string
  role: string
  portraitFile: string
  systemPrompt: string
  llmConfig: LLMConfig
  createdAt: number
  updatedAt: number
}

export type AgentCreate = Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>
export type AgentUpdate = Partial<AgentCreate> & { id: string }

export const PROVIDER_MODELS: Record<LLMProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  ollama: ['llama3.2', 'mistral', 'codellama', 'phi3'],
  'claude-oauth': ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
}

export const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  groq: 'Groq',
  ollama: 'Ollama',
  'claude-oauth': 'Claude (계정)',
}

export const PROVIDER_COLORS: Record<LLMProviderType, string> = {
  openai: 'provider-openai',
  anthropic: 'provider-anthropic',
  gemini: 'provider-gemini',
  groq: 'provider-groq',
  ollama: 'provider-ollama',
  'claude-oauth': 'provider-claude-oauth',
}
