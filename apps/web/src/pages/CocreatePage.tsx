import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type CocreateKind, type CocreateSession, type Theme } from '../lib/api'
import '../styles/cocreate-layout.css'
import '../styles/pages/create-stage.css'
import '../styles/pages/create-resources.css'
import '../styles/pages/create-plan.css'

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
    headSub: 'AI 教练 · 筛选高杠杆资源',
    docHint: '高杠杆资源 · 可继续加约束',
    placeholder: '加约束、丢链接、或直接确认…（Enter 发送）',
    confirmHint: '确认资料后进入学习计划共创 →',
    confirmLabel: '确认，进入学习计划',
    backPath: (id) => `/create/${id}/stage`,
    nextPath: (id) => `/create/${id}/plan`,
  },
  plan: {
    title: '学习计划',
    headSub: 'AI 教练 · 学/练/用三阶段计划',
    docHint: '三阶段 · 每天约 30 分钟',
    placeholder: '对计划提修改意见…（锁定后不可修改）',
    confirmHint: '',
    confirmLabel: '锁定计划',
    backPath: (id) => `/create/${id}/resources`,
    nextPath: (id) => `/themes/${id}/summary`,
  },
}

const stepOrder: CocreateKind[] = ['stage', 'resources', 'plan']

export function CocreatePage({ kind }: { kind: CocreateKind }) {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const info = meta[kind]
  const [theme, setTheme] = useState<Theme | null>(null)
  const [session, setSession] = useState<CocreateSession | null>(null)
  const [input, setInput] = useState('')
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [planViewed, setPlanViewed] = useState(false)

  useEffect(() => {
    void api.getTheme(themeId).then(setTheme).catch(() => setTheme(null))
  }, [themeId])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setBusy(true)
      setError('')
      setPlanViewed(false)
      try {
        let s: CocreateSession
        try {
          s = await api.getCocreate(themeId, kind)
          if (s.confirmed) {
            s = await api.startCocreate(themeId, kind)
          }
        } catch {
          s = await api.startCocreate(themeId, kind)
        }
        if (!cancelled) {
          setSession(s)
          const level = (s.live_doc as { selected_level?: number }).selected_level
          if (typeof level === 'number') setSelectedLevel(level)
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

  const topic = theme?.title || '主题'

  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!input.trim() || !session || busy) return
    setBusy(true)
    setError('')
    try {
      const s = await api.messageCocreate(themeId, kind, input.trim())
      setSession(s)
      setInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  async function confirm() {
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
          live_doc: { ...session?.live_doc, selected_level: selectedLevel },
        })
      } else if (kind === 'resources') {
        await api.confirmCocreate(themeId, kind, { live_doc: session?.live_doc })
      } else {
        await api.confirmCocreate(themeId, kind, { live_doc: session?.live_doc })
      }
      nav(info.nextPath(themeId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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

  const lockDisabled = kind === 'plan' && (!planViewed || busy)

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
          {kind === 'plan' ? (
            <button
              className={`titlebar__lock-btn${lockDisabled ? ' is-disabled' : ''}`}
              data-state="unlocked"
              type="button"
              disabled={busy}
              onClick={() => {
                if (lockDisabled) return
                void confirm()
              }}
            >
              <span className="lock-icon">
                <Icon name="lock" size={14} className="icon" />
              </span>
              <span className="lock-text">{busy ? '锁定中…' : '锁定计划'}</span>
              <span className="tt">需先查看计划</span>
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
            {error ? <div className="error-banner">{error}</div> : null}
            {(session?.messages || []).map((m, i) => (
              <div key={`${m.role}-${i}`} className={`msg msg--${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="msg__avatar">
                  {m.role === 'user' ? '我' : <Icon name="sparkles" size={16} className="icon" />}
                </div>
                <div className="msg__body">
                  <div className="msg__bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  <div className="msg__meta">{m.role === 'user' ? '你' : 'AI 教练'} · 刚刚</div>
                </div>
              </div>
            ))}
            {busy && !session ? (
              <div className="msg msg--ai">
                <div className="msg__avatar"><Icon name="sparkles" size={16} className="icon" /></div>
                <div className="msg__body">
                  <div className="msg__bubble">AI 正在生成初稿…</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="composer-wrap">
            <form className="ds-composer" onSubmit={(e) => void send(e)}>
              <textarea
                className="ds-composer__input"
                placeholder={info.placeholder}
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onComposerKey}
              />
              <div className="ds-composer__toolbar">
                <div className="ds-composer__tools">
                  {kind !== 'stage' ? (
                    <button className="ds-composer__icon-btn" type="button" title="附加" onClick={() => {}}>
                      <Icon name="plus" size={16} className="icon" />
                    </button>
                  ) : null}
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
                    disabled={busy || !input.trim()}
                  >
                    <Icon name="send" size={16} className="icon" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section
          className="doc-panel"
          onClick={kind === 'plan' ? () => setPlanViewed(true) : undefined}
        >
          <div className="doc-head">
            <div className="doc-head__title">
              <Icon name="file-text" size={16} className="ic icon" />
              <span>「{topic}」{info.title}</span>
            </div>
            <div className="doc-head__hint">{info.docHint}</div>
          </div>

          <div
            className="doc-scroll"
            onScroll={kind === 'plan' ? () => setPlanViewed(true) : undefined}
          >
            <div className="doc-inner">
              {kind === 'stage' && (
                <StageDoc
                  levels={levels}
                  selectedLevel={selectedLevel}
                  onSelect={setSelectedLevel}
                />
              )}
              {kind === 'resources' && <ResourcesDoc doc={session?.live_doc || {}} />}
              {kind === 'plan' && <PlanDoc doc={session?.live_doc || {}} />}
            </div>
          </div>

          {kind !== 'plan' ? (
            <div className="confirm-bar">
              <span className="confirm-bar__hint">{info.confirmHint}</span>
              <button
                className="ds-btn ds-btn--brand"
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
              >
                <span>{info.confirmLabel}</span>
                <Icon name="arrow-right" size={12} className="icon" />
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
}: {
  levels: Array<Record<string, unknown>>
  selectedLevel: number | null
  onSelect: (n: number) => void
}) {
  return (
    <section className="doc-section">
      <div className="doc-section__head">
        <span className="doc-section__index">A</span>
        <h3 className="doc-section__title">
          <Icon name="layers" size={14} className="ic icon" />
          学习阶梯定位
        </h3>
        <span className="ds-tag ds-tag--brand">点击选择</span>
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
              onClick={() => onSelect(level)}
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
        {path7d ? <p className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>{path7d}</p> : null}
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
          {!resources.length ? <p className="text-tertiary">等待资料生成…</p> : null}
        </div>
      </section>
    </>
  )
}

function PlanDoc({ doc }: { doc: Record<string, unknown> }) {
  const core = (doc.core_20 as string[]) || []
  const phases =
    (doc.phases as Record<
      string,
      { title?: string; summary?: string; activities?: Array<{ title: string; description?: string; activity_type?: string }> }
    >) || {}
  const daily = doc.daily_minutes ? Number(doc.daily_minutes) : 30

  const phaseMeta: Array<{ key: string; index: string; badge: string; badgeClass: string }> = [
    { key: 'learning', index: 'B', badge: '学 · 约 7 天', badgeClass: 'phase-block__badge--learn' },
    { key: 'practice', index: 'C', badge: '练 · 约 4 周', badgeClass: 'phase-block__badge--practice' },
    { key: 'application', index: 'D', badge: '用 · 长尾', badgeClass: 'phase-block__badge--apply' },
  ]

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
          {!core.length ? <p className="text-tertiary">等待计划生成…</p> : null}
        </div>
        {doc.goal ? <p className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>{String(doc.goal)}</p> : null}
      </section>

      {phaseMeta.map(({ key, index, badge, badgeClass }) => {
        const phase = phases[key]
        const acts = phase?.activities || []
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
                {acts.map((a, i) => (
                  <div key={i} className="session-card">
                    <div className="session-card__top">
                      <span className="session-card__num">{i + 1}</span>
                      <span className="session-card__title">{a.title}</span>
                      <span className="session-card__duration">
                        <Icon name="clock" size={12} className="ic icon" />
                        {daily} 分钟
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
                ))}
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
            每天约 {daily} 分钟
          </span>
          <span className="m">
            <Icon name="layers" size={12} className="ic icon" />
            {core.length || 0} 条核心精神
          </span>
          <span className="m">
            <Icon name="check-circle" size={12} className="ic icon" />
            3 阶段
          </span>
        </div>
      </div>
    </>
  )
}
