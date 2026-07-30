import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type ThemeType } from '../lib/api'

export function CreateInfoPage() {
  const nav = useNavigate()
  const [title, setTitle] = useState('革新学习方法')
  const [themeType, setThemeType] = useState<ThemeType>('general')
  const [goal, setGoal] = useState('用刻意练习把学习方法真正用起来')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const theme = await api.createTheme({ title, theme_type: themeType, goal })
      nav(`/create/${theme.id}/stage`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-narrow">
      <p className="muted">创建 · ①/④</p>
      <h1>主题信息</h1>
      <p className="lead">先写清楚要学什么。接下来三次共创会围绕这个主题展开。</p>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="title">主题名称</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="type">类型</label>
          <select id="type" value={themeType} onChange={(e) => setThemeType(e.target.value as ThemeType)}>
            <option value="general">通识（可限微信读书）</option>
            <option value="tech">技术</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="goal">一句话目标（可选）</label>
          <textarea id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="row">
          <button className="ds-btn ds-btn--brand ds-btn--lg" type="submit" disabled={busy}>
            {busy ? '创建中…' : '下一步：阶梯共创'}
          </button>
          <button className="ds-btn ds-btn--ghost" type="button" onClick={() => nav('/')}>取消</button>
        </div>
      </form>
    </div>
  )
}
