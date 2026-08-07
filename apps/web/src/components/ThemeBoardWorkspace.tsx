import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ActivityExpandPanel } from './ActivityExpandPanel'
import { Icon } from './Icon'
import { api, type ActiveSlice, type DailyTask, type SliceActivity, type Theme, type ThemePhase } from '../lib/api'
import {
  getCoreConcepts,
  getCurrentLevel,
  getDailyMinutes,
  getSliceItems,
  matchThemeResource,
  phaseZh,
  resourceDeepLink,
  resourcesPathHint,
  workNoteKey,
} from '../lib/themeDoc'
import '../styles/pages/theme-work.css'
import '../styles/pages/theme-overview.css'
import '../styles/components.css'
import '../styles/components/activity-expand.css'

const DRAFT_KEY = 'weekly-review-draft'
export type ThemeBoardMode = 'info' | 'execute' | 'plan' | 'review'

function parseMode(raw: string | null): ThemeBoardMode {
  if (raw === 'plan' || raw === 'review' || raw === 'execute' || raw === 'info') return raw
  return 'info'
}

/** 主题看板：信息 / 执行 / 计划 / 复盘（吸收原作业面能力） */
export function ThemeBoardWorkspace() {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = parseMode(searchParams.get('mode'))
  const fromCreate = searchParams.get('from') === 'create'
  const [theme, setTheme] = useState<Theme | null>(null)
  const [slice, setSlice] = useState<ActiveSlice | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [cocreateOpen, setCocreateOpen] = useState(false)
  const [expandId, setExpandId] = useState<string | null>(null)
  const [openingResource, setOpeningResource] = useState(false)
  const [noteSaveHint, setNoteSaveHint] = useState('')
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        const localNote = localStorage.getItem(workNoteKey(themeId)) || ''
        const serverNote = t.work_note || ''
        // 服务端优先；若服务端空而本机有内容，带上本机并回写
        if (serverNote) {
          setNote(serverNote)
          localStorage.setItem(workNoteKey(themeId), serverNote)
        } else if (localNote) {
          setNote(localNote)
          void api.updateTheme(themeId, { work_note: localNote }).catch(() => undefined)
        } else {
          setNote('')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [themeId])

  const level = useMemo(() => getCurrentLevel(theme), [theme])
  const sliceItems = useMemo(() => getSliceItems(slice, theme), [slice, theme])
  const concepts = useMemo(() => getCoreConcepts(theme, 3), [theme])
  const cores = useMemo(() => (theme ? getCoreConcepts(theme, 5) : []), [theme])
  const dailyMinutes = getDailyMinutes(slice, theme)
  const expandItem = sliceItems.find((it) => it.activityId === expandId)
  const activityById = useMemo(() => {
    const map = new Map<string, (typeof sliceItems)[number]>()
    for (const it of sliceItems) {
      if (it.activityId) map.set(it.activityId, it)
    }
    return map
  }, [sliceItems])

  const todayLoadMinutes = useMemo(() => {
    return tasks.reduce((sum, task) => {
      const linked = task.activity_id ? activityById.get(task.activity_id) : undefined
      const fromExe = linked?.executionDoc?.minutes
      if (typeof fromExe === 'number' && fromExe > 0) return sum + fromExe
      const fromSummary = task.execution_summary?.minutes
      if (typeof fromSummary === 'number' && fromSummary > 0) return sum + fromSummary
      return sum
    }, 0)
  }, [tasks, activityById])

  const durationMeta =
    todayLoadMinutes > 0
      ? todayLoadMinutes > dailyMinutes
        ? `今日约 ${todayLoadMinutes} 分钟 · 已超预算 ${dailyMinutes}`
        : `今日约 ${todayLoadMinutes} 分钟 · 预算 ${dailyMinutes}`
      : `每天约 ${dailyMinutes} 分钟`

  const focusTask = useMemo(() => {
    return tasks.find((t) => !t.done) || tasks[0] || null
  }, [tasks])
  const focusLinked = focusTask?.activity_id
    ? activityById.get(focusTask.activity_id)
    : undefined
  const focusExe = focusLinked?.executionDoc
  const nextActionText = useMemo(() => {
    const steps = focusExe?.steps || []
    const undone = steps.find((s) => !s.done)?.text?.trim()
    if (undone) return undone
    if (focusExe?.goal?.trim()) return focusExe.goal.trim()
    if (focusTask?.title?.trim()) return focusTask.title.trim()
    const nextSlice = sliceItems.find((it) => !it.done)
    return nextSlice?.label || (sliceItems.length ? '当前切片已全部完成' : '暂无计划活动')
  }, [focusExe, focusTask, sliceItems])
  const focusResource = useMemo(() => {
    const ref = focusExe?.resource_ref
    const matched = matchThemeResource(theme, ref || null)
    if (matched) return matched
    // 未绑定资源时，给第一条核心资料如何用
    return matchThemeResource(theme, { index: 0 }) || null
  }, [focusExe, theme])
  const materialHint = useMemo(() => {
    if (focusResource?.how_to_use?.trim()) return focusResource.how_to_use.trim()
    if (focusResource?.name) return `优先使用：${focusResource.name}`
    const pathHint = resourcesPathHint(theme)
    if (pathHint) return pathHint
    return '打开主题计划书查看资料清单，或先为今日任务做「任务拆分」绑定资料。'
  }, [focusResource, theme])

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

  function setMode(next: ThemeBoardMode) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('mode', next)
    setSearchParams(nextParams, { replace: true })
  }

  function persistNote(v: string) {
    if (!theme) return
    localStorage.setItem(workNoteKey(theme.id), v)
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(() => {
      void api
        .updateTheme(theme.id, { work_note: v })
        .then(() => {
          setNoteSaveHint('已同步到主题')
          window.setTimeout(() => setNoteSaveHint(''), 1600)
        })
        .catch(() => {
          setNoteSaveHint('同步失败，仍保存在本机')
          window.setTimeout(() => setNoteSaveHint(''), 2200)
        })
    }, 500)
  }

  async function openResource(ref?: { index?: number | null; name?: string } | null) {
    const matched = matchThemeResource(theme, ref || null) || focusResource
    const direct = resourceDeepLink(matched)
    if (direct) {
      window.open(direct, '_blank', 'noopener,noreferrer')
      return
    }
    const query = (matched?.weread?.title || matched?.name || ref?.name || '').replace(/[《》]/g, '').trim()
    if (!query) {
      nav(`/themes/${themeId}/document#chapter-resources`)
      return
    }
    setOpeningResource(true)
    try {
      const { books } = await api.searchWeread(query)
      const hit = books.find((b) => typeof b.deepLink === 'string' && b.deepLink)
      if (hit && typeof hit.deepLink === 'string') {
        window.open(hit.deepLink, '_blank', 'noopener,noreferrer')
      } else {
        nav(`/themes/${themeId}/document#chapter-resources`)
      }
    } catch {
      nav(`/themes/${themeId}/document#chapter-resources`)
    } finally {
      setOpeningResource(false)
    }
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
  const sliceDone = sliceItems.filter((it) => it.done).length
  const sliceTotal = sliceItems.length
  const hasSliceProgress = sliceTotal > 0
  const overviewProgressPct = hasSliceProgress
    ? Math.round((sliceDone / sliceTotal) * 100)
    : tasks.length
      ? Math.round((doneCount / tasks.length) * 100)
      : 0
  const sliceTitle = slice?.title || (level ? `L${level.level} · ${level.name}` : theme.title)
  const stepActive = (key: ThemePhase) => theme.phase === key

  return (
    <div className="work-page theme-board">
      <div className="breadcrumb">
        <Link to="/" data-dom-id="btn-back-today" id="breadcrumb-back-today">
          <Icon name="arrow-left" size={12} />
          返回今天
        </Link>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <span style={{ color: 'var(--text-default)' }}>主题看板</span>
      </div>

      {fromCreate ? <p className="muted" style={{ margin: '0 0 var(--spacer-12)' }}>首次着陆 · 计划已锁定</p> : null}

      <div className="page-header">
        <h1 className="page-header__title">{theme.title}</h1>
        <div className="page-header__meta">
          {level ? (
            <span className="page-header__meta-item">
              <Icon name="layers" size={14} />
              {`L${level.level} · ${level.name}`}
            </span>
          ) : null}
          <span
            className={`page-header__meta-item${todayLoadMinutes > dailyMinutes ? ' is-over-budget' : ''}`}
          >
            <Icon name="clock" size={14} />
            {durationMeta}
          </span>
          <span className="ds-tag ds-tag--brand">{phaseLabel}</span>
        </div>
        {theme.goal ? (
          <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 'var(--body-sm-font-size)' }}>
            {theme.goal}
          </p>
        ) : null}
      </div>

      <div className="ds-tabs" style={{ marginBottom: 'var(--spacer-24)' }}>
        <button
          type="button"
          className={`ds-tab${mode === 'info' ? ' is-active' : ''}`}
          data-dom-id="tab-info"
          onClick={() => setMode('info')}
        >
          主题
        </button>
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

      <div className={`mode-panel${mode === 'info' ? ' is-active' : ''}`} id="panel-info">
        <section className="ov-progress" style={{ marginBottom: 'var(--spacer-24)' }}>
          <div className="ov-progress__track">
            <div className="ov-progress__fill" style={{ width: `${overviewProgressPct}%` }} />
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
                {doneCount}/{totalCount}
              </span>
            </span>
          </div>
        </section>

        <section className="ov-cta" style={{ marginBottom: 'var(--spacer-24)' }}>
          <div className="ov-cta__body">
            <div className="ov-cta__label">今日任务 · {tasks.length} 项</div>
            <div className="ov-cta__tasks">
              {tasks.length === 0 ? (
                <div className="ov-cta__task">
                  <span className="ov-cta__idx mono">—</span>
                  <span>今天还没有该主题任务（可在今日看板加入承诺）</span>
                </div>
              ) : (
                tasks.map((task, i) => (
                  <div key={task.id} className="ov-cta__task">
                    <span className="ov-cta__idx mono">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      {task.done ? '✓ ' : ''}
                      {task.title}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <button
            type="button"
            className="ds-btn ds-btn--brand ds-btn--lg"
            data-dom-id="btn-enter-execution"
            onClick={() => setMode('execute')}
          >
            <Icon name="play" size={14} className="icon" />
            去执行
          </button>
        </section>

        <section className="ov-map" style={{ marginBottom: 'var(--spacer-24)' }}>
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

        <section className="ov-aux" style={{ marginBottom: 'var(--spacer-24)' }}>
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
          <button
            type="button"
            className="ov-secondary__link"
            data-dom-id="btn-review"
            onClick={() => setMode('review')}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
          >
            <Icon name="trending-up" size={12} />
            复盘
          </button>
          <span className="ov-secondary__sep">·</span>
          <button
            type="button"
            className="ov-secondary__link"
            onClick={() => setMode('plan')}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
          >
            <Icon name="sparkles" size={12} />
            计划管理
          </button>
        </nav>
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
                const expanded = Boolean(linked?.expanded && (exe?.goal || steps.length > 0))
                const primaryText = expanded
                  ? exe?.goal || task.title
                  : task.title
                const planLabel = linked?.label || ''
                const showPlanMuted =
                  expanded && planLabel && planLabel !== primaryText && planLabel !== (exe?.goal || '')
                const expandBtnLabel = expanded
                  ? `已拆分 · ${steps.length} 步`
                  : '任务拆分'
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
                      <p className="task-item__text">{primaryText}</p>
                      {showPlanMuted ? (
                        <p className="task-item__plan">计划：{planLabel}</p>
                      ) : null}
                      <div className="task-item__meta">
                        <span className="task-item__source">
                          <Icon name="layers" size={12} />
                          {sliceTitle}
                        </span>
                        {typeof exe?.minutes === 'number' ? (
                          <span className="task-item__source">{exe.minutes} 分钟</span>
                        ) : null}
                        {!expanded && task.description ? (
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
                          <button
                            type="button"
                            className="task-item__resource-link"
                            disabled={openingResource}
                            onClick={() => void openResource(exe.resource_ref)}
                          >
                            {exe.resource_ref.name}
                            <span className="task-item__resource-action">
                              {openingResource ? '打开中…' : '打开'}
                            </span>
                          </button>
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
                          {expandBtnLabel}
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
            <p className="source-sidebar__text">{nextActionText}</p>
            <div
              style={{
                marginTop: 'var(--spacer-16)',
                paddingTop: 'var(--spacer-16)',
                borderTop: '1px solid var(--border-neutral-l1)',
              }}
            >
              <p className="source-sidebar__title">资料提示</p>
              {focusResource?.name ? (
                <p className="source-sidebar__resource-name">{focusResource.name}</p>
              ) : null}
              <p className="source-sidebar__text">{materialHint}</p>
              <div className="source-sidebar__actions">
                <button
                  type="button"
                  className="ds-btn ds-btn--secondary ds-btn--sm"
                  disabled={openingResource || !focusResource}
                  onClick={() => void openResource(focusExe?.resource_ref || { index: 0 })}
                >
                  {openingResource ? '打开中…' : '打开资料'}
                </button>
                <Link
                  className="ds-btn ds-btn--tertiary ds-btn--sm"
                  to={`/themes/${theme.id}/document#chapter-resources`}
                >
                  资料清单
                </Link>
              </div>
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
            persistNote(v)
          }}
        />
        <p className="text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)', marginTop: 8 }}>
          {noteSaveHint || '主题笔记会同步，换设备可继续；也可带去周复盘。'}
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
