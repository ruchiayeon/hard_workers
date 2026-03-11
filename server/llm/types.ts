import type { LLMConfig, LLMProviderType } from '../../src/types/agent'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool_result'
  content: string | ToolResultContent[]
  tool_use_id?: string
}

export interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export interface StreamChunkInternal {
  delta: string
  done: boolean
  error?: string
  toolCall?: { id: string; name: string; input: Record<string, unknown> }
}

export interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface LLMProvider {
  readonly type: LLMProviderType
  testConnection(): Promise<{ ok: boolean; error?: string }>
  chat(messages: ChatMessage[], config: LLMConfig): Promise<string>
  streamChat(
    messages: ChatMessage[],
    config: LLMConfig,
    onChunk: (chunk: StreamChunkInternal) => void,
    tools?: ToolDef[],
  ): Promise<void>
}
