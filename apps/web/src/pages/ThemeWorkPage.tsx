import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type ActiveSlice, type DailyTask, type Theme } from '../lib/api'
import { getCoreConcepts, getCurrentLevel, getSliceItems, phaseZh } from '../lib/themeDoc'
import '../styles/pages/theme-work.css'

type Mode = 'execute' | 'plan' | 'review'

export function ThemeWorkPage() {
  const { themeId = '' } = useParams()
  const [mode, setMode] = useState<Mode>('execute')
  const [theme, setTheme] = useState<Theme | null>(null)
  const [slice, setSlice] = useState<ActiveSlice | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [t, home, active] = await Promise.all([
          api.getTheme(themeId),
          api.home(),
          api.getActiveSlice(themeId).catch(() => null),
        ])
        setTheme(t)
        setTasks(home.today_tasks.filter((x) => x.theme_id === themeId))
        setSlice(active)
        const key = `work-note:${themeId}`
        setNote(localStorage.getItem(key) || '')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [themeId])

  const level = useMemo(() => getCurrentLevel(theme), [theme])
  const sliceItems = useMemo(() => getSliceItems(slice, theme), [slice, theme])
  const concepts = useMemo(() => getCoreConcepts(theme, 3), [theme])

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
  const sliceTitle = slice?.title || (level ? `L${level.level} · ${level.name}` : theme.title)

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
          {level ? (
            <span className="page-header__meta-item">
              <Icon name="layers" size={14} />
              {`L${level.level} · ${level.name}`}
            </span>
          ) : null}
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
                        {sliceTitle}
                      </span>
                      {task.description ? (
                        <span className="task-item__source">{task.description}</span>
                      ) : null}
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
            <p className="source-sidebar__text">{theme.title}</p>
            <p className="source-sidebar__text" style={{ marginTop: 'var(--spacer-8)' }}>
              {sliceTitle}
            </p>
            {level?.understand ? (
              <p className="source-sidebar__text" style={{ marginTop: 'var(--spacer-8)' }}>
                {level.understand}
              </p>
            ) : null}
            <div
              style={{
                marginTop: 'var(--spacer-16)',
                paddingTop: 'var(--spacer-16)',
                borderTop: '1px solid var(--border-neutral-l1)',
              }}
            >
              <p className="source-sidebar__title">阶段</p>
              <p className="source-sidebar__text">{phaseLabel}</p>
            </div>
            {concepts.length > 0 ? (
              <div
                style={{
                  marginTop: 'var(--spacer-16)',
                  paddingTop: 'var(--spacer-16)',
                  borderTop: '1px solid var(--border-neutral-l1)',
                }}
              >
                <p className="source-sidebar__title">核心</p>
                <p className="source-sidebar__text">{concepts.join(' · ')}</p>
              </div>
            ) : null}
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
                当前计划切片
              </h2>
              <p className="text-tertiary" style={{ fontSize: 'var(--body-sm-font-size)', margin: 0 }}>
                {sliceTitle}
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
            {sliceItems.length === 0 ? (
              <p className="text-tertiary" style={{ fontSize: 'var(--body-sm-font-size)' }}>
                暂无切片活动，请先完成计划共创并锁定。
              </p>
            ) : (
              sliceItems.map((item, i) => (
                <div key={item.id} className="slice-item">
                  <span className="slice-item__num">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    {item.label}
                    <span className="text-tertiary" style={{ marginLeft: 8, fontSize: 11 }}>
                      {item.done ? '已完成' : item.desc}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="plan-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)' }}>
            <span className="text-tertiary" style={{ fontSize: 'var(--body-sm-font-size)' }}>
              {phaseLabel}
              {level ? ` · L${level.level}` : ''}
            </span>
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
            今日笔记
          </h2>
          <span className="ds-tag ds-tag--brand">围绕「{theme.title}」</span>
        </div>
        <textarea
          className="ds-textarea"
          style={{ minHeight: 120, width: '100%' }}
          placeholder="记录卡点、收获或想带去周复盘的问题…"
          value={note}
          onChange={(e) => {
            const v = e.target.value
            setNote(v)
            localStorage.setItem(`work-note:${theme.id}`, v)
          }}
        />
        <p className="text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)', marginTop: 8 }}>
          笔记仅保存在本机。系统改进建议请在周复盘中生成。
        </p>

        <div className="review-footer">
          <span className="text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)' }}>
            {concepts.length ? `核心：${concepts.join(' · ')}` : '完成阶梯共创后可见核心概念'}
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
