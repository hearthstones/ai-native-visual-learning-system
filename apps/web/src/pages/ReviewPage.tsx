import { useEffect, useState } from 'react'
import { api, type WeeklyReview } from '../lib/api'

export function ReviewPage() {
  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.latestWeeklyReview().then(setReview).catch(() => setReview(null))
  }, [])

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

  return (
    <div className="page">
      <h1>周复盘</h1>
      <p className="lead">低成本检查与改进：系统起草，你只需确认或改一句。</p>
      {error && <div className="error-banner">{error}</div>}
      <button className="ds-btn ds-btn--brand" type="button" disabled={busy} onClick={() => void generate()}>
        {busy ? '生成中…' : '生成本周复盘'}
      </button>

      {review && (
        <div className="stack" style={{ marginTop: 24 }}>
          <div className="theme-card" style={{ cursor: 'default', flexDirection: 'column' }}>
            <strong>摘要 · 周起始 {review.week_start}</strong>
            <p className="muted">{review.summary}</p>
          </div>
          <DocList title="进展" items={review.wins} />
          <DocList title="问题" items={review.issues} />
          <DocList title="调整建议" items={review.adjustments} />
        </div>
      )}
    </div>
  )
}

function DocList({ title, items }: { title: string; items: unknown[] }) {
  return (
    <div className="theme-card" style={{ cursor: 'default', flexDirection: 'column' }}>
      <strong>{title}</strong>
      <ul className="muted">
        {items.map((item, i) => (
          <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
        ))}
      </ul>
    </div>
  )
}
