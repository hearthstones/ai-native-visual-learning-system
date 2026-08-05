import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PlanDoc } from '../components/cocreate/PlanDoc'
import { ResourcesDoc } from '../components/cocreate/ResourcesDoc'
import { StageDoc } from '../components/cocreate/StageDoc'
import { Icon } from '../components/Icon'
import { api, type PlanDocument } from '../lib/api'
import { downloadPlanDocumentHtml } from '../lib/exportPlanDocumentHtml'
import { draftResumeLabel, draftResumePath, getLadderLevels, getSelectedLevel, phaseZh } from '../lib/themeDoc'
import '../styles/cocreate-layout.css'
import '../styles/pages/create-stage.css'
import '../styles/pages/create-resources.css'
import '../styles/pages/theme-document.css'

export function ThemePlanDocumentPage() {
  const { themeId = '' } = useParams()
  const [data, setData] = useState<PlanDocument | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const doc = await api.getPlanDocument(themeId)
        if (!cancelled) setData(doc)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [themeId])

  const theme = data?.theme
  const levels = useMemo(() => (theme ? getLadderLevels(theme) : []), [theme])
  const selectedLevel = useMemo(() => (theme ? getSelectedLevel(theme) : null), [theme])
  const hasPlan = !!(data?.plan_doc && Object.keys(data.plan_doc).length)
  const hasResources = !!(theme?.resources_doc && Object.keys(theme.resources_doc).length)
  const canExport = !!(theme && data?.locked && (levels.length || hasResources || hasPlan))

  function onExport() {
    if (!theme || !data) return
    downloadPlanDocumentHtml(theme, data.plan_doc || {})
  }

  if (loading) {
    return (
      <div className="docbook-page">
        <p className="muted">加载中…</p>
      </div>
    )
  }

  if (error || !theme || !data) {
    return (
      <div className="docbook-page">
        <div className="error-banner">{error || '主题不存在'}</div>
        <Link className="ds-btn ds-btn--secondary" to="/">
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div className="docbook-page">
      <div className="docbook-toolbar">
        <Link to={`/themes/${theme.id}`} className="docbook-toolbar__back">
          <Icon name="arrow-left" size={14} />
          返回主题看板
        </Link>
        <div className="docbook-toolbar__actions">
          <button
            type="button"
            className="ds-btn ds-btn--secondary"
            disabled={!canExport}
            onClick={onExport}
            data-dom-id="btn-export-plan-html"
            title={data.locked ? '导出 HTML' : '锁定计划后可导出'}
          >
            <Icon name="download" size={14} className="icon" />
            导出 HTML
          </button>
        </div>
      </div>

      <header className="docbook-header">
        <div className="docbook-header__eyebrow">主题计划书</div>
        <h1 className="docbook-header__title">{theme.title}</h1>
        <div className="docbook-header__meta">
          <span className="ds-tag ds-tag--brand">{phaseZh[theme.phase]}</span>
          {theme.goal ? <span>{theme.goal}</span> : null}
          {!data.locked ? <span className="ds-tag">未锁定</span> : null}
        </div>
      </header>

      {!data.locked ? (
        <div className="docbook-empty">
          计划尚未锁定。可先完成共创，锁定后再通读与导出。
          <div style={{ marginTop: 12 }}>
            <Link className="ds-btn ds-btn--brand" to={draftResumePath(theme)}>
              {draftResumeLabel(theme)}
            </Link>
          </div>
        </div>
      ) : null}

      <nav className="docbook-toc" aria-label="计划书目录">
        <a href="#chapter-ladder">一、学习阶梯</a>
        <a href="#chapter-resources">二、学习资料</a>
        <a href="#chapter-plan">三、学习计划</a>
      </nav>

      <div className="doc-panel">
        <section className="docbook-chapter" id="chapter-ladder">
          <div className="docbook-chapter__head">
            <span className="docbook-chapter__index">01</span>
            <h2 className="docbook-chapter__title">学习阶梯</h2>
          </div>
          {levels.length ? (
            <StageDoc
              levels={levels}
              selectedLevel={selectedLevel}
              onSelect={() => undefined}
              readOnly
              embedded
            />
          ) : (
            <div className="docbook-empty">暂无学习阶梯</div>
          )}
        </section>

        <section className="docbook-chapter" id="chapter-resources">
          <div className="docbook-chapter__head">
            <span className="docbook-chapter__index">02</span>
            <h2 className="docbook-chapter__title">学习资料</h2>
          </div>
          {hasResources ? (
            <ResourcesDoc doc={theme.resources_doc || {}} embedded />
          ) : (
            <div className="docbook-empty">暂无学习资料</div>
          )}
        </section>

        <section className="docbook-chapter" id="chapter-plan">
          <div className="docbook-chapter__head">
            <span className="docbook-chapter__index">03</span>
            <h2 className="docbook-chapter__title">学习计划</h2>
          </div>
          {hasPlan ? (
            <PlanDoc doc={data.plan_doc} showReadyCard={false} embedded />
          ) : (
            <div className="docbook-empty">暂无学习计划</div>
          )}
        </section>
      </div>

      <footer className="docbook-foot">
        <span>不含今日任务与复盘</span>
        <span className="docbook-foot__sep">·</span>
        <Link to={`/themes/${theme.id}/plan`}>调整计划</Link>
        <span className="docbook-foot__sep">·</span>
        <Link to="/review">周复盘</Link>
        <span className="docbook-foot__sep">·</span>
        <Link to={`/themes/${theme.id}/work`}>进入执行</Link>
      </footer>
    </div>
  )
}
