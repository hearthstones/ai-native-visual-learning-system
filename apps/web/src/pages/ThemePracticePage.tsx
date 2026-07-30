import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type Theme } from '../lib/api'
import '../styles/pages/theme-practice.css'

const CORE_ITEMS = [
  { name: '主动阅读四问', status: 'done' as const, label: '已掌握' },
  { name: '检视阅读 vs 分析阅读', status: 'done' as const, label: '已掌握' },
  { name: '刻意练习三要素', status: 'done' as const, label: '已掌握' },
  { name: '费曼学习法', status: 'done' as const, label: '已掌握' },
  { name: '间隔重复与主动回忆', status: 'weak' as const, label: '待加强' },
]

export function ThemePracticePage() {
  const { themeId = '' } = useParams()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void api
      .getTheme(themeId)
      .then(setTheme)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [themeId])

  if (error) {
    return (
      <div className="ov-page">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!theme) {
    return (
      <div className="ov-page">
        <p className="muted">加载中…</p>
      </div>
    )
  }

  return (
    <div className="ov-page">
      <header className="ov-identity">
        <h1 className="ov-identity__title">{theme.title}</h1>
        <div className="ov-identity__meta">
          <span className="ds-tag ds-tag--brand">练习期</span>
          <span className="ov-identity__goal">{theme.goal || '在真实场景中刻意练习'}</span>
        </div>
      </header>

      <section className="ov-progress">
        <div className="ov-progress__track">
          <div className="ov-progress__fill" style={{ width: '50%' }} />
        </div>
        <div className="ov-progress__meta">
          <span>练习期</span>
          <span className="ov-sep">·</span>
          <span>
            第 <span className="mono">2/4</span> 周
          </span>
          <span className="ov-sep">·</span>
          <span>已完成学习期</span>
          <span className="ov-sep">·</span>
          <span>
            核心 <span className="mono">4/5</span>
          </span>
        </div>
      </section>

      <section className="ov-cta">
        <div className="ov-cta__body">
          <div className="ov-cta__label">今日任务 · 1 项</div>
          <div className="ov-cta__tasks">
            <div className="ov-cta__task">
              <span className="ov-cta__idx mono">01</span>
              <span>用费曼法向同事讲解阅读四问（约 20 分钟）</span>
            </div>
          </div>
        </div>
        <Link
          to={`/themes/${theme.id}/work`}
          className="ds-btn ds-btn--brand ds-btn--lg"
          data-dom-id="btn-enter-execution"
        >
          <Icon name="play" size={14} className="icon" />
          进入执行
        </Link>
      </section>

      <section className="ov-map">
        <div className="ov-map__head">
          <span className="ov-map__title">学习路径</span>
        </div>
        <div className="ov-path">
          <div className="ov-path__stage ov-path__stage--done">
            <div className="ov-path__stage-head">
              <img
                src="/icons/check-circle.svg"
                width={16}
                height={16}
                alt=""
                style={{ filter: 'brightness(0.6)' }}
              />
              <span className="ov-path__stage-name">学</span>
            </div>
            <div className="ov-path__stage-label">学习期</div>
            <div className="ov-path__stage-meta">已完成</div>
          </div>
          <div className="ov-path__connector">
            <Icon name="arrow-right" size={12} />
          </div>
          <div className="ov-path__stage ov-path__stage--current">
            <div className="ov-path__stage-head">
              <span className="ov-path__stage-dot" />
              <span className="ov-path__stage-name">练</span>
            </div>
            <div className="ov-path__stage-label">练习期</div>
            <div className="ov-path__stage-meta">
              当前 · 第 <span className="mono">2/4</span> 周
            </div>
          </div>
          <div className="ov-path__connector">
            <Icon name="arrow-right" size={12} />
          </div>
          <div className="ov-path__stage ov-path__stage--upcoming">
            <div className="ov-path__stage-head">
              <span className="ov-path__stage-dot ov-path__stage-dot--hollow" />
              <span className="ov-path__stage-name">用</span>
            </div>
            <div className="ov-path__stage-label">应用期</div>
            <div className="ov-path__stage-meta">未开始</div>
          </div>
        </div>
        <div className="ov-map__hint">练习期 · 每周 1-2 次刻意练习，巩固核心方法</div>
      </section>

      <section className="ov-aux">
        <details className="ov-aux-core">
          <summary>
            <span className="ov-aux-core__label">
              核心掌握 <span className="mono">4/5</span>
            </span>
            <Icon name="chevron-right" size={12} className="ov-aux-core__chevron" />
          </summary>
          <ul className="ov-core-list">
            {CORE_ITEMS.map((item) => (
              <li key={item.name} className={`ov-core ov-core--${item.status}`}>
                <span className="ov-core__dot" />
                <span className="ov-core__name">{item.name}</span>
                <span className={`ov-core__label ov-core__label--${item.status}`}>{item.label}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <nav className="ov-secondary">
        <Link to={`/themes/${theme.id}/plan`} className="ov-secondary__link" data-dom-id="btn-plan">
          <Icon name="layout" size={12} />
          调整计划
        </Link>
        <span className="ov-secondary__sep">·</span>
        <Link to="/review" className="ov-secondary__link" data-dom-id="btn-review">
          <Icon name="trending-up" size={12} />
          复盘
        </Link>
      </nav>

      <div className="ov-demo">
        <Link
          to={`/themes/${theme.id}`}
          className="ov-demo__link"
          data-dom-id="btn-demo-learning"
        >
          演示：切换到学习期
          <Icon name="arrow-right" size={12} />
        </Link>
      </div>
    </div>
  )
}
