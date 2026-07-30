import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type DailyTask, type Theme, type ThemePhase } from '../lib/api'
import '../styles/pages/theme-overview.css'

const phaseZh: Record<ThemePhase, string> = {
  learning: '学习期',
  practice: '练习期',
  application: '应用期',
}

const CORE_ITEMS = [
  { name: '主动阅读四问', status: 'done' as const, label: '已掌握' },
  { name: '检视阅读 vs 分析阅读', status: 'good' as const, label: '良好', current: true },
  { name: '刻意练习三要素', status: 'done' as const, label: '已掌握' },
  { name: '费曼学习法', status: 'weak' as const, label: '待加强' },
  { name: '间隔重复与主动回忆', status: 'weak' as const, label: '待加强' },
]

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
  const displayTasks =
    tasks.length > 0
      ? tasks
      : [
          { id: 'demo-1', title: '检视阅读《如何阅读一本书》第 2 章' },
          { id: 'demo-2', title: '用费曼法复述「检视阅读 vs 分析阅读」' },
        ]
  const stepActive = (key: ThemePhase) => theme.phase === key

  return (
    <div className="ov-page">
      {fromCreate ? <p className="muted" style={{ margin: 0 }}>首次着陆 · 计划已锁定</p> : null}

      <header className="ov-identity">
        <h1 className="ov-identity__title">{theme.title}</h1>
        <div className="ov-identity__meta">
          <span className="ds-tag ds-tag--brand">{phaseLabel}</span>
          <span className="ov-identity__goal">{theme.goal || '建立阅读方法论框架'}</span>
        </div>
      </header>

      <section className="ov-progress">
        <div className="ov-progress__track">
          <div className="ov-progress__fill" style={{ width: '43%' }} />
        </div>
        <div className="ov-progress__meta">
          <span>
            第 <span className="mono">3/7</span> 天
          </span>
          <span className="ov-sep">·</span>
          <span>每天约 30 分钟</span>
          <span className="ov-sep">·</span>
          <span>
            核心 <span className="mono">3/5</span>
          </span>
        </div>
      </section>

      <section className="ov-cta">
        <div className="ov-cta__body">
          <div className="ov-cta__label">今日任务 · {displayTasks.length} 项</div>
          <div className="ov-cta__tasks">
            {displayTasks.map((task, i) => (
              <div key={task.id} className="ov-cta__task">
                <span className="ov-cta__idx mono">{String(i + 1).padStart(2, '0')}</span>
                <span>{task.title}</span>
              </div>
            ))}
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
          <span className="ov-map__count mono">3/5</span>
        </div>
        <div className="ov-map__bar">
          <div className="ov-map__seg ov-map__seg--done" />
          <div className="ov-map__seg ov-map__seg--good" />
          <div className="ov-map__seg ov-map__seg--done" />
          <div className="ov-map__seg ov-map__seg--weak" />
          <div className="ov-map__seg ov-map__seg--weak" />
        </div>
        <ul className="ov-core-list">
          {CORE_ITEMS.map((item) => (
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
        <div className="ov-map__hint">今日任务关联「检视阅读 vs 分析阅读」</div>
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
          演示：切换到练习期
          <Icon name="arrow-right" size={12} />
        </Link>
      </div>
    </div>
  )
}
