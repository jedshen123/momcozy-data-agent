import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export interface ViewCubePath {
  join_path: string
  includes: string[]
  prefix?: boolean
}

export interface View {
  name: string
  title: string
  description?: string
  cubes: ViewCubePath[]
  meta?: { ai_context?: string }
}

function DeleteDialog({
  view,
  onConfirm,
  onCancel,
}: {
  view: View
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.75rem' }}>确认删除</h3>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          确定要删除 View <strong style={{ color: '#111827' }}>{view.title || view.name}</strong>（<code style={{ fontSize: '0.8125rem', color: '#4b5563' }}>{view.name}</code>）吗？此操作不可撤销。
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>取消</button>
          <button onClick={onConfirm} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.375rem', background: '#dc2626', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>删除</button>
        </div>
      </div>
    </div>
  )
}

export default function ViewsPage() {
  const [views, setViews] = useState<View[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<View | null>(null)
  const navigate = useNavigate()

  async function loadViews() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/views')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setViews(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadViews() }, [])

  async function handleDelete(view: View) {
    try {
      const res = await fetch(`/api/views/${view.name}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDeleting(null)
      await loadViews()
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  const filtered = views.filter(v => {
    if (!search) return true
    const q = search.toLowerCase()
    return v.name?.toLowerCase().includes(q) || v.title?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>Views</h1>
          {!loading && <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{views.length} 个</span>}
        </div>
        <Link to="/views/new" style={{ padding: '0.5rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
          + 新建 View
        </Link>
      </div>

      {views.length > 0 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索 View 名称、标题、说明…"
          style={{ width: '100%', padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>加载中…</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {error}
          <button onClick={loadViews} style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
        </div>
      ) : views.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔭</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>还没有 View</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '360px', margin: '0 auto 1.5rem' }}>
            View 是面向 LLM 的逻辑查询层，通过 join_path 组合多个 Cube 并暴露指定字段。
          </p>
          <Link to="/views/new" style={{ display: 'inline-block', padding: '0.625rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
            + 新建 View
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>没有匹配 "{search}" 的 View</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>View 名称</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cube 路径</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr
                  key={v.name}
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => navigate(`/views/${v.name}`)}
                >
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.875rem' }}>{v.name}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.8125rem', marginTop: '0.125rem' }}>{v.title}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {v.cubes?.map((cp, i) => (
                        <span key={i} style={{ fontSize: '0.75rem', color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.125rem 0.375rem', borderRadius: '9999px', fontFamily: 'monospace' }}>
                          {cp.join_path}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/views/${v.name}/edit`)} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>编辑</button>
                      <button onClick={() => setDeleting(v)} style={{ padding: '0.375rem 0.75rem', border: '1px solid #fca5a5', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#dc2626' }}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <DeleteDialog
          view={deleting}
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
