import { NavLink, Outlet } from 'react-router-dom'
import './AppShell.css'

const phaseLabel: Record<string, string> = {
  learning: '学',
  practice: '练',
  application: '用',
}

export function AppShell({
  title = '刻意练习',
  slots,
}: {
  title?: string
  slots?: Record<string, { used: number; max: number }>
}) {
  return (
    <div className="app-shell">
      <header className="ds-wbtitlebar">
        <div className="ds-wbtitlebar__left">
          <div className="ds-wbtitlebar__lights" aria-hidden>
            <span className="ds-wbtitlebar__light ds-wbtitlebar__light--close" />
            <span className="ds-wbtitlebar__light ds-wbtitlebar__light--min" />
            <span className="ds-wbtitlebar__light ds-wbtitlebar__light--max" />
          </div>
          <span className="ds-wbtitlebar__mode-chip">{title}</span>
          {slots && (
            <span className="slot-chip">
              {(['learning', 'practice', 'application'] as const).map((p) => (
                <span key={p}>
                  {phaseLabel[p]} {slots[p]?.used ?? 0}/{slots[p]?.max ?? 0}
                </span>
              ))}
            </span>
          )}
        </div>
      </header>

      <nav className="ds-activityrail" aria-label="主导航">
        <NavLink to="/" className={({ isActive }) => `ds-activityrail__btn${isActive ? ' is-active' : ''}`} title="今天">
          <RailIcon label="今" />
        </NavLink>
        <NavLink to="/review" className={({ isActive }) => `ds-activityrail__btn${isActive ? ' is-active' : ''}`} title="周复盘">
          <RailIcon label="复" />
        </NavLink>
        <div className="ds-activityrail__spacer" />
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

function RailIcon({ label }: { label: string }) {
  return <span className="rail-glyph">{label}</span>
}
