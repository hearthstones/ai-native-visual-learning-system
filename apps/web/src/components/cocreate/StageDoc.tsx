import { Icon } from '../Icon'

export function StageDoc({
  levels,
  selectedLevel,
  onSelect,
  readOnly = false,
}: {
  levels: Array<Record<string, unknown>>
  selectedLevel: number | null
  onSelect: (n: number) => void
  readOnly?: boolean
}) {
  return (
    <section className="doc-section">
      <div className="doc-section__head">
        <span className="doc-section__index">A</span>
        <h3 className="doc-section__title">
          <Icon name="layers" size={14} className="ic icon" />
          学习阶梯定位
        </h3>
        <span className="ds-tag ds-tag--brand">{readOnly ? '已确认' : '点击选择'}</span>
      </div>
      <div className="ladder">
        {levels.map((lv) => {
          const level = Number(lv.level)
          const selected = selectedLevel === level
          const concepts = Array.isArray(lv.concepts) ? (lv.concepts as string[]).join('、') : ''
          return (
            <div
              key={level}
              className={`ladder__row${selected ? ' is-selected' : ''}`}
              data-level={level}
              onClick={readOnly ? undefined : () => onSelect(level)}
              style={readOnly ? { cursor: 'default' } : undefined}
            >
              <div className="ladder__lvl">L{level}</div>
              <div>
                <div className="ladder__name">{String(lv.name || '')}</div>
                <div className="ladder__desc">
                  {lv.understand ? (
                    <div className="row">
                      <span className="k">理解：</span>
                      {String(lv.understand)}
                    </div>
                  ) : null}
                  {lv.mastery ? (
                    <div className="row">
                      <span className="k">掌握：</span>
                      {String(lv.mastery)}
                    </div>
                  ) : null}
                  {concepts ? (
                    <div className="row">
                      <span className="k">核心概念：</span>
                      {concepts}
                    </div>
                  ) : null}
                  {lv.milestone ? (
                    <div className="row">
                      <span className="k">里程碑：</span>
                      {String(lv.milestone)}
                    </div>
                  ) : null}
                  {lv.exercise ? (
                    <div className="row">
                      <span className="k">练习：</span>
                      {String(lv.exercise)}
                    </div>
                  ) : null}
                  {lv.self_check ? (
                    <div className="row">
                      <span className="k">自检：</span>
                      {String(lv.self_check)}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                className="ladder__select-btn"
                type="button"
                disabled={readOnly}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!readOnly) onSelect(level)
                }}
              >
                {selected ? '✓ 已选定' : '我在这里'}
              </button>
            </div>
          )
        })}
        {!levels.length ? <p className="text-tertiary">等待阶梯生成…</p> : null}
      </div>
    </section>
  )
}
