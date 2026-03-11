/**
 * Claude OAuth - reads tokens from Claude CLI credentials
 * Falls back to opening CMD for `claude login` if not authenticated
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { updateCredential } from '../settings'
import { llmRegistry } from '../llm/registry'

const CLAUDE_CREDS_PATH = path.join(os.homedir(), '.claude', '.credentials.json')

interface ClaudeCliCredentials {
  claudeAiOauth?: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes?: string[]
    subscriptionType?: string
  }
}

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'

/**
 * Read Claude CLI credentials file directly
 */
export function readClaudeCliCredentials(): ClaudeCliCredentials | null {
  try {
    if (fs.existsSync(CLAUDE_CREDS_PATH)) {
      return JSON.parse(fs.readFileSync(CLAUDE_CREDS_PATH, 'utf-8'))
    }
  } catch { /* empty */ }
  return null
}

/**
 * Sync credentials from Claude CLI → our app settings
 * Returns true if credentials were found and synced
 */
export function syncFromClaudeCli(): boolean {
  const cliCreds = readClaudeCliCredentials()
  if (!cliCreds?.claudeAiOauth?.accessToken) return false

  const oauth = cliCreds.claudeAiOauth
  const updated = updateCredential('claude-oauth', {
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    expiresAt: oauth.expiresAt,
  })
  llmRegistry.init(updated)
  console.log(`  ✓ Claude CLI 토큰 연동 완료 (${oauth.subscriptionType ?? 'unknown'} plan)`)
  return true
}

/**
 * Open a CMD window for `claude login`
 * After login completes, credentials will be available in ~/.claude/.credentials.json
 */
export function openLoginTerminal(): void {
  const cmd = process.platform === 'win32'
    ? `start "Claude Login" cmd /k "claude login && echo. && echo 로그인 완료! 이 창을 닫아도 됩니다. && pause"`
    : process.platform === 'darwin'
      ? `osascript -e 'tell app "Terminal" to do script "claude login"'`
      : `x-terminal-emulator -e "claude login" || gnome-terminal -- claude login`

  exec(cmd, (err) => {
    if (err) console.error('  ✗ Failed to open login terminal:', err.message)
  })
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`)
  }

  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}
