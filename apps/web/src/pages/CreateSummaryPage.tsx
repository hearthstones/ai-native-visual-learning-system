import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type DailyTask, type Theme } from '../lib/api'
import { getCoreConcepts, phaseZh } from '../lib/themeDoc'
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
  const [queueCount, setQueueCount] = useState(0)
  const [homeUnavailable, setHomeUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filling, setFilling] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      setHomeUnavailable(false)
      try {
        const t = await api.getTheme(themeId)
        if (cancelled) return
        setTheme(t)
        try {
          const home = await api.home()
          if (cancelled) return
          setTasks(home.today_tasks.filter((task) => task.theme_id === themeId))
          setQueueCount(home.queue.filter((item) => item.theme_id === themeId).length)
        } catch {
          if (!cancelled) {
            setHomeUnavailable(true)
            setTasks([])
            setQueueCount(0)
          }
        }
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

  async function fillTodayThenHome() {
    setFilling(true)
    setError('')
    try {
      await api.suggestCommitments(themeId)
      nav('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFilling(false)
    }
  }

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

  const phaseLabel = phaseZh[theme.phase]
  const displayTasks = tasks
  const concepts = getCoreConcepts(theme)
  const conceptLine = concepts.length ? concepts.join(' · ') : theme.goal || '计划已就绪'
  const emptyHint = homeUnavailable
    ? '今日看板暂时加载失败。可先进入主题看板查看计划，或稍后回到今日看板。'
    : queueCount > 0
      ? `计划已入可做队列（${queueCount} 条）。今日承诺需主动选择，或一键按建议填入。`
      : '暂无今日承诺，也没有可做队列活动——可稍后在主题看板查看计划。'

  return (
    <div className="overview-first-page">
      <section className="lock-notice">
        <div className="lock-notice__icon">
          <Icon name="check-circle" size={32} className="lock-notice__icon-img" />
        </div>
        <h1 className="lock-notice__title">计划已锁定</h1>
        <p className="lock-notice__subtitle">
          「{theme.title}」的学习计划已就绪。学习期按课表推进（默认约 10 节 × 2 小时）；练/用期再按每天节奏执行。开始你的
          {phaseLabel}。
        </p>
      </section>

      <section className="first-cta-card">
        <div className="first-cta-card__left">
          <div className="first-cta-card__label">今日任务 · {displayTasks.length} 项</div>
          <div className="first-cta-card__tasks">
            {displayTasks.length === 0 ? (
              <div className="first-cta-card__task">
                <span className="first-cta-card__task-index">—</span>
                <span>{emptyHint}</span>
              </div>
            ) : (
              displayTasks.slice(0, 4).map((task, i) => (
                <div key={task.id} className="first-cta-card__task">
                  <span className="first-cta-card__task-index">{String(i + 1).padStart(2, '0')}</span>
                  <span>{task.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="first-cta-card__action">
          {displayTasks.length === 0 && queueCount > 0 ? (
            <button
              className="ds-btn ds-btn--brand ds-btn--lg"
              type="button"
              data-dom-id="btn-fill-today-and-home"
              disabled={filling}
              onClick={() => void fillTodayThenHome()}
            >
              <Icon name="play" size={14} className="icon" />
              <span>{filling ? '填入中…' : '按建议填入并开始今天'}</span>
            </button>
          ) : (
            <button
              className="ds-btn ds-btn--brand ds-btn--lg"
              type="button"
              data-dom-id="btn-enter-execution"
              onClick={() => nav(homeUnavailable ? `/themes/${theme.id}` : '/')}
            >
              <Icon name="play" size={14} className="icon" />
              <span>{homeUnavailable ? '进入主题看板' : '回到今日看板'}</span>
            </button>
          )}
          {displayTasks.length === 0 && queueCount > 0 ? (
            <button
              className="ds-btn ds-btn--secondary"
              type="button"
              data-dom-id="btn-enter-home-empty"
              disabled={filling}
              onClick={() => nav('/')}
            >
              先回今日看板
            </button>
          ) : null}
          <span className="first-cta-card__duration">按计划节奏</span>
        </div>
      </section>

      <section className="core-oneliner">
        <div className="core-oneliner__text">核心：{conceptLine}</div>
        <div className="core-oneliner__meta">
          {typeLabel[theme.theme_type] || theme.theme_type} · {phaseLabel}
          {theme.current_ladder_level ? ` · L${theme.current_ladder_level}` : ''}
        </div>
        <Link
          to={`/themes/${theme.id}/document`}
          className="core-oneliner__link"
          data-dom-id="btn-view-plan-document"
        >
          查看主题计划书
          <Icon name="arrow-right" size={12} />
        </Link>
        <Link
          to={`/themes/${theme.id}`}
          className="core-oneliner__link"
          data-dom-id="btn-view-overview"
          style={{ marginTop: 8 }}
        >
          查看完整进度
          <Icon name="arrow-right" size={12} />
        </Link>
      </section>
    </div>
  )
}
