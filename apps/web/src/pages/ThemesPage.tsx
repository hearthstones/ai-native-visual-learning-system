import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { api, type Theme, type ThemeStatus } from '../lib/api'
import { draftResumeLabel, draftResumePath, phaseZh } from '../lib/themeDoc'
import '../styles/pages/themes.css'

type TabKey = ThemeStatus
type ConfirmKind =
  | 'dormant'
  | 'completed'
  | 'abandoned'
  | 'archived'
  | 'deleted'
  | 'purge'

const PRIMARY_TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'active', label: '进行中' },
  { key: 'draft', label: '草稿' },
  { key: 'dormant', label: '休眠' },
  { key: 'completed', label: '完成' },
]

const HISTORY_TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'abandoned', label: '废弃' },
  { key: 'archived', label: '归档' },
  { key: 'deleted', label: '回收站' },
]

const ALL_TABS = [...PRIMARY_TABS, ...HISTORY_TABS]

const EMPTY: Record<TabKey, { title: string; desc: string }> = {
  active: { title: '暂无进行中的主题', desc: '新建并锁定计划后会出现在这里。' },
  draft: { title: '暂无草稿', desc: '创建后未完成共创的主题会留在草稿。' },
  dormant: { title: '暂无休眠主题', desc: '休眠可腾出槽位，之后可恢复。' },
  completed: { title: '暂无已完成主题', desc: '应用期标记完成后会出现在这里。' },
  abandoned: { title: '暂无废弃主题', desc: '主动放弃的主题会出现在这里。' },
  archived: { title: '暂无归档主题', desc: '完成或废弃后可归档收纳。' },
  deleted: { title: '回收站为空', desc: '删除的主题会先留在这里，可恢复或永久删除。' },
}

const CONFIRM_COPY: Record<
  ConfirmKind,
  { title: string; body: (name: string, locked: boolean) => string; ok: string; danger?: boolean }
> = {
  dormant: {
    title: '确认休眠',
    body: (name) => `休眠「${name}」将释放阶段槽位并撤下今日任务，之后可在休眠列表恢复。`,
    ok: '确认休眠',
  },
  completed: {
    title: '确认完成（毕业）',
    body: (name) => `将「${name}」标记为完成：不再占槽，作为成功终点保留，可随时回看。`,
    ok: '确认完成',
  },
  abandoned: {
    title: '确认废弃',
    body: (name, locked) =>
      locked
        ? `废弃「${name}」表示不再继续学习，仍可回看；之后可归档或删除。`
        : `废弃草稿「${name}」。未锁定计划的主题废弃后不能直接恢复为进行中。`,
    ok: '确认废弃',
    danger: true,
  },
  archived: {
    title: '确认归档',
    body: (name) => `将「${name}」收入归档，从日常列表淡出；需要时可取消归档或回看。`,
    ok: '确认归档',
  },
  deleted: {
    title: '确认删除',
    body: (name) => `将「${name}」移入回收站。可恢复；永久删除需在回收站再次确认。`,
    ok: '移入回收站',
    danger: true,
  },
  purge: {
    title: '永久删除',
    body: (name) => `彻底删除「${name}」及其计划、共创记录，不可恢复。`,
    ok: '永久删除',
    danger: true,
  },
}

const phaseTag: Record<string, string> = {
  learning: 'ds-tag ds-tag--brand',
  practice: 'ds-tag ds-tag--warning',
  application: 'ds-tag',
}

const typeZh: Record<string, string> = {
  general: '通识',
  tech: '技术',
}

const statusZh: Record<ThemeStatus, string> = {
  draft: '草稿',
  active: '进行中',
  dormant: '休眠',
  completed: '完成',
  abandoned: '废弃',
  archived: '归档',
  deleted: '回收站',
}

function formatUpdated(iso: string) {
  try {
    const d = new Date(iso)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}-${day} ${h}:${min}`
  } catch {
    return iso
  }
}

function isTabKey(v: string | null): v is TabKey {
  return ALL_TABS.some((t) => t.key === v)
}

function isHistoryTab(key: TabKey) {
  return HISTORY_TABS.some((t) => t.key === key)
}

export function ThemesPage() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: TabKey = isTabKey(params.get('tab')) ? (params.get('tab') as TabKey) : 'active'

  const [themes, setThemes] = useState<Theme[]>([])
  const [slots, setSlots] = useState<Record<string, { used: number; max: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(isHistoryTab(tab))
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [editTheme, setEditTheme] = useState<Theme | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editGoal, setEditGoal] = useState('')
  const [confirmTheme, setConfirmTheme] = useState<Theme | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)

  async function load(opts?: { quiet?: boolean }) {
    if (!opts?.quiet) setLoading(true)
    setError('')
    try {
      const [list, slotSnap] = await Promise.all([api.listThemes(), api.slots()])
      setThemes(list)
      setSlots(slotSnap)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!opts?.quiet) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    setHistoryOpen(isHistoryTab(tab))
  }, [tab])

  useEffect(() => {
    if (!ok) return
    const t = window.setTimeout(() => setOk(''), 2800)
    return () => window.clearTimeout(t)
  }, [ok])

  useEffect(() => {
    if (!menuId) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuId])

  const counts = useMemo(() => {
    const c = Object.fromEntries(ALL_TABS.map((t) => [t.key, 0])) as Record<TabKey, number>
    for (const t of themes) c[t.status] += 1
    return c
  }, [themes])

  const historyCount = HISTORY_TABS.reduce((n, t) => n + counts[t.key], 0)
  const filtered = useMemo(() => themes.filter((t) => t.status === tab), [themes, tab])
  const learningFull = (slots.learning?.used ?? 0) >= (slots.learning?.max ?? 1)

  function setTab(next: TabKey) {
    const p = new URLSearchParams(params)
    if (next === 'active') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
    if (isHistoryTab(next)) setHistoryOpen(true)
  }

  async function runAction(
    themeId: string,
    fn: () => Promise<unknown>,
    successMsg: string,
    followTab?: TabKey,
  ): Promise<boolean> {
    if (busyId) return false
    setBusyId(themeId)
    setMenuId(null)
    setError('')
    setOk('')
    try {
      await fn()
      setOk(successMsg)
      await load({ quiet: true })
      if (followTab) setTab(followTab)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusyId(null)
    }
  }

  function openEdit(theme: Theme) {
    setMenuId(null)
    setEditTheme(theme)
    setEditTitle(theme.title)
    setEditGoal(theme.goal || '')
  }

  async function saveEdit(e?: FormEvent) {
    e?.preventDefault()
    if (!editTheme) return
    const title = editTitle.trim()
    if (!title) {
      setError('主题名称不能为空')
      return
    }
    const okSave = await runAction(
      editTheme.id,
      () => api.updateTheme(editTheme.id, { title, goal: editGoal.trim() }),
      '已更新主题信息',
    )
    if (okSave) setEditTheme(null)
  }

  function askConfirm(theme: Theme, kind: ConfirmKind) {
    setMenuId(null)
    setConfirmTheme(theme)
    setConfirmKind(kind)
  }

  async function runConfirm() {
    if (!confirmTheme || !confirmKind) return
    const theme = confirmTheme
    const kind = confirmKind
    setConfirmTheme(null)
    setConfirmKind(null)

    if (kind === 'purge') {
      await runAction(theme.id, () => api.purgeTheme(theme.id), '已永久删除', 'deleted')
      return
    }

    const statusMap: Record<Exclude<ConfirmKind, 'purge'>, ThemeStatus> = {
      dormant: 'dormant',
      completed: 'completed',
      abandoned: 'abandoned',
      archived: 'archived',
      deleted: 'deleted',
    }
    const msg: Record<Exclude<ConfirmKind, 'purge'>, string> = {
      dormant: '已休眠，槽位已释放',
      completed: '已标记完成',
      abandoned: '已废弃',
      archived: '已归档',
      deleted: '已移入回收站',
    }
    await runAction(
      theme.id,
      () => api.updateTheme(theme.id, { status: statusMap[kind] }),
      msg[kind],
      statusMap[kind],
    )
  }

  function goCreate() {
    nav(learningFull ? '/create/intercept' : '/create')
  }

  function MoreMenu({
    theme,
    items,
  }: {
    theme: Theme
    items: Array<{ label: string; danger?: boolean; onClick: () => void }>
  }) {
    const open = menuId === theme.id
    return (
      <div className="themes-more" ref={open ? menuRef : undefined}>
        <button
          type="button"
          className="ds-btn ds-btn--tertiary ds-btn--sm"
          aria-label="更多操作"
          aria-expanded={open}
          disabled={busyId === theme.id}
          onClick={() => setMenuId(open ? null : theme.id)}
        >
          ⋯
        </button>
        {open ? (
          <div className="themes-more__menu" role="menu">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`themes-more__item${it.danger ? ' is-danger' : ''}`}
                onClick={it.onClick}
              >
                {it.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  function renderActions(theme: Theme) {
    const busy = busyId === theme.id
    const primary = (
      label: string,
      opts: { kind?: 'brand' | 'secondary' | 'tertiary' | 'danger'; to?: string; onClick?: () => void },
    ) => {
      const cls = `ds-btn ds-btn--${opts.kind || 'tertiary'} ds-btn--sm`
      if (opts.to) {
        return (
          <Link key={label} className={cls} to={opts.to}>
            {label}
          </Link>
        )
      }
      return (
        <button key={label} type="button" className={cls} disabled={busy} onClick={opts.onClick}>
          {label}
        </button>
      )
    }

    switch (theme.status) {
      case 'active':
        return (
          <>
            {primary('进入', { kind: 'brand', to: `/themes/${theme.id}` })}
            {primary(theme.is_focus ? '取消焦点' : '设焦点', {
              kind: 'secondary',
              onClick: () =>
                void runAction(
                  theme.id,
                  () => api.updateTheme(theme.id, { is_focus: !theme.is_focus }),
                  theme.is_focus ? '已取消主焦点' : '已设为主焦点',
                ),
            })}
            {primary('休眠', {
              kind: 'tertiary',
              onClick: () => askConfirm(theme, 'dormant'),
            })}
            <MoreMenu
              theme={theme}
              items={[
                { label: '编辑', onClick: () => openEdit(theme) },
                ...(theme.phase === 'application'
                  ? [{ label: '标记完成', onClick: () => askConfirm(theme, 'completed') }]
                  : []),
                { label: '废弃', danger: true, onClick: () => askConfirm(theme, 'abandoned') },
                { label: '删除', danger: true, onClick: () => askConfirm(theme, 'deleted') },
              ]}
            />
          </>
        )
      case 'draft':
        return (
          <>
            {primary(draftResumeLabel(theme), { kind: 'brand', to: draftResumePath(theme) })}
            <MoreMenu
              theme={theme}
              items={[
                { label: '编辑', onClick: () => openEdit(theme) },
                { label: '废弃', danger: true, onClick: () => askConfirm(theme, 'abandoned') },
                { label: '删除', danger: true, onClick: () => askConfirm(theme, 'deleted') },
              ]}
            />
          </>
        )
      case 'dormant':
        return (
          <>
            {primary('恢复进行', {
              kind: 'brand',
              onClick: () =>
                void runAction(
                  theme.id,
                  () => api.updateTheme(theme.id, { status: 'active' }),
                  '已恢复为进行中',
                  'active',
                ),
            })}
            <MoreMenu
              theme={theme}
              items={[
                { label: '编辑', onClick: () => openEdit(theme) },
                { label: '废弃', danger: true, onClick: () => askConfirm(theme, 'abandoned') },
                { label: '删除', danger: true, onClick: () => askConfirm(theme, 'deleted') },
              ]}
            />
          </>
        )
      case 'completed':
        return (
          <>
            {primary('查看', { kind: 'brand', to: `/themes/${theme.id}` })}
            {primary('归档', { kind: 'secondary', onClick: () => askConfirm(theme, 'archived') })}
            <MoreMenu
              theme={theme}
              items={[
                {
                  label: '重开进行',
                  onClick: () =>
                    void runAction(
                      theme.id,
                      () => api.updateTheme(theme.id, { status: 'active' }),
                      '已重新进入进行中',
                      'active',
                    ),
                },
                { label: '编辑', onClick: () => openEdit(theme) },
                { label: '删除', danger: true, onClick: () => askConfirm(theme, 'deleted') },
              ]}
            />
          </>
        )
      case 'abandoned':
        return (
          <>
            {primary('查看', { kind: 'secondary', to: `/themes/${theme.id}` })}
            {primary('归档', { kind: 'brand', onClick: () => askConfirm(theme, 'archived') })}
            <MoreMenu
              theme={theme}
              items={[
                ...(theme.locked_at
                  ? [
                      {
                        label: '重开进行',
                        onClick: () =>
                          void runAction(
                            theme.id,
                            () => api.updateTheme(theme.id, { status: 'active' }),
                            '已重新进入进行中',
                            'active' as TabKey,
                          ),
                      },
                    ]
                  : []),
                { label: '编辑', onClick: () => openEdit(theme) },
                { label: '删除', danger: true, onClick: () => askConfirm(theme, 'deleted') },
              ]}
            />
          </>
        )
      case 'archived':
        return (
          <>
            {primary('查看', { kind: 'brand', to: `/themes/${theme.id}` })}
            {primary('取消归档', {
              kind: 'secondary',
              onClick: () =>
                void runAction(
                  theme.id,
                  () => api.restoreTheme(theme.id),
                  '已取消归档',
                  theme.previous_status === 'abandoned' ? 'abandoned' : 'completed',
                ),
            })}
            <MoreMenu
              theme={theme}
              items={[
                { label: '编辑', onClick: () => openEdit(theme) },
                { label: '删除', danger: true, onClick: () => askConfirm(theme, 'deleted') },
              ]}
            />
          </>
        )
      case 'deleted':
        return (
          <>
            {primary('恢复', {
              kind: 'brand',
              onClick: () =>
                void runAction(theme.id, () => api.restoreTheme(theme.id), '已从回收站恢复', theme.previous_status || 'active'),
            })}
            {primary('永久删除', { kind: 'danger', onClick: () => askConfirm(theme, 'purge') })}
          </>
        )
      default:
        return null
    }
  }

  const confirm = confirmKind ? CONFIRM_COPY[confirmKind] : null

  return (
    <div className="themes-page">
      <div className="themes-header">
        <div className="themes-header__title-group">
          <h1 className="themes-header__title">我的主题</h1>
          <p className="themes-header__subtitle">管理主题生命周期与阶段槽位</p>
        </div>
        <button className="ds-btn ds-btn--brand" type="button" onClick={goCreate}>
          <Icon name="plus" size={14} className="icon" />
          <span>新建主题</span>
        </button>
      </div>

      <div className="themes-slotbar">
        <span className="themes-slotbar__label">阶段槽位</span>
        <span className="themes-slotbar__item">
          学 {slots.learning?.used ?? 0}/{slots.learning?.max ?? 1}
        </span>
        <span className="themes-slotbar__item">
          练 {slots.practice?.used ?? 0}/{slots.practice?.max ?? 3}
        </span>
        <span className="themes-slotbar__item">
          用 {slots.application?.used ?? 0}/{slots.application?.max ?? 5}
        </span>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {ok ? <div className="ok-banner">{ok}</div> : null}

      <div className="themes-tabbar">
        <div className="ds-tabs themes-tabs" role="tablist" aria-label="常用状态">
          {PRIMARY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`ds-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="themes-tab-count">{counts[t.key]}</span>
            </button>
          ))}
          <button
            type="button"
            className={`ds-tab themes-tabs__more${historyOpen || isHistoryTab(tab) ? ' is-active' : ''}`}
            aria-expanded={historyOpen}
            onClick={() => {
              const next = !historyOpen
              setHistoryOpen(next)
              if (next && !isHistoryTab(tab)) setTab('abandoned')
            }}
          >
            历史
            <span className="themes-tab-count">{historyCount}</span>
          </button>
        </div>
        {historyOpen ? (
          <>
            <p className="themes-history-hint text-tertiary" style={{ fontSize: 12, margin: '8px 0 0' }}>
              历史包含废弃、归档与回收站，与「完成」成功终点分开存放。
            </p>
            <div className="ds-tabs themes-tabs themes-tabs--history" role="tablist" aria-label="历史状态">
              {HISTORY_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  className={`ds-tab${tab === t.key ? ' is-active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  <span className="themes-tab-count">{counts[t.key]}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {loading ? (
        <p className="themes-empty">加载中…</p>
      ) : filtered.length === 0 ? (
        <div className="themes-empty">
          <p className="themes-empty__title">{EMPTY[tab].title}</p>
          <p className="themes-empty__desc">{EMPTY[tab].desc}</p>
          {tab === 'active' || tab === 'draft' ? (
            <button className="ds-btn ds-btn--secondary" type="button" onClick={goCreate}>
              新建主题
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="themes-list">
          {filtered.map((theme) => (
            <li key={theme.id} className="themes-row">
              <div className="themes-row__main">
                <div className="themes-row__head">
                  <span className="themes-row__title">{theme.title}</span>
                  {theme.status === 'active' ||
                  theme.status === 'dormant' ||
                  theme.status === 'completed' ? (
                    <span className={phaseTag[theme.phase]}>{phaseZh[theme.phase]}</span>
                  ) : null}
                  {theme.is_focus ? <span className="ds-tag ds-tag--brand">主焦点</span> : null}
                  {theme.status === 'deleted' && theme.previous_status ? (
                    <span className="themes-row__type">
                      原状态 · {statusZh[theme.previous_status]}
                    </span>
                  ) : null}
                  {theme.status === 'archived' && theme.previous_status ? (
                    <span className="themes-row__type">
                      来自 · {statusZh[theme.previous_status]}
                    </span>
                  ) : null}
                  <span className="themes-row__type">
                    {typeZh[theme.theme_type] || theme.theme_type}
                  </span>
                </div>
                <p className="themes-row__goal">{theme.goal || '暂无目标描述'}</p>
                <div className="themes-row__meta">更新于 {formatUpdated(theme.updated_at)}</div>
              </div>
              <div className="themes-row__actions">{renderActions(theme)}</div>
            </li>
          ))}
        </ul>
      )}

      <div className={`themes-modal${editTheme ? ' is-open' : ''}`}>
        <div className="ds-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-theme-title">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title" id="edit-theme-title">
              编辑主题
            </span>
            <button type="button" className="ds-dialog__close" onClick={() => setEditTheme(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
          <form onSubmit={(e) => void saveEdit(e)}>
            <div className="ds-dialog__body themes-edit-body">
              <label className="themes-field">
                <span className="themes-field__label">主题名称</span>
                <input
                  className="themes-field__input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <label className="themes-field">
                <span className="themes-field__label">一句话目标</span>
                <textarea
                  className="themes-field__textarea"
                  value={editGoal}
                  onChange={(e) => setEditGoal(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </label>
            </div>
            <div className="ds-dialog__foot">
              <button type="button" className="ds-btn ds-btn--tertiary" onClick={() => setEditTheme(null)}>
                取消
              </button>
              <button type="submit" className="ds-btn ds-btn--brand" disabled={!!busyId}>
                保存
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className={`themes-modal${confirmTheme && confirm ? ' is-open' : ''}`}>
        <div className="ds-dialog" role="dialog" aria-modal="true">
          <div className="ds-dialog__head">
            <span className="ds-dialog__title">{confirm?.title}</span>
            <button
              type="button"
              className="ds-dialog__close"
              onClick={() => {
                setConfirmTheme(null)
                setConfirmKind(null)
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="ds-dialog__body">
            {confirm && confirmTheme
              ? confirm.body(confirmTheme.title, !!confirmTheme.locked_at)
              : null}
          </div>
          <div className="ds-dialog__foot">
            <button
              type="button"
              className="ds-btn ds-btn--tertiary"
              onClick={() => {
                setConfirmTheme(null)
                setConfirmKind(null)
              }}
            >
              取消
            </button>
            <button
              type="button"
              className={`ds-btn ${confirm?.danger ? 'ds-btn--danger' : 'ds-btn--brand'}`}
              disabled={!!busyId}
              onClick={() => void runConfirm()}
            >
              {confirm?.ok}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
