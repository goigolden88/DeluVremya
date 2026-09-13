import { NavLink, Outlet } from 'react-router-dom'

/**
 * Нижняя панель: только то, что открывают каждый день. Вкладки прибавляются
 * вместе с экранами, по этапам.
 *
 * «Настроек» здесь нет намеренно, как и в «Дневниках»: в них заходят раз
 * в месяц, и живут они шестерёнкой в шапке «Сегодня».
 */
const TABS = [{ to: '/', label: 'Сегодня', end: true }]

export function Layout() {
  return (
    <div className="layout">
      <main className="content">
        <Outlet />
      </main>

      <nav className="tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? 'tab tab--active' : 'tab')}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
