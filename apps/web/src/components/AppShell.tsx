import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { slotSummaryParts, type SlotMap } from '../lib/slots'

function contextLabel(pathname: string) {
  if (pathname.startsWith('/settings')) return '设置'
  if (pathname.startsWith('/create')) return '新建主题'
  if (pathname.startsWith('/review')) return '周复盘'
  if (pathname === '/themes') return '我的主题'
  if (pathname.startsWith('/themes')) return '主题执行'
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day} · 今天`
}

function SlotChip({ slots }: { slots?: SlotMap }) {
  if (!slots) return null
  const parts = slotSummaryParts(slots)
  return (
    <div className="shell-slots" title="阶段槽位">
      <span className="shell-slots__item">学 {parts.learning}</span>
      <span className="shell-slots__item">练 {parts.practice}</span>
      <span className="shell-slots__item">用 {parts.application}</span>
    </div>
  )
}

export function AppShell({
  title = '刻意练习',
  slots,
}: {
  title?: string
  slots?: SlotMap
}) {
  const { pathname } = useLocation()
  const isCocreate = /^\/create\/[^/]+\/(stage|resources|plan)\/?$/.test(pathname)
  const hideChrome =
    pathname.startsWith('/create/intercept') ||
    pathname.startsWith('/review') ||
    isCocreate

  if (hideChrome) {
    return (
      <div className={`app-shell app-shell--bare${isCocreate ? ' app-shell--cocreate' : ''}`}>
        <main className="app-main app-main--bare">
          <Outlet />
        </main>
      </div>
    )
  }

  const themesManageActive = pathname === '/themes'
  const themeActive = pathname.startsWith('/themes/')
  const settingsActive = pathname.startsWith('/settings')
  const homeActive = pathname === '/' && !themesManageActive && !themeActive

  return (
    <div className="app-shell" data-viewport-mode="app-shell">
      <header className="ds-wbtitlebar">
        <div className="ds-wbtitlebar__left">
          <div className="ds-wbtitlebar__lights" aria-hidden>
            <span className="ds-wbtitlebar__light ds-wbtitlebar__light--close" />
            <span className="ds-wbtitlebar__light ds-wbtitlebar__light--min" />
            <span className="ds-wbtitlebar__light ds-wbtitlebar__light--max" />
          </div>
          <span className="ds-wbtitlebar__mode-chip">{title}</span>
          <span className="ds-wbtitlebar__context">{contextLabel(pathname)}</span>
        </div>
        <div className="ds-wbtitlebar__right">
          <SlotChip slots={slots} />
        </div>
      </header>

      <nav className="ds-activityrail" aria-label="主导航">
        <NavLink
          to="/"
          end
          className={() => `ds-activityrail__btn${homeActive ? ' is-active' : ''}`}
          title="今天"
          aria-label="今天"
        >
          <Icon name="home" size={16} />
          <span className="ds-activityrail__label">今天</span>
        </NavLink>
        <NavLink
          to="/themes"
          className={`ds-activityrail__btn${themesManageActive || themeActive ? ' is-active' : ''}`}
          title="主题"
          aria-label="我的主题"
        >
          <Icon name="layers" size={16} />
          <span className="ds-activityrail__label">主题</span>
        </NavLink>
        <div className="ds-activityrail__divider" />
        <div className="ds-activityrail__spacer" />
        <NavLink
          to="/review"
          className={({ isActive }) => `ds-activityrail__btn${isActive ? ' is-active' : ''}`}
          title="复盘"
          aria-label="周复盘"
        >
          <Icon name="scroll-text" size={16} />
          <span className="ds-activityrail__label">复盘</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={`ds-activityrail__btn${settingsActive ? ' is-active' : ''}`}
          title="设置"
          aria-label="设置"
        >
          <Icon name="settings" size={16} />
          <span className="ds-activityrail__label">设置</span>
        </NavLink>
      </nav>

      <main className="app-main" data-scroll-region="primary">
        <Outlet />
      </main>
    </div>
  )
}
