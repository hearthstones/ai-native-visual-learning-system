import { Icon } from '../Icon'
import { DEFAULT_PLAN_PREFS } from '../../lib/planPrefs'

export function PlanDoc({
  doc,
  showReadyCard = true,
  embedded = false,
}: {
  doc: Record<string, unknown>
  /** 共创确认时显示「计划已就绪」；阅读/导出页关闭 */
  showReadyCard?: boolean
  /** 计划书阅读态：弱化共创分区序号 */
  embedded?: boolean
}) {
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
  const fallbackDaily = doc.daily_minutes
    ? Number(doc.daily_minutes)
    : DEFAULT_PLAN_PREFS.daily_minutes
  const rationale = String(doc.rationale || '')

  const phaseMeta: Array<{
    key: string
    index: string
    fallback: string
    badgeClass: string
    defaultMin: number
  }> = [
    {
      key: 'learning',
      index: 'B',
      fallback: DEFAULT_PLAN_PREFS.learning_duration,
      badgeClass: 'phase-block__badge--learn',
      defaultMin: 120,
    },
    {
      key: 'practice',
      index: 'C',
      fallback: DEFAULT_PLAN_PREFS.practice_duration,
      badgeClass: 'phase-block__badge--practice',
      defaultMin: 30,
    },
    {
      key: 'application',
      index: 'D',
      fallback: DEFAULT_PLAN_PREFS.application_duration,
      badgeClass: 'phase-block__badge--apply',
      defaultMin: 30,
    },
  ]

  const shortLabel: Record<string, string> = {
    learning: '学',
    practice: '练',
    application: '用',
  }

  return (
    <>
      <section className={`doc-section${embedded ? ' doc-section--embedded' : ''}`}>
        <div className={`doc-section__head${embedded ? ' doc-section__head--subtle' : ''}`}>
          {!embedded ? <span className="doc-section__index">A</span> : null}
          <span className="doc-section__title">
            <Icon name="sparkles" size={14} className="ic icon" />
            核心精神
          </span>
        </div>
        {doc.goal ? (
          <p className="text-secondary" style={{ marginBottom: 10, fontSize: 12 }}>
            目标 · {String(doc.goal)}
          </p>
        ) : null}
        <div className="core20">
          {core.map((c) => (
            <div key={c} className="core20__item">
              <span className="dot" />
              {c}
            </div>
          ))}
          {!core.length ? <p className="text-tertiary">等待计划推荐…</p> : null}
        </div>
        {rationale ? (
          <p className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>
            {rationale}
          </p>
        ) : null}
      </section>

      {phaseMeta.map(({ key, index, fallback, badgeClass, defaultMin }) => {
        const phase = phases[key]
        const acts = phase?.activities || []
        const duration = phase?.duration || durations[key] || fallback
        const phaseMin = Number(phaseMinutes[key]) || defaultMin
        const badge = `${shortLabel[key]} · ${duration}`
        return (
          <section key={key} className={`doc-section${embedded ? ' doc-section--embedded' : ''}`}>
            <div className={`doc-section__head${embedded ? ' doc-section__head--subtle' : ''}`}>
              {!embedded ? <span className="doc-section__index">{index}</span> : null}
              <span className="doc-section__title">{phase?.title || key}</span>
              <span className={`phase-block__badge ${badgeClass}`}>{badge}</span>
            </div>
            <div className="phase-block">
              {embedded ? (
                phase?.summary ? (
                  <p className="text-secondary" style={{ margin: '0 0 12px', fontSize: 12 }}>
                    {phase.summary}
                  </p>
                ) : null
              ) : (
                <div className="phase-block__head">
                  <span className={`phase-block__badge ${badgeClass}`}>{phase?.title || key}</span>
                  <span className="phase-block__title">{phase?.summary || ''}</span>
                </div>
              )}
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

      {showReadyCard ? (
        <div className="validation-card">
          <div className="validation-card__head">
            <span className="validation-card__icon">
              <Icon name="check-circle" size={16} className="icon" />
            </span>
            <span className="validation-card__title">计划已就绪</span>
          </div>
          <div className="validation-card__desc">确认无误后锁定计划，今日任务将自动生成。</div>
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
              学{' '}
              {durations.learning || phases.learning?.duration || DEFAULT_PLAN_PREFS.learning_duration}{' '}
              · 练{' '}
              {durations.practice || phases.practice?.duration || DEFAULT_PLAN_PREFS.practice_duration}{' '}
              · 用{' '}
              {durations.application ||
                phases.application?.duration ||
                DEFAULT_PLAN_PREFS.application_duration}
            </span>
          </div>
        </div>
      ) : null}
    </>
  )
}
