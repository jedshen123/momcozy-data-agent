import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export interface DisambiguationEntity {
  name: string
  definition: string
  entity_type: string
  entity_id?: string
}

export interface UsageScenario {
  condition: string
  use: string
}

export interface Disambiguation {
  id: string
  concept_a: DisambiguationEntity
  concept_b: DisambiguationEntity
  core_difference: string
  usage_scenarios?: UsageScenario[]
  auto_generated?: boolean
  created_at?: string
}

function DeleteDialog({ dis, onConfirm, onCancel }: { dis: Disambiguation; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.75rem' }}>确认删除</h3>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          确定要删除澄清条目 <strong style={{ color: '#111827' }}>{dis.concept_a.name} vs {dis.concept_b.name}</strong>（<code style={{ fontSize: '0.8125rem' }}>{dis.id}</code>）吗？此操作不可撤销。
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>取消</button>
          <button onClick={onConfirm} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.375rem', background: '#dc2626', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>删除</button>
        </div>
      </div>
    </div>
  )
}

export default function DisambiguationsPage() {
  const [items, setItems] = useState<Disambiguation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<Disambiguation | null>(null)
  const navigate = useNavigate()

  async function loadItems() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/disambiguations')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setItems(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [])

  async function handleDelete(dis: Disambiguation) {
    try {
      const res = await fetch(`/api/disambiguations/${dis.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDeleting(null)
      await loadItems()
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  const filtered = items.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      d.concept_a.name?.toLowerCase().includes(q) ||
      d.concept_b.name?.toLowerCase().includes(q) ||
      d.core_difference?.toLowerCase().includes(q) ||
      d.id?.toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>概念澄清</h1>
          {!loading && <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{items.length} 条</span>}
        </div>
        <Link to="/disambiguations/new" style={{ padding: '0.5rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
          + 新建澄清
        </Link>
      </div>

      {/* 搜索框 */}
      {items.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索概念名称、差异描述…"
            style={{ width: '100%', padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* 内容区 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>加载中…</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {error} <button onClick={loadItems} style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔀</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>还没有澄清条目</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            当 AI 分析时遇到相似概念混淆，可以通过澄清条目帮助 AI 正确理解和区分。
          </p>
          <Link to="/disambiguations/new" style={{ display: 'inline-block', padding: '0.625rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
            + 新建澄清
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>没有符合条件的澄清条目</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>概念对比</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>核心差异</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>场景数</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>来源</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr
                  key={d.id}
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => navigate(`/disambiguations/${d.id}`)}
                >
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: '600', color: '#1d4ed8', fontSize: '0.875rem' }}>{d.concept_a.name}</span>
                      <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>vs</span>
                      <span style={{ fontWeight: '600', color: '#15803d', fontSize: '0.875rem' }}>{d.concept_b.name}</span>
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      <code style={{ background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem' }}>{d.id}</code>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', maxWidth: '320px' }}>
                    <div style={{ color: '#374151', fontSize: '0.875rem', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {d.core_difference}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{d.usage_scenarios?.length ?? 0} 个</span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {d.auto_generated ? (
                      <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a', fontWeight: '500' }}>AI 生成</span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: '500' }}>人工</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/disambiguations/${d.id}/edit`)} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>编辑</button>
                      <button onClick={() => setDeleting(d)} style={{ padding: '0.375rem 0.75rem', border: '1px solid #fca5a5', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#dc2626' }}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && <DeleteDialog dis={deleting} onConfirm={() => handleDelete(deleting)} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
