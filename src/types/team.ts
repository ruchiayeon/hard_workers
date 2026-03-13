import type { Agent } from './agent'

export type RelationMode = 'solo' | 'collaborate' | 'hierarchical'

export interface MemberRelation {
  fromId: string  // hierarchical: supervisor
  toId: string    // hierarchical: subordinate
  mode: RelationMode
}

export interface Team {
  id: string
  name: string
  description?: string
  leaderId: string
  memberIds: string[]
  outputDir?: string
  defaultMode: RelationMode
  relations: MemberRelation[]
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
