import { Icon } from '../Icon'

export function ResourcesDoc({ doc }: { doc: Record<string, unknown> }) {
  const resources = (doc.resources as Array<Record<string, unknown>>) || []
  const constraints = (doc.constraints as string[]) || []
  const path7d = String(doc.path_7d || '')
  const rationale = String(doc.rationale || '')

  return (
    <>
      <section className="doc-section">
        <div className="doc-section__head">
          <span className="doc-section__index">A</span>
          <h3 className="doc-section__title">资料范围</h3>
          {constraints[0] ? (
            <span className="ds-tag ds-tag--brand" style={{ marginLeft: 'auto' }}>
              {constraints[0]}
            </span>
          ) : null}
        </div>
        <div className="constraint-tags">
          {(constraints.length ? constraints : ['高杠杆优先']).map((c) => (
            <span key={c} className="constraint-tag">
              {c}
            </span>
          ))}
        </div>
        {rationale ? (
          <p className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>
            {rationale}
          </p>
        ) : null}
        {path7d ? (
          <p className="text-secondary" style={{ marginTop: 8, fontSize: 12 }}>
            {path7d}
          </p>
        ) : null}
      </section>

      <section className="doc-section">
        <div className="doc-section__head">
          <span className="doc-section__index">B</span>
          <h3 className="doc-section__title">学习资源（{resources.length} 份）</h3>
          <span className="ds-tag" style={{ marginLeft: 'auto' }}>
            已排序
          </span>
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
                  {i < 2 ? (
                    <span className="ds-tag ds-tag--brand">核心</span>
                  ) : (
                    <span className="ds-tag">补充</span>
                  )}
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
          {!resources.length ? <p className="text-tertiary">等待资料推荐…</p> : null}
        </div>
      </section>
    </>
  )
}
