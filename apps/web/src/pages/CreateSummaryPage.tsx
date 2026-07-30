import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type DailyTask, type Theme } from '../lib/api'
import '../styles/pages/create-summary.css'

const typeLabel: Record<string, string> = {
  general: '通识',
  tech: '技术',
}

export function CreateSummaryPage() {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [t, home] = await Promise.all([
          api.getTheme(themeId),
          api.home().catch(() => null),
        ])
        if (cancelled) return
        setTheme(t)
        const today = (home?.today_tasks || []).filter((task) => task.theme_id === themeId)
        setTasks(today)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [themeId])

  if (loading) {
    return (
      <div className="overview-first-page">
        <p className="text-tertiary">加载中…</p>
      </div>
    )
  }

  if (error || !theme) {
    return (
      <div className="overview-first-page">
        <div className="error-banner">{error || '主题不存在'}</div>
        <Link className="ds-btn ds-btn--secondary" to="/">返回首页</Link>
      </div>
    )
  }

  const displayTasks: Array<{ id: string; title: string }> = tasks.length
    ? tasks
    : [
        { id: '1', title: '开始今日第一项学习任务' },
        { id: '2', title: '用费曼法复述一条核心概念' },
      ]

  const concepts = (() => {
    const levels = (theme.ladder_doc?.levels as Array<{ concepts?: string[] }>) || []
    const flat = levels.flatMap((l) => l.concepts || [])
    return flat.length ? flat.slice(0, 5).join(' · ') : theme.goal || '计划已就绪'
  })()

  return (
    <div className="overview-first-page">
      <section className="lock-notice">
        <div className="lock-notice__icon">
          <Icon name="check-circle" size={32} className="lock-notice__icon-img" />
        </div>
        <h1 className="lock-notice__title">计划已锁定</h1>
        <p className="lock-notice__subtitle">
          「{theme.title}」的学习计划已就绪。每天约 30 分钟，开始你的学习期。
        </p>
      </section>

      <section className="first-cta-card">
        <div className="first-cta-card__left">
          <div className="first-cta-card__label">今日任务 · {displayTasks.length} 项</div>
          <div className="first-cta-card__tasks">
            {displayTasks.slice(0, 4).map((task, i) => (
              <div key={task.id} className="first-cta-card__task">
                <span className="first-cta-card__task-index">{String(i + 1).padStart(2, '0')}</span>
                <span>{task.title}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="first-cta-card__action">
          <button
            className="ds-btn ds-btn--brand ds-btn--lg"
            type="button"
            data-dom-id="btn-enter-execution"
            onClick={() => nav(`/themes/${theme.id}/work`)}
          >
            <Icon name="play" size={14} className="icon" />
            <span>开始第一天</span>
          </button>
          <span className="first-cta-card__duration">约 30 分钟</span>
        </div>
      </section>

      <section className="core-oneliner">
        <div className="core-oneliner__text">核心：{concepts}</div>
        <div className="core-oneliner__meta">
          {typeLabel[theme.theme_type] || theme.theme_type} · 学习期
          {theme.current_ladder_level ? ` · L${theme.current_ladder_level}` : ''}
        </div>
        <Link
          to={`/themes/${theme.id}`}
          className="core-oneliner__link"
          data-dom-id="btn-view-overview"
        >
          查看完整进度
          <Icon name="arrow-right" size={12} />
        </Link>
      </section>
    </div>
  )
}
