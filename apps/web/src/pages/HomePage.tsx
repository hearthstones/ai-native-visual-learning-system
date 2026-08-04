import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type HomeData, type Theme } from '../lib/api'
import { draftResumeLabel, draftResumePath } from '../lib/themeDoc'
import '../styles/pages/home.css'
import '../styles/pages/home-empty.css'
import '../styles/pages/home-first.css'

const phaseZh: Record<string, string> = {
  learning: '学习期',
  practice: '练习期',
  application: '应用期',
}

const phaseTag: Record<string, string> = {
  learning: 'ds-tag ds-tag--brand',
  practice: 'ds-tag ds-tag--warning',
  application: 'ds-tag',
}

const phaseDot: Record<string, string> = {
  learning: 'today-item__dot today-item__dot--teal',
  practice: 'today-item__dot today-item__dot--amber',
  application: 'today-item__dot today-item__dot--teal',
}

function formatTodaySubtitle() {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}（周${week}）`
}

function SlotBar({ slots }: { slots: HomeData['slots'] }) {
  return (
    <div className="slot-bar">
      <span className="slot-bar__label">阶段槽位</span>
      <span className="slot-bar__item">学 {slots.learning?.used ?? 0}/{slots.learning?.max ?? 1}</span>
      <span className="slot-bar__item">练 {slots.practice?.used ?? 0}/{slots.practice?.max ?? 3}</span>
      <span className="slot-bar__item">用 {slots.application?.used ?? 0}/{slots.application?.max ?? 5}</span>
    </div>
  )
}

function themeById(themes: Theme[], id: string) {
  return themes.find((t) => t.id === id)
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
      setData(await api.home())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const active = useMemo(
    () => (data ? data.themes.filter((t) => t.status === 'active') : []),
    [data],
  )
  const drafts = useMemo(
    () => (data ? data.themes.filter((t) => t.status === 'draft') : []),
    [data],
  )

  if (loading) {
    return (
      <div className="home-page">
        <p className="text-secondary">加载中…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="home-page">
        <div className="ds-alert ds-alert--danger" style={{ marginBottom: 16 }}>
          <div className="ds-alert__content">
            <div className="ds-alert__title">加载失败</div>
            <div className="ds-alert__desc">{error}</div>
          </div>
        </div>
        <button className="ds-btn ds-btn--secondary" type="button" onClick={() => void load()}>
          重试
        </button>
      </div>
    )
  }

  if (!data) return null

  const learningFull = (data.slots.learning?.used ?? 0) >= (data.slots.learning?.max ?? 1)
  const goCreate = () => nav(learningFull ? '/create/intercept' : '/create')

  /* ── 空态：home-empty ── */
  if (active.length === 0) {
    return (
      <div className="home-empty-page">
        <div className="home-empty__icon">
          <Icon name="sparkles" size={28} />
        </div>
        <div className="home-empty__title-group">
          <div className="home-empty__title">
            {drafts.length > 0 ? '你有未完成的主题草稿' : '从第一个主题开始'}
          </div>
          <div className="home-empty__subtitle">
            {drafts.length > 0
              ? '继续共创，或去「我的主题」管理草稿与休眠主题。'
              : 'AI 教练帮你共创学习阶梯、筛选高杠杆资料、制定学练用三阶段计划。每天约 30 分钟。'}
          </div>
        </div>
        <div className="home-empty__actions">
          {drafts.length > 0 ? (
            <>
              <Link className="ds-btn ds-btn--brand ds-btn--lg" to={draftResumePath(drafts[0])}>
                <Icon name="arrow-right" size={14} className="icon" />
                <span>{draftResumeLabel(drafts[0])} · {drafts[0].title}</span>
              </Link>
              <Link className="ds-btn ds-btn--secondary" to="/themes?tab=draft">
                管理全部主题
              </Link>
            </>
          ) : (
            <button className="ds-btn ds-btn--brand ds-btn--lg" type="button" onClick={goCreate}>
              <Icon name="plus" size={14} className="icon" />
              <span>新建第一个主题</span>
            </button>
          )}
          <div className="home-empty__slots">
            <span className="home-empty__slots-label">阶段槽位</span>
            <span>学 {data.slots.learning?.used ?? 0}/{data.slots.learning?.max ?? 1}</span>
            <span>练 {data.slots.practice?.used ?? 0}/{data.slots.practice?.max ?? 3}</span>
            <span>用 {data.slots.application?.used ?? 0}/{data.slots.application?.max ?? 5}</span>
          </div>
        </div>
      </div>
    )
  }

  const isFirst = active.length === 1
  const themeMap = data.themes

  return (
    <div className="home-page">
      <div className="home-header">
        <div className="home-header__title-group">
          <div className="home-header__title">今天</div>
          <div className="home-header__subtitle">{formatTodaySubtitle()}</div>
        </div>
        <button className="ds-btn ds-btn--tertiary" type="button" onClick={goCreate}>
          <Icon name="plus" size={14} className="icon" />
          <span>新建主题</span>
        </button>
      </div>

      <section className="home-section">
        <div className="home-section__label">今日任务</div>
        <div className="today-list">
          {data.today_tasks.length === 0 && (
            <p className="text-tertiary" style={{ fontSize: 12 }}>今天还没有任务。</p>
          )}
          {data.today_tasks.map((task) => {
            const theme = themeById(themeMap, task.theme_id)
            return (
              <Link
                key={task.id}
                className="today-item"
                to={`/themes/${task.theme_id}/work`}
                style={task.done ? { opacity: 0.55 } : undefined}
              >
                <span className={phaseDot[theme?.phase ?? 'learning']} />
                <span className="ds-tag today-item__topic-tag">{theme?.title ?? '主题'}</span>
                <span className="today-item__text">{task.title}</span>
                <span className="today-item__enter">
                  <span>进入</span>
                  <Icon name="arrow-right" size={14} />
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__label-row">
          <div className="home-section__label">我的主题</div>
          <Link className="home-section__link" to="/themes">
            管理全部
          </Link>
        </div>
        <div className="theme-grid">
          {active.map((theme) => {
            const todayCount = data.today_tasks.filter((t) => t.theme_id === theme.id).length
            return (
              <div key={theme.id} className="theme-card">
                <div className="theme-card__head">
                  <span className="theme-card__name">{theme.title}</span>
                  <span className={phaseTag[theme.phase]}>{phaseZh[theme.phase]}</span>
                </div>
                <div className="theme-card__status">
                  {theme.is_focus ? '主焦点' : '在跑'}
                  {theme.goal ? ` · ${theme.goal}` : ''}
                </div>
                <div className="theme-card__footer">
                  <span className="theme-card__task-hint">
                    今日 {todayCount} 项任务
                  </span>
                  <Link className="theme-card__enter" to={`/themes/${theme.id}`}>
                    <span>进入概览</span>
                    <Icon name="chevron-right" size={14} />
                  </Link>
                </div>
                {isFirst && <SlotBar slots={data.slots} />}
              </div>
            )
          })}
        </div>
        {!isFirst && <SlotBar slots={data.slots} />}
        {drafts.length > 0 && (
          <div className="home-draft-card">
            <div className="home-draft-card__main">
              <span className="home-draft-card__eyebrow">未完成共创</span>
              <span className="home-draft-card__title">{drafts[0].title}</span>
              <span className="home-draft-card__desc">
                {drafts.length > 1
                  ? `另有 ${drafts.length - 1} 个草稿待续创`
                  : '继续阶梯 / 资料 / 计划共创，锁定后进入执行'}
              </span>
            </div>
            <div className="home-draft-card__actions">
              <Link className="ds-btn ds-btn--brand ds-btn--sm" to={draftResumePath(drafts[0])}>
                {draftResumeLabel(drafts[0])}
              </Link>
              <Link className="ds-btn ds-btn--secondary ds-btn--sm" to="/themes?tab=draft">
                全部草稿
              </Link>
            </div>
          </div>
        )}
      </section>

      {data.drift_events.length > 0 && (
        <section className="home-section">
          <div className="home-section__label">漂移提示</div>
          <div className="ds-alert ds-alert--warning">
            <span className="ds-alert__icon">
              <Icon name="alert-triangle" size={16} />
            </span>
            <div className="ds-alert__content">
              <div className="ds-alert__title">主焦点偏多</div>
              <div className="ds-alert__desc">
                {data.drift_events[0]?.message}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
