/**
 * Claude OAuth provider with tool use support
 */
import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, ChatMessage, StreamChunkInternal, ToolDef } from '../types'
import type { LLMConfig } from '../../../src/types/agent'
import { refreshAccessToken } from '../../auth/claude-oauth'
import { updateCredential } from '../../settings'
import { llmRegistry } from '../registry'

interface OAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export class ClaudeOAuthProvider implements LLMProvider {
  readonly type = 'claude-oauth' as const
  private creds: OAuthCredentials

  constructor(creds: OAuthCredentials) {
    this.creds = creds
  }

  async getClient(): Promise<Anthropic> {
    if (Date.now() > this.creds.expiresAt - 5 * 60 * 1000) {
      try {
        const tokens = await refreshAccessToken(this.creds.refreshToken)
        this.creds.accessToken = tokens.access_token
        this.creds.refreshToken = tokens.refresh_token
        this.creds.expiresAt = Date.now() + tokens.expires_in * 1000
        const updated = updateCredential('claude-oauth', this.creds)
        llmRegistry.init(updated)
      } catch (e) {
        console.error('Token refresh failed:', e)
        throw new Error('Claude OAuth 토큰이 만료되었습니다. 다시 로그인해주세요.')
      }
    }
    return new Anthropic({ authToken: this.creds.accessToken })
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = await this.getClient()
      await client.messages.create({
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
    const client = await this.getClient()
    const systemMsg = messages.find((m) => m.role === 'system')
    const userMessages = messages.filter((m) => m.role !== 'system')

    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: systemMsg?.content as string | undefined,
      messages: userMessages as Anthropic.MessageParam[],
      temperature: config.temperature ?? 0.7,
    })
    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  async streamChat(
    messages: ChatMessage[],
    config: LLMConfig,
    onChunk: (chunk: StreamChunkInternal) => void,
    tools?: ToolDef[],
  ): Promise<void> {
    const client = await this.getClient()
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    // Convert our messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = chatMessages.map((m) => {
      if (m.role === 'tool_result' && Array.isArray(m.content)) {
        return {
          role: 'user' as const,
          content: m.content.map((tr) => ({
            type: 'tool_result' as const,
            tool_use_id: tr.tool_use_id,
            content: tr.content,
            is_error: tr.is_error,
          })),
        }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content as string }
    })

    const params: Anthropic.MessageCreateParams = {
      model: config.model,
      max_tokens: config.maxTokens ?? 8192,
      system: systemMsg?.content as string | undefined,
      messages: anthropicMessages,
      temperature: config.temperature ?? 0.7,
    }

    if (tools && tools.length > 0) {
      params.tools = tools as Anthropic.Tool[]
    }

    const stream = client.messages.stream(params)

    let currentToolId = ''
    let currentToolName = ''
    let toolInputJson = ''

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolId = event.content_block.id
          currentToolName = event.content_block.name
          toolInputJson = ''
          onChunk({ delta: `\n🔧 ${currentToolName} 호출 중...`, done: false })
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          onChunk({ delta: event.delta.text, done: false })
        } else if (event.delta.type === 'input_json_delta') {
          toolInputJson += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolId && currentToolName) {
          try {
            const input = JSON.parse(toolInputJson || '{}')
            onChunk({
              delta: '',
              done: false,
              toolCall: { id: currentToolId, name: currentToolName, input },
            })
          } catch {
            onChunk({
              delta: '',
              done: false,
              toolCall: { id: currentToolId, name: currentToolName, input: {} },
            })
          }
          currentToolId = ''
          currentToolName = ''
          toolInputJson = ''
        }
      } else if (event.type === 'message_stop') {
        onChunk({ delta: '', done: true })
      }
    }
  }
}
