export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type AgentRunStatus = 'idle' | 'streaming' | 'done' | 'error'
export type AgentRole = 'leader' | 'member'
export type RunPhase = 'planning' | 'discussing' | 'executing' | 'synthesizing'

export interface Task {
  id: string
  teamId: string
  teamName: string
  prompt: string
  status: TaskStatus
  createdAt: number
  completedAt?: number
}

export interface AgentRun {
  taskId: string
  agentId: string
  agentName: string
  agentRole: AgentRole
  subtask?: string
  output: string
  status: AgentRunStatus
  phase?: RunPhase
  startedAt?: number
  completedAt?: number
}

export interface StreamChunk {
  taskId: string
  agentId: string
  agentName: string
  agentRole: AgentRole
  delta: string
  done: boolean
  phase?: RunPhase
  error?: string
}

export interface FinalResult {
  taskId: string
  content: string
  completedAt: number
}

export interface TaskCreate {
  teamId: string
  prompt: string
}
