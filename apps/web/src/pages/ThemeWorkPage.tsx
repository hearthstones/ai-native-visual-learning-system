import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type DailyTask, type Theme } from '../lib/api'

type Mode = 'work' | 'plan' | 'review'

export function ThemeWorkPage() {
  const { themeId = '' } = useParams()
  const [mode, setMode] = useState<Mode>('work')
  const [theme, setTheme] = useState<Theme | null>(null)
  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [t, home] = await Promise.all([api.getTheme(themeId), api.home()])
        setTheme(t)
        setTasks(home.today_tasks.filter((x) => x.theme_id === themeId))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [themeId])

  if (error) return <div className="page"><div className="error-banner">{error}</div></div>
  if (!theme) return <div className="page"><p className="muted">加载中…</p></div>

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">今天</Link> / <Link to={`/themes/${theme.id}`}>{theme.title}</Link> / 作业面
      </p>
      <h1>{theme.title}</h1>

      <div className="ds-tabs" style={{ marginBottom: 24 }}>
        {([
          ['work', '执行'],
          ['plan', '计划'],
          ['review', '复盘'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`ds-tab${mode === key ? ' is-active' : ''}`}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'work' && (
        <div className="stack">
          {tasks.length === 0 && <p className="muted">今日暂无该主题任务。</p>}
          {tasks.map((task) => (
            <label key={task.id} className="task-item ds-check">
              <input
                type="checkbox"
                checked={task.done}
                onChange={async (e) => {
                  const done = e.target.checked
                  await api.toggleTask(task.id, done)
                  setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done } : t)))
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
      )}

      {mode === 'plan' && (
        <div className="stack">
          <p className="lead">当前阶段计划来自锁定后的 active 切片。可进入阶段管理或重新共创。</p>
          <div className="row">
            <Link className="ds-btn ds-btn--brand" to={`/themes/${theme.id}/plan`}>阶段管理</Link>
            <Link className="ds-btn ds-btn--secondary" to={`/create/${theme.id}/stage`}>阶梯共创</Link>
            <Link className="ds-btn ds-btn--secondary" to={`/create/${theme.id}/resources`}>资料共创</Link>
            <Link className="ds-btn ds-btn--secondary" to={`/create/${theme.id}/plan`}>计划共创</Link>
          </div>
        </div>
      )}

      {mode === 'review' && (
        <div className="stack">
          <p className="lead">短周期复盘入口。完整周报复盘见左侧 Rail。</p>
          <Link className="ds-btn ds-btn--brand" to="/review">打开周复盘</Link>
        </div>
      )}
    </div>
  )
}
