import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type DailyTask, type Theme, type ThemePhase } from '../lib/api'
import {
  coreStatus,
  getCoreConcepts,
  getCurrentLevel,
  getSelectedLevel,
  phaseZh,
} from '../lib/themeDoc'
import '../styles/pages/theme-overview.css'

export function ThemeOverviewPage() {
  const { themeId = '' } = useParams()
  const [params] = useSearchParams()
  const fromCreate = params.get('from') === 'create'
  const [theme, setTheme] = useState<Theme | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [t, home] = await Promise.all([api.getTheme(themeId), api.home()])
        setTheme(t)
        setTasks(home.today_tasks.filter((x) => x.theme_id === themeId))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [themeId])

  const cores = useMemo(() => {
    if (!theme) return []
    const concepts = getCoreConcepts(theme, 5)
    const selected = getSelectedLevel(theme)
    return concepts.map((name, i) => ({
      name,
      ...coreStatus(i, concepts.length, selected),
    }))
  }, [theme])

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
  const doneCores = cores.filter((c) => c.status === 'done' || c.status === 'good').length
  const currentCore = cores.find((c) => c.current)?.name || cores[0]?.name
  const stepActive = (key: ThemePhase) => theme.phase === key
  const demoLabel =
    theme.phase === 'practice'
      ? '演示：练习期看板'
      : theme.phase === 'application'
        ? '演示：应用期看板'
        : '演示：切换到练习期看板'

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
          <div
            className="ov-progress__fill"
            style={{
              width: `${cores.length ? Math.round((doneCores / cores.length) * 100) : 20}%`,
            }}
          />
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
          <span>每天约 30 分钟</span>
          <span className="ov-sep">·</span>
          <span>
            核心{' '}
            <span className="mono">
              {doneCores}/{cores.length || 0}
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
          <span className="ov-map__title">核心掌握</span>
          <span className="ov-map__count mono">
            {doneCores}/{cores.length || 0}
          </span>
        </div>
        {cores.length > 0 ? (
          <>
            <div className="ov-map__bar">
              {cores.map((item) => (
                <div
                  key={item.name}
                  className={`ov-map__seg ov-map__seg--${item.status}`}
                />
              ))}
            </div>
            <ul className="ov-core-list">
              {cores.map((item) => (
                <li
                  key={item.name}
                  className={`ov-core ov-core--${item.status}${item.current ? ' ov-core--current' : ''}`}
                >
                  <span className="ov-core__dot" />
                  <span className="ov-core__name">{item.name}</span>
                  <span className={`ov-core__label ov-core__label--${item.status}`}>{item.label}</span>
                </li>
              ))}
            </ul>
            {currentCore ? (
              <div className="ov-map__hint">今日聚焦「{currentCore}」</div>
            ) : null}
          </>
        ) : (
          <div className="ov-map__hint">完成阶梯共创后，这里会展示核心概念掌握情况</div>
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

      <div className="ov-demo">
        <Link
          to={`/themes/${theme.id}/practice`}
          className="ov-demo__link"
          data-dom-id="btn-demo-practice"
        >
          {demoLabel}
          <Icon name="arrow-right" size={12} />
        </Link>
      </div>
    </div>
  )
}
