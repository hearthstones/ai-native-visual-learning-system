import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type Theme } from '../lib/api'
import '../styles/components.css'
import '../styles/pages/create-intercept.css'

type Choice = 'advance' | 'hibernate' | 'abandon'

const typeLabel: Record<string, string> = {
  general: '通识 · 主题阅读',
  tech: '技术 · 工作流',
}

export function CreateInterceptPage() {
  const nav = useNavigate()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [slots, setSlots] = useState<Record<string, { used: number; max: number }>>({})
  const [choice, setChoice] = useState<Choice>('advance')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const home = await api.home()
        if (cancelled) return
        setSlots(home.slots)
        const used = home.slots.learning?.used ?? 0
        const max = home.slots.learning?.max ?? 1
        if (used < max) {
          nav('/create', { replace: true })
          return
        }
        const learning = home.themes.find((t) => t.status === 'active' && t.phase === 'learning')
        setTheme(learning ?? null)
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
  }, [nav])

  async function onConfirm() {
    if (!theme || busy) return
    setBusy(true)
    setError('')
    try {
      if (choice === 'advance') {
        await api.advancePhase(theme.id)
      } else if (choice === 'hibernate') {
        await api.updateTheme(theme.id, { status: 'dormant' })
      } else {
        await api.updateTheme(theme.id, { status: 'archived' })
      }
      nav('/create')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const learning = slots.learning
  const used = learning?.used ?? 0
  const max = learning?.max ?? 1
  const full = used >= max
  const name = theme?.title ?? '当前主题'

  if (loading) {
    return (
      <div className="intercept-wrap">
        <p className="text-tertiary">加载中…</p>
      </div>
    )
  }

  return (
    <div className="intercept-wrap">
      <div className="intercept-top">
        <span className="intercept-eyebrow">刻意练习 · 主题管理</span>
        <Link to="/" className="ds-btn ds-btn--tertiary ds-btn--sm" data-dom-id="btn-back-home">
          <Icon name="arrow-left" size={14} />
          <span>返回首页</span>
        </Link>
      </div>

      <div className="ds-dialog" role="dialog" aria-labelledby="intercept-title" aria-modal="false">
        <div className="ds-dialog__head">
          <div className="ds-dialog__head-left">
            <span className="ds-dialog__head-icon">
              <Icon name="alert-triangle" size={16} />
            </span>
            <span className="ds-dialog__title" id="intercept-title">
              {full ? '想新建主题？先腾出学习槽位' : '学习槽位可用'}
            </span>
          </div>
          <button
            className="ds-dialog__close"
            type="button"
            aria-label="关闭"
            onClick={() => nav('/')}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="ds-dialog__body">
          <div className="intercept-body">
            {error ? <div className="error-banner">{error}</div> : null}

            <div className={`ds-alert ${full ? 'ds-alert--warning' : 'ds-alert--info'}`}>
              <span className="ds-alert__icon">
                <Icon name="alert-triangle" size={16} />
              </span>
              <div className="ds-alert__content">
                <div className="ds-alert__title">
                  {full
                    ? `学习阶段槽位已满（${used}/${max}）`
                    : `学习阶段槽位（${used}/${max}）`}
                </div>
                <div className="ds-alert__desc">
                  {full
                    ? `学习阶段最多并发 ${max} 个主题。要新建主题，需先把当前学习期主题推进到练习期、休眠或废弃，腾出学习槽位。`
                    : '当前学习槽位尚有空位，可直接创建新主题。'}
                </div>
              </div>
            </div>

            {theme ? (
              <div className="theme-summary">
                <div className="theme-summary__name">{theme.title}</div>
                <div className="theme-summary__meta">
                  <span className="ds-tag ds-tag--brand">{typeLabel[theme.theme_type] ?? theme.theme_type}</span>
                  <span>
                    {theme.current_ladder_level ? `L${theme.current_ladder_level} · ` : ''}
                    学习期
                  </span>
                </div>
                <div className="theme-summary__mono">{theme.goal || '学习阶段进行中'}</div>
              </div>
            ) : (
              <div className="theme-summary">
                <div className="theme-summary__name">未找到占用学习槽的主题</div>
                <div className="theme-summary__mono">可返回首页，或直接进入创建</div>
              </div>
            )}

            {theme ? (
              <>
                <div className="section-label">请选择如何腾出学习槽位</div>
                <div className="radio-list">
                  <label className="radio-option">
                    <span className="radio-option__main">
                      <span className="ds-radio">
                        <input
                          type="radio"
                          name="intercept-choice"
                          value="advance"
                          checked={choice === 'advance'}
                          onChange={() => setChoice('advance')}
                        />
                        <span className="ds-radio__dot" />
                        <span className="radio-option__title">推进「{name}」到练习阶段</span>
                        <span className="ds-tag ds-tag--brand radio-option__tag">推荐</span>
                      </span>
                    </span>
                    <span className="radio-option__sub">把学习切片归档，进入练习期，腾出学习槽位后新建</span>
                  </label>

                  <label className="radio-option">
                    <span className="radio-option__main">
                      <span className="ds-radio">
                        <input
                          type="radio"
                          name="intercept-choice"
                          value="hibernate"
                          checked={choice === 'hibernate'}
                          onChange={() => setChoice('hibernate')}
                        />
                        <span className="ds-radio__dot" />
                        <span className="radio-option__title">休眠当前主题后新建</span>
                      </span>
                    </span>
                    <span className="radio-option__sub">暂停「{name}」，留痕可恢复，腾出槽位</span>
                  </label>

                  <label className="radio-option">
                    <span className="radio-option__main">
                      <span className="ds-radio">
                        <input
                          type="radio"
                          name="intercept-choice"
                          value="abandon"
                          checked={choice === 'abandon'}
                          onChange={() => setChoice('abandon')}
                        />
                        <span className="ds-radio__dot" />
                        <span className="radio-option__title">废弃当前主题后新建</span>
                      </span>
                    </span>
                    <span className="radio-option__sub">归档收尾「{name}」，不再继续，腾出槽位</span>
                  </label>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="ds-dialog__foot">
          <Link to="/" className="ds-btn ds-btn--tertiary" data-dom-id="btn-back-home">
            取消
          </Link>
          {theme ? (
            <button
              className="ds-btn ds-btn--primary"
              type="button"
              id="interceptConfirm"
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {busy ? '处理中…' : '确认'}
            </button>
          ) : (
            <button className="ds-btn ds-btn--brand" type="button" onClick={() => nav('/create')}>
              去创建主题
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
