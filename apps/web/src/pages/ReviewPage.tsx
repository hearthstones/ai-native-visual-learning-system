import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type WeeklyReview } from '../lib/api'
import '../styles/components.css'
import '../styles/pages/review-weekly.css'

const DEFAULT_CORES = [
  '主动阅读四问',
  '检视阅读 vs 分析阅读',
  '刻意练习三要素',
  '费曼学习法',
  '间隔重复与主动回忆',
]

function masteryTag(score: number) {
  if (score >= 5) return { label: '已掌握', className: 'ds-tag ds-tag--success' }
  if (score >= 4) return { label: '良好', className: 'ds-tag ds-tag--brand' }
  if (score >= 2) return { label: '待加强', className: 'ds-tag ds-tag--warning' }
  if (score >= 1) return { label: '薄弱', className: 'ds-tag ds-tag--danger' }
  return { label: '未练习', className: 'ds-tag' }
}

function asTextList(items: unknown[]): string[] {
  return items.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
}

function weekRangeLabel(weekStart?: string) {
  if (!weekStart) {
    const end = new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - 6)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return `${fmt(start)} → ${fmt(end)}`
  }
  const start = new Date(weekStart)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(start)} → ${fmt(end)}`
}

export function ReviewPage() {
  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scores, setScores] = useState<number[]>([5, 4, 2, 1, 0])
  const [q1, setQ1] = useState('')
  const [q2, setQ2] = useState('')
  const [q3, setQ3] = useState('')

  useEffect(() => {
    void api.latestWeeklyReview().then(setReview).catch(() => setReview(null))
  }, [])

  const wins = useMemo(() => (review ? asTextList(review.wins) : []), [review])
  const issues = useMemo(() => (review ? asTextList(review.issues) : []), [review])
  const adjustments = useMemo(
    () => (review ? asTextList(review.adjustments) : []),
    [review],
  )

  async function generate() {
    setBusy(true)
    setError('')
    try {
      const r = await api.createWeeklyReview()
      setReview(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const mastered = scores.filter((s) => s >= 4).length
  const weak = scores.filter((s) => s < 3).length

  return (
    <div className="review-wrap">
      <div className="review-top">
        <Link to="/" data-dom-id="btn-back-work" className="ds-btn ds-btn--tertiary ds-btn--sm">
          <Icon name="arrow-left" size={14} />
          <span>返回作业</span>
        </Link>
        <span className="eyebrow">刻意练习 · 周复盘</span>
        <span className="mono" style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
          {weekRangeLabel(review?.week_start)}
        </span>
      </div>

      <div className="ds-pagehead">
        <div className="ds-pagehead__main">
          <div className="ds-pagehead__title">周复盘{review?.week_start ? ` · ${review.week_start}` : ' W1'}</div>
          <div className="ds-pagehead__subtitle">
            {review?.summary || '低成本检查与改进：系统起草，你只需确认或改一句。'}
          </div>
        </div>
        <div className="ds-pagehead__actions">
          <span className="ds-tag ds-tag--brand">{review ? '已生成' : '草稿态'}</span>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="kpi-grid">
        <div className="ds-statcard">
          <div className="ds-statcard__label">完成率</div>
          <div className="ds-statcard__value">{review ? '—' : '71%'}</div>
          <div className="ds-statcard__delta is-up">
            <Icon name="check-circle" size={14} />
            <span>{wins[0] || '本周进展待汇总'}</span>
          </div>
        </div>
        <div className="ds-statcard">
          <div className="ds-statcard__label">核心掌握</div>
          <div className="ds-statcard__value">{mastered}/{scores.length}</div>
          <div className="ds-statcard__delta" style={{ color: 'var(--status-warning-default)' }}>
            <Icon name="alert-triangle" size={14} />
            <span>{weak} 项待加强</span>
          </div>
        </div>
        <div className="ds-statcard">
          <div className="ds-statcard__label">改进建议</div>
          <div className="ds-statcard__value">{adjustments.length || 0}</div>
          <div className="ds-statcard__delta is-up">
            <Icon name="trending-up" size={14} />
            <span>{adjustments[0] || '生成后展示'}</span>
          </div>
        </div>
      </div>

      {wins.length > 0 ? (
        <div className="ds-card" style={{ marginBottom: 'var(--spacer-16)' }}>
          <div className="h3" style={{ marginBottom: 'var(--spacer-8)' }}>本周进展</div>
          <ul className="text-secondary" style={{ margin: 0, paddingLeft: 18 }}>
            {wins.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="ds-card" style={{ marginBottom: 'var(--spacer-24)' }}>
        <div style={{ marginBottom: 'var(--spacer-16)' }}>
          <div className="h3" style={{ marginBottom: 'var(--spacer-4)' }}>核心掌握度</div>
          <div className="ds-card__desc">拖动滑块校验每条核心的掌握程度</div>
        </div>
        {DEFAULT_CORES.map((name, i) => {
          const score = scores[i] ?? 0
          const tag = masteryTag(score)
          return (
            <div key={name} className="mastery-row">
              <span style={{ fontSize: 'var(--body-md-font-size)', fontWeight: 500, color: 'var(--text-default)' }}>
                {name}
              </span>
              <input
                type="range"
                className="ds-slider"
                min={0}
                max={5}
                value={score}
                onChange={(e) => {
                  const next = [...scores]
                  next[i] = Number(e.target.value)
                  setScores(next)
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
                <span className="mono" style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
                  {score}/5
                </span>
                <span className={tag.className}>{tag.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="ds-alert ds-alert--warning" style={{ margin: 'var(--spacer-16) 0' }}>
        <span className="ds-alert__icon">
          <Icon name="alert-triangle" size={16} />
        </span>
        <div>
          <div className="ds-alert__title">系统检测到卡点</div>
          <div className="ds-alert__desc">
            {issues.length
              ? issues.join('；')
              : '完成 3 问并生成改进建议后，这里会展示系统识别的卡点。'}
          </div>
        </div>
      </div>

      <div className="ds-card">
        <div style={{ marginBottom: 'var(--spacer-24)' }}>
          <div className="h3" style={{ marginBottom: 'var(--spacer-4)' }}>3 问复盘</div>
          <div className="ds-card__desc">每问不超过 50 字，聚焦可执行改进</div>
        </div>

        <div className="question-block">
          <label className="question-label" style={{ fontSize: 'var(--body-md-font-size)', color: 'var(--text-default)' }}>
            1. 这周哪条核心真的用上了？
          </label>
          <textarea
            className="ds-textarea"
            style={{ minHeight: 72 }}
            maxLength={50}
            placeholder="主动阅读四问，用在读新书时…"
            value={q1}
            onChange={(e) => setQ1(e.target.value)}
          />
          <div className="char-count mono" style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            {q1.length} / 50
          </div>
        </div>

        <div className="question-block">
          <label className="question-label" style={{ fontSize: 'var(--body-md-font-size)', color: 'var(--text-default)' }}>
            2. 哪条没掌握，卡在哪？
          </label>
          <textarea
            className="ds-textarea"
            style={{ minHeight: 72 }}
            maxLength={50}
            placeholder="刻意练习三要素只记住「专注/反馈」，漏了…"
            value={q2}
            onChange={(e) => setQ2(e.target.value)}
          />
          <div className="char-count mono" style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            {q2.length} / 50
          </div>
        </div>

        <div className="question-block" style={{ marginBottom: 0 }}>
          <label className="question-label" style={{ fontSize: 'var(--body-md-font-size)', color: 'var(--text-default)' }}>
            3. 下周最该改的一件事？
          </label>
          <textarea
            className="ds-textarea"
            style={{ minHeight: 72 }}
            maxLength={50}
            placeholder="把费曼复述改成每日第一项，绑定打卡…"
            value={q3}
            onChange={(e) => setQ3(e.target.value)}
          />
          <div className="char-count mono" style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            {q3.length} / 50
          </div>
        </div>
      </div>

      {adjustments.length > 0 ? (
        <div className="ds-card" style={{ marginTop: 'var(--spacer-24)' }}>
          <div className="h3" style={{ marginBottom: 'var(--spacer-8)' }}>改进建议</div>
          <ul className="text-secondary" style={{ margin: 0, paddingLeft: 18 }}>
            {adjustments.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacer-12)', marginTop: 'var(--spacer-24)' }}>
        <button className="ds-btn ds-btn--secondary" type="button" onClick={() => {}}>
          保存草稿
        </button>
        <button
          data-dom-id="btn-generate-suggestions"
          className="ds-btn ds-btn--brand"
          type="button"
          disabled={busy}
          onClick={() => void generate()}
        >
          <Icon name="sparkles" size={14} />
          <span>{busy ? '生成中…' : '生成改进建议'}</span>
        </button>
      </div>
    </div>
  )
}
