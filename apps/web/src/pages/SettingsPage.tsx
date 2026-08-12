import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, type LlmSettings } from '../lib/api'
import '../styles/pages/settings.css'

export function SettingsPage() {
  const [settings, setSettings] = useState<LlmSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [wereadApiKey, setWereadApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)

  useEffect(() => {
    void api
      .getSettings()
      .then((s) => {
        setSettings(s)
        setBaseUrl(s.deepseek_base_url)
        setModel(s.deepseek_model)
        const known = s.model_options.some((o) => o.value === s.deepseek_model)
        setCustomModel(!known)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function onSave(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setOk('')
    try {
      const body: {
        deepseek_api_key?: string
        deepseek_base_url?: string
        deepseek_model?: string
        weread_api_key?: string
      } = {
        deepseek_base_url: baseUrl.trim(),
        deepseek_model: model.trim(),
      }
      if (apiKey.trim()) body.deepseek_api_key = apiKey.trim()
      if (wereadApiKey.trim()) body.weread_api_key = wereadApiKey.trim()
      const next = await api.updateSettings(body)
      setSettings(next)
      setApiKey('')
      setWereadApiKey('')
      setOk('已保存，立即生效')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onTestLlm() {
    if (testBusy) return
    setTestBusy(true)
    setError('')
    setTestMsg('')
    setOk('')
    try {
      const r = await api.testLlm()
      const reply =
        r.echo && typeof r.echo === 'object' && r.echo !== null && 'reply' in r.echo
          ? String((r.echo as { reply?: string }).reply || '')
          : ''
      setTestMsg(
        reply
          ? `连通正常（${r.model}）：模型回复「${reply}」`
          : `连通正常（${r.model}）`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTestBusy(false)
    }
  }

  const options = settings?.model_options || []

  return (
    <div className="settings-page">
      <div className="settings-head">
        <h1 className="settings-title">设置</h1>
        <p className="settings-subtitle">配置 AI 模型与密钥。本次先支持 DeepSeek（OpenAI 兼容接口）。</p>
      </div>

      {error ? <div className="error-banner" style={{ marginTop: 16 }}>{error}</div> : null}
      {ok ? <div className="ok-banner" style={{ marginTop: 16 }}>{ok}</div> : null}
      {testMsg ? <div className="ok-banner" style={{ marginTop: 16 }}>{testMsg}</div> : null}

      <form className="settings-form" onSubmit={(e) => void onSave(e)}>
        <div className="ds-settingrow__group">
          <div className="ds-settingrow__grouplabel">模型提供商 · DeepSeek</div>
          <div className="ds-settingrow__panel">
            <div className="ds-settingrow">
              <div className="ds-settingrow__main">
                <div className="ds-settingrow__title">API Key</div>
                <div className="ds-settingrow__desc">
                  {settings?.deepseek_api_key_configured
                    ? `已配置：${settings.deepseek_api_key_masked}`
                    : '尚未配置，共创与复盘将无法调用模型'}
                </div>
              </div>
              <div className="ds-settingrow__control">
                <input
                  className="settings-input"
                  type="password"
                  autoComplete="off"
                  placeholder={settings?.deepseek_api_key_configured ? '留空则保持原密钥' : 'sk-…'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>

            <div className="ds-settingrow">
              <div className="ds-settingrow__main">
                <div className="ds-settingrow__title">Base URL</div>
                <div className="ds-settingrow__desc">DeepSeek OpenAI 兼容接口地址</div>
              </div>
              <div className="ds-settingrow__control">
                <input
                  className="settings-input settings-input--wide"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com"
                />
              </div>
            </div>

            <div className="ds-settingrow">
              <div className="ds-settingrow__main">
                <div className="ds-settingrow__title">模型</div>
                <div className="ds-settingrow__desc">用于阶梯 / 资料 / 计划共创与周复盘</div>
              </div>
              <div className="ds-settingrow__control settings-model-control">
                <select
                  className="ds-settingrow__select"
                  value={customModel ? '__custom__' : model}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomModel(true)
                      return
                    }
                    setCustomModel(false)
                    setModel(e.target.value)
                  }}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  <option value="__custom__">自定义模型名…</option>
                </select>
                {customModel ? (
                  <input
                    className="settings-input"
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="例如 deepseek-chat"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="ds-settingrow__group">
          <div className="ds-settingrow__grouplabel">其他接入</div>
          <div className="ds-settingrow__panel">
            <div className="ds-settingrow">
              <div className="ds-settingrow__main">
                <div className="ds-settingrow__title">微信读书 API Key</div>
                <div className="ds-settingrow__desc">
                  {settings?.weread_configured
                    ? `已配置：${settings.weread_api_key_masked ?? '***'}`
                    : '未配置（资料 enrichment 将跳过微信读书）'}
                </div>
              </div>
              <div className="ds-settingrow__control">
                <input
                  className="settings-input"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    settings?.weread_configured
                      ? (settings.weread_api_key_masked ?? '留空则保持原密钥')
                      : 'wrk-…'
                  }
                  value={wereadApiKey}
                  onChange={(e) => setWereadApiKey(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button
            className="ds-btn ds-btn--secondary"
            type="button"
            disabled={testBusy}
            onClick={() => void onTestLlm()}
          >
            <span>{testBusy ? '测试中…' : '测试模型连通性'}</span>
          </button>
          <button className="ds-btn ds-btn--brand" type="submit" disabled={busy || !model.trim()}>
            <span>{busy ? '保存中…' : '保存设置'}</span>
          </button>
        </div>
      </form>

      <div className="settings-session">
        <button
          className="ds-btn ds-btn--secondary"
          type="button"
          onClick={() => {
            void api.logout().finally(() => {
              window.location.reload()
            })
          }}
        >
          <span>退出登录</span>
        </button>
      </div>
    </div>
  )
}
