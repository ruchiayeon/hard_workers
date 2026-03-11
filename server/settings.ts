import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ProviderCredentials } from '../src/types/settings'

function getConfigPath(): string {
  const dir = path.join(os.homedir(), '.crew-builder')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'credentials.json')
}

export function loadCredentials(): ProviderCredentials {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { /* empty */ }
  return {}
}

export function saveCredentials(creds: ProviderCredentials): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(creds, null, 2))
}

export function updateCredential(
  key: keyof ProviderCredentials,
  value: ProviderCredentials[keyof ProviderCredentials] | null
): ProviderCredentials {
  const creds = loadCredentials()
  if (value === null) delete creds[key]
  else (creds as Record<string, unknown>)[key] = value
  saveCredentials(creds)
  return creds
}
