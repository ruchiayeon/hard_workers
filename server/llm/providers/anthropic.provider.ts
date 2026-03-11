import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, ChatMessage, StreamChunkInternal } from '../types'
import type { LLMConfig } from '../../../src/types/agent'

export class AnthropicProvider implements LLMProvider {
  readonly type = 'anthropic' as const
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const userMessages = messages.filter((m) => m.role !== 'system')

    const response = await this.client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: systemMsg?.content,
      messages: userMessages as Anthropic.MessageParam[],
      temperature: config.temperature ?? 0.7,
    })
    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  async streamChat(
    messages: ChatMessage[],
    config: LLMConfig,
    onChunk: (chunk: StreamChunkInternal) => void,
    _tools?: import('../types').ToolDef[],
  ): Promise<void> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const userMessages = messages.filter((m) => m.role !== 'system')

    const stream = this.client.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: systemMsg?.content,
      messages: userMessages as Anthropic.MessageParam[],
      temperature: config.temperature ?? 0.7,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onChunk({ delta: event.delta.text, done: false })
      }
      if (event.type === 'message_stop') {
        onChunk({ delta: '', done: true })
      }
    }
  }
}
