import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { slotSummaryParts, type SlotMap } from '../lib/slots'

function contextLabel(pathname: string) {
  if (pathname.startsWith('/settings')) return '设置'
  if (pathname.startsWith('/create')) return '新建主题'
  if (pathname.startsWith('/review')) return '周复盘'
  if (pathname === '/themes') return '我的主题'
  if (/\/themes\/[^/]+\/document\/ladder\/?$/.test(pathname)) return '学习阶梯'
  if (/\/themes\/[^/]+\/document\/resources\/?$/.test(pathname)) return '学习资料'
  if (/\/themes\/[^/]+\/document\/plan\/?$/.test(pathname)) return '学习计划'
  if (/\/themes\/[^/]+\/document\/?$/.test(pathname)) return '主题计划书'
  if (pathname.startsWith('/themes')) return '主题看板'
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

type NavItem = {
  to: string
  end?: boolean
  title: string
  label: string
  ariaLabel: string
  icon: 'home' | 'layers' | 'scroll-text' | 'settings'
  isActive: boolean
}

function NavButton({
  item,
  btnClass,
  labelClass,
}: {
  item: NavItem
  btnClass: string
  labelClass: string
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={`${btnClass}${item.isActive ? ' is-active' : ''}`}
      title={item.title}
      aria-label={item.ariaLabel}
    >
      <Icon name={item.icon} size={16} />
      <span className={labelClass}>{item.label}</span>
    </NavLink>
  )
}

function ActivityRail({ items }: { items: NavItem[] }) {
  const [home, themes, review, settings] = items
  return (
    <nav className="ds-activityrail" aria-label="主导航">
      <NavButton item={home} btnClass="ds-activityrail__btn" labelClass="ds-activityrail__label" />
      <NavButton item={themes} btnClass="ds-activityrail__btn" labelClass="ds-activityrail__label" />
      <div className="ds-activityrail__divider" />
      <div className="ds-activityrail__spacer" />
      <NavButton item={review} btnClass="ds-activityrail__btn" labelClass="ds-activityrail__label" />
      <NavButton item={settings} btnClass="ds-activityrail__btn" labelClass="ds-activityrail__label" />
    </nav>
  )
}

function MobileTabBar({ items }: { items: NavItem[] }) {
  return (
    <nav className="ds-mobile-tabbar" aria-label="底部导航">
      {items.map((item) => (
        <NavButton
          key={item.to}
          item={item}
          btnClass="ds-mobile-tabbar__btn"
          labelClass="ds-mobile-tabbar__label"
        />
      ))}
    </nav>
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
  const isIntercept = pathname.startsWith('/create/intercept')
  const isReview = pathname.startsWith('/review')

  const themesManageActive = pathname === '/themes'
  const themeActive = pathname.startsWith('/themes/')
  const settingsActive = pathname.startsWith('/settings')
  const homeActive = pathname === '/' && !themesManageActive && !themeActive

  const navItems: NavItem[] = [
    {
      to: '/',
      end: true,
      title: '今天',
      label: '今天',
      ariaLabel: '今天',
      icon: 'home',
      isActive: homeActive,
    },
    {
      to: '/themes',
      title: '主题',
      label: '主题',
      ariaLabel: '我的主题',
      icon: 'layers',
      isActive: themesManageActive || themeActive,
    },
    {
      to: '/review',
      title: '复盘',
      label: '复盘',
      ariaLabel: '周复盘',
      icon: 'scroll-text',
      isActive: isReview,
    },
    {
      to: '/settings',
      title: '设置',
      label: '设置',
      ariaLabel: '设置',
      icon: 'settings',
      isActive: settingsActive,
    },
  ]

  /* 共创 / 拦截：全屏聚焦，不带壳层导航 */
  if (isCocreate || isIntercept) {
    return (
      <div className={`app-shell app-shell--bare${isCocreate ? ' app-shell--cocreate' : ''}`}>
        <main className="app-main app-main--bare">
          <Outlet />
        </main>
      </div>
    )
  }

  /* 复盘：桌面无侧栏，手机保留底部 Tab */
  if (isReview) {
    return (
      <div className="app-shell app-shell--bare app-shell--with-tabbar">
        <main className="app-main app-main--bare">
          <Outlet />
        </main>
        <MobileTabBar items={navItems} />
      </div>
    )
  }

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

      <ActivityRail items={navItems} />

      <main className="app-main" data-scroll-region="primary">
        <Outlet />
      </main>

      <MobileTabBar items={navItems} />
    </div>
  )
}
