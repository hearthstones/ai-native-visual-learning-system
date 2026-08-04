import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type ActiveSlice, type DailyTask, type Theme, type ThemePhase } from '../lib/api'
import { getCoreConcepts, getCurrentLevel, getDailyMinutes, getSliceItems, phaseZh } from '../lib/themeDoc'
import '../styles/pages/theme-overview.css'

export function ThemeOverviewPage() {
  const { themeId = '' } = useParams()
  const [params] = useSearchParams()
  const fromCreate = params.get('from') === 'create'
  const [theme, setTheme] = useState<Theme | null>(null)
  const [slice, setSlice] = useState<ActiveSlice | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [t, home, active] = await Promise.all([
          api.getTheme(themeId),
          api.home(),
          api.getActiveSlice(themeId).catch(() => null),
        ])
        setTheme(t)
        setSlice(active)
        setTasks(home.today_tasks.filter((x) => x.theme_id === themeId))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [themeId])

  const cores = useMemo(() => (theme ? getCoreConcepts(theme, 5) : []), [theme])
  const sliceItems = useMemo(() => getSliceItems(slice, theme), [slice, theme])

  if (error) {
    return (
      <div className="ov-page">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!theme) {
    return (
      <div className="ov-page">
        <p className="muted">加载中…</p>
      </div>
    )
  }

  const phaseLabel = phaseZh[theme.phase]
  const level = getCurrentLevel(theme)
  const dailyMinutes = getDailyMinutes(slice, theme)
  const doneTasks = tasks.filter((t) => t.done).length
  const sliceDone = sliceItems.filter((it) => it.done).length
  const sliceTotal = sliceItems.length
  const hasSliceProgress = sliceTotal > 0
  const progressPct = hasSliceProgress
    ? Math.round((sliceDone / sliceTotal) * 100)
    : tasks.length
      ? Math.round((doneTasks / tasks.length) * 100)
      : 0
  const stepActive = (key: ThemePhase) => theme.phase === key

  return (
    <div className="ov-page">
      {fromCreate ? <p className="muted" style={{ margin: 0 }}>首次着陆 · 计划已锁定</p> : null}

      <header className="ov-identity">
        <h1 className="ov-identity__title">{theme.title}</h1>
        <div className="ov-identity__meta">
          <span className="ds-tag ds-tag--brand">{phaseLabel}</span>
          <span className="ov-identity__goal">{theme.goal || level?.understand || '围绕主题持续推进'}</span>
        </div>
      </header>

      <section className="ov-progress">
        <div className="ov-progress__track">
          <div className="ov-progress__fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="ov-progress__meta">
          {level ? (
            <>
              <span>
                L<span className="mono">{level.level}</span> · {level.name}
              </span>
              <span className="ov-sep">·</span>
            </>
          ) : null}
          <span>每天约 {dailyMinutes} 分钟</span>
          <span className="ov-sep">·</span>
          <span>
            切片{' '}
            <span className="mono">
              {sliceDone}/{sliceTotal}
            </span>
            <span className="ov-sep"> · </span>
            今日任务{' '}
            <span className="mono">
              {doneTasks}/{tasks.length}
            </span>
          </span>
        </div>
      </section>

      <section className="ov-cta">
        <div className="ov-cta__body">
          <div className="ov-cta__label">今日任务 · {tasks.length} 项</div>
          <div className="ov-cta__tasks">
            {tasks.length === 0 ? (
              <div className="ov-cta__task">
                <span className="ov-cta__idx mono">—</span>
                <span>今天还没有该主题任务</span>
              </div>
            ) : (
              tasks.map((task, i) => (
                <div key={task.id} className="ov-cta__task">
                  <span className="ov-cta__idx mono">{String(i + 1).padStart(2, '0')}</span>
                  <span>{task.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <Link
          to={`/themes/${theme.id}/work`}
          className="ds-btn ds-btn--brand ds-btn--lg"
          data-dom-id="btn-enter-execution"
        >
          <Icon name="play" size={14} className="icon" />
          进入执行
        </Link>
      </section>

      <section className="ov-map">
        <div className="ov-map__head">
          <span className="ov-map__title">核心概念</span>
          <span className="ov-map__count mono">{cores.length}</span>
        </div>
        {cores.length > 0 ? (
          <>
            <ul className="ov-core-list">
              {cores.map((name, i) => (
                <li key={name} className={`ov-core${i === 0 ? ' ov-core--current' : ''}`}>
                  <span className="ov-core__dot" />
                  <span className="ov-core__name">{name}</span>
                  <span className="ov-core__label">{i === 0 ? '本周自评' : '待自评'}</span>
                </li>
              ))}
            </ul>
            <div className="ov-map__hint">掌握度请在周复盘中自评，这里只列出阶梯核心概念</div>
          </>
        ) : (
          <div className="ov-map__hint">完成阶梯共创后，这里会展示核心概念</div>
        )}
      </section>

      <section className="ov-aux">
        <div className="ov-stepper">
          <div className={`ov-step${stepActive('learning') ? ' ov-step--active' : ''}`}>
            <span className="ov-step__dot" />
            <span className="ov-step__label">学</span>
          </div>
          <div className="ov-step__line" />
          <div className={`ov-step${stepActive('practice') ? ' ov-step--active' : ''}`}>
            <span className="ov-step__dot" />
            <span className="ov-step__label">练</span>
          </div>
          <div className="ov-step__line" />
          <div className={`ov-step${stepActive('application') ? ' ov-step--active' : ''}`}>
            <span className="ov-step__dot" />
            <span className="ov-step__label">用</span>
          </div>
        </div>
      </section>

      <nav className="ov-secondary">
        <Link to={`/themes/${theme.id}/plan`} className="ov-secondary__link" data-dom-id="btn-plan">
          <Icon name="layout" size={12} />
          调整计划
        </Link>
        <span className="ov-secondary__sep">·</span>
        <Link to="/review" className="ov-secondary__link" data-dom-id="btn-review">
          <Icon name="trending-up" size={12} />
          复盘
        </Link>
        <span className="ov-secondary__sep">·</span>
        <Link to={`/themes/${theme.id}/work`} className="ov-secondary__link">
          <Icon name="scroll-text" size={12} />
          作业
        </Link>
      </nav>
    </div>
  )
}
