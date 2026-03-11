const API = '/api'

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(API + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  agent: {
    list: () => fetchJSON<import('./types/agent').Agent[]>('/agents'),
    get: (id: string) => fetchJSON<import('./types/agent').Agent>(`/agents/${id}`),
    create: (data: unknown) => fetchJSON<import('./types/agent').Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: unknown) => fetchJSON<import('./types/agent').Agent>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<void>(`/agents/${id}`, { method: 'DELETE' }),
  },
  team: {
    list: () => fetchJSON<import('./types/team').Team[]>('/teams'),
    get: (id: string) => fetchJSON<import('./types/team').Team>(`/teams/${id}`),
    save: (data: unknown) => fetchJSON<import('./types/team').Team>('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: unknown) => fetchJSON<import('./types/team').Team>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<void>(`/teams/${id}`, { method: 'DELETE' }),
    setOutputDir: (id: string) => fetchJSON<import('./types/team').Team & { cancelled?: boolean }>(`/teams/${id}/workspace`, { method: 'POST', body: '{}' }),
    clearOutputDir: (id: string) => fetchJSON<import('./types/team').Team>(`/teams/${id}/workspace`, { method: 'DELETE' }),
  },
  task: {
    run: (data: { teamId: string; prompt: string; openTerminals?: boolean }) => {
      // Returns EventSource-like SSE stream
      return fetch(API + '/tasks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
  },
  llm: {
    test: (provider: string) => fetchJSON<{ ok: boolean; error?: string }>('/llm/test', { method: 'POST', body: JSON.stringify({ provider }) }),
  },
  settings: {
    getKeys: () => fetchJSON<Record<string, boolean | string>>('/settings/keys'),
    setKey: (key: string, value: unknown) => fetchJSON<{ ok: boolean }>('/settings/keys', { method: 'POST', body: JSON.stringify({ key, value }) }),
    clearKey: (key: string) => fetchJSON<{ ok: boolean }>(`/settings/keys/${key}`, { method: 'DELETE' }),
  },
  workspace: {
    pick: () => fetchJSON<{ path?: string; cancelled?: boolean }>('/workspace/pick', { method: 'POST' }),
  },
  auth: {
    claudeLogin: () => fetchJSON<{ ok: boolean; message?: string }>('/auth/claude/login', { method: 'POST' }),
    claudeSync: () => fetchJSON<{ ok: boolean; message?: string; error?: string }>('/auth/claude/sync', { method: 'POST' }),
    claudeLogout: () => fetchJSON<{ ok: boolean }>('/auth/claude/logout', { method: 'POST' }),
  },
}
