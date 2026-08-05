import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ActivityExpandPanel } from '../components/ActivityExpandPanel'
import { Icon } from '../components/Icon'
import { api, type ActiveSlice, type DailyTask, type SliceActivity, type Theme } from '../lib/api'
import {
  getCoreConcepts,
  getCurrentLevel,
  getDailyMinutes,
  getSliceItems,
  phaseZh,
  workNoteKey,
} from '../lib/themeDoc'
import '../styles/pages/theme-work.css'
import '../styles/components.css'
import '../styles/components/activity-expand.css'

const DRAFT_KEY = 'weekly-review-draft'
type Mode = 'execute' | 'plan' | 'review'

function parseMode(raw: string | null): Mode {
  if (raw === 'plan' || raw === 'review') return raw
  return 'execute'
}

export function ThemeWorkPage() {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = parseMode(searchParams.get('mode'))
  const [theme, setTheme] = useState<Theme | null>(null)
  const [slice, setSlice] = useState<ActiveSlice | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [cocreateOpen, setCocreateOpen] = useState(false)
  const [expandId, setExpandId] = useState<string | null>(null)

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
        setNote(localStorage.getItem(workNoteKey(themeId)) || '')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [themeId])

  const level = useMemo(() => getCurrentLevel(theme), [theme])
  const sliceItems = useMemo(() => getSliceItems(slice, theme), [slice, theme])
  const concepts = useMemo(() => getCoreConcepts(theme, 3), [theme])
  const dailyMinutes = getDailyMinutes(slice, theme)
  const nextItem = sliceItems.find((it) => !it.done)
  const materialHint = theme?.goal || level?.understand || '围绕主题目标推进当前切片'
  const expandItem = sliceItems.find((it) => it.activityId === expandId)
  const activityById = useMemo(() => {
    const map = new Map<string, (typeof sliceItems)[number]>()
    for (const it of sliceItems) {
      if (it.activityId) map.set(it.activityId, it)
    }
    return map
  }, [sliceItems])

  function mergeActivity(act: SliceActivity) {
    setSlice((prev) =>
      prev
        ? {
            ...prev,
            activities: prev.activities.map((a) => (a.id === act.id ? { ...a, ...act } : a)),
          }
        : prev,
    )
  }

  function setMode(next: Mode) {
    setSearchParams({ mode: next }, { replace: true })
  }

  function takeNoteToReview() {
    if (!theme || !note.trim()) return
    let draft: {
      themeId?: string | null
      scores?: number[]
      q1?: string
      q2?: string
      q3?: string
    } | null = null
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    } catch {
      draft = null
    }
    const sameTheme = draft?.themeId === theme.id
    const mergedQ1 = sameTheme && draft?.q1 ? `${draft.q1}\n\n${note.trim()}` : note.trim()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        themeId: theme.id,
        scores: sameTheme ? draft?.scores ?? [] : [],
        q1: mergedQ1,
        q2: sameTheme ? draft?.q2 ?? '' : '',
        q3: sameTheme ? draft?.q3 ?? '' : '',
        savedAt: new Date().toISOString(),
      }),
    )
    nav(`/review?themeId=${theme.id}`)
  }

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
            每天约 {dailyMinutes} 分钟
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
              {tasks.map((task) => {
                const linked = task.activity_id ? activityById.get(task.activity_id) : undefined
                const exe = linked?.executionDoc
                const steps = exe?.steps || []
                return (
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
                      {exe?.goal ? (
                        <p className="task-item__goal">{exe.goal}</p>
                      ) : null}
                      <div className="task-item__meta">
                        <span className="task-item__source">
                          <Icon name="layers" size={12} />
                          {sliceTitle}
                        </span>
                        {typeof exe?.minutes === 'number' ? (
                          <span className="task-item__source">{exe.minutes} 分钟</span>
                        ) : null}
                        {!linked?.expanded && task.description ? (
                          <span className="task-item__source">{task.description}</span>
                        ) : null}
                      </div>
                      {steps.length > 0 ? (
                        <ul className="task-steps">
                          {steps.map((step) => (
                            <li key={step.id} className={`task-step${step.done ? ' is-done' : ''}`}>
                              <label className="ds-check task-step__check">
                                <input
                                  type="checkbox"
                                  checked={step.done}
                                  onChange={async (e) => {
                                    if (!task.activity_id) return
                                    const updated = await api.toggleExecutionStep(
                                      task.activity_id,
                                      step.id,
                                      e.target.checked,
                                    )
                                    mergeActivity(updated)
                                  }}
                                />
                                <span className="ds-check__box" />
                              </label>
                              <span className="task-step__text">{step.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {exe?.resource_ref?.name ? (
                        <p className="task-item__hint">
                          <span className="task-item__hint-label">资料</span>
                          {exe.resource_ref.name}
                        </p>
                      ) : null}
                      {exe?.outcome ? (
                        <p className="task-item__hint">
                          <span className="task-item__hint-label">验收</span>
                          {exe.outcome}
                        </p>
                      ) : null}
                      {task.activity_id ? (
                        <button
                          type="button"
                          className="ds-btn ds-btn--secondary ds-btn--sm"
                          style={{ marginTop: 10 }}
                          onClick={() => setExpandId(task.activity_id)}
                        >
                          <Icon name="sparkles" size={12} className="icon" />
                          任务拆分
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
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
            <p className="source-sidebar__title">下一步</p>
            <p className="source-sidebar__text">
              {nextItem ? nextItem.label : sliceItems.length ? '当前切片已全部完成' : '暂无计划活动'}
            </p>
            <div
              style={{
                marginTop: 'var(--spacer-16)',
                paddingTop: 'var(--spacer-16)',
                borderTop: '1px solid var(--border-neutral-l1)',
              }}
            >
              <p className="source-sidebar__title">资料提示</p>
              <p className="source-sidebar__text">{materialHint}</p>
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
              <button
                type="button"
                data-dom-id="btn-open-cocreate"
                className="ds-btn ds-btn--brand ds-btn--sm"
                onClick={() => setCocreateOpen(true)}
              >
                <Icon name="sparkles" size={12} className="icon" />
                打开共创
              </button>
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
                  <div className="slice-item__main">
                    <span>
                      {item.label}
                      <span className="text-tertiary" style={{ marginLeft: 8, fontSize: 11 }}>
                        {item.done
                          ? '已完成'
                          : item.expanded
                            ? `已拆分 · ${(item.executionDoc?.steps || []).length} 步`
                            : item.desc}
                      </span>
                    </span>
                  </div>
                  {item.activityId ? (
                    <button
                      type="button"
                      className="ds-btn ds-btn--secondary ds-btn--sm expand-entry"
                      onClick={() => setExpandId(item.activityId || null)}
                    >
                      <Icon name="sparkles" size={12} className="icon" />
                      任务拆分
                    </button>
                  ) : null}
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
            localStorage.setItem(workNoteKey(theme.id), v)
          }}
        />
        <p className="text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)', marginTop: 8 }}>
          笔记仅保存在本机。系统改进建议请在周复盘中生成。
        </p>

        <div className="review-footer">
          <span className="text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)' }}>
            {concepts.length ? `核心：${concepts.join(' · ')}` : '完成阶梯共创后可见核心概念'}
          </span>
          <div style={{ display: 'flex', gap: 'var(--spacer-8)' }}>
            <button
              type="button"
              className="ds-btn ds-btn--tertiary ds-btn--sm"
              disabled={!note.trim()}
              onClick={takeNoteToReview}
            >
              <Icon name="arrow-right" size={12} className="icon" />
              带去周复盘
            </button>
            <Link to="/review" data-dom-id="btn-open-full-review" className="ds-btn ds-btn--secondary ds-btn--sm">
              <Icon name="file-text" size={12} className="icon" />
              进入完整复盘
            </Link>
          </div>
        </div>
      </div>

      <div className={`modal-overlay${cocreateOpen ? ' is-open' : ''}`}>
        <div className="ds-dialog">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title">打开计划共创</span>
            <button type="button" className="ds-dialog__close" onClick={() => setCocreateOpen(false)}>
              <Icon name="x" size={14} alt="close" />
            </button>
          </div>
          <div className="ds-dialog__body">
            将打开计划共创。若该步已确认，会进入修订模式（只读历史+可强制重开）
          </div>
          <div className="ds-dialog__foot">
            <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setCocreateOpen(false)}>
              取消
            </button>
            <Link
              to={`/create/${theme.id}/plan?revise=1`}
              className="ds-btn ds-btn--brand"
              onClick={() => setCocreateOpen(false)}
            >
              打开修订
            </Link>
          </div>
        </div>
      </div>

      {expandId ? (
        <ActivityExpandPanel
          key={expandId}
          open
          activityId={expandId}
          activityTitle={expandItem?.label || '计划活动'}
          initialDoc={expandItem?.executionDoc}
          onClose={() => setExpandId(null)}
          onUpdated={mergeActivity}
        />
      ) : null}
    </div>
  )
}
