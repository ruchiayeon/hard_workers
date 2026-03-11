import { v4 as uuidv4 } from 'uuid'
import { getDb } from './index'
import type { Agent, AgentCreate, AgentUpdate } from '../../src/types/agent'

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    role: row.role as string,
    portraitFile: row.portrait_file as string,
    systemPrompt: row.system_prompt as string,
    llmConfig: JSON.parse(row.llm_config as string),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

export const agentRepo = {
  list(): Agent[] {
    const rows = getDb().prepare('SELECT * FROM agents ORDER BY created_at DESC').all()
    return (rows as Record<string, unknown>[]).map(rowToAgent)
  },

  get(id: string): Agent | null {
    const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id)
    return row ? rowToAgent(row as Record<string, unknown>) : null
  },

  create(data: AgentCreate): Agent {
    const now = Date.now()
    const id = uuidv4()
    getDb().prepare(`
      INSERT INTO agents (id, name, role, portrait_file, system_prompt, llm_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.role, data.portraitFile, data.systemPrompt, JSON.stringify(data.llmConfig), now, now)
    return this.get(id)!
  },

  update(data: AgentUpdate): Agent {
    const now = Date.now()
    const existing = this.get(data.id)
    if (!existing) throw new Error(`Agent ${data.id} not found`)
    const merged = { ...existing, ...data }
    getDb().prepare(`
      UPDATE agents SET name=?, role=?, portrait_file=?, system_prompt=?, llm_config=?, updated_at=?
      WHERE id=?
    `).run(merged.name, merged.role, merged.portraitFile, merged.systemPrompt, JSON.stringify(merged.llmConfig), now, data.id)
    return this.get(data.id)!
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM agents WHERE id = ?').run(id)
  },
}
