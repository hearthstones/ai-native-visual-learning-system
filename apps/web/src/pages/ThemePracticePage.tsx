import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type DailyTask, type Theme } from '../lib/api'
import { getCoreConcepts, getCurrentLevel, phaseZh } from '../lib/themeDoc'
import '../styles/pages/theme-practice.css'

export function ThemePracticePage() {
  const { themeId = '' } = useParams()
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

  const cores = useMemo(() => (theme ? getCoreConcepts(theme, 5) : []), [theme])

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
  const doneTasks = tasks.filter((t) => t.done).length
  const taskProgress = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0

  return (
    <div className="ov-page">
      <header className="ov-identity">
        <h1 className="ov-identity__title">{theme.title}</h1>
        <div className="ov-identity__meta">
          <span className="ds-tag ds-tag--brand">{phaseLabel}</span>
          <span className="ov-identity__goal">{theme.goal || '在真实场景中刻意练习'}</span>
        </div>
      </header>

      <section className="ov-progress">
        <div className="ov-progress__track">
          <div className="ov-progress__fill" style={{ width: `${taskProgress}%` }} />
        </div>
        <div className="ov-progress__meta">
          <span>{phaseLabel}</span>
          {level ? (
            <>
              <span className="ov-sep">·</span>
              <span>
                L<span className="mono">{level.level}</span> · {level.name}
              </span>
            </>
          ) : null}
          <span className="ov-sep">·</span>
          <span>
            今日{' '}
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
          to={`/themes/${theme.id}?mode=execute`}
          className="ds-btn ds-btn--brand ds-btn--lg"
          data-dom-id="btn-enter-execution"
        >
          <Icon name="play" size={14} className="icon" />
          去执行
        </Link>
      </section>

      <section className="ov-map">
        <div className="ov-map__head">
          <span className="ov-map__title">学习路径</span>
        </div>
        <div className="ov-path">
          <div
            className={`ov-path__stage${
              theme.phase === 'learning' ? ' ov-path__stage--current' : ' ov-path__stage--done'
            }`}
          >
            <div className="ov-path__stage-head">
              <span className="ov-path__stage-name">学</span>
            </div>
            <div className="ov-path__stage-label">学习期</div>
            <div className="ov-path__stage-meta">
              {theme.phase === 'learning' ? '当前' : '已完成 / 可回顾'}
            </div>
          </div>
          <div className="ov-path__connector">
            <Icon name="arrow-right" size={12} />
          </div>
          <div
            className={`ov-path__stage${
              theme.phase === 'practice'
                ? ' ov-path__stage--current'
                : theme.phase === 'application'
                  ? ' ov-path__stage--done'
                  : ' ov-path__stage--upcoming'
            }`}
          >
            <div className="ov-path__stage-head">
              <span className="ov-path__stage-dot" />
              <span className="ov-path__stage-name">练</span>
            </div>
            <div className="ov-path__stage-label">练习期</div>
            <div className="ov-path__stage-meta">
              {theme.phase === 'practice' ? '当前' : theme.phase === 'application' ? '已完成' : '未开始'}
            </div>
          </div>
          <div className="ov-path__connector">
            <Icon name="arrow-right" size={12} />
          </div>
          <div
            className={`ov-path__stage${
              theme.phase === 'application' ? ' ov-path__stage--current' : ' ov-path__stage--upcoming'
            }`}
          >
            <div className="ov-path__stage-head">
              <span className="ov-path__stage-dot ov-path__stage-dot--hollow" />
              <span className="ov-path__stage-name">用</span>
            </div>
            <div className="ov-path__stage-label">应用期</div>
            <div className="ov-path__stage-meta">
              {theme.phase === 'application' ? '当前' : '未开始'}
            </div>
          </div>
        </div>
        <div className="ov-map__hint">
          {level?.mastery || `${phaseLabel} · 围绕「${theme.title}」巩固核心方法`}
        </div>
      </section>

      <section className="ov-aux">
        <details className="ov-aux-core" open>
          <summary>
            <span className="ov-aux-core__label">
              核心概念 <span className="mono">{cores.length}</span>
            </span>
            <Icon name="chevron-right" size={12} className="ov-aux-core__chevron" />
          </summary>
          <ul className="ov-core-list">
            {cores.length === 0 ? (
              <li className="ov-core">
                <span className="ov-core__name text-tertiary">暂无核心概念数据</span>
              </li>
            ) : (
              cores.map((name) => (
                <li key={name} className="ov-core">
                  <span className="ov-core__dot" />
                  <span className="ov-core__name">{name}</span>
                  <span className="ov-core__label">待复盘评估</span>
                </li>
              ))
            )}
          </ul>
        </details>
      </section>

      <nav className="ov-secondary">
        <Link
          to={`/themes/${theme.id}/document`}
          className="ov-secondary__link"
          data-dom-id="btn-plan-document"
        >
          <Icon name="file-text" size={12} />
          主题计划书
        </Link>
        <span className="ov-secondary__sep">·</span>
        <Link to={`/themes/${theme.id}/plan`} className="ov-secondary__link" data-dom-id="btn-plan">
          <Icon name="layout" size={12} />
          调整计划
        </Link>
        <span className="ov-secondary__sep">·</span>
        <Link to="/review" className="ov-secondary__link" data-dom-id="btn-review">
          <Icon name="trending-up" size={12} />
          复盘
        </Link>
      </nav>

      <div className="ov-demo">
        <Link to={`/themes/${theme.id}`} className="ov-demo__link" data-dom-id="btn-demo-learning">
          返回主题概览
          <Icon name="arrow-right" size={12} />
        </Link>
      </div>
    </div>
  )
}
