import { Outlet, NavLink } from 'react-router-dom'

const navItems = [
  { path: '/analysis', label: '分析' },
  { path: '/cubes', label: 'Cubes' },
  { path: '/views', label: 'Views' },
  { path: '/metrics', label: '指标' },
  { path: '/disambiguations', label: '澄清层' },
  { path: '/experiences', label: '经验层' },
  { path: '/optimizer', label: '优化' },
  { path: '/agents', label: 'Agent 配置' },
]

export default function Layout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav style={{
        display: 'flex',
        gap: '2rem',
        padding: '1rem 2rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#fff'
      }}>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              textDecoration: 'none',
              color: isActive ? '#2563eb' : '#374151',
              fontWeight: isActive ? '600' : '400',
              padding: '0.5rem 0',
              borderBottom: isActive ? '2px solid #2563eb' : 'none'
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
