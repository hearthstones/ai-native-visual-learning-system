import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type HomeData, type Theme } from '../lib/api'
import { isLearningSlotFull, slotSummaryParts } from '../lib/slots'
import { draftResumeLabel, draftResumePath, driftTitle, phaseZh } from '../lib/themeDoc'
import '../styles/pages/home.css'
import '../styles/pages/home-empty.css'
import '../styles/pages/home-first.css'

const phaseTag: Record<string, string> = {
  learning: 'ds-tag ds-tag--brand',
  practice: 'ds-tag ds-tag--warning',
  application: 'ds-tag',
}

const phaseDot: Record<string, string> = {
  learning: 'today-item__dot today-item__dot--teal',
  practice: 'today-item__dot today-item__dot--amber',
  application: 'today-item__dot today-item__dot--teal',
}

/** 首页可做队列默认只露前 N 条，其余靠「查看更多」展开 */
const QUEUE_PREVIEW_LIMIT = 5

function formatTodaySubtitle() {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}（周${week}）`
}

function SlotBar({ slots }: { slots: HomeData['slots'] }) {
  const parts = slotSummaryParts(slots)
  return (
    <div className="slot-bar">
      <span className="slot-bar__label">阶段槽位</span>
      <span className="slot-bar__item">学 {parts.learning}</span>
      <span className="slot-bar__item">练 {parts.practice}</span>
      <span className="slot-bar__item">用 {parts.application}</span>
    </div>
  )
}

function themeById(themes: Theme[], id: string) {
  return themes.find((t) => t.id === id)
}

export function HomePage() {
  const nav = useNavigate()
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [queueExpanded, setQueueExpanded] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await api.home())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function toggleTodayTask(taskId: string, done: boolean) {
    setError('')
    try {
      await api.toggleTask(taskId, done)
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          today_tasks: prev.today_tasks.map((t) => (t.id === taskId ? { ...t, done } : t)),
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function commitActivity(activityId: string) {
    setError('')
    try {
      await api.commitToday(activityId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function uncommitTask(taskId: string) {
    setError('')
    try {
      await api.uncommitToday(taskId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function suggestFill(themeId?: string) {
    setError('')
    try {
      await api.suggestCommitments(themeId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function clearFocus(themeId: string) {
    setError('')
    try {
      await api.updateTheme(themeId, { is_focus: false })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function dormancyTheme(themeId: string) {
    setError('')
    try {
      await api.updateTheme(themeId, { status: 'dormant' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const active = useMemo(
    () => (data ? data.themes.filter((t) => t.status === 'active') : []),
    [data],
  )
  const drafts = useMemo(
    () => (data ? data.themes.filter((t) => t.status === 'draft') : []),
    [data],
  )

  if (loading) {
    return (
      <div className="home-page">
        <div className="home-skeleton" aria-hidden="true">
          <div className="home-skeleton__bar" />
          <div className="home-skeleton__bar home-skeleton__bar--medium" />
          <div className="home-skeleton__bar home-skeleton__bar--short" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="home-page">
        <div className="ds-alert ds-alert--danger" style={{ marginBottom: 16 }}>
          <div className="ds-alert__content">
            <div className="ds-alert__title">加载失败</div>
            <div className="ds-alert__desc">{error}</div>
          </div>
        </div>
        <button className="ds-btn ds-btn--secondary" type="button" onClick={() => void load()}>
          重试
        </button>
      </div>
    )
  }

  if (!data) return null

  const learningFull = isLearningSlotFull(data.slots)
  const slotParts = slotSummaryParts(data.slots)
  const goCreate = () => nav(learningFull ? '/create/intercept' : '/create')

  /* ── 空态：home-empty ── */
  if (active.length === 0) {
    return (
      <div className="home-empty-page">
        {error ? (
          <div className="ds-alert ds-alert--danger" style={{ marginBottom: 16 }}>
            <div className="ds-alert__content">
              <div className="ds-alert__desc">{error}</div>
            </div>
          </div>
        ) : null}
        <div className="home-empty__icon">
          <Icon name="sparkles" size={28} />
        </div>
        <div className="home-empty__title-group">
          <div className="home-empty__title">
            {drafts.length > 0 ? '你有未完成的主题草稿' : '从第一个主题开始'}
          </div>
          <div className="home-empty__subtitle">
            {drafts.length > 0
              ? '继续共创，或去「我的主题」管理草稿与休眠主题。'
              : 'AI 教练帮你共创学习阶梯、筛选高杠杆资料、制定学练用三阶段计划。每天约 30 分钟。'}
          </div>
        </div>
        <div className="home-empty__actions">
          {drafts.length > 0 ? (
            <>
              <Link className="ds-btn ds-btn--brand ds-btn--lg" to={draftResumePath(drafts[0])}>
                <Icon name="arrow-right" size={14} className="icon" />
                <span>{draftResumeLabel(drafts[0])} · {drafts[0].title}</span>
              </Link>
              <Link className="ds-btn ds-btn--secondary" to="/themes?tab=draft">
                管理全部主题
              </Link>
            </>
          ) : (
            <button className="ds-btn ds-btn--brand ds-btn--lg" type="button" onClick={goCreate}>
              <Icon name="plus" size={14} className="icon" />
              <span>新建第一个主题</span>
            </button>
          )}
          <div className="home-empty__slots">
            <span className="home-empty__slots-label">阶段槽位</span>
            <span>学 {slotParts.learning}</span>
            <span>练 {slotParts.practice}</span>
            <span>用 {slotParts.application}</span>
          </div>
        </div>
      </div>
    )
  }

  const isFirst = active.length === 1
  const themeMap = data.themes
  const visibleThemes = active.slice(0, 4)
  const focusThemes = active.filter((t) => t.is_focus)
  // 历史漂移事件可能残留；主焦点已压回 ≤1 时不再展示 focus_over_one
  const driftMessages = data.drift_events
    .filter((ev) => !(ev.kind === 'focus_over_one' && focusThemes.length <= 1))
    .slice(0, 3)
  const showFocusDriftActions = focusThemes.length > 1

  return (
    <div className="home-page">
      {error ? (
        <div className="ds-alert ds-alert--danger" style={{ marginBottom: 16 }}>
          <div className="ds-alert__content">
            <div className="ds-alert__desc">{error}</div>
          </div>
        </div>
      ) : null}
      <div className="home-header">
        <div className="home-header__title-group">
          <div className="home-header__title">今天</div>
          <div className="home-header__subtitle">{formatTodaySubtitle()}</div>
        </div>
        <button className="ds-btn ds-btn--tertiary" type="button" onClick={goCreate}>
          <Icon name="plus" size={14} className="icon" />
          <span>新建主题</span>
        </button>
      </div>

      <section className="home-section">
        <div className="home-section__label-row">
          <div className="home-section__label">今日承诺</div>
          <span className="home-section__hint">主动加入今天 · 每主题最多 2 条</span>
        </div>
        <div className="today-list">
          {data.today_tasks.length === 0 && (
            <div className="home-empty-commit">
              <p className="text-tertiary" style={{ fontSize: 12, margin: 0 }}>
                今天还没有承诺。从下方队列选几条加入，或一键按建议填入。
              </p>
              {(data.queue?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  className="ds-btn ds-btn--brand ds-btn--sm"
                  onClick={() => void suggestFill()}
                >
                  按建议填入今天
                </button>
              ) : null}
            </div>
          )}
          {data.today_tasks.map((task) => {
            const theme = themeById(themeMap, task.theme_id)
            const summary = task.execution_summary
            const expanded = Boolean(summary?.expanded)
            const metaParts: string[] = []
            if (expanded) {
              metaParts.push(
                summary && summary.steps_total > 0
                  ? `已拆分 · ${summary.steps_done}/${summary.steps_total}`
                  : '已拆分',
              )
              if (typeof summary?.minutes === 'number') {
                metaParts.push(`约${summary.minutes}分钟`)
              }
            }
            return (
              <div
                key={task.id}
                className={`today-item${task.done ? ' is-done' : ''}${expanded ? ' today-item--expanded' : ''}`}
              >
                <label className="ds-check today-item__check">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={(e) => {
                      void toggleTodayTask(task.id, e.target.checked)
                    }}
                  />
                  <span className="ds-check__box" />
                </label>
                <span className={phaseDot[theme?.phase ?? 'learning']} />
                <span className="ds-tag today-item__topic-tag">{theme?.title ?? '主题'}</span>
                <div className="today-item__main">
                  <Link className="today-item__text" to={`/themes/${task.theme_id}/work`}>
                    {task.title}
                  </Link>
                  {metaParts.length > 0 ? (
                    <span className="today-item__meta">{metaParts.join(' · ')}</span>
                  ) : null}
                </div>
                <div className="today-item__actions">
                  <button
                    type="button"
                    className="today-item__uncommit"
                    onClick={() => void uncommitTask(task.id)}
                    title="移出今天，回到队列"
                  >
                    移出
                  </button>
                  <Link className="today-item__enter" to={`/themes/${task.theme_id}/work`}>
                    <span>进入</span>
                    <Icon name="arrow-right" size={14} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__label-row">
          <div className="home-section__label">可做队列</div>
          <span className="home-section__hint">
            不跟日期 · 没做完明天还在
            {(data.queue?.length ?? 0) > QUEUE_PREVIEW_LIMIT
              ? ` · 共 ${data.queue?.length ?? 0} 条`
              : ''}
          </span>
        </div>
        <div className="today-list">
          {(data.queue?.length ?? 0) === 0 && (
            <p className="text-tertiary" style={{ fontSize: 12 }}>
              {data.today_tasks.length > 0
                ? '队列里暂时没有更多可承诺项。'
                : '暂无未完成活动。完成计划锁定后会出现在这里。'}
            </p>
          )}
          {(queueExpanded
            ? data.queue || []
            : (data.queue || []).slice(0, QUEUE_PREVIEW_LIMIT)
          ).map((item) => {
            const summary = item.execution_summary
            const metaParts: string[] = []
            if (summary?.expanded) {
              metaParts.push(
                summary.steps_total > 0
                  ? `已拆分 · ${summary.steps_done}/${summary.steps_total}`
                  : '已拆分',
              )
              if (typeof summary.minutes === 'number') {
                metaParts.push(`约${summary.minutes}分钟`)
              }
            }
            const themeCommitCount = data.today_tasks.filter((t) => t.theme_id === item.theme_id).length
            const atLimit = themeCommitCount >= 2
            return (
              <div key={item.activity_id} className="today-item today-item--queue">
                <span className={phaseDot[item.phase]} />
                <span className="ds-tag today-item__topic-tag">{item.theme_title}</span>
                <div className="today-item__main">
                  <span className="today-item__text">{item.title}</span>
                  {metaParts.length > 0 ? (
                    <span className="today-item__meta">{metaParts.join(' · ')}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="ds-btn ds-btn--secondary ds-btn--sm"
                  disabled={atLimit}
                  onClick={() => void commitActivity(item.activity_id)}
                >
                  {atLimit ? '已满' : '加入今天'}
                </button>
              </div>
            )
          })}
        </div>
        {(data.queue?.length ?? 0) > QUEUE_PREVIEW_LIMIT ? (
          <button
            type="button"
            className="home-section__more-link"
            onClick={() => setQueueExpanded((v) => !v)}
          >
            {queueExpanded
              ? '收起'
              : `查看更多（还有 ${(data.queue?.length ?? 0) - QUEUE_PREVIEW_LIMIT} 条）`}
          </button>
        ) : null}
      </section>

      <section className="home-section">
        <div className="home-section__label-row">
          <div className="home-section__label">我的主题</div>
          <Link className="home-section__link" to="/themes">
            管理全部
          </Link>
        </div>
        <div className="theme-grid">
          {visibleThemes.map((theme) => {
            const todayCount = data.today_tasks.filter((t) => t.theme_id === theme.id).length
            const queueCount = (data.queue || []).filter((q) => q.theme_id === theme.id).length
            return (
              <div key={theme.id} className="theme-card">
                <div className="theme-card__head">
                  <span className="theme-card__name">{theme.title}</span>
                  <span className={phaseTag[theme.phase]}>{phaseZh[theme.phase]}</span>
                </div>
                <div className="theme-card__status">
                  {theme.is_focus ? '主焦点' : '在跑'}
                  {theme.goal ? ` · ${theme.goal}` : ''}
                </div>
                <div className="theme-card__footer">
                  <span className="theme-card__task-hint">
                    承诺 {todayCount} · 队列 {queueCount}
                  </span>
                  <div className="theme-card__footer-actions">
                    {queueCount > 0 && todayCount < 2 ? (
                      <button
                        type="button"
                        className="ds-btn ds-btn--tertiary ds-btn--sm"
                        onClick={() => void suggestFill(theme.id)}
                      >
                        建议填入
                      </button>
                    ) : null}
                    <Link className="theme-card__enter" to={`/themes/${theme.id}`}>
                      <span>进入概览</span>
                      <Icon name="chevron-right" size={14} />
                    </Link>
                  </div>
                </div>
                {isFirst && <SlotBar slots={data.slots} />}
              </div>
            )
          })}
        </div>
        {active.length > 4 && (
          <Link className="home-section__more-link" to="/themes">
            查看全部 {active.length} 个主题
          </Link>
        )}
        {!isFirst && <SlotBar slots={data.slots} />}
        {drafts.length > 0 && (
          <div className="home-draft-card">
            <div className="home-draft-card__main">
              <span className="home-draft-card__eyebrow">未完成共创</span>
              <span className="home-draft-card__title">{drafts[0].title}</span>
              <span className="home-draft-card__desc">
                {drafts.length > 1
                  ? `另有 ${drafts.length - 1} 个草稿待续创`
                  : '继续阶梯 / 资料 / 计划共创，锁定后进入执行'}
              </span>
            </div>
            <div className="home-draft-card__actions">
              <Link className="ds-btn ds-btn--brand ds-btn--sm" to={draftResumePath(drafts[0])}>
                {draftResumeLabel(drafts[0])}
              </Link>
              <Link className="ds-btn ds-btn--secondary ds-btn--sm" to="/themes?tab=draft">
                全部草稿
              </Link>
            </div>
          </div>
        )}
      </section>

      {driftMessages.length > 0 && (
        <section className="home-section">
          <div className="home-section__label">漂移提示</div>
          <div className="ds-alert ds-alert--warning">
            <span className="ds-alert__icon">
              <Icon name="alert-triangle" size={16} />
            </span>
            <div className="ds-alert__content">
              <div className="ds-alert__title">{driftTitle(data.drift_events[0]?.kind)}</div>
              <div className="ds-alert__desc">
                {driftMessages.length === 1 ? (
                  driftMessages[0].message
                ) : (
                  <ul className="home-drift-list">
                    {driftMessages.map((ev) => (
                      <li key={ev.id}>{ev.message}</li>
                    ))}
                  </ul>
                )}
              </div>
              {showFocusDriftActions && focusThemes.length > 1 ? (
                <div className="home-drift-actions">
                  {focusThemes.map((t) => (
                    <div key={t.id} className="home-drift-actions__row">
                      <span className="home-drift-actions__name">{t.title}</span>
                      <div className="home-drift-actions__btns">
                        <button
                          type="button"
                          className="ds-btn ds-btn--secondary ds-btn--sm"
                          onClick={() => void clearFocus(t.id)}
                        >
                          取消焦点
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--tertiary ds-btn--sm"
                          onClick={() => void dormancyTheme(t.id)}
                        >
                          休眠
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
