import OpenAI from 'openai'
import type { LLMProvider, ChatMessage, StreamChunkInternal } from '../types'
import type { LLMConfig } from '../../../src/types/agent'

export class OpenAIProvider implements LLMProvider {
  readonly type = 'openai' as const
  private client: OpenAI

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    })
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.models.list()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens,
    })
    return response.choices[0]?.message?.content ?? ''
  }

  async streamChat(
    messages: ChatMessage[],
    config: LLMConfig,
    onChunk: (chunk: StreamChunkInternal) => void,
    _tools?: import('../types').ToolDef[],
  ): Promise<void> {
    const stream = await this.client.chat.completions.create({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      const done = chunk.choices[0]?.finish_reason === 'stop'
      if (delta) onChunk({ delta, done: false })
      if (done) onChunk({ delta: '', done: true })
    }
  }
}
