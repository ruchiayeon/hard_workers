/**
 * Opens a PowerShell window per agent to show real-time streaming output
 * Tracks opened state via PID lock files — survives server restarts
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'

const LOG_DIR = path.join(os.homedir(), '.crew-builder', 'logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

const streams = new Map<string, fs.WriteStream>()

function lockFile(agentId: string) { return path.join(LOG_DIR, `${agentId}.pid`) }
function logFile(agentId: string) { return path.join(LOG_DIR, `${agentId}.log`) }

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

function isTerminalAlive(agentId: string): boolean {
  try {
    const pid = parseInt(fs.readFileSync(lockFile(agentId), 'utf-8').trim(), 10)
    return !isNaN(pid) && isProcessAlive(pid)
  } catch { return false }
}

function getStream(agentId: string): fs.WriteStream {
  let stream = streams.get(agentId)
  if (stream && !stream.destroyed) return stream
  stream = fs.createWriteStream(logFile(agentId), { flags: 'a' })
  streams.set(agentId, stream)
  return stream
}

/**
 * Open or reuse a terminal for an agent.
 */
export function openAgentTerminal(agentId: string, agentName: string, role: string): void {
  const alive = isTerminalAlive(agentId)
  const roleIcon = role === 'leader' ? '👑' : '⚔'

  if (alive) {
    // Terminal still open — write separator and reuse
    const stream = getStream(agentId)
    stream.write(`\n\n${'━'.repeat(60)}\n  🔄 새로운 미션 시작\n${'━'.repeat(60)}\n`)
    return
  }

  // First time or terminal was closed — init log file and open window
  const logPath = logFile(agentId)
  fs.writeFileSync(logPath, '')

  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  streams.set(agentId, stream)

  stream.write([
    '═'.repeat(60),
    `  ${roleIcon} ${agentName} (${role})`,
    '═'.repeat(60),
    '\n',
  ].join('\n'))

  // Spawn detached PowerShell — gets its own window on Windows
  const title = `${roleIcon} ${agentName} - Crew Builder`
  const psScript = `$Host.UI.RawUI.WindowTitle='${title}'; Get-Content -Path '${logPath.replace(/'/g, "''")}' -Wait -Encoding UTF8`

  const child = spawn('powershell', ['-NoProfile', '-Command', psScript], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  // Save PID so we can check if it's alive later (even after server restart)
  if (child.pid) {
    fs.writeFileSync(lockFile(agentId), String(child.pid))
  }
}

export function writeToTerminal(agentId: string, text: string) {
  const stream = streams.get(agentId)
  if (stream && !stream.destroyed) stream.write(text)
}

export function writePhaseToTerminal(agentId: string, phase: string) {
  const stream = streams.get(agentId)
  if (!stream || stream.destroyed) return

  const labels: Record<string, string> = {
    planning: '🗺️  계획 수립 중...',
    executing: '⚡ 작업 실행 중...',
    synthesizing: '🔗 결과 종합 중...',
  }
  stream.write(`\n\n── ${labels[phase] ?? phase} ${'─'.repeat(40)}\n\n`)
}

export function completeTerminal(agentId: string) {
  const stream = streams.get(agentId)
  if (!stream || stream.destroyed) return
  stream.write(`\n\n${'═'.repeat(60)}\n  ✅ 작업 완료\n${'═'.repeat(60)}\n`)
}
