import type { LLMProvider, ChatMessage, StreamChunkInternal } from '../types'
import type { LLMConfig } from '../../../src/types/agent'

export class OllamaProvider implements LLMProvider {
  readonly type = 'ollama' as const
  private baseUrl: string

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        options: { temperature: config.temperature ?? 0.7 },
      }),
    })
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
    const data = await res.json() as { message?: { content: string } }
    return data.message?.content ?? ''
  }

  async streamChat(
    messages: ChatMessage[],
    config: LLMConfig,
    onChunk: (chunk: StreamChunkInternal) => void,
    _tools?: import('../types').ToolDef[],
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        options: { temperature: config.temperature ?? 0.7 },
      }),
    })

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const lines = decoder.decode(value).split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const data = JSON.parse(line) as {
            message?: { content: string }
            done?: boolean
          }
          if (data.message?.content) {
            onChunk({ delta: data.message.content, done: false })
          }
          if (data.done) {
            onChunk({ delta: '', done: true })
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  }
}
