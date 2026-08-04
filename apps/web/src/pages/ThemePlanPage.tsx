import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type ActiveSlice, type Theme, type ThemePhase } from '../lib/api'
import { getCurrentLevel, getSliceItems, phaseZh } from '../lib/themeDoc'
import '../styles/pages/theme-plan.css'

const PHASES: Array<{ key: ThemePhase; label: string }> = [
  { key: 'learning', label: '学习' },
  { key: 'practice', label: '练习' },
  { key: 'application', label: '应用' },
]

const SLOT_KEYS: ThemePhase[] = ['learning', 'practice', 'application']

function phaseIndex(phase: ThemePhase) {
  return PHASES.findIndex((p) => p.key === phase)
}

function noop() {
  /* 原型演示：未接后端的条目编辑 */
}

export function ThemePlanPage() {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [slice, setSlice] = useState<ActiveSlice | null>(null)
  const [themes, setThemes] = useState<Theme[]>([])
  const [slots, setSlots] = useState<Record<string, { used: number; max: number }>>({})
  const [drift, setDrift] = useState<
    Array<{ id: string; kind: string; message: string; theme_id: string | null; created_at: string }>
  >([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [focusWarnOpen, setFocusWarnOpen] = useState(false)
  const [focusErrorOpen, setFocusErrorOpen] = useState(false)
  const [slotFullOpen, setSlotFullOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [ok, setOk] = useState('')

  const items = useMemo(() => getSliceItems(slice, theme), [slice, theme])
  const currentLevel = useMemo(() => getCurrentLevel(theme), [theme])

  async function load() {
    const [t, home, s, active] = await Promise.all([
      api.getTheme(themeId),
      api.home(),
      api.slots(),
      api.getActiveSlice(themeId).catch(() => null),
    ])
    setTheme(t)
    setThemes(home.themes)
    setSlots(s)
    setDrift(home.drift_events)
    setSlice(active)
  }

  useEffect(() => {
    void load().catch((e) => setError(String(e.message || e)))
  }, [themeId])

  async function toggleItem(item: { id: string; activityId?: string; done?: boolean }) {
    if (!item.activityId) return
    setBusy(true)
    try {
      const updated = await api.toggleActivity(item.activityId, !item.done)
      setSlice((prev) =>
        prev
          ? {
              ...prev,
              activities: prev.activities.map((a) =>
                a.id === updated.id ? { ...a, done: updated.done } : a,
              ),
            }
          : prev,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmAdvance() {
    setBusy(true)
    setError('')
    try {
      await api.advancePhase(themeId)
      setAdvanceOpen(false)
      await load()
    } catch (e) {
      setAdvanceOpen(false)
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      if (/槽|slot|满/i.test(msg)) setSlotFullOpen(true)
    } finally {
      setBusy(false)
    }
  }

  async function confirmComplete() {
    if (!theme) return
    setBusy(true)
    setError('')
    setOk('')
    try {
      await api.updateTheme(theme.id, { status: 'completed' })
      setCompleteOpen(false)
      setOk('已标记完成，主题不再占槽')
      nav(`/themes?tab=completed`)
    } catch (e) {
      setCompleteOpen(false)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function setFocus(next: boolean) {
    if (!theme) return
    setBusy(true)
    setError('')
    try {
      await api.updateTheme(theme.id, { is_focus: next })
      setFocusWarnOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function trySetFocus() {
    const focusCount = themes.filter((t) => t.is_focus && t.status === 'active').length
    if (focusCount >= 3) {
      setFocusErrorOpen(true)
      return
    }
    if (focusCount >= 1) {
      setFocusWarnOpen(true)
      return
    }
    void setFocus(true)
  }

  function tryAdvance() {
    if (!theme) return
    const idx = phaseIndex(theme.phase)
    if (idx >= PHASES.length - 1) return
    const next = PHASES[idx + 1]
    const slot = slots[next.key]
    if (slot && slot.used >= slot.max) {
      setSlotFullOpen(true)
      return
    }
    setAdvanceOpen(true)
  }

  if (!theme) {
    return (
      <div className="phase-main">
        <div className="phase-left">
          <p className="muted">加载中…</p>
        </div>
      </div>
    )
  }

  const currentIdx = phaseIndex(theme.phase)
  const phaseLabel = PHASES[currentIdx]?.label ?? theme.phase
  const canAdvance = theme.phase !== 'application' && theme.status === 'active'
  const canComplete =
    theme.status === 'active' && theme.phase === 'application'
  const done = items.filter((it) => it.done).length
  const focusedThemes = themes.filter((t) => t.is_focus && t.status === 'active')
  const occupyingByPhase = (key: ThemePhase) =>
    themes.filter((t) => t.phase === key && t.status === 'active').map((t) => t.title).join('、')
  const sliceTitle = slice?.title || `${phaseLabel}计划`

  return (
    <>
      <div className="phase-main">
        <div className="phase-left" id="phaseLeft">
          {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
          {ok && <div className="ok-banner" style={{ marginBottom: 16 }}>{ok}</div>}

          <div style={{ marginBottom: 16 }}>
            <Link to={`/themes/${theme.id}/work`} className="ds-btn ds-btn--tertiary ds-btn--sm">
              <Icon name="arrow-left" size={14} className="icon" />
              返回作业
            </Link>
          </div>

          <div className="phase-timeline" id="phaseTimeline">
            {PHASES.map((phase, i) => {
              const nodeClass =
                i === currentIdx ? ' is-active' : i < currentIdx ? ' is-completed' : ''
              const circleClass =
                i === currentIdx ? ' is-active' : i < currentIdx ? ' is-completed' : ''
              const icon = i < currentIdx ? 'check' : i === currentIdx ? 'play' : 'circle'
              return (
                <Fragment key={phase.key}>
                  <div className={`phase-timeline__node${nodeClass}`}>
                    <div className={`phase-timeline__circle${circleClass}`}>
                      <Icon name={icon} size={14} />
                    </div>
                    <span className="phase-timeline__label">{phase.label}</span>
                  </div>
                  {i < PHASES.length - 1 ? (
                    <div
                      className={`phase-timeline__line${i < currentIdx ? ' is-completed' : ''}`}
                    />
                  ) : null}
                </Fragment>
              )
            })}
          </div>

          <div id="activeSliceContainer">
            <div className="slice-card">
              <div className="slice-card__head">
                <div className="slice-card__head-left">
                  <span className="slice-card__title">
                    {sliceTitle}
                    {currentLevel ? ` · L${currentLevel.level}` : ''}
                  </span>
                  <span className="ds-tag ds-tag--brand">进行中</span>
                </div>
                <span
                  className="mono"
                  style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}
                >
                  {done} / {items.length}
                </span>
              </div>
              <div className="slice-card__body ds-stack-8">
                {items.length === 0 ? (
                  <p className="text-tertiary" style={{ fontSize: 12, margin: 0 }}>
                    暂无计划活动。完成计划共创并锁定后，这里会展示当前阶段的活动列表。
                  </p>
                ) : null}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`checklist-item${item.done ? ' is-checked' : ''}`}
                  >
                    <label className="ds-check checklist-item__check">
                      <input
                        type="checkbox"
                        checked={!!item.done}
                        disabled={busy || !item.activityId}
                        onChange={() => void toggleItem(item)}
                      />
                      <span className="ds-check__box" />
                    </label>
                    <div className="checklist-item__content">
                      <span className="checklist-item__label">{item.label}</span>
                      <span className="checklist-item__desc">{item.desc}</span>
                    </div>
                    <button
                      type="button"
                      className="checklist-item__delete"
                      title="删除"
                      onClick={noop}
                    >
                      <Icon name="trash" size={12} alt="trash" />
                    </button>
                  </div>
                ))}
                <div className="slice-add-row">
                  <button
                    type="button"
                    className="ds-btn ds-btn--tertiary ds-btn--sm"
                    onClick={noop}
                  >
                    <Icon name="plus" size={12} className="icon" />
                    添加
                  </button>
                </div>
              </div>
              {canAdvance ? (
                <div className="slice-card__foot">
                  <button
                    type="button"
                    className="ds-btn ds-btn--brand"
                    disabled={busy}
                    onClick={() => tryAdvance()}
                  >
                    进入下一阶段 <Icon name="arrow-right" size={14} className="icon" />
                  </button>
                </div>
              ) : null}
              {canComplete ? (
                <div className="slice-card__foot">
                  <p className="text-tertiary" style={{ fontSize: 12, margin: '0 0 8px' }}>
                    应用期可长尾续跑；若已随心所欲，可标记完成并释放槽位。
                  </p>
                  <button
                    type="button"
                    className="ds-btn ds-btn--brand"
                    disabled={busy}
                    onClick={() => setCompleteOpen(true)}
                  >
                    标记完成（毕业）
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div id="archiveContainer">
            <div className="archive-section">
              <div
                className={`archive-section__toggle${archiveOpen ? ' is-open' : ''}`}
                onClick={() => setArchiveOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setArchiveOpen((v) => !v)
                }}
                role="button"
                tabIndex={0}
              >
                <Icon name="chevron-right" size={14} />
                <span>学习计划</span>
                <span className="archive-section__badge">
                  <Icon name="lock" size={12} alt="lock" />
                  已归档 · 只读
                </span>
              </div>
              <div className={`archive-section__body${archiveOpen ? ' is-open' : ''}`}>
                <div className="archive-section__inner ds-stack-8">
                  {theme.goal ? (
                    <div className="checklist-item is-checked">
                      <label className="ds-check checklist-item__check">
                        <input type="checkbox" checked disabled />
                        <span className="ds-check__box" />
                      </label>
                      <div className="checklist-item__content">
                        <span className="checklist-item__label">{theme.goal}</span>
                        <span className="checklist-item__desc">
                          {phaseZh.learning}目标 · 已锁定基线
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-tertiary" style={{ fontSize: 12, margin: 0 }}>
                      暂无归档条目
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="phase-right">
          <div className="right-section">
            <div className="section-heading">
              <Icon name="grid-2x2" size={14} alt="grid" />
              阶段槽位概览
            </div>
            <div id="slotOverview">
              {SLOT_KEYS.map((key) => {
                const phase = PHASES.find((p) => p.key === key)!
                const used = slots[key]?.used ?? 0
                const limit = slots[key]?.max ?? 1
                const pct = Math.min((used / limit) * 100, 100)
                const isFull = used >= limit
                const occupying = occupyingByPhase(key)
                return (
                  <div key={key} className="slot-card">
                    <div className="slot-card__row">
                      <span className="slot-card__name">{phase.label}</span>
                      <span
                        className="slot-card__count"
                        style={{
                          color: isFull ? 'var(--status-error-default)' : 'var(--text-secondary)',
                        }}
                      >
                        {used} / {limit}
                      </span>
                    </div>
                    <div className="slot-card__minibar">
                      <div
                        className={`slot-card__minibar-fill${isFull ? ' is-full' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {isFull ? (
                      <div className="slot-card__alert">
                        <Icon name="alert-circle" size={12} alt="alert" />
                        槽位已满{occupying ? `，占用：${occupying}` : ''}。请先推进到下一阶段或休眠/废弃。
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="right-section">
            <div className="section-heading">
              <Icon name="star" size={14} alt="star" />
              主焦点管理
            </div>
            <div className="focus-list" id="focusList">
              {focusedThemes.length === 0 ? (
                <div className="focus-empty">暂无主焦点主题</div>
              ) : (
                focusedThemes.map((t) => {
                  const pl = PHASES.find((p) => p.key === t.phase)?.label ?? t.phase
                  return (
                    <div key={t.id} className="focus-item">
                      <Icon name="star" size={14} alt="star" className="focus-item__star" />
                      <span
                        className="focus-item__name"
                        style={t.id === theme.id ? { fontWeight: 500 } : undefined}
                      >
                        {t.title}
                      </span>
                      <span className="focus-item__phase">{pl}期</span>
                    </div>
                  )
                })
              )}
            </div>
            <div style={{ marginTop: 'var(--spacer-12)' }} id="focusActionArea">
              {theme.is_focus ? (
                <button
                  type="button"
                  className="focus-action-btn is-danger"
                  disabled={busy}
                  onClick={() => void setFocus(false)}
                >
                  取消焦点
                </button>
              ) : (
                <button
                  type="button"
                  className="focus-action-btn"
                  disabled={busy}
                  onClick={() => trySetFocus()}
                >
                  设为主焦点
                </button>
              )}
              <button
                type="button"
                className="focus-action-btn"
                style={{ marginLeft: 8 }}
                disabled={busy}
                onClick={() =>
                  void api.updateTheme(theme.id, { status: 'dormant' }).then(load).catch((e) => {
                    setError(e instanceof Error ? e.message : String(e))
                  })
                }
              >
                休眠腾槽
              </button>
            </div>
          </div>

          <div className="right-section">
            <div className="section-heading">
              <Icon name="trending-down" size={14} alt="trending-down" />
              漂移记录
            </div>
            <div className="drift-list" id="driftList">
              {drift.length === 0 ? (
                <div className="focus-empty">暂无漂移记录</div>
              ) : (
                drift.map((r) => (
                  <div key={r.id} className="drift-item">
                    <div className="drift-item__dot" />
                    <div className="drift-item__content">
                      <div className="drift-item__time">{r.created_at}</div>
                      <div className="drift-item__desc">{r.message}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`modal-overlay${advanceOpen ? ' is-open' : ''}`} id="modalAdvancePhase">
        <div className="ds-dialog">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title">确认进入下一阶段</span>
            <button type="button" className="ds-dialog__close" onClick={() => setAdvanceOpen(false)}>
              <Icon name="x" size={14} alt="close" />
            </button>
          </div>
          <div className="ds-dialog__body">
            {phaseLabel}计划将归档，系统将生成
            {PHASES[currentIdx + 1]?.label ?? '下一'}计划。归档后不可编辑。
          </div>
          <div className="ds-dialog__foot">
            <button
              type="button"
              className="ds-btn ds-btn--secondary"
              onClick={() => setAdvanceOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--brand"
              disabled={busy}
              onClick={() => void confirmAdvance()}
            >
              确认
            </button>
          </div>
        </div>
      </div>

      <div className={`modal-overlay${completeOpen ? ' is-open' : ''}`} id="modalCompleteTheme">
        <div className="ds-dialog">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title">确认标记完成</span>
            <button type="button" className="ds-dialog__close" onClick={() => setCompleteOpen(false)}>
              <Icon name="x" size={14} alt="close" />
            </button>
          </div>
          <div className="ds-dialog__body">
            将「{theme.title}」标记为完成（毕业）：释放应用槽位，主题进入「完成」列表，之后仍可回看或重开。
          </div>
          <div className="ds-dialog__foot">
            <button
              type="button"
              className="ds-btn ds-btn--secondary"
              onClick={() => setCompleteOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--brand"
              disabled={busy}
              onClick={() => void confirmComplete()}
            >
              确认完成
            </button>
          </div>
        </div>
      </div>

      <div className={`modal-overlay${focusWarnOpen ? ' is-open' : ''}`} id="modalFocusWarning">
        <div className="ds-dialog">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title">注意力分散警告</span>
            <button type="button" className="ds-dialog__close" onClick={() => setFocusWarnOpen(false)}>
              <Icon name="x" size={14} alt="close" />
            </button>
          </div>
          <div className="ds-dialog__body">
            <div className="ds-alert ds-alert--warning" style={{ marginBottom: 'var(--spacer-8)' }}>
              <span className="ds-alert__icon">
                <Icon name="alert-triangle" size={16} alt="warning" />
              </span>
              <div>
                <div className="ds-alert__title">同时设多个主焦点会导致注意力分散</div>
                <div className="ds-alert__desc">此操作已记入计划漂移记录。</div>
              </div>
            </div>
            <span>
              当前已有 {focusedThemes.length} 个主焦点。确定要将「{theme.title}」也设为主焦点吗？
            </span>
          </div>
          <div className="ds-dialog__foot">
            <button
              type="button"
              className="ds-btn ds-btn--secondary"
              onClick={() => setFocusWarnOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--warning"
              disabled={busy}
              onClick={() => void setFocus(true)}
            >
              仍然设置
            </button>
          </div>
        </div>
      </div>

      <div className={`modal-overlay${focusErrorOpen ? ' is-open' : ''}`} id="modalFocusError">
        <div className="ds-dialog">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title">主焦点数量已达上限</span>
            <button type="button" className="ds-dialog__close" onClick={() => setFocusErrorOpen(false)}>
              <Icon name="x" size={14} alt="close" />
            </button>
          </div>
          <div className="ds-dialog__body">
            <div className="ds-alert ds-alert--danger" style={{ marginBottom: 'var(--spacer-8)' }}>
              <span className="ds-alert__icon">
                <Icon name="alert-circle" size={16} alt="error" />
              </span>
              <div>
                <div className="ds-alert__title">主焦点最多 3 个</div>
                <div className="ds-alert__desc">请先取消一个已有的主焦点后再设置新的。</div>
              </div>
            </div>
          </div>
          <div className="ds-dialog__foot">
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              onClick={() => setFocusErrorOpen(false)}
            >
              知道了
            </button>
          </div>
        </div>
      </div>

      <div className={`modal-overlay${slotFullOpen ? ' is-open' : ''}`} id="modalSlotFull">
        <div className="ds-dialog">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title">学习槽已满</span>
            <button type="button" className="ds-dialog__close" onClick={() => setSlotFullOpen(false)}>
              <Icon name="x" size={14} alt="close" />
            </button>
          </div>
          <div className="ds-dialog__body">
            <div className="ds-alert ds-alert--danger" style={{ marginBottom: 'var(--spacer-8)' }}>
              <span className="ds-alert__icon">
                <Icon name="alert-circle" size={16} alt="error" />
              </span>
              <div>
                <div className="ds-alert__title">目标阶段槽位已被占用</div>
                <div className="ds-alert__desc">
                  请先推进其他主题到下一阶段，或将其休眠/废弃。
                </div>
              </div>
            </div>
          </div>
          <div className="ds-dialog__foot">
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              onClick={() => {
                setSlotFullOpen(false)
                nav('/')
              }}
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
