import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type HomeData } from '../lib/api'

const phaseZh: Record<string, string> = {
  learning: '学习期',
  practice: '练习期',
  application: '应用期',
}

export function HomePage() {
  const nav = useNavigate()
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const home = await api.home()
      setData(home)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading) return <div className="page"><p className="muted">加载中…</p></div>
  if (error) {
    return (
      <div className="page">
        <div className="error-banner">{error}</div>
        <button className="ds-btn ds-btn--secondary" type="button" onClick={() => void load()}>重试</button>
      </div>
    )
  }
  if (!data) return null

  const active = data.themes.filter((t) => t.status === 'active')
  const learningFull = (data.slots.learning?.used ?? 0) >= (data.slots.learning?.max ?? 1)

  if (active.length === 0) {
    return (
      <div className="empty-hero">
        <p className="muted">学习槽 {data.slots.learning?.used ?? 0}/{data.slots.learning?.max ?? 1}</p>
        <h1>从第一个主题开始</h1>
        <p className="lead">一次轻量表单，三次 AI 共创（阶梯 → 资料 → 计划），锁定后进入今日执行。</p>
        <button
          className="ds-btn ds-btn--brand ds-btn--lg"
          type="button"
          onClick={() => nav(learningFull ? '/create/intercept' : '/create')}
        >
          创建主题
        </button>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>今天</h1>
          <p className="lead" style={{ marginBottom: 0 }}>只盯当前循环，完成今日少量任务。</p>
        </div>
        <button
          className="ds-btn ds-btn--secondary"
          type="button"
          onClick={() => nav(learningFull ? '/create/intercept' : '/create')}
        >
          新建主题
        </button>
      </div>

      <div className="section-title">今日任务</div>
      <div className="stack">
        {data.today_tasks.length === 0 && <p className="muted">今天还没有任务。</p>}
        {data.today_tasks.map((task) => (
          <label key={task.id} className="task-item ds-check">
            <input
              type="checkbox"
              checked={task.done}
              onChange={async (e) => {
                const done = e.target.checked
                await api.toggleTask(task.id, done)
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        today_tasks: prev.today_tasks.map((t) =>
                          t.id === task.id ? { ...t, done } : t,
                        ),
                      }
                    : prev,
                )
              }}
            />
            <span className="ds-check__box" />
            <span>
              <div>{task.title}</div>
              {task.description && <div className="muted">{task.description}</div>}
            </span>
          </label>
        ))}
      </div>

      <div className="section-title">主题</div>
      <div className="stack">
        {active.map((theme) => (
          <Link key={theme.id} to={`/themes/${theme.id}`} className="theme-card">
            <div style={{ flex: 1 }}>
              <div className="row">
                <strong>{theme.title}</strong>
                {theme.is_focus && <span className="ds-tag ds-tag--brand">主焦点</span>}
                <span className="ds-tag">{phaseZh[theme.phase]}</span>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>{theme.goal || '暂无目标描述'}</div>
            </div>
          </Link>
        ))}
      </div>

      {data.drift_events.length > 0 && (
        <>
          <div className="section-title">漂移提示</div>
          <div className="stack">
            {data.drift_events.slice(0, 3).map((d) => (
              <div key={d.id} className="muted">{d.message}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
