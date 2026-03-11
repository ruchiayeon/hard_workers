import type { Agent } from './agent'

export interface Team {
  id: string
  name: string
  description?: string
  leaderId: string
  memberIds: string[]
  outputDir?: string
  createdAt: number
  updatedAt: number
}

export interface ResolvedTeam {
  id: string
  name: string
  description?: string
  leader: Agent
  members: Agent[]
}

export type TeamCreate = Omit<Team, 'id' | 'createdAt' | 'updatedAt'>
export type TeamUpdate = Partial<TeamCreate> & { id: string }
