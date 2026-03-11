/**
 * Opens a PowerShell window per agent to show real-time streaming output
 * Tracks opened state via PID lock files — survives server restarts
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn, exec } from 'child_process'

const LOG_DIR = path.join(os.homedir(), '.crew-builder', 'logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

const streams = new Map<string, fs.WriteStream>()

function lockFile(agentId: string) { return path.join(LOG_DIR, `${agentId}.pid`) }
function logFile(agentId: string) { return path.join(LOG_DIR, `${agentId}.log`) }

function isTerminalAlive(agentId: string): boolean {
  // lock 파일이 있으면 터미널이 열린 적 있다고 판단 (창이 닫혔으면 재오픈)
  return fs.existsSync(lockFile(agentId))
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

  // exec으로 start 명령 실행 → 새 CMD 창 생성
  const title = `${roleIcon} ${agentName}`
  const safeTitle = title.replace(/"/g, '')
  const safePath = logPath.replace(/'/g, "''")
  const cmd = `start "${safeTitle}" powershell -NoProfile -NoExit -Command "Get-Content -Path '${safePath}' -Wait -Encoding UTF8"`

  exec(cmd, (err) => {
    if (err) console.error('[agent-terminal] exec error:', err.message)
  })
  console.log(`[agent-terminal] opened CMD for ${agentName}, log=${logPath}`)

  // PID 추적은 exec에서 불가하므로 log 파일 존재로 alive 판단
  fs.writeFileSync(lockFile(agentId), '1')
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
  if (stream && !stream.destroyed) {
    stream.write(`\n\n${'═'.repeat(60)}\n  ✅ 작업 완료\n${'═'.repeat(60)}\n`)
    stream.end()
    streams.delete(agentId)
  }
  // lock 삭제 → 다음 실행 시 새 창 열기
  try { fs.unlinkSync(lockFile(agentId)) } catch { /* ignore */ }
}
