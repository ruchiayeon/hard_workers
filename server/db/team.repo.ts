import { v4 as uuidv4 } from 'uuid'
import { getDb } from './index'
import type { Team, TeamCreate } from '../../src/types/team'

function rowToTeam(row: Record<string, unknown>): Team {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    leaderId: row.leader_id as string,
    memberIds: JSON.parse(row.member_ids as string),
    outputDir: (row.workspace as string) || undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

export const teamRepo = {
  list(): Team[] {
    const rows = getDb().prepare('SELECT * FROM teams ORDER BY created_at DESC').all()
    return (rows as Record<string, unknown>[]).map(rowToTeam)
  },

  get(id: string): Team | null {
    const row = getDb().prepare('SELECT * FROM teams WHERE id = ?').get(id)
    return row ? rowToTeam(row as Record<string, unknown>) : null
  },

  save(data: TeamCreate & { id?: string }): Team {
    const now = Date.now()
    if (data.id) {
      getDb().prepare(`
        UPDATE teams SET name=?, description=?, leader_id=?, member_ids=?, workspace=?, updated_at=?
        WHERE id=?
      `).run(data.name, data.description ?? null, data.leaderId, JSON.stringify(data.memberIds), data.outputDir ?? null, now, data.id)
      return this.get(data.id)!
    } else {
      const id = uuidv4()
      getDb().prepare(`
        INSERT INTO teams (id, name, description, leader_id, member_ids, workspace, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description ?? null, data.leaderId, JSON.stringify(data.memberIds), data.outputDir ?? null, now, now)
      return this.get(id)!
    }
  },

  updateOutputDir(id: string, outputDir: string | null): Team | null {
    getDb().prepare('UPDATE teams SET workspace=?, updated_at=? WHERE id=?')
      .run(outputDir, Date.now(), id)
    return this.get(id)
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM teams WHERE id = ?').run(id)
  },
}
