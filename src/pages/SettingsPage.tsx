import { useState, useEffect, useCallback } from 'react'
import { PROVIDER_LABELS } from '../types/agent'
import type { LLMProviderType } from '../types/agent'
import { api } from '../api'

interface ProviderSetting {
  key: LLMProviderType
  label: string
  fields: Array<{ name: string; label: string; type: 'text' | 'password'; placeholder: string }>
  accessType: 'api' | 'oauth' | 'local'
}

const PROVIDER_SETTINGS: ProviderSetting[] = [
  {
    key: 'openai',
    label: PROVIDER_LABELS.openai,
    accessType: 'api',
    fields: [{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' }],
  },
  {
    key: 'anthropic',
    label: PROVIDER_LABELS.anthropic,
    accessType: 'api',
    fields: [{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...' }],
  },
  {
    key: 'gemini',
    label: PROVIDER_LABELS.gemini,
    accessType: 'api',
    fields: [{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'AI...' }],
  },
  {
    key: 'groq',
    label: PROVIDER_LABELS.groq,
    accessType: 'api',
    fields: [{ name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'gsk_...' }],
  },
  {
    key: 'ollama',
    label: PROVIDER_LABELS.ollama,
    accessType: 'local',
    fields: [{ name: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'http://localhost:11434' }],
  },
]

export default function SettingsPage() {
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean | string>>({})
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({})
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [claudeLoggingIn, setClaudeLoggingIn] = useState(false)

  const loadStatus = useCallback(async () => {
    const status = await api.settings.getKeys()
    setKeyStatus(status)
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleFieldChange = (provider: string, field: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }))
  }

  const handleSave = async (setting: ProviderSetting) => {
    const values = formValues[setting.key]
    if (!values) return
    await api.settings.setKey(setting.key, values)
    loadStatus()
    setFormValues((prev) => {
      const next = { ...prev }
      delete next[setting.key]
      return next
    })
  }

  const handleClear = async (key: LLMProviderType) => {
    await api.settings.clearKey(key)
    loadStatus()
    setTestResults((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleTest = async (key: LLMProviderType) => {
    setTesting((prev) => ({ ...prev, [key]: true }))
    const result = await api.llm.test(key)
    setTestResults((prev) => ({ ...prev, [key]: result }))
    setTesting((prev) => ({ ...prev, [key]: false }))
  }

  const handleClaudeLogin = async () => {
    setClaudeLoggingIn(true)
    try {
      await api.auth.claudeLogin()
      // Poll for login completion
      const poll = setInterval(async () => {
        const status = await api.settings.getKeys()
        if (status['claude-oauth']) {
          clearInterval(poll)
          setKeyStatus(status)
          setClaudeLoggingIn(false)
        }
      }, 2000)
      // Stop polling after 5 minutes
      setTimeout(() => { clearInterval(poll); setClaudeLoggingIn(false) }, 5 * 60 * 1000)
    } catch {
      setClaudeLoggingIn(false)
    }
  }

  const handleClaudeLogout = async () => {
    await api.auth.claudeLogout()
    loadStatus()
    setTestResults((prev) => {
      const next = { ...prev }
      delete next['claude-oauth']
      return next
    })
  }

  const accessTypeLabels = {
    api: { text: 'API 키', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    oauth: { text: '계정 로그인', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
    local: { text: '로컬', color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  }

  const claudeOAuthConfigured = !!keyStatus['claude-oauth']
  const claudeTest = testResults['claude-oauth']
  const claudeTesting = testing['claude-oauth']

  return (
    <div className="p-6 h-full overflow-y-auto">
      <h1 className="text-2xl font-bold text-white font-game mb-1">설정</h1>
      <p className="text-gray-500 text-sm mb-6">LLM 프로바이더의 API 키 또는 계정 정보를 설정합니다</p>

      <div className="space-y-4 max-w-2xl">
        {/* Claude OAuth card */}
        <div className="card-frame p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold">Claude (계정)</span>
              <span className={`text-xs px-2 py-0.5 rounded border ${accessTypeLabels.oauth.color}`}>
                {accessTypeLabels.oauth.text}
              </span>
              {claudeOAuthConfigured && (
                <span className="text-green-400 text-xs border border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded">
                  연결됨
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {claudeOAuthConfigured && (
                <>
                  <button
                    onClick={() => handleTest('claude-oauth')}
                    disabled={claudeTesting}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    {claudeTesting ? '테스트 중...' : '연결 테스트'}
                  </button>
                  <button
                    onClick={handleClaudeLogout}
                    className="btn-danger text-xs py-1 px-3"
                  >
                    연결 해제
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Test result */}
          {claudeTest && (
            <div className={`text-xs mb-3 px-3 py-1.5 rounded ${
              claudeTest.ok
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {claudeTest.ok ? '✓ 연결 성공!' : `✗ 연결 실패: ${claudeTest.error}`}
            </div>
          )}

          {!claudeOAuthConfigured && (
            <div className="space-y-3">
              <p className="text-gray-500 text-xs">
                Claude CLI의 인증 정보를 연동하거나, CMD 창을 열어 로그인합니다.
                Max/Pro 구독의 모델을 사용할 수 있습니다.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClaudeLogin}
                  disabled={claudeLoggingIn}
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  {claudeLoggingIn ? (
                    <>
                      <span className="flex items-center gap-0.5">
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                      </span>
                      로그인 대기 중...
                    </>
                  ) : (
                    '🔗 Claude 계정 연결'
                  )}
                </button>
                <button
                  onClick={async () => {
                    const result = await api.auth.claudeSync()
                    if (result.ok) loadStatus()
                    else alert(result.error ?? '연동 실패')
                  }}
                  className="btn-secondary text-xs"
                >
                  🔄 CLI 토큰 동기화
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Other providers */}
        {PROVIDER_SETTINGS.map((setting) => {
          const isConfigured = setting.key === 'ollama'
            ? true
            : !!keyStatus[setting.key]
          const test = testResults[setting.key]
          const isTesting = testing[setting.key]
          const atl = accessTypeLabels[setting.accessType]

          return (
            <div key={setting.key} className="card-frame p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-white font-semibold">{setting.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${atl.color}`}>
                    {atl.text}
                  </span>
                  {isConfigured && (
                    <span className="text-green-400 text-xs border border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded">
                      설정됨
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTest(setting.key)}
                    disabled={isTesting}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    {isTesting ? '테스트 중...' : '연결 테스트'}
                  </button>
                  {isConfigured && setting.key !== 'ollama' && (
                    <button
                      onClick={() => handleClear(setting.key)}
                      className="btn-danger text-xs py-1 px-3"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>

              {/* Test result */}
              {test && (
                <div className={`text-xs mb-3 px-3 py-1.5 rounded ${
                  test.ok
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {test.ok ? '✓ 연결 성공!' : `✗ 연결 실패: ${test.error}`}
                </div>
              )}

              {/* Input fields */}
              <div className="space-y-2">
                {setting.fields.map((field) => (
                  <div key={field.name}>
                    <label className="label">{field.label}</label>
                    <div className="flex gap-2">
                      <input
                        type={field.type}
                        className="input-field flex-1"
                        placeholder={field.placeholder}
                        value={formValues[setting.key]?.[field.name] ?? ''}
                        onChange={(e) => handleFieldChange(setting.key, field.name, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Save button for this provider */}
              {formValues[setting.key] && Object.values(formValues[setting.key]).some(v => v) && (
                <button
                  onClick={() => handleSave(setting)}
                  className="btn-primary text-xs mt-3"
                >
                  저장
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
