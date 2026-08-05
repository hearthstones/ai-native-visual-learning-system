import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import {
  api,
  type ExecutionDoc,
  type ExecutionStep,
  type SliceActivity,
} from '../lib/api'
import '../styles/components/activity-expand.css'

type Props = {
  open: boolean
  activityId: string | null
  activityTitle: string
  initialDoc?: ExecutionDoc
  onClose: () => void
  onUpdated: (activity: SliceActivity) => void
}

function stepsToText(steps: ExecutionStep[] | undefined) {
  return (steps || []).map((s) => s.text).join('\n')
}

function parseStepsText(text: string, prev: ExecutionStep[] | undefined): ExecutionStep[] {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^\s*[-*\d.、)]+\s*/, '').trim())
    .filter(Boolean)
  const prevByText = new Map((prev || []).map((s) => [s.text, s]))
  return lines.map((line) => {
    const old = prevByText.get(line)
    return old ? { ...old, text: line } : { id: crypto.randomUUID(), text: line, done: false }
  })
}

export function ActivityExpandPanel({
  open,
  activityId,
  activityTitle,
  initialDoc,
  onClose,
  onUpdated,
}: Props) {
  const [doc, setDoc] = useState<ExecutionDoc>(initialDoc || {})
  const [goal, setGoal] = useState('')
  const [stepsText, setStepsText] = useState('')
  const [outcome, setOutcome] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [resourceName, setResourceName] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  const expanded = Boolean((doc.goal || '').trim() || (doc.steps && doc.steps.length > 0))
  const messages = useMemo(() => doc.messages || [], [doc.messages])

  useEffect(() => {
    if (!open || !activityId) return
    const next = initialDoc || {}
    setDoc(next)
    setGoal(next.goal || '')
    setStepsText(stepsToText(next.steps))
    setOutcome(next.outcome || '')
    setMinutes(typeof next.minutes === 'number' && next.minutes > 0 ? next.minutes : 30)
    setResourceName(next.resource_ref?.name || '')
    setChatInput('')
    setError('')
    setDirty(false)
    // 打开/切换活动时同步；手改过程中不因父级重渲染重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activityId])

  function applyActivity(act: SliceActivity) {
    const next = act.execution_doc || {}
    setDoc(next)
    setGoal(next.goal || '')
    setStepsText(stepsToText(next.steps))
    setOutcome(next.outcome || '')
    setMinutes(typeof next.minutes === 'number' && next.minutes > 0 ? next.minutes : 30)
    setResourceName(next.resource_ref?.name || '')
    setDirty(false)
    onUpdated(act)
  }

  async function handleGenerate() {
    if (!activityId) return
    setBusy(true)
    setError('')
    try {
      const act = await api.expandActivity(activityId)
      applyActivity(act)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveManual() {
    if (!activityId) return
    setBusy(true)
    setError('')
    try {
      const steps = parseStepsText(stepsText, doc.steps)
      const act = await api.patchActivityExecution(activityId, {
        goal,
        steps,
        outcome,
        minutes,
        resource_ref: resourceName.trim()
          ? { name: resourceName.trim(), index: doc.resource_ref?.index ?? null }
          : null,
      })
      applyActivity(act)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleChat() {
    if (!activityId || !chatInput.trim()) return
    if (dirty) {
      setError('有未保存的手改，请先保存或放弃后再对话调整')
      return
    }
    setBusy(true)
    setError('')
    try {
      const act = await api.messageActivityExpand(activityId, chatInput.trim())
      setChatInput('')
      applyActivity(act)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    if (!activityId) return
    if (!window.confirm('清除这条活动的任务拆分？粗计划文案会保留。')) return
    setBusy(true)
    setError('')
    try {
      const act = await api.patchActivityExecution(activityId, { clear: true })
      applyActivity(act)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open || !activityId) return null

  return (
    <div className="modal-overlay is-open" role="dialog" aria-modal="true">
      <div className="ds-dialog expand-panel">
        <div className="ds-dialog__head">
          <span className="ds-dialog__title">任务拆分 · {activityTitle}</span>
          <button type="button" className="ds-dialog__close" onClick={onClose}>
            <Icon name="x" size={14} alt="close" />
          </button>
        </div>

        <div className="expand-panel__body">
          {error ? <div className="error-banner">{error}</div> : null}

          {!expanded ? (
            <div className="expand-panel__empty">
              <p>把这条粗计划拆成可执行步骤（目标、步骤、资料、验收）。结果会长期挂在该活动上，之后仍可手改或对话调整。</p>
              <button
                type="button"
                className="ds-btn ds-btn--brand"
                disabled={busy}
                onClick={() => void handleGenerate()}
              >
                {busy ? '生成中…' : 'AI 任务拆分'}
              </button>
            </div>
          ) : (
            <>
              <p className="expand-panel__hint" style={{ margin: 0 }}>
                可直接改下方字段并保存，或用对话让 AI 调整。
              </p>
              <div className="expand-panel__toolbar">
                <button
                  type="button"
                  className="ds-btn ds-btn--secondary ds-btn--sm"
                  disabled={busy}
                  onClick={() => void handleGenerate()}
                >
                  {busy ? '处理中…' : '再生成'}
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn--ghost ds-btn--sm"
                  disabled={busy}
                  onClick={() => void handleClear()}
                >
                  清除拆分
                </button>
              </div>

              <label className="expand-field">
                <span>目标</span>
                <input
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value)
                    setDirty(true)
                  }}
                />
              </label>

              <label className="expand-field">
                <span>步骤（每行一条）</span>
                <textarea
                  rows={5}
                  value={stepsText}
                  onChange={(e) => {
                    setStepsText(e.target.value)
                    setDirty(true)
                  }}
                />
              </label>

              <div className="expand-field-row">
                <label className="expand-field">
                  <span>时长（分钟）</span>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={minutes}
                    onChange={(e) => {
                      setMinutes(Number(e.target.value) || 30)
                      setDirty(true)
                    }}
                  />
                </label>
                <label className="expand-field">
                  <span>资料</span>
                  <input
                    value={resourceName}
                    placeholder="可选"
                    onChange={(e) => {
                      setResourceName(e.target.value)
                      setDirty(true)
                    }}
                  />
                </label>
              </div>

              <label className="expand-field">
                <span>验收</span>
                <input
                  value={outcome}
                  onChange={(e) => {
                    setOutcome(e.target.value)
                    setDirty(true)
                  }}
                />
              </label>

              <div className="expand-panel__actions">
                <button
                  type="button"
                  className="ds-btn ds-btn--brand ds-btn--sm"
                  disabled={busy || !dirty}
                  onClick={() => void handleSaveManual()}
                >
                  保存修改
                </button>
                {dirty ? (
                  <>
                    <span className="expand-panel__hint">有未保存修改</span>
                    <button
                      type="button"
                      className="ds-btn ds-btn--ghost ds-btn--sm"
                      disabled={busy}
                      onClick={() => {
                        setGoal(doc.goal || '')
                        setStepsText(stepsToText(doc.steps))
                        setOutcome(doc.outcome || '')
                        setMinutes(
                          typeof doc.minutes === 'number' && doc.minutes > 0 ? doc.minutes : 30,
                        )
                        setResourceName(doc.resource_ref?.name || '')
                        setDirty(false)
                        setError('')
                      }}
                    >
                      放弃修改
                    </button>
                  </>
                ) : null}
              </div>

              <div className="expand-chat">
                <p className="expand-chat__title">
                  <Icon name="message-circle" size={14} />
                  对话调整
                </p>
                <div className="expand-chat__log">
                  {messages.length === 0 ? (
                    <p className="text-tertiary">例如：「再具体一点」「只要阅读」「拆成 30 分钟能做完的」</p>
                  ) : (
                    messages.map((m, i) => (
                      <div key={`${m.role}-${i}`} className={`expand-chat__msg is-${m.role}`}>
                        {m.content}
                      </div>
                    ))
                  )}
                </div>
                <div className="expand-chat__compose">
                  <input
                    value={chatInput}
                    placeholder="一句话意见…"
                    disabled={busy}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleChat()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="ds-btn ds-btn--secondary ds-btn--sm"
                    disabled={busy || !chatInput.trim()}
                    onClick={() => void handleChat()}
                  >
                    发送
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
