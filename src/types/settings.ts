export interface ProviderCredentials {
  openai?: { apiKey: string }
  anthropic?: { apiKey: string }
  gemini?: { apiKey: string }
  groq?: { apiKey: string }
  ollama?: { baseUrl: string }
  'claude-oauth'?: { accessToken: string; refreshToken: string; expiresAt: number }
}

export type ProviderKeyStatus = {
  [K in keyof ProviderCredentials]: boolean
}

export interface TestConnectionResult {
  ok: boolean
  error?: string
}
