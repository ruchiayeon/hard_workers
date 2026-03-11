import type { LLMProviderType } from '../../src/types/agent'
import type { LLMProvider } from './types'
import { OpenAIProvider } from './providers/openai.provider'
import { AnthropicProvider } from './providers/anthropic.provider'
import { GeminiProvider } from './providers/gemini.provider'
import { GroqProvider } from './providers/groq.provider'
import { OllamaProvider } from './providers/ollama.provider'
import { ClaudeOAuthProvider } from './providers/claude-oauth.provider'
import type { ProviderCredentials } from '../../src/types/settings'

class LLMRegistry {
  private providers = new Map<LLMProviderType, LLMProvider>()

  init(creds: ProviderCredentials) {
    if (creds.openai?.apiKey) this.providers.set('openai', new OpenAIProvider(creds.openai.apiKey))
    if (creds.anthropic?.apiKey) this.providers.set('anthropic', new AnthropicProvider(creds.anthropic.apiKey))
    if (creds.gemini?.apiKey) this.providers.set('gemini', new GeminiProvider(creds.gemini.apiKey))
    if (creds.groq?.apiKey) this.providers.set('groq', new GroqProvider(creds.groq.apiKey))
    this.providers.set('ollama', new OllamaProvider(creds.ollama?.baseUrl))
    if (creds['claude-oauth']?.accessToken) {
      this.providers.set('claude-oauth', new ClaudeOAuthProvider(creds['claude-oauth']))
    }
  }

  getProvider(type: LLMProviderType): LLMProvider {
    const provider = this.providers.get(type)
    if (!provider) throw new Error(`LLM provider '${type}' is not configured. Add credentials in Settings.`)
    return provider
  }

  hasProvider(type: LLMProviderType): boolean {
    return this.providers.has(type)
  }
}

export const llmRegistry = new LLMRegistry()
