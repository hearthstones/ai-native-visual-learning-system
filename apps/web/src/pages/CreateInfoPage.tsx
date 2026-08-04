import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type ThemeType } from '../lib/api'
import '../styles/pages/create-info.css'

export function CreateInfoPage() {
  const nav = useNavigate()
  const [title, setTitle] = useState('革新学习方法')
  const [themeType, setThemeType] = useState<ThemeType>('general')
  const [goal, setGoal] = useState('建立可持续的主题阅读方法')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkingSlot, setCheckingSlot] = useState(true)

  useEffect(() => {
    let cancelled = false
    void api
      .slots()
      .then((slots) => {
        if (cancelled) return
        const used = slots.learning?.used ?? 0
        const max = slots.learning?.max ?? 1
        if (used >= max) {
          nav('/create/intercept', { replace: true })
          return
        }
        setCheckingSlot(false)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setCheckingSlot(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [nav])

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const slots = await api.slots()
      const used = slots.learning?.used ?? 0
      const max = slots.learning?.max ?? 1
      if (used >= max) {
        nav('/create/intercept', { replace: true })
        return
      }
      const theme = await api.createTheme({ title: title.trim(), theme_type: themeType, goal })
      nav(`/create/${theme.id}/stage`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (checkingSlot) {
    return (
      <div className="create-page">
        <p className="text-secondary">检查学习槽位…</p>
      </div>
    )
  }

  return (
    <div className="create-page">
      <div className="create-stepper" aria-label="创建步骤">
        <span className="create-stepper__item is-current">信息</span>
        <span className="create-stepper__sep">·</span>
        <span className="create-stepper__item">阶梯</span>
        <span className="create-stepper__sep">·</span>
        <span className="create-stepper__item">资料</span>
        <span className="create-stepper__sep">·</span>
        <span className="create-stepper__item">计划</span>
      </div>

      <div className="create-head">
        <h1 className="create-title">主题信息</h1>
        <p className="create-subtitle">给主题起个名字，选择类型，写一句话目标。接下来 AI 教练会帮你共创学习阶梯。</p>
      </div>

      {error ? <div className="error-banner" style={{ marginTop: 16 }}>{error}</div> : null}

      <form className="create-form" onSubmit={(e) => void onSubmit(e)}>
        <div className="form-group">
          <label className="form-label" htmlFor="theme-name">主题名</label>
          <input
            className="form-input"
            type="text"
            id="theme-name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：革新学习方法"
            required
          />
        </div>

        <div className="form-group">
          <span className="form-label">类型</span>
          <div className="radio-group">
            <label className="radio-card">
              <input
                type="radio"
                name="theme-type"
                value="general"
                checked={themeType === 'general'}
                onChange={() => setThemeType('general')}
              />
              <span className="radio-card__body">
                <span className="radio-card__title">通识主题</span>
                <span className="radio-card__desc">围绕书籍、文章、课程建立阅读能力与方法</span>
              </span>
            </label>
            <label className="radio-card">
              <input
                type="radio"
                name="theme-type"
                value="tech"
                checked={themeType === 'tech'}
                onChange={() => setThemeType('tech')}
              />
              <span className="radio-card__body">
                <span className="radio-card__title">技术主题</span>
                <span className="radio-card__desc">围绕代码、框架、工具建立可复用的工作流</span>
              </span>
            </label>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="theme-goal">一句话目标（可选）</label>
          <input
            className="form-input"
            type="text"
            id="theme-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="例如：建立可持续的主题阅读方法"
          />
        </div>
      </form>

      <div className="create-actions">
        <button
          className="ds-btn ds-btn--brand ds-btn--lg"
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void onSubmit()}
          data-dom-id="btn-start-cocreate"
        >
          <Icon name="sparkles" size={14} className="icon" />
          <span>{busy ? '创建中…' : '进入学习阶梯共创'}</span>
        </button>
        <span className="create-actions__hint">下一步：AI 教练将根据主题生成 5 级学习阶梯</span>
      </div>
    </div>
  )
}
