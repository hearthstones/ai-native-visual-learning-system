import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Theme } from '../lib/api'

export function ThemePlanPage() {
  const { themeId = '' } = useParams()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [slots, setSlots] = useState<Record<string, { used: number; max: number }>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [t, s] = await Promise.all([api.getTheme(themeId), api.slots()])
    setTheme(t)
    setSlots(s)
  }

  useEffect(() => {
    void load().catch((e) => setError(String(e.message || e)))
  }, [themeId])

  async function advance() {
    setBusy(true)
    setError('')
    try {
      await api.advancePhase(themeId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggleFocus() {
    if (!theme) return
    setBusy(true)
    try {
      await api.updateTheme(theme.id, { is_focus: !theme.is_focus })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!theme) return <div className="page"><p className="muted">加载中…</p></div>

  return (
    <div className="page">
      <p className="muted">
        <Link to={`/themes/${theme.id}`}>{theme.title}</Link> / 阶段管理
      </p>
      <h1>阶段与并发</h1>
      <p className="lead">学 1 / 练 3 / 用 5 硬槽；主焦点 ≤3，超过 1 个会记漂移。</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="row" style={{ marginBottom: 24 }}>
        {Object.entries(slots).map(([k, v]) => (
          <span key={k} className="ds-tag">{k}: {v.used}/{v.max}</span>
        ))}
      </div>

      <div className="theme-card" style={{ cursor: 'default' }}>
        <div>
          <strong>{theme.title}</strong>
          <div className="muted">当前阶段：{theme.phase}</div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="ds-btn ds-btn--brand" type="button" disabled={busy} onClick={() => void advance()}>
          进入下一阶段
        </button>
        <button className="ds-btn ds-btn--secondary" type="button" disabled={busy} onClick={() => void toggleFocus()}>
          {theme.is_focus ? '取消主焦点' : '设为主焦点'}
        </button>
        <button
          className="ds-btn ds-btn--ghost"
          type="button"
          disabled={busy}
          onClick={() => void api.updateTheme(theme.id, { status: 'dormant' }).then(load)}
        >
          休眠腾槽
        </button>
      </div>
    </div>
  )
}
