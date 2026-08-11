import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ActivityExpandPanel } from './ActivityExpandPanel'
import { Icon } from './Icon'
import { api, type ActiveSlice, type DailyTask, type SliceActivity, type Theme } from '../lib/api'
import {
  getCoreConcepts,
  getCurrentLevel,
  getDailyMinutes,
  getSliceItems,
  matchThemeResource,
  phaseZh,
  isBookLikeResource,
  pickMatchingWereadBook,
  resourceDeepLink,
  workNoteKey,
} from '../lib/themeDoc'
import '../styles/pages/theme-board.css'
import '../styles/components.css'
import '../styles/components/activity-expand.css'

const DRAFT_KEY = 'weekly-review-draft'

/** 主题看板：单列主区 + 页头计划入口 + 折叠复盘 */
export function ThemeBoardWorkspace() {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  const fromCreate = searchParams.get('from') === 'create'

  const [theme, setTheme] = useState<Theme | null>(null)
  const [slice, setSlice] = useState<ActiveSlice | null>(null)
  const [todayTasks, setTodayTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [cocreateOpen, setCocreateOpen] = useState(false)
  const [expandId, setExpandId] = useState<string | null>(null)
  const [openingResource, setOpeningResource] = useState(false)
  const [noteSaveHint, setNoteSaveHint] = useState('')
  const [reviewOpen, setReviewOpen] = useState(mode === 'review')
  /** 行内展开详情（步骤/资料/验收）；默认收起，同今日列表密度 */
  const [detailId, setDetailId] = useState<string | null>(null)
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReviewOpen(mode === 'review')
  }, [mode])

  useEffect(() => {
    void (async () => {
      try {
        const [t, home, active] = await Promise.all([
          api.getTheme(themeId),
          api.home(),
          api.getActiveSlice(themeId).catch(() => null),
        ])
        setTheme(t)
        setTodayTasks(home.today_tasks.filter((x) => x.theme_id === themeId))
        setSlice(active)
        const localNote = localStorage.getItem(workNoteKey(themeId)) || ''
        const serverNote = t.work_note || ''
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
  const dailyMinutes = getDailyMinutes(slice, theme)

  const todayByActivity = useMemo(() => {
    const map = new Map<string, DailyTask>()
    for (const t of todayTasks) {
      if (t.activity_id) map.set(t.activity_id, t)
    }
    return map
  }, [todayTasks])

  /** 本主题可做：未完成；今日承诺置顶 */
  const openItems = useMemo(() => {
    const open = sliceItems.filter((it) => it.activityId && !it.done)
    return [...open].sort((a, b) => {
      const aToday = a.activityId && todayByActivity.has(a.activityId) ? 0 : 1
      const bToday = b.activityId && todayByActivity.has(b.activityId) ? 0 : 1
      return aToday - bToday
    })
  }, [sliceItems, todayByActivity])

  const todayCommitCount = todayTasks.filter((t) => !t.done).length
  const expandItem = sliceItems.find((it) => it.activityId === expandId)

  function mergeActivity(act: SliceActivity) {
    setSlice((prev) =>
      prev
        ? {
            ...prev,
            activities: prev.activities.map((a) => (a.id === act.id ? { ...a, ...act } : a)),
          }
        : prev,
    )
    // 步骤全勾会同步 Activity.done → 今日承诺 done
    setTodayTasks((prev) =>
      prev.map((t) => (t.activity_id === act.id ? { ...t, done: act.done } : t)),
    )
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
    const matched = matchThemeResource(theme, ref || null)
    // 学习包 / 脚本：进资料页看用法，不要去微信读书搜书
    if (matched && !isBookLikeResource(matched)) {
      nav(`/themes/${themeId}/document/resources`)
      return
    }
    const direct = resourceDeepLink(matched)
    if (direct) {
      window.open(direct, '_blank', 'noopener,noreferrer')
      return
    }
    const query = (matched?.name || ref?.name || '').replace(/[《》]/g, '').trim()
    if (!query || (matched && !isBookLikeResource(matched))) {
      nav(`/themes/${themeId}/document/resources`)
      return
    }
    setOpeningResource(true)
    try {
      const { books } = await api.searchWeread(query)
      const hit = pickMatchingWereadBook(matched?.name || ref?.name || query, books)
      if (hit && typeof hit.deepLink === 'string') {
        window.open(hit.deepLink, '_blank', 'noopener,noreferrer')
      } else {
        nav(`/themes/${themeId}/document/resources`)
      }
    } catch {
      nav(`/themes/${themeId}/document/resources`)
    } finally {
      setOpeningResource(false)
    }
  }

  async function toggleOpenItem(activityId: string, done: boolean) {
    setError('')
    try {
      const daily = todayByActivity.get(activityId)
      if (daily) {
        await api.toggleTask(daily.id, done)
        setTodayTasks((prev) => prev.map((t) => (t.id === daily.id ? { ...t, done } : t)))
        setSlice((prev) =>
          prev
            ? {
                ...prev,
                activities: prev.activities.map((a) =>
                  a.id === activityId ? { ...a, done } : a,
                ),
              }
            : prev,
        )
        return
      }
      const updated = await api.toggleActivity(activityId, done)
      mergeActivity(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
      <div className="theme-board-page">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!theme) {
    return (
      <div className="theme-board-page">
        <p className="muted">加载中…</p>
      </div>
    )
  }

  const phaseLabel = phaseZh[theme.phase]
  const sliceTitle = slice?.title || (level ? `L${level.level} · ${level.name}` : theme.title)
  const sliceDone = sliceItems.filter((it) => it.done).length
  const sliceTotal = sliceItems.length

  return (
    <div className="theme-board-page">
      <div className="breadcrumb">
        <Link to="/" data-dom-id="btn-back-today" id="breadcrumb-back-today">
          <Icon name="arrow-left" size={12} />
          返回今天
        </Link>
      </div>

      {fromCreate ? (
        <p className="muted" style={{ margin: '0 0 var(--spacer-12)' }}>
          首次着陆 · 计划已锁定
        </p>
      ) : null}

      <header className="tb-header">
        <div className="tb-header__title-group">
          <h1 className="tb-header__title">{theme.title}</h1>
          <div className="tb-header__meta">
            <span>{phaseLabel}</span>
            {level ? (
              <>
                <span className="tb-sep">·</span>
                <span>
                  L{level.level} {level.name}
                </span>
              </>
            ) : null}
            <span className="tb-sep">·</span>
            <span>每天约 {dailyMinutes} 分钟</span>
            {sliceTotal > 0 ? (
              <>
                <span className="tb-sep">·</span>
                <span>
                  切片 {sliceDone}/{sliceTotal}
                </span>
              </>
            ) : null}
          </div>
          {theme.goal ? (
            <p className="text-tertiary" style={{ margin: '4px 0 0', fontSize: 'var(--body-xs-font-size)' }}>
              {theme.goal}
            </p>
          ) : null}
          <div className="tb-actions" id="panel-plan">
            <div className="tb-actions__group">
              <span className="tb-actions__label">查看</span>
              <Link
                to={`/themes/${theme.id}/document/ladder`}
                className="ds-btn ds-btn--tertiary ds-btn--sm"
                data-dom-id="btn-view-ladder"
              >
                <Icon name="layers" size={12} className="icon" />
                阶梯
              </Link>
              <Link
                to={`/themes/${theme.id}/document/resources`}
                className="ds-btn ds-btn--tertiary ds-btn--sm"
                data-dom-id="btn-view-resources"
              >
                <Icon name="scroll-text" size={12} className="icon" />
                资料
              </Link>
              <Link
                to={`/themes/${theme.id}/document/plan`}
                className="ds-btn ds-btn--tertiary ds-btn--sm"
                data-dom-id="btn-view-plan-chapter"
              >
                <Icon name="list" size={12} className="icon" />
                计划
              </Link>
              <Link
                to={`/themes/${theme.id}/document`}
                className="ds-btn ds-btn--secondary ds-btn--sm"
                data-dom-id="btn-plan-document"
                title="通读三章并导出带走"
              >
                <Icon name="file-text" size={12} className="icon" />
                主题计划书
              </Link>
            </div>
            <div className="tb-actions__group">
              <span className="tb-actions__label">调整</span>
              <Link
                to={`/themes/${theme.id}/plan`}
                className="ds-btn ds-btn--tertiary ds-btn--sm"
                data-dom-id="btn-open-phases"
                title="学 / 练 / 用阶段与槽位"
              >
                <Icon name="layout" size={12} className="icon" />
                阶段管理
              </Link>
              <button
                type="button"
                className="ds-btn ds-btn--tertiary ds-btn--sm"
                data-dom-id="btn-open-cocreate"
                onClick={() => setCocreateOpen(true)}
                title="修订已锁定的计划共创"
              >
                <Icon name="sparkles" size={12} className="icon" />
                修订共创
              </button>
            </div>
          </div>
          {concepts.length > 0 ? (
            <p className="tb-actions__hint" style={{ margin: '8px 0 0' }}>
              核心 {concepts.slice(0, 3).join(' · ')}
            </p>
          ) : null}
        </div>
      </header>

      <section className="tb-section" id="panel-execute">
        <div className="tb-section__label-row">
          <div className="tb-section__label">本主题可做</div>
          <span className="tb-section__hint">
            未完成 {openItems.length}
            {todayCommitCount > 0 ? ` · 今日承诺 ${todayCommitCount}` : ''}
          </span>
        </div>

        {openItems.length === 0 ? (
          <div className="tb-empty">
            <p>
              {sliceTotal === 0
                ? '当前还没有计划活动。完成计划共创并锁定后会出现在这里。'
                : sliceDone >= sliceTotal && sliceTotal > 0
                  ? '当前切片已全部完成，可去阶段管理推进下一步。'
                  : '暂无未完成活动。'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to="/" className="ds-btn ds-btn--secondary ds-btn--sm">
                回今日看板
              </Link>
              <Link to={`/themes/${theme.id}/plan`} className="ds-btn ds-btn--tertiary ds-btn--sm">
                阶段管理
              </Link>
            </div>
          </div>
        ) : (
          <div className="task-list">
            {openItems.map((item) => {
              const activityId = item.activityId!
              const exe = item.executionDoc
              const steps = exe?.steps || []
              const hasDetail = Boolean(
                steps.length > 0 || exe?.resource_ref?.name || exe?.outcome || item.expanded,
              )
              const detailOpen = detailId === activityId
              const daily = todayByActivity.get(activityId)
              const metaParts: string[] = []
              if (item.expanded) {
                metaParts.push(steps.length > 0 ? `已拆分 · ${steps.filter((s) => s.done).length}/${steps.length}` : '已拆分')
              }
              if (typeof exe?.minutes === 'number') metaParts.push(`约${exe.minutes}分钟`)

              return (
                <div key={activityId} className={`task-item${detailOpen ? ' is-detail-open' : ''}`}>
                  <label className="ds-check task-item__check">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={(e) => {
                        void toggleOpenItem(activityId, e.target.checked)
                      }}
                    />
                    <span className="ds-check__box" />
                  </label>
                  <div className="task-item__body">
                    <button
                      type="button"
                      className="task-item__title-btn"
                      onClick={() => setDetailId((id) => (id === activityId ? null : activityId))}
                      disabled={!hasDetail && !item.activityId}
                    >
                      <span className="task-item__text">{item.label}</span>
                    </button>
                    <div className="task-item__meta">
                      {daily ? <span className="tb-badge-today">今日</span> : null}
                      {metaParts.length > 0 ? (
                        <span className="task-item__source">{metaParts.join(' · ')}</span>
                      ) : (
                        <span className="task-item__source">{sliceTitle}</span>
                      )}
                    </div>

                    {detailOpen ? (
                      <div className="task-item__detail">
                        {exe?.goal && exe.goal !== item.label ? (
                          <p className="task-item__hint">
                            <span className="task-item__hint-label">目标</span>
                            {exe.goal}
                          </p>
                        ) : null}
                        {steps.length > 0 ? (
                          <ul className="task-steps">
                            {steps.map((step) => (
                              <li key={step.id} className={`task-step${step.done ? ' is-done' : ''}`}>
                                <label className="ds-check task-step__check">
                                  <input
                                    type="checkbox"
                                    checked={step.done}
                                    onChange={async (e) => {
                                      setError('')
                                      try {
                                        const updated = await api.toggleExecutionStep(
                                          activityId,
                                          step.id,
                                          e.target.checked,
                                        )
                                        mergeActivity(updated)
                                      } catch (err) {
                                        setError(
                                          err instanceof Error ? err.message : String(err),
                                        )
                                      }
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
                        <div className="task-item__detail-actions">
                          <button
                            type="button"
                            className="ds-btn ds-btn--secondary ds-btn--sm"
                            onClick={() => setExpandId(activityId)}
                          >
                            <Icon name="sparkles" size={12} className="icon" />
                            {item.expanded ? `任务拆分 · ${steps.length} 步` : '任务拆分'}
                          </button>
                          <Link
                            className="ds-btn ds-btn--tertiary ds-btn--sm"
                            to={`/themes/${theme.id}/document/resources`}
                          >
                            资料清单
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {!detailOpen ? (
                    <button
                      type="button"
                      className="ds-btn ds-btn--tertiary ds-btn--sm task-item__more"
                      onClick={() => setDetailId(activityId)}
                    >
                      详情
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className={`tb-fold${reviewOpen ? ' is-open' : ''}`} id="panel-review">
        <button
          type="button"
          className="tb-fold__toggle"
          data-dom-id="tab-review"
          onClick={() => setReviewOpen((v) => !v)}
        >
          <span className="tb-section__label">复盘与笔记</span>
          <Icon name="chevron-down" size={14} className="tb-fold__chevron" />
        </button>
        <div className="tb-fold__body">
          <textarea
            className="ds-textarea"
            style={{ minHeight: 100, width: '100%' }}
            placeholder="记录卡点、收获或想带去周复盘的问题…"
            value={note}
            onChange={(e) => {
              const v = e.target.value
              setNote(v)
              persistNote(v)
            }}
          />
          <p className="text-tertiary" style={{ fontSize: 'var(--body-xs-font-size)', marginTop: 8 }}>
            {noteSaveHint || '主题笔记会同步；也可带去周复盘。'}
          </p>
          <div className="tb-plan-links">
            <button
              type="button"
              className="ds-btn ds-btn--tertiary ds-btn--sm"
              disabled={!note.trim()}
              onClick={takeNoteToReview}
            >
              <Icon name="arrow-right" size={12} className="icon" />
              带去周复盘
            </button>
            <Link
              to={`/review?themeId=${theme.id}`}
              data-dom-id="btn-open-full-review"
              className="ds-btn ds-btn--secondary ds-btn--sm"
            >
              <Icon name="file-text" size={12} className="icon" />
              进入完整复盘
            </Link>
          </div>
        </div>
      </section>

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
