import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

function noop() {
  /* 原型壳层入口：本阶段仅视觉，不接产品功能 */
}

function projectLabel(pathname: string) {
  if (pathname.startsWith('/settings')) return '设置'
  if (pathname.startsWith('/create')) return '新建主题'
  if (pathname.startsWith('/review')) return '周复盘'
  if (pathname.startsWith('/themes')) return '主题执行'
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day} · 今天`
}

export function AppShell({
  title = '刻意练习',
}: {
  title?: string
  slots?: Record<string, { used: number; max: number }>
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

  const themeActive = pathname.startsWith('/themes')
  const settingsActive = pathname.startsWith('/settings')

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
          <button className="ds-wbtitlebar__project-selector" type="button" onClick={noop}>
            <span>{projectLabel(pathname)}</span>
            <Icon name="chevron-down" size={12} className="icon" />
          </button>
        </div>
        <div className="ds-wbtitlebar__right">
          <button className="ds-wbtitlebar__iconbtn" type="button" aria-label="搜索" onClick={noop}>
            <Icon name="search" size={16} className="icon" />
          </button>
          <button className="ds-wbtitlebar__iconbtn" type="button" aria-label="通知" onClick={noop}>
            <Icon name="bell" size={16} className="icon" />
          </button>
          <NavLink
            to="/settings"
            className="ds-wbtitlebar__iconbtn"
            aria-label="设置"
            title="设置"
          >
            <Icon name="settings" size={16} className="icon" />
          </NavLink>
        </div>
      </header>

      <nav className="ds-activityrail" aria-label="主导航">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `ds-activityrail__btn${isActive && !themeActive ? ' is-active' : ''}`}
          title="今天"
          aria-label="今天"
        >
          <Icon name="home" size={16} />
        </NavLink>
        <button
          className={`ds-activityrail__btn${themeActive ? ' is-active' : ''}`}
          type="button"
          title="我的主题"
          aria-label="我的主题"
          onClick={noop}
        >
          <Icon name="layers" size={16} />
        </button>
        <button
          className="ds-activityrail__btn"
          type="button"
          title="日历"
          aria-label="日历"
          onClick={noop}
        >
          <Icon name="calendar" size={16} />
        </button>
        <div className="ds-activityrail__divider" />
        <div className="ds-activityrail__spacer" />
        <NavLink
          to="/review"
          className={({ isActive }) => `ds-activityrail__btn${isActive ? ' is-active' : ''}`}
          title="周复盘"
          aria-label="周复盘"
        >
          <Icon name="scroll-text" size={16} />
        </NavLink>
        <NavLink
          to="/settings"
          className={`ds-activityrail__btn${settingsActive ? ' is-active' : ''}`}
          title="设置"
          aria-label="设置"
        >
          <Icon name="settings" size={16} />
        </NavLink>
      </nav>

      <main className="app-main" data-scroll-region="primary">
        <Outlet />
      </main>
    </div>
  )
}
