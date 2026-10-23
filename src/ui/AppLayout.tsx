import { Link, NavLink, Outlet } from 'react-router-dom'
import { LevelBar } from './components/LevelBar'
import { ToastHost } from './components/ToastHost'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`

export function AppLayout() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 px-4 py-2">
        <Link to="/" className="text-lg font-bold text-white">
          🧭 SQL Quest
        </Link>
        <nav className="flex gap-1">
          <NavLink to="/" end className={navClass}>
            Mapa
          </NavLink>
          <NavLink to="/playground" className={navClass}>
            Playground
          </NavLink>
          <NavLink to="/projeto" className={navClass}>
            Projeto
          </NavLink>
          <NavLink to="/conquistas" className={navClass}>
            Conquistas
          </NavLink>
        </nav>
        <div className="ml-auto">
          <LevelBar />
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      <ToastHost />
    </div>
  )
}
