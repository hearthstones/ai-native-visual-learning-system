import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, type Theme } from '../lib/api'

const phaseZh: Record<string, string> = {
  learning: '学习期',
  practice: '练习期',
  application: '应用期',
}

export function ThemeOverviewPage() {
  const { themeId = '' } = useParams()
  const [params] = useSearchParams()
  const fromCreate = params.get('from') === 'create'
  const nav = useNavigate()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void api.getTheme(themeId).then(setTheme).catch((e) => setError(String(e.message || e)))
  }, [themeId])

  if (error) return <div className="page"><div className="error-banner">{error}</div></div>
  if (!theme) return <div className="page"><p className="muted">加载中…</p></div>

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">今天</Link> / 主题看板
        {fromCreate ? ' · 首次着陆' : ''}
      </p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{theme.title}</h1>
          <p className="lead">{theme.goal || '计划已锁定，可以开始执行。'}</p>
          <div className="row">
            <span className="ds-tag">{phaseZh[theme.phase]}</span>
            {theme.is_focus && <span className="ds-tag ds-tag--brand">主焦点</span>}
            {theme.current_ladder_level && (
              <span className="ds-tag">阶梯 L{theme.current_ladder_level}</span>
            )}
          </div>
        </div>
        <button className="ds-btn ds-btn--brand ds-btn--lg" type="button" onClick={() => nav(`/themes/${theme.id}/work`)}>
          进入执行
        </button>
      </div>

      <div className="section-title">快捷入口</div>
      <div className="row">
        <Link className="ds-btn ds-btn--secondary" to={`/themes/${theme.id}/work`}>作业 · 执行</Link>
        <Link className="ds-btn ds-btn--secondary" to={`/themes/${theme.id}/plan`}>阶段管理</Link>
        <Link className="ds-btn ds-btn--ghost" to={`/create/${theme.id}/plan`}>重开计划共创</Link>
      </div>
    </div>
  )
}
