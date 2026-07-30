import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type CocreateKind, type CocreateSession } from '../lib/api'
import './CocreatePage.css'

const meta: Record<CocreateKind, { step: string; title: string; nextLabel: string; nextPath: (id: string) => string }> = {
  stage: {
    step: '②/④',
    title: '学习阶梯',
    nextLabel: '确认级别，进入资料共创',
    nextPath: (id) => `/create/${id}/resources`,
  },
  resources: {
    step: '③/④',
    title: '学习资料',
    nextLabel: '确认资料，进入计划共创',
    nextPath: (id) => `/create/${id}/plan`,
  },
  plan: {
    step: '④/④',
    title: '三阶段计划',
    nextLabel: '锁定计划，进入执行',
    nextPath: (id) => `/themes/${id}?from=create`,
  },
}

export function CocreatePage({ kind }: { kind: CocreateKind }) {
  const { themeId = '' } = useParams()
  const nav = useNavigate()
  const info = meta[kind]
  const [session, setSession] = useState<CocreateSession | null>(null)
  const [input, setInput] = useState('')
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setBusy(true)
      setError('')
      try {
        let s: CocreateSession
        try {
          s = await api.getCocreate(themeId, kind)
          // 已确认的会话不可再发消息；重开共创时新建一轮
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

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || !session) return
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

  return (
    <div className="cocreate-page">
      <header className="cocreate-head">
        <div>
          <p className="muted">创建 · {info.step}</p>
          <h1>{info.title}</h1>
        </div>
        <button className="ds-btn ds-btn--brand" type="button" disabled={busy} onClick={() => void confirm()}>
          {info.nextLabel}
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="cocreate-grid">
        <section className="chat-pane">
          <div className="chat-log">
            {(session?.messages || []).map((m, i) => (
              <div key={`${m.role}-${i}`} className={`bubble bubble--${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && !session && <p className="muted">AI 正在生成初稿…</p>}
          </div>
          <form className="chat-input" onSubmit={(e) => void send(e)}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={kind === 'resources' ? '例如：只用微信读书里的书' : '补充约束或修改意见'}
              disabled={busy}
            />
            <button className="ds-btn ds-btn--secondary" type="submit" disabled={busy || !input.trim()}>
              发送
            </button>
          </form>
        </section>

        <section className="doc-pane">
          {kind === 'stage' && (
            <div className="stack">
              {levels.map((lv) => {
                const level = Number(lv.level)
                const active = selectedLevel === level
                return (
                  <button
                    key={level}
                    type="button"
                    className={`level-card${active ? ' is-active' : ''}`}
                    onClick={() => setSelectedLevel(level)}
                  >
                    <div className="row">
                      <strong>L{level} · {String(lv.name || '')}</strong>
                      {active && <span className="ds-tag ds-tag--brand">我在这</span>}
                    </div>
                    <p className="muted">{String(lv.understand || '')}</p>
                  </button>
                )
              })}
            </div>
          )}

          {kind === 'resources' && <ResourcesDoc doc={session?.live_doc || {}} />}
          {kind === 'plan' && <PlanDoc doc={session?.live_doc || {}} />}
        </section>
      </div>
    </div>
  )
}

function ResourcesDoc({ doc }: { doc: Record<string, unknown> }) {
  const resources = (doc.resources as Array<Record<string, unknown>>) || []
  return (
    <div className="stack">
      <p className="muted">{String(doc.path_7d || '高杠杆资料清单')}</p>
      {resources.map((r, i) => (
        <div key={i} className="level-card">
          <div className="row">
            <strong>{String(r.name || `资源 ${i + 1}`)}</strong>
            {r.weread_readable ? <span className="ds-tag ds-tag--brand">微信读书</span> : null}
            <span className="ds-tag">{String(r.difficulty || '')}</span>
          </div>
          <p className="muted">{String(r.why || '')}</p>
        </div>
      ))}
    </div>
  )
}

function PlanDoc({ doc }: { doc: Record<string, unknown> }) {
  const core = (doc.core_20 as string[]) || []
  const phases = (doc.phases as Record<string, { title?: string; summary?: string; activities?: Array<{ title: string }> }>) || {}
  return (
    <div className="stack">
      <div className="level-card">
        <strong>目标</strong>
        <p className="muted">{String(doc.goal || '')}</p>
      </div>
      <div className="level-card">
        <strong>核心 20%</strong>
        <ul className="muted">
          {core.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
      {(['learning', 'practice', 'application'] as const).map((p) => (
        <div key={p} className="level-card">
          <strong>{phases[p]?.title || p}</strong>
          <p className="muted">{phases[p]?.summary || ''}</p>
          <ul className="muted">
            {(phases[p]?.activities || []).slice(0, 5).map((a, i) => (
              <li key={i}>{a.title}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
