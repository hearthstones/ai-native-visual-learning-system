import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type DailyTask, type Theme, type ThemePhase } from '../lib/api'
import '../styles/pages/theme-work.css'

type Mode = 'execute' | 'plan' | 'review'

const phaseZh: Record<ThemePhase, string> = {
  learning: '学习阶段',
  practice: '练习阶段',
  application: '应用阶段',
}

const DEMO_SUGGESTIONS = [
  { id: 'suggestion-1', text: '把「主动阅读四问」做成 Anki 闪卡', adopted: false },
  { id: 'suggestion-2', text: '每次阅读前先写 3 个问题', adopted: true },
  { id: 'suggestion-3', text: '费曼复述录音频回放对比', adopted: false },
]

export function ThemeWorkPage() {
  const { themeId = '' } = useParams()
  const [mode, setMode] = useState<Mode>('execute')
  const [theme, setTheme] = useState<Theme | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [suggestions, setSuggestions] = useState(DEMO_SUGGESTIONS)
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
      <div className="work-page">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!theme) {
    return (
      <div className="work-page">
        <p className="muted">加载中…</p>
      </div>
    )
  }

  const phaseLabel = phaseZh[theme.phase]
  const doneCount = tasks.filter((t) => t.done).length
  const totalCount = tasks.length
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0

  return (
    <div className="work-page">
      <div className="breadcrumb">
        <Link to={`/themes/${theme.id}`} data-dom-id="btn-back-overview" id="breadcrumb-back-overview">
          <Icon name="arrow-left" size={12} />
          返回看板
        </Link>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <span>
          {theme.title} · {phaseLabel}
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <span style={{ color: 'var(--text-default)' }}>作业面</span>
      </div>

      <div className="page-header">
        <h1 className="page-header__title">{theme.title}</h1>
        <div className="page-header__meta">
          <span className="page-header__meta-item">
            <Icon name="calendar" size={14} />
            W1 Day 3
          </span>
          <span className="page-header__meta-item">
            <Icon name="clock" size={14} />
            每天约 30 分钟
          </span>
          <span className="ds-tag ds-tag--brand">{phaseLabel}</span>
        </div>
      </div>

      <div className="ds-tabs" style={{ marginBottom: 'var(--spacer-24)' }}>
        <button
          type="button"
          className={`ds-tab${mode === 'execute' ? ' is-active' : ''}`}
          data-dom-id="tab-execute"
          onClick={() => setMode('execute')}
        >
          执行
        </button>
        <button
          type="button"
          className={`ds-tab${mode === 'plan' ? ' is-active' : ''}`}
          data-dom-id="tab-plan"
          onClick={() => setMode('plan')}
        >
          计划
        </button>
        <button
          type="button"
          className={`ds-tab${mode === 'review' ? ' is-active' : ''}`}
          data-dom-id="tab-review"
          onClick={() => setMode('review')}
        >
          复盘与改进
        </button>
      </div>

      <div className={`mode-panel${mode === 'execute' ? ' is-active' : ''}`} id="panel-execute">
        <div className="work-layout">
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--spacer-16)',
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-family-heading, 'SF Pro')",
                  fontSize: 'var(--heading-xs-font-size)',
                  fontWeight: 600,
                  color: 'var(--text-default)',
                  margin: 0,
                }}
              >
                今日任务
              </h2>
              <span className="ds-tag ds-tag--brand">{totalCount} 项</span>
            </div>
            <div className="task-list">
              {tasks.length === 0 && (
                <p className="text-tertiary" style={{ fontSize: 'var(--body-sm-font-size)' }}>
                  今日暂无该主题任务。
                </p>
              )}
              {tasks.map((task) => (
                <div key={task.id} className={`task-item${task.done ? ' is-done' : ''}`}>
                  <label className="ds-check task-item__check">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={async (e) => {
                        const done = e.target.checked
                        await api.toggleTask(task.id, done)
                        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done } : t)))
                      }}
                    />
                    <span className="ds-check__box" />
                  </label>
                  <div className="task-item__body">
                    <p className="task-item__text">{task.title}</p>
                    <div className="task-item__meta">
                      <span className="task-item__source">
                        <Icon name="layers" size={12} />
                        来自当前学习切片
                      </span>
                      {task.description ? (
                        <span className="task-item__source">{task.description}</span>
                      ) : (
                        <span className="task-item__source">
                          <Icon name="clock" size={12} />
                          约 15 分钟
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 'var(--spacer-24)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--spacer-8)',
                }}
              >
                <span className="text-secondary" style={{ fontSize: 'var(--body-xs-font-size)' }}>
                  今日进度
                </span>
                <span className="mono text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)' }}>
                  {doneCount} / {totalCount}
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar__fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>

          <aside className="source-sidebar">
            <p className="source-sidebar__title">来源</p>
            <p className="source-sidebar__text">当前学习切片</p>
            <p className="source-sidebar__text" style={{ marginTop: 'var(--spacer-8)' }}>
              检视阅读与分析阅读
            </p>
            <div
              style={{
                marginTop: 'var(--spacer-16)',
                paddingTop: 'var(--spacer-16)',
                borderTop: '1px solid var(--border-neutral-l1)',
              }}
            >
              <p className="source-sidebar__title">阶段</p>
              <p className="source-sidebar__text">{phaseLabel} · W1</p>
            </div>
            <div
              style={{
                marginTop: 'var(--spacer-16)',
                paddingTop: 'var(--spacer-16)',
                borderTop: '1px solid var(--border-neutral-l1)',
              }}
            >
              <p className="source-sidebar__title">日程</p>
              <p className="source-sidebar__text">Day 3 / 7</p>
            </div>
          </aside>
        </div>
      </div>

      <div className={`mode-panel${mode === 'plan' ? ' is-active' : ''}`} id="panel-plan">
        <div className="slice-card">
          <div className="slice-card__header">
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-family-heading, 'SF Pro')",
                  fontSize: 'var(--heading-xs-font-size)',
                  fontWeight: 600,
                  color: 'var(--text-default)',
                  margin: '0 0 var(--spacer-4) 0',
                }}
              >
                当前学习切片
              </h2>
              <p className="text-tertiary" style={{ fontSize: 'var(--body-sm-font-size)', margin: 0 }}>
                检视阅读与分析阅读
              </p>
            </div>
            <div className="plan-actions">
              <Link
                to={`/themes/${theme.id}/plan`}
                data-dom-id="btn-open-phases"
                className="ds-btn ds-btn--secondary ds-btn--sm"
              >
                <Icon name="layout" size={12} className="icon" />
                阶段管理
              </Link>
              <Link
                to={`/create/${theme.id}/plan`}
                data-dom-id="btn-open-cocreate"
                className="ds-btn ds-btn--brand ds-btn--sm"
              >
                <Icon name="sparkles" size={12} className="icon" />
                打开共创
              </Link>
            </div>
          </div>
          <div className="slice-card__body">
            <div className="slice-item">
              <span className="slice-item__num">01</span>
              <span>检视阅读四步法</span>
            </div>
            <div className="slice-item">
              <span className="slice-item__num">02</span>
              <span>分析阅读三阶段</span>
            </div>
            <div className="slice-item">
              <span className="slice-item__num">03</span>
              <span>对比两者适用场景</span>
            </div>
          </div>
        </div>

        <div className="plan-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)' }}>
            <span className="text-tertiary" style={{ fontSize: 'var(--body-sm-font-size)' }}>
              W1 Day 3 / 7
            </span>
            <div className="progress-bar" style={{ width: 120, marginTop: 0 }}>
              <div className="progress-bar__fill" style={{ width: '43%' }} />
            </div>
          </div>
          <Link
            to={`/themes/${theme.id}/plan`}
            data-dom-id="btn-open-phases"
            className="ds-btn ds-btn--tertiary ds-btn--sm"
          >
            <Icon name="chevron-right" size={12} className="icon" />
            阶段管理
          </Link>
        </div>
      </div>

      <div className={`mode-panel${mode === 'review' ? ' is-active' : ''}`} id="panel-review">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacer-16)',
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-family-heading, 'SF Pro')",
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 600,
              color: 'var(--text-default)',
              margin: 0,
            }}
          >
            改进建议
          </h2>
          <span className="ds-tag ds-tag--brand">来自 W0 复盘</span>
        </div>
        <div className="suggestion-list">
          {suggestions.map((s) => (
            <div key={s.id} className={`suggestion-item${s.adopted ? ' is-adopted' : ''}`} id={s.id}>
              <label className="ds-check suggestion-item__check">
                <input
                  type="checkbox"
                  checked={s.adopted}
                  onChange={(e) => {
                    const adopted = e.target.checked
                    setSuggestions((prev) =>
                      prev.map((x) => (x.id === s.id ? { ...x, adopted } : x)),
                    )
                  }}
                />
                <span className="ds-check__box" />
              </label>
              <div className="suggestion-item__body">
                <p className="suggestion-item__text">{s.text}</p>
                <span className="suggestion-item__source">
                  <Icon name="refresh" size={12} />
                  来自 W0 复盘
                </span>
              </div>
              <div className="suggestion-item__status">
                <span className={`ds-tag${s.adopted ? ' ds-tag--success' : ''}`}>
                  {s.adopted ? '已采纳' : '待采纳'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="review-footer">
          <span className="text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)' }}>
            采纳建议将融入下一阶段学习切片
          </span>
          <Link to="/review" data-dom-id="btn-open-full-review" className="ds-btn ds-btn--secondary ds-btn--sm">
            <Icon name="file-text" size={12} className="icon" />
            进入完整复盘
          </Link>
        </div>
      </div>
    </div>
  )
}
