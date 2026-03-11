import { GoogleGenerativeAI } from '@google/generative-ai'
import type { LLMProvider, ChatMessage, StreamChunkInternal } from '../types'
import type { LLMConfig } from '../../../src/types/agent'

export class GeminiProvider implements LLMProvider {
  readonly type = 'gemini' as const
  private client: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' })
      await model.generateContent('Hi')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  private buildGeminiMessages(messages: ChatMessage[]) {
    const systemMsg = messages.find((m) => m.role === 'system')
    const conversationMsgs = messages.filter((m) => m.role !== 'system')
    return { systemInstruction: systemMsg?.content, history: conversationMsgs }
  }

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    const { systemInstruction, history } = this.buildGeminiMessages(messages)
    const model = this.client.getGenerativeModel({
      model: config.model,
      systemInstruction,
      generationConfig: { temperature: config.temperature ?? 0.7 },
    })

    const lastMsg = history[history.length - 1]
    const chat = model.startChat({
      history: history.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    })
    const result = await chat.sendMessage(lastMsg?.content ?? '')
    return result.response.text()
  }

  async streamChat(
    messages: ChatMessage[],
    config: LLMConfig,
    onChunk: (chunk: StreamChunkInternal) => void,
    _tools?: import('../types').ToolDef[],
  ): Promise<void> {
    const { systemInstruction, history } = this.buildGeminiMessages(messages)
    const model = this.client.getGenerativeModel({
      model: config.model,
      systemInstruction,
      generationConfig: { temperature: config.temperature ?? 0.7 },
    })

    const lastMsg = history[history.length - 1]
    const chat = model.startChat({
      history: history.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    })

    const result = await chat.sendMessageStream(lastMsg?.content ?? '')
    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) onChunk({ delta: text, done: false })
    }
    onChunk({ delta: '', done: true })
  }
}
