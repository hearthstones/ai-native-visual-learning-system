import { Icon } from '../Icon'
import {
  isBookLikeResource,
  resourceDeepLink,
  type ThemeResource,
} from '../../lib/themeDoc'

/** 过滤共创里误写入的主题元数据约束 */
function displayConstraints(raw: string[]): string[] {
  return raw.filter((c) => !/^(主题|类型|目标|当前阶梯)\s*[：:]/.test(c.trim()))
}

function typeZh(type: unknown): string {
  const t = String(type || '').trim()
  const map: Record<string, string> = {
    book: '书',
    article: '文章',
    video: '视频',
    course: '课程',
    tool: '工具',
    docs: '文档',
    doc: '文档',
    ai_pack: '学习包',
    script: '阅读脚本',
  }
  return map[t.toLowerCase()] || t
}

function asThemeResource(r: Record<string, unknown>): ThemeResource {
  const weread =
    r.weread && typeof r.weread === 'object'
      ? (r.weread as ThemeResource['weread'])
      : null
  return {
    name: String(r.name || ''),
    type: r.type != null ? String(r.type) : undefined,
    how_to_use: r.how_to_use != null ? String(r.how_to_use) : undefined,
    covers: r.covers != null ? String(r.covers) : undefined,
    why: r.why != null ? String(r.why) : undefined,
    weread_readable: Boolean(r.weread_readable),
    book_hint: r.book_hint != null ? String(r.book_hint) : undefined,
    weread,
  }
}

function difficultyZh(value: unknown): string {
  const t = String(value || '').trim()
  const map: Record<string, string> = {
    beginner: '入门',
    easy: '简单',
    intermediate: '中级',
    medium: '中等',
    advanced: '进阶',
    hard: '较难',
  }
  return map[t.toLowerCase()] || t
}

export function ResourcesDoc({
  doc,
  embedded = false,
}: {
  doc: Record<string, unknown>
  embedded?: boolean
}) {
  const resources = (doc.resources as Array<Record<string, unknown>>) || []
  const constraints = displayConstraints((doc.constraints as string[]) || [])
  const path7d = String(doc.path_7d || '')
  const rationale = String(doc.rationale || '')

  return (
    <>
      <section className={`doc-section${embedded ? ' doc-section--embedded' : ''}`}>
        {!embedded ? (
          <div className="doc-section__head">
            <span className="doc-section__index">A</span>
            <h3 className="doc-section__title">资料范围</h3>
            {constraints[0] ? (
              <span className="ds-tag ds-tag--brand" style={{ marginLeft: 'auto' }}>
                {constraints[0]}
              </span>
            ) : null}
          </div>
        ) : null}
        {constraints.length ? (
          <div className="constraint-tags">
            {constraints.map((c) => (
              <span key={c} className="constraint-tag">
                {c}
              </span>
            ))}
          </div>
        ) : !embedded ? (
          <div className="constraint-tags">
            <span className="constraint-tag">高杠杆优先</span>
          </div>
        ) : null}
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

      <section className={`doc-section${embedded ? ' doc-section--embedded' : ''}`}>
        {!embedded ? (
          <div className="doc-section__head">
            <span className="doc-section__index">B</span>
            <h3 className="doc-section__title">学习资源（{resources.length} 份）</h3>
            <span className="ds-tag" style={{ marginLeft: 'auto' }}>
              已排序
            </span>
          </div>
        ) : (
          <div className="doc-section__head doc-section__head--subtle">
            <h3 className="doc-section__title">学习资源（{resources.length} 份）</h3>
          </div>
        )}
        <div className="resources">
          {resources.map((r, i) => {
            const resource = asThemeResource(r)
            const openHref = resourceDeepLink(resource)
            const bookLike = isBookLikeResource(resource)
            return (
            <div key={i} className="resource-card">
              <div className="resource-card__head">
                <span className="resource-card__icon">
                  <Icon name="file-text" size={16} className="icon" />
                </span>
                <div>
                  <div className="resource-card__title">{String(r.name || `资源 ${i + 1}`)}</div>
                  <div className="resource-card__author">{typeZh(r.type)}</div>
                  {openHref ? (
                    <a
                      className="resource-card__open"
                      href={openHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开阅读
                    </a>
                  ) : bookLike && r.weread_readable ? (
                    <span className="resource-card__open resource-card__open--muted">微信读书可读</span>
                  ) : !bookLike ? (
                    <span className="resource-card__open resource-card__open--muted">站内用法见下方</span>
                  ) : null}
                </div>
                <div className="resource-card__tags">
                  {i < 2 ? (
                    <span className="ds-tag ds-tag--brand">核心</span>
                  ) : (
                    <span className="ds-tag">补充</span>
                  )}
                  {openHref ? <span className="ds-tag">微信读书可读</span> : null}
                  {r.difficulty ? <span className="ds-tag">{difficultyZh(r.difficulty)}</span> : null}
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
                    <div className="resource-field__value">{difficultyZh(r.difficulty)}</div>
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
            )
          })}
          {!resources.length ? <p className="text-tertiary">等待资料推荐…</p> : null}
        </div>
      </section>
    </>
  )
}
