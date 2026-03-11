import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db/index'
import { agentRepo } from './db/agent.repo'
import { teamRepo } from './db/team.repo'
import { llmRegistry } from './llm/registry'
import { loadCredentials, updateCredential } from './settings'
import { runCrew } from './crew/runner'
import { syncFromClaudeCli, openLoginTerminal } from './auth/claude-oauth'

const app = express()
app.use(cors())
app.use(express.json())

// Initialize
getDb()
const creds = loadCredentials()
llmRegistry.init(creds)

// Auto-sync Claude CLI credentials on startup
if (!creds['claude-oauth']?.accessToken) {
  syncFromClaudeCli()
}

// ── Agent routes ──────────────────────────────────────────
app.get('/api/agents', (_req, res) => res.json(agentRepo.list()))
app.get('/api/agents/:id', (req, res) => {
  const agent = agentRepo.get(req.params.id)
  agent ? res.json(agent) : res.status(404).json({ error: 'Not found' })
})
app.post('/api/agents', (req, res) => res.json(agentRepo.create(req.body)))
app.put('/api/agents/:id', (req, res) => res.json(agentRepo.update({ id: req.params.id, ...req.body })))
app.delete('/api/agents/:id', (req, res) => { agentRepo.delete(req.params.id); res.json({ ok: true }) })

// ── Team routes ───────────────────────────────────────────
app.get('/api/teams', (_req, res) => res.json(teamRepo.list()))
app.get('/api/teams/:id', (req, res) => {
  const team = teamRepo.get(req.params.id)
  team ? res.json(team) : res.status(404).json({ error: 'Not found' })
})
app.post('/api/teams', (req, res) => res.json(teamRepo.save(req.body)))
app.put('/api/teams/:id', (req, res) => res.json(teamRepo.save({ id: req.params.id, ...req.body })))
app.delete('/api/teams/:id', (req, res) => { teamRepo.delete(req.params.id); res.json({ ok: true }) })

// ── Workspace (folder picker) ─────────────────────────────
app.post('/api/workspace/pick', (_req, res) => {
  const { exec } = require('child_process') as typeof import('child_process')
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const pathMod = require('path') as typeof import('path')

  const tmpFile = pathMod.join(os.tmpdir(), `crew-builder-pick-${Date.now()}.txt`)
  // Write result to temp file so we can read it back
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '결과 저장 폴더를 선택하세요'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq 'OK') {
  [System.IO.File]::WriteAllText('${tmpFile.replace(/\\/g, '\\\\')}', $f.SelectedPath)
} else {
  [System.IO.File]::WriteAllText('${tmpFile.replace(/\\/g, '\\\\')}', '')
}
`.trim().replace(/\n/g, '; ')

  exec(`powershell -NoProfile -STA -Command "${psScript}"`, { timeout: 120000 }, (err) => {
    try {
      if (err) { res.json({ cancelled: true }); return }
      const selected = fs.existsSync(tmpFile) ? fs.readFileSync(tmpFile, 'utf-8').trim() : ''
      fs.unlinkSync(tmpFile)
      res.json(selected ? { path: selected } : { cancelled: true })
    } catch {
      res.json({ cancelled: true })
    }
  })
})

app.post('/api/teams/:id/workspace', (req, res) => {
  const { path: manualPath } = req.body
  if (manualPath) {
    const team = teamRepo.updateOutputDir(req.params.id, manualPath)
    res.json(team)
    return
  }
  // Reuse /api/workspace/pick logic — redirect internally is messy, so just duplicate
  const { exec } = require('child_process') as typeof import('child_process')
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const pathMod = require('path') as typeof import('path')
  const tmpFile = pathMod.join(os.tmpdir(), `crew-builder-pick-${Date.now()}.txt`)
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '결과 저장 폴더를 선택하세요'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq 'OK') {
  [System.IO.File]::WriteAllText('${tmpFile.replace(/\\/g, '\\\\')}', $f.SelectedPath)
} else {
  [System.IO.File]::WriteAllText('${tmpFile.replace(/\\/g, '\\\\')}', '')
}
`.trim().replace(/\n/g, '; ')
  exec(`powershell -NoProfile -STA -Command "${psScript}"`, { timeout: 120000 }, (err) => {
    try {
      if (err) { res.json({ cancelled: true }); return }
      const selected = fs.existsSync(tmpFile) ? fs.readFileSync(tmpFile, 'utf-8').trim() : ''
      fs.unlinkSync(tmpFile)
      if (selected) {
        const team = teamRepo.updateOutputDir(req.params.id, selected)
        res.json(team)
      } else {
        res.json({ cancelled: true })
      }
    } catch {
      res.json({ cancelled: true })
    }
  })
})

app.delete('/api/teams/:id/workspace', (req, res) => {
  const team = teamRepo.updateOutputDir(req.params.id, null)
  res.json(team)
})

// ── Task routes (SSE streaming) ───────────────────────────
app.post('/api/tasks/run', (req, res) => {
  const { teamId, prompt, openTerminals } = req.body
  const team = teamRepo.get(teamId)
  if (!team) { res.status(404).json({ error: 'Team not found' }); return }
  const leader = agentRepo.get(team.leaderId)
  if (!leader) { res.status(404).json({ error: 'Leader not found' }); return }
  const members = team.memberIds.map((id: string) => agentRepo.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof agentRepo.get>>[]

  const taskId = uuidv4()

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Task-Id', taskId)
  res.flushHeaders()

  runCrew(res, taskId, leader, members, prompt, openTerminals ?? false, team.outputDir ?? undefined)
})

// ── LLM test ──────────────────────────────────────────────
app.post('/api/llm/test', async (req, res) => {
  try {
    const provider = llmRegistry.getProvider(req.body.provider)
    const result = await provider.testConnection()
    res.json(result)
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message })
  }
})

// ── Settings routes ───────────────────────────────────────
app.get('/api/settings/keys', (_req, res) => {
  const c = loadCredentials()
  res.json({
    openai: !!c.openai?.apiKey,
    anthropic: !!c.anthropic?.apiKey,
    gemini: !!c.gemini?.apiKey,
    groq: !!c.groq?.apiKey,
    'ollama-url': c.ollama?.baseUrl ?? 'http://localhost:11434',
    'claude-oauth': !!c['claude-oauth']?.accessToken,
  })
})

app.post('/api/settings/keys', (req, res) => {
  const { key, value } = req.body
  const updated = updateCredential(key, value)
  llmRegistry.init(updated)
  res.json({ ok: true })
})

app.delete('/api/settings/keys/:key', (req, res) => {
  const updated = updateCredential(req.params.key as keyof typeof creds, null)
  llmRegistry.init(updated)
  res.json({ ok: true })
})

// ── Claude OAuth routes ──────────────────────────────────
app.post('/api/auth/claude/login', (_req, res) => {
  // First try to sync from existing CLI credentials
  if (syncFromClaudeCli()) {
    res.json({ ok: true, message: 'Claude CLI 토큰을 연동했습니다' })
    return
  }
  // Otherwise open CMD for `claude login`
  openLoginTerminal()
  res.json({ ok: true, message: 'CMD 창에서 Claude 로그인을 진행해주세요' })
})

app.post('/api/auth/claude/sync', (_req, res) => {
  // Manual sync from Claude CLI credentials
  if (syncFromClaudeCli()) {
    res.json({ ok: true, message: 'Claude CLI 토큰 연동 완료' })
  } else {
    res.json({ ok: false, error: 'Claude CLI 인증 정보를 찾을 수 없습니다. CMD에서 `claude login`을 먼저 실행해주세요.' })
  }
})

app.post('/api/auth/claude/logout', (_req, res) => {
  const updated = updateCredential('claude-oauth', null)
  llmRegistry.init(updated)
  res.json({ ok: true })
})

// ── Static assets (agent portraits) ──────────────────────
app.use('/assets', express.static('assets'))

const PORT = 3456
app.listen(PORT, () => {
  console.log(`\n  ⚔ Crew Builder server running at http://localhost:${PORT}`)
  console.log(`  Frontend: http://localhost:5173\n`)
})
