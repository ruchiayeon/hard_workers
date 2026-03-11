import { OpenAIProvider } from './openai.provider'
import type { LLMConfig } from '../../../src/types/agent'
import type { ChatMessage, StreamChunkInternal } from '../types'

// Groq uses OpenAI-compatible API
export class GroqProvider extends OpenAIProvider {
  override readonly type = 'groq' as const

  constructor(apiKey: string) {
    super(apiKey, 'https://api.groq.com/openai/v1')
  }

  override async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.chat(
        [{ role: 'user', content: 'Hi' }],
        { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 10 }
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  override async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    return super.chat(messages, config)
  }

  override async streamChat(
    messages: ChatMessage[],
    config: LLMConfig,
    onChunk: (chunk: StreamChunkInternal) => void,
    _tools?: import('../types').ToolDef[],
  ): Promise<void> {
    return super.streamChat(messages, config, onChunk, _tools)
  }
}
