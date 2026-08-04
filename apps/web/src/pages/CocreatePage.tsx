import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  api,
  type CocreateKind,
  type CocreateSession,
  type PlanPrefs,
  type Theme,
} from '../lib/api'
import '../styles/cocreate-layout.css'
import '../styles/pages/create-stage.css'
import '../styles/pages/create-resources.css'
import '../styles/pages/create-plan.css'

const DEFAULT_PLAN_PREFS: PlanPrefs = {
  learning_duration: '10 节 × 2 小时',
  practice_duration: '约 4 周',
  application_duration: '长尾',
  daily_minutes: 30,
}

const RESOURCE_SUGGESTIONS = [
  '我对这个主题很感兴趣，请再多给几份高质量参考资料',
  '再精简一点，只留最核心的',
  '优先微信读书能读到的书',
  '再硬核、更专业一些',
]

const PLAN_SUGGESTIONS = [
  '希望更早进入练习期，学习期少几节',
  '学习期再充分一点，多加几节',
  '练习期每天改成约 20 分钟',
  '应用期先保持简单骨架就好',
]

const meta: Record<
  CocreateKind,
  {
    title: string
    headSub: string
    docHint: string
    placeholder: string
    confirmHint: string
    confirmLabel: string
    backPath: (id: string) => string
    nextPath: (id: string) => string
  }
> = {
  stage: {
    title: '学习阶梯',
    headSub: 'AI 教练 · 定位你的学习起点',
    docHint: '5 级 · 点击选择你当前所在的级别',
    placeholder: '回答教练的问题，或直接点选右侧级别…',
    confirmHint: '选定当前级别后进入下一步 →',
    confirmLabel: '确认，进入学习资料',
    backPath: () => '/create',
    nextPath: (id) => `/create/${id}/resources`,
  },
  resources: {
    title: '学习资料',
    headSub: 'AI 教练 · 先给推荐，再按你的意见调整',
    docHint: '基于主题 / 目标 / 阶梯的推荐清单',
    placeholder: '说出你的意见，例如「再多几份」…（Enter 发送）',
    confirmHint: '确认资料后进入学习计划共创 →',
    confirmLabel: '确认，进入学习计划',
    backPath: (id) => `/create/${id}/stage`,
    nextPath: (id) => `/create/${id}/plan`,
  },
  plan: {
    title: '学习计划',
    headSub: 'AI 教练 · 先给推荐节奏，再按你的意见调整',
    docHint: '基于主题 / 阶梯 / 资料的推荐计划',
    placeholder: '说出你的意见，例如「更早开始练习」…（Enter 发送）',
    confirmHint: '',
    confirmLabel: '锁定计划',
    backPath: (id) => `/create/${id}/resources`,
    nextPath: (id) => `/themes/${id}/summary`,
  },
}

const stepOrder: CocreateKind[] = ['stage', 'resources', 'plan']

function applyDurationsToPrefs(
  liveDoc: Record<string, unknown>,
  prev: PlanPrefs,
): PlanPrefs {
  const durations = liveDoc.durations as
    | { learning?: string; practice?: string; application?: string }
    | undefined
  return {
    learning_duration: durations?.learning || prev.learning_duration,
    practice_duration: durations?.practice || prev.practice_duration,
    application_duration: durations?.application || prev.application_duration,
    daily_minutes: Number(liveDoc.daily_minutes) || prev.daily_minutes,
  }
}

export function CocreatePage({ kind }: { kind: CocreateKind }) {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const reviseRequested = searchParams.get('revise') === '1'
  const info = meta[kind]
  const [theme, setTheme] = useState<Theme | null>(null)
  const [session, setSession] = useState<CocreateSession | null>(null)
  const [input, setInput] = useState('')
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revisionMode, setRevisionMode] = useState(false)
  const [openedAt, setOpenedAt] = useState<Date | null>(null)
  const [planPrefs, setPlanPrefs] = useState<PlanPrefs>(DEFAULT_PLAN_PREFS)
  const [slotBlocker, setSlotBlocker] = useState<Theme | null>(null)

  useEffect(() => {
    void api.getTheme(themeId).then(setTheme).catch(() => setTheme(null))
  }, [themeId])

  useEffect(() => {
    if (kind !== 'plan') {
      setSlotBlocker(null)
      return
    }
    let cancelled = false
    void api
      .home()
      .then((home) => {
        if (cancelled) return
        const used = home.slots.learning?.used ?? 0
        const max = home.slots.learning?.max ?? 1
        const occupying = home.themes.find(
          (t) => t.status === 'active' && t.phase === 'learning' && t.id !== themeId,
        )
        setSlotBlocker(used >= max && occupying ? occupying : null)
      })
      .catch(() => {
        if (!cancelled) setSlotBlocker(null)
      })
    return () => {
      cancelled = true
    }
  }, [kind, themeId])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setBusy(true)
      setError('')
      setSession(null)
      setRevisionMode(false)
      setOpenedAt(null)
      try {
        let s: CocreateSession
        try {
          const existing = await api.getCocreate(themeId, kind)
          if (existing.confirmed) {
            s = existing
            if (!cancelled) setRevisionMode(true)
          } else {
            s = existing
          }
        } catch {
          s = await api.startCocreate(themeId, kind)
        }
        if (!cancelled) {
          setSession(s)
          setOpenedAt(new Date())
          const level = (s.live_doc as { selected_level?: number }).selected_level
          if (typeof level === 'number') setSelectedLevel(level)
          if (kind === 'plan') {
            setPlanPrefs((prev) => applyDurationsToPrefs(s.live_doc, prev))
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [themeId, kind])

  const levels = useMemo(() => {
    const doc = session?.live_doc as { levels?: Array<Record<string, unknown>> } | undefined
    return doc?.levels || []
  }, [session])

  const resourceCount = useMemo(() => {
    const resources = (session?.live_doc.resources as unknown[] | undefined) || []
    const target = Number(session?.live_doc.target_count)
    return target || resources.length || 0
  }, [session])

  const topic = theme?.title || '主题'
  const suggestions =
    kind === 'resources' ? RESOURCE_SUGGESTIONS : kind === 'plan' ? PLAN_SUGGESTIONS : []

  async function sendMessage(content: string) {
    if (!content.trim() || !session || busy || session.confirmed) return
    setBusy(true)
    setError('')
    try {
      const s = await api.messageCocreate(themeId, kind, content.trim())
      setSession(s)
      setInput('')
      if (kind === 'plan') {
        setPlanPrefs((prev) => applyDurationsToPrefs(s.live_doc, prev))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    await sendMessage(input)
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  async function restartCocreate() {
    setBusy(true)
    setError('')
    try {
      const s = await api.startCocreate(themeId, kind, { force: true })
      setSession(s)
      setRevisionMode(false)
      setOpenedAt(new Date())
      if (kind === 'plan') {
        setPlanPrefs((prev) => applyDurationsToPrefs(s.live_doc, prev))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function messageTimeLabel(index: number, total: number) {
    if (index === total - 1) {
      if (!openedAt) return '刚刚'
      const secs = Math.floor((Date.now() - openedAt.getTime()) / 1000)
      if (secs < 60) return '刚刚'
      return `${Math.floor(secs / 60)} 分钟前`
    }
    return '稍早'
  }

  async function confirm() {
    if (!session || session.confirmed) {
      setError('本步已确认。请先点「重新共创」后再确认。')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (kind === 'stage') {
        if (!selectedLevel) {
          setError('请先在右侧选择你当前所在的阶梯级别')
          setBusy(false)
          return
        }
        await api.confirmCocreate(themeId, kind, {
          selected_level: selectedLevel,
          live_doc: { ...session.live_doc, selected_level: selectedLevel },
        })
      } else {
        await api.confirmCocreate(themeId, kind, { live_doc: session.live_doc })
      }
      nav(info.nextPath(themeId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (kind === 'plan' && /槽位已满|slot/i.test(msg)) {
        setError(`${msg} 可先去腾出学习槽位，再回来锁定。`)
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  function stepClass(step: CocreateKind) {
    const cur = stepOrder.indexOf(kind)
    const i = stepOrder.indexOf(step)
    if (i < cur) return 'titlebar__step is-done'
    if (i === cur) return 'titlebar__step is-active'
    return 'titlebar__step'
  }

  const revisionView = Boolean(revisionMode || session?.confirmed)
  const lockDisabled = kind === 'plan' && (busy || !session || revisionView)
  const composeDisabled = busy || !session || revisionView
  const confirmDisabled = busy || !session || revisionView
  const rationale = session?.live_doc.rationale ? String(session.live_doc.rationale) : ''
  const messages = session?.messages || []
  const showRevisionBanner = revisionView || (reviseRequested && Boolean(session?.confirmed))

  return (
    <>
      <header className="titlebar">
        <div className="titlebar__left">
          <button
            className="titlebar__back"
            type="button"
            title="返回"
            onClick={() => nav(info.backPath(themeId))}
          >
            <Icon name="arrow-left" size={18} className="icon" />
          </button>
          <div className="titlebar__title">
            {info.title}
            <span className="sep">·</span>
            <span className="topic">{topic}</span>
          </div>
          <div className="titlebar__stepper">
            <span className="titlebar__step is-done"><span className="dot" />信息</span>
            <span className="titlebar__step-sep">·</span>
            <span className={stepClass('stage')}><span className="dot" />阶梯</span>
            <span className="titlebar__step-sep">·</span>
            <span className={stepClass('resources')}><span className="dot" />资料</span>
            <span className="titlebar__step-sep">·</span>
            <span className={stepClass('plan')}><span className="dot" />计划</span>
          </div>
        </div>
        <div className="titlebar__right">
          {kind === 'plan' && session ? (
            <button
              className={`titlebar__lock-btn${lockDisabled ? ' is-disabled' : ''}`}
              data-state={revisionView ? 'locked' : 'unlocked'}
              type="button"
              disabled={lockDisabled}
              title={revisionView ? '已确认。请先重新共创后再锁定' : undefined}
              onClick={() => void confirm()}
            >
              <span className="lock-icon">
                <Icon name="lock" size={14} className="icon" />
              </span>
              <span className="lock-text">
                {busy ? '锁定中…' : revisionView ? '已锁定' : '锁定计划'}
              </span>
            </button>
          ) : null}
        </div>
      </header>

      <main className="main">
        <section className="chat-panel">
          <div className="chat-panel__head">
            <Icon name="sparkles" size={16} className="ic icon" />
            <div>
              <div className="chat-panel__head-title">对话共创</div>
              <div className="chat-panel__head-sub">{info.headSub}</div>
            </div>
          </div>

          <div className="chat-scroll">
            {showRevisionBanner ? (
              <div className="error-banner" style={{ display: 'grid', gap: 8, background: 'var(--status-warning-surface-l1)', borderColor: 'var(--status-warning-surface-l2)', color: 'var(--text-default)' }}>
                <div>本步已确认。可继续查看；若要重开共创请点「重新共创」</div>
                <div>
                  <button
                    className="ds-btn ds-btn--secondary ds-btn--sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void restartCocreate()}
                  >
                    重新共创
                  </button>
                </div>
              </div>
            ) : null}
            {slotBlocker ? (
              <div className="error-banner" style={{ display: 'grid', gap: 8 }}>
                <div>
                  学习槽位已被「{slotBlocker.title}」占用（1/1）。现在可以共创计划，但锁定前需先腾槽。
                </div>
                <div>
                  <button
                    className="ds-btn ds-btn--secondary ds-btn--sm"
                    type="button"
                    onClick={() => nav('/create/intercept')}
                  >
                    去腾出学习槽位
                  </button>
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="error-banner" style={{ display: 'grid', gap: 8 }}>
                <div>{error}</div>
                {kind === 'plan' && /槽位已满|slot/i.test(error) ? (
                  <div>
                    <button
                      className="ds-btn ds-btn--secondary ds-btn--sm"
                      type="button"
                      onClick={() => nav('/create/intercept')}
                    >
                      去腾出学习槽位
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(session?.messages || []).map((m, i) => (
              <div key={`${m.role}-${i}`} className={`msg msg--${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="msg__avatar">
                  {m.role === 'user' ? '我' : <Icon name="sparkles" size={16} className="icon" />}
                </div>
                <div className="msg__body">
                  <div className="msg__bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  <div className="msg__meta">
                    {m.role === 'user' ? '你' : 'AI 教练'} · {messageTimeLabel(i, messages.length)}
                  </div>
                </div>
              </div>
            ))}
            {busy && session ? (
              <div className="msg msg--ai">
                <div className="msg__avatar"><Icon name="sparkles" size={16} className="icon" /></div>
                <div className="msg__body">
                  <div className="msg__bubble">AI 教练思考中…</div>
                </div>
              </div>
            ) : null}
            {busy && !session ? (
              <div className="msg msg--ai">
                <div className="msg__avatar"><Icon name="sparkles" size={16} className="icon" /></div>
                <div className="msg__body">
                  <div className="msg__bubble">
                    {kind === 'resources'
                      ? '正在根据主题、目标与阶梯推荐资料…'
                      : kind === 'plan'
                        ? '正在根据主题、阶梯与资料推荐学习节奏…'
                        : 'AI 正在生成初稿…'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="composer-wrap">
            {session && suggestions.length > 0 && !revisionView ? (
              <div className="suggest-chips">
                <span className="pref-chips__label">快速提意见</span>
                {suggestions.map((text) => (
                  <button
                    key={text}
                    type="button"
                    className="pref-chip"
                    disabled={busy}
                    onClick={() => void sendMessage(text)}
                  >
                    {text.length > 18 ? `${text.slice(0, 16)}…` : text}
                  </button>
                ))}
              </div>
            ) : null}

            <form className="ds-composer" onSubmit={(e) => void send(e)}>
              <textarea
                className="ds-composer__input"
                placeholder={
                  revisionView ? '本步已确认，请先点「重新共创」后再对话' : info.placeholder
                }
                value={input}
                disabled={composeDisabled}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onComposerKey}
              />
              <div className="ds-composer__toolbar">
                <div className="ds-composer__tools">
                  <div className="ds-composer__model">
                    <Icon name="sparkles" size={12} className="icon" />
                    <span>教练模式</span>
                  </div>
                </div>
                <div className="ds-composer__actions">
                  <button
                    className="ds-composer__send"
                    type="submit"
                    title="发送"
                    disabled={composeDisabled || !input.trim()}
                  >
                    <Icon name="send" size={16} className="icon" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section className="doc-panel">
          <div className="doc-head">
            <div className="doc-head__title">
              <Icon name="file-text" size={16} className="ic icon" />
              <span>「{topic}」{info.title}</span>
            </div>
            <div className="doc-head__hint">
              {kind === 'resources' && session
                ? `推荐 ${resourceCount} 份${rationale ? ` · ${rationale}` : ''}`
                : kind === 'plan' && session
                  ? `学 ${planPrefs.learning_duration} · 练 ${planPrefs.practice_duration} · 用 ${planPrefs.application_duration} · 每天约 ${planPrefs.daily_minutes} 分钟`
                  : info.docHint}
            </div>
          </div>

          <div className="doc-scroll">
            <div className="doc-inner">
              {kind === 'stage' && (
                <StageDoc
                  levels={levels}
                  selectedLevel={selectedLevel}
                  onSelect={revisionView ? () => undefined : setSelectedLevel}
                  readOnly={revisionView}
                />
              )}
              {kind === 'resources' && <ResourcesDoc doc={session?.live_doc || {}} />}
              {kind === 'plan' && <PlanDoc doc={session?.live_doc || {}} />}
            </div>
          </div>

          {kind !== 'plan' ? (
            <div className="confirm-bar">
              <span className="confirm-bar__hint">
                {revisionView ? '本步已确认。若要修改请先重新共创。' : info.confirmHint}
              </span>
              <button
                className="ds-btn ds-btn--brand"
                type="button"
                disabled={confirmDisabled}
                onClick={() => void confirm()}
              >
                <span>{revisionView ? '已确认' : info.confirmLabel}</span>
                {!revisionView ? <Icon name="arrow-right" size={12} className="icon" /> : null}
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </>
  )
}

function StageDoc({
  levels,
  selectedLevel,
  onSelect,
  readOnly = false,
}: {
  levels: Array<Record<string, unknown>>
  selectedLevel: number | null
  onSelect: (n: number) => void
  readOnly?: boolean
}) {
  return (
    <section className="doc-section">
      <div className="doc-section__head">
        <span className="doc-section__index">A</span>
        <h3 className="doc-section__title">
          <Icon name="layers" size={14} className="ic icon" />
          学习阶梯定位
        </h3>
        <span className="ds-tag ds-tag--brand">{readOnly ? '已确认' : '点击选择'}</span>
      </div>
      <div className="ladder">
        {levels.map((lv) => {
          const level = Number(lv.level)
          const selected = selectedLevel === level
          const concepts = Array.isArray(lv.concepts) ? (lv.concepts as string[]).join('、') : ''
          return (
            <div
              key={level}
              className={`ladder__row${selected ? ' is-selected' : ''}`}
              data-level={level}
              onClick={readOnly ? undefined : () => onSelect(level)}
              style={readOnly ? { cursor: 'default' } : undefined}
            >
              <div className="ladder__lvl">L{level}</div>
              <div>
                <div className="ladder__name">{String(lv.name || '')}</div>
                <div className="ladder__desc">
                  {lv.understand ? (
                    <div className="row"><span className="k">理解：</span>{String(lv.understand)}</div>
                  ) : null}
                  {lv.mastery ? (
                    <div className="row"><span className="k">掌握：</span>{String(lv.mastery)}</div>
                  ) : null}
                  {concepts ? (
                    <div className="row"><span className="k">核心概念：</span>{concepts}</div>
                  ) : null}
                  {lv.milestone ? (
                    <div className="row"><span className="k">里程碑：</span>{String(lv.milestone)}</div>
                  ) : null}
                  {lv.exercise ? (
                    <div className="row"><span className="k">练习：</span>{String(lv.exercise)}</div>
                  ) : null}
                  {lv.self_check ? (
                    <div className="row"><span className="k">自检：</span>{String(lv.self_check)}</div>
                  ) : null}
                </div>
              </div>
              <button
                className="ladder__select-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(level)
                }}
              >
                {selected ? '✓ 已选定' : '我在这里'}
              </button>
            </div>
          )
        })}
        {!levels.length ? <p className="text-tertiary">等待阶梯生成…</p> : null}
      </div>
    </section>
  )
}

function ResourcesDoc({ doc }: { doc: Record<string, unknown> }) {
  const resources = (doc.resources as Array<Record<string, unknown>>) || []
  const constraints = (doc.constraints as string[]) || []
  const path7d = String(doc.path_7d || '')
  const rationale = String(doc.rationale || '')

  return (
    <>
      <section className="doc-section">
        <div className="doc-section__head">
          <span className="doc-section__index">A</span>
          <h3 className="doc-section__title">资料范围</h3>
          {constraints[0] ? (
            <span className="ds-tag ds-tag--brand" style={{ marginLeft: 'auto' }}>{constraints[0]}</span>
          ) : null}
        </div>
        <div className="constraint-tags">
          {(constraints.length ? constraints : ['高杠杆优先']).map((c) => (
            <span key={c} className="constraint-tag">{c}</span>
          ))}
        </div>
        {rationale ? <p className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>{rationale}</p> : null}
        {path7d ? <p className="text-secondary" style={{ marginTop: 8, fontSize: 12 }}>{path7d}</p> : null}
      </section>

      <section className="doc-section">
        <div className="doc-section__head">
          <span className="doc-section__index">B</span>
          <h3 className="doc-section__title">学习资源（{resources.length} 份）</h3>
          <span className="ds-tag" style={{ marginLeft: 'auto' }}>已排序</span>
        </div>
        <div className="resources">
          {resources.map((r, i) => (
            <div key={i} className="resource-card">
              <div className="resource-card__head">
                <span className="resource-card__icon">
                  <Icon name="file-text" size={16} className="icon" />
                </span>
                <div>
                  <div className="resource-card__title">{String(r.name || `资源 ${i + 1}`)}</div>
                  <div className="resource-card__author">{String(r.type || '')}</div>
                </div>
                <div className="resource-card__tags">
                  {i < 2 ? <span className="ds-tag ds-tag--brand">核心</span> : <span className="ds-tag">补充</span>}
                  {r.weread_readable ? <span className="ds-tag">微信读书可读</span> : null}
                  {r.difficulty ? <span className="ds-tag">{String(r.difficulty)}</span> : null}
                </div>
              </div>
              <div className="resource-card__body">
                {r.learner_type ? (
                  <div className="resource-field">
                    <div className="resource-field__label">类型</div>
                    <div className="resource-field__value">{String(r.learner_type)}</div>
                  </div>
                ) : null}
                {r.difficulty ? (
                  <div className="resource-field">
                    <div className="resource-field__label">难度</div>
                    <div className="resource-field__value">{String(r.difficulty)}</div>
                  </div>
                ) : null}
                {r.covers ? (
                  <div className="resource-field resource-field--full">
                    <div className="resource-field__label">覆盖</div>
                    <div className="resource-field__value">{String(r.covers)}</div>
                  </div>
                ) : null}
                {r.why ? (
                  <div className="resource-field resource-field--full">
                    <div className="resource-field__label">为什么选它</div>
                    <div className="resource-field__value">{String(r.why)}</div>
                  </div>
                ) : null}
                {r.how_to_use ? (
                  <div className="resource-field resource-field--full">
                    <div className="resource-field__label">最短路径</div>
                    <div className="resource-field__value">{String(r.how_to_use)}</div>
                  </div>
                ) : null}
                {r.warning ? (
                  <div className="resource-field resource-field--full">
                    <div className="resource-field__label">注意</div>
                    <div className="resource-field__warning">⚠ {String(r.warning)}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {!resources.length ? <p className="text-tertiary">等待资料推荐…</p> : null}
        </div>
      </section>
    </>
  )
}

function PlanDoc({ doc }: { doc: Record<string, unknown> }) {
  const core = (Array.isArray(doc.core_20) ? doc.core_20 : [])
    .map((c) => {
      if (typeof c === 'string') return c
      if (c && typeof c === 'object' && 'title' in c) return String((c as { title: unknown }).title)
      return String(c ?? '')
    })
    .filter(Boolean)
  const phases =
    (doc.phases as Record<
      string,
      {
        title?: string
        duration?: string
        summary?: string
        activities?: Array<{
          title: string
          description?: string
          activity_type?: string
          minutes?: number
        }>
      }
    >) || {}
  const durations = (doc.durations as Record<string, string>) || {}
  const phaseMinutes = (doc.phase_minutes as Record<string, number>) || {}
  const fallbackDaily = doc.daily_minutes ? Number(doc.daily_minutes) : 30
  const rationale = String(doc.rationale || '')

  const phaseMeta: Array<{ key: string; index: string; fallback: string; badgeClass: string; defaultMin: number }> = [
    { key: 'learning', index: 'B', fallback: '10 节 × 2 小时', badgeClass: 'phase-block__badge--learn', defaultMin: 120 },
    { key: 'practice', index: 'C', fallback: '约 4 周', badgeClass: 'phase-block__badge--practice', defaultMin: 30 },
    { key: 'application', index: 'D', fallback: '长尾', badgeClass: 'phase-block__badge--apply', defaultMin: 30 },
  ]

  const shortLabel: Record<string, string> = {
    learning: '学',
    practice: '练',
    application: '用',
  }

  return (
    <>
      <section className="doc-section">
        <div className="doc-section__head">
          <span className="doc-section__index">A</span>
          <span className="doc-section__title">
            <Icon name="sparkles" size={14} className="ic icon" />
            核心精神
          </span>
        </div>
        <div className="core20">
          {core.map((c) => (
            <div key={c} className="core20__item"><span className="dot" />{c}</div>
          ))}
          {!core.length ? <p className="text-tertiary">等待计划推荐…</p> : null}
        </div>
        {rationale ? <p className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>{rationale}</p> : null}
        {doc.goal ? <p className="text-secondary" style={{ marginTop: 8, fontSize: 12 }}>{String(doc.goal)}</p> : null}
      </section>

      {phaseMeta.map(({ key, index, fallback, badgeClass, defaultMin }) => {
        const phase = phases[key]
        const acts = phase?.activities || []
        const duration = phase?.duration || durations[key] || fallback
        const phaseMin = Number(phaseMinutes[key]) || defaultMin
        const badge = `${shortLabel[key]} · ${duration}`
        return (
          <section key={key} className="doc-section">
            <div className="doc-section__head">
              <span className="doc-section__index">{index}</span>
              <span className="doc-section__title">{phase?.title || key}</span>
              <span className={`phase-block__badge ${badgeClass}`}>{badge}</span>
            </div>
            <div className="phase-block">
              <div className="phase-block__head">
                <span className={`phase-block__badge ${badgeClass}`}>{phase?.title || key}</span>
                <span className="phase-block__title">{phase?.summary || ''}</span>
              </div>
              <div className="sessions">
                {acts.map((a, i) => {
                  const mins = Number(a.minutes) || phaseMin
                  return (
                    <div key={i} className="session-card">
                      <div className="session-card__top">
                        <span className="session-card__num">{i + 1}</span>
                        <span className="session-card__title">{a.title}</span>
                        <span className="session-card__duration">
                          <Icon name="clock" size={12} className="ic icon" />
                          {mins >= 60 ? `${mins / 60} 小时` : `${mins} 分钟`}
                        </span>
                      </div>
                      {a.description ? (
                        <div className="session-card__grid">
                          <div className="session-field session-field--full">
                            <div className="session-field__label">说明</div>
                            <div className="session-field__value">{a.description}</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )
      })}

      <div className="validation-card">
        <div className="validation-card__head">
          <span className="validation-card__icon">
            <Icon name="check-circle" size={16} className="icon" />
          </span>
          <span className="validation-card__title">计划已就绪</span>
        </div>
        <div className="validation-card__desc">
          确认无误后锁定计划，今日任务将自动生成。
        </div>
        <div className="validation-card__meta">
          <span className="m">
            <Icon name="clock" size={12} className="ic icon" />
            学每节 2 小时 · 练/用每天约 {fallbackDaily} 分钟
          </span>
          <span className="m">
            <Icon name="layers" size={12} className="ic icon" />
            {core.length || 0} 条核心精神
          </span>
          <span className="m">
            <Icon name="check-circle" size={12} className="ic icon" />
            学 {durations.learning || phases.learning?.duration || '10 节 × 2 小时'} · 练{' '}
            {durations.practice || phases.practice?.duration || '约 4 周'} · 用{' '}
            {durations.application || phases.application?.duration || '长尾'}
          </span>
        </div>
      </div>
    </>
  )
}
