import { useState, useEffect } from 'react'
import type { Agent, AgentCreate, LLMProviderType, LLMConfig } from '../../types/agent'
import { PROVIDER_MODELS, PROVIDER_LABELS } from '../../types/agent'

interface Props {
  agent?: Agent | null
  onSave: (data: AgentCreate) => void
  onClose: () => void
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
}

export default function AgentEditor({ agent, onSave, onClose }: Props) {
  const [name, setName] = useState(agent?.name ?? '')
  const [role, setRole] = useState(agent?.role ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '')
  const [portraitFile, setPortraitFile] = useState(agent?.portraitFile ?? '')
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(agent?.llmConfig ?? DEFAULT_CONFIG)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleProviderChange = (provider: LLMProviderType) => {
    const models = PROVIDER_MODELS[provider]
    setLlmConfig({
      ...llmConfig,
      provider,
      model: models[0],
    })
  }

  const handleSubmit = () => {
    if (!name.trim() || !role.trim()) return
    onSave({
      name: name.trim(),
      role: role.trim(),
      systemPrompt,
      portraitFile: portraitFile || 'default.png',
      llmConfig,
    })
  }

  const providerType = llmConfig.provider
  const accessType = providerType === 'claude-oauth' ? 'account' : providerType === 'ollama' ? 'local' : 'api'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card-frame w-[560px] max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-pixel text-yellow-400 text-sm">
            {agent ? 'EDIT AGENT' : 'NEW AGENT'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label">이름 (Name)</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 분석가 민수"
            />
          </div>
          <div>
            <label className="label">역할 (Role)</label>
            <input
              className="input-field"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="예: Data Analyst"
            />
          </div>
        </div>

        {/* Portrait */}
        <div className="mb-5">
          <label className="label">초상화 (Portrait File)</label>
          <input
            className="input-field"
            value={portraitFile}
            onChange={(e) => setPortraitFile(e.target.value)}
            placeholder="파일명 (예: analyst.png) 또는 URL"
          />
          <p className="text-gray-600 text-xs mt-1">assets/agents/ 폴더에 PNG 이미지를 넣어주세요</p>
        </div>

        {/* LLM Configuration */}
        <div className="border border-game-border rounded-lg p-4 mb-5">
          <h3 className="text-xs text-gray-300 uppercase tracking-wider font-semibold mb-3">
            LLM 설정
          </h3>

          {/* Access Type Indicator */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">접근 방식:</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${
              accessType === 'api' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
              accessType === 'account' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
              'bg-green-500/20 text-green-400 border-green-500/30'
            }`}>
              {accessType === 'api' ? '🔑 API 키' : accessType === 'account' ? '👤 계정 접근' : '🖥 로컬'}
            </span>
          </div>

          {/* Provider Select */}
          <div className="mb-3">
            <label className="label">LLM 프로바이더</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PROVIDER_LABELS) as LLMProviderType[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-2 py-1.5 rounded text-xs border transition-all ${
                    llmConfig.provider === p
                      ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-400'
                      : 'border-game-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Model Select */}
          <div className="mb-3">
            <label className="label">모델</label>
            <select
              className="input-field"
              value={llmConfig.model}
              onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
            >
              {PROVIDER_MODELS[llmConfig.provider].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Temperature ({llmConfig.temperature ?? 0.7})</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={llmConfig.temperature ?? 0.7}
                onChange={(e) => setLlmConfig({ ...llmConfig, temperature: parseFloat(e.target.value) })}
                className="w-full accent-yellow-400"
              />
            </div>
            <div>
              <label className="label">Max Tokens</label>
              <input
                type="number"
                className="input-field"
                value={llmConfig.maxTokens ?? 4096}
                onChange={(e) => setLlmConfig({ ...llmConfig, maxTokens: parseInt(e.target.value) || 4096 })}
                min={100}
                max={128000}
              />
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div className="mb-6">
          <label className="label">시스템 프롬프트</label>
          <textarea
            className="input-field min-h-[120px] resize-y"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="이 에이전트의 성격과 전문 분야를 설명해주세요..."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">취소</button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !role.trim()}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {agent ? '저장' : '생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
