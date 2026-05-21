import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export interface Metric {
  id: string
  name: string
  type: 'simple' | 'composite'
  description?: string
  aliases?: string[]
  disambiguation?: string

  // 简单指标
  view?: string
  measure?: string
  filter_sql?: string
  dimensions?: string[]

  // 复合指标
  formula?: string
  measure_map?: Record<string, string>
}

function DeleteDialog({ metric, onConfirm, onCancel }: { metric: Metric; onConfirm: () => void; onCancel: () => void }) {  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.75rem' }}>确认删除</h3>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          确定要删除指标 <strong style={{ color: '#111827' }}>{metric.name}</strong>（<code style={{ fontSize: '0.8125rem' }}>{metric.id}</code>）吗？此操作不可撤销。
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>取消</button>
          <button onClick={onConfirm} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.375rem', background: '#dc2626', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>删除</button>
        </div>
      </div>
    </div>
  )
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<Metric | null>(null)
  const navigate = useNavigate()

  async function loadMetrics() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/metrics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMetrics(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMetrics() }, [])

  async function handleDelete(metric: Metric) {
    try {
      const res = await fetch(`/api/metrics/${metric.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDeleting(null)
      await loadMetrics()
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  const filtered = metrics.filter(m => {
    return !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.id?.toLowerCase().includes(search.toLowerCase()) ||
      m.aliases?.some(a => a.toLowerCase().includes(search.toLowerCase()))
  })

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>指标</h1>
          {!loading && <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{metrics.length} 条</span>}
        </div>
        <Link to="/metrics/new" style={{ padding: '0.5rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
          + 新建指标
        </Link>
      </div>

      {/* 搜索 */}
      {metrics.length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索指标名称、别名…"
            style={{ flex: 1, padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none' }}
          />
        </div>
      )}

      {/* 内容区 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>加载中…</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {error} <button onClick={loadMetrics} style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
        </div>
      ) : metrics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>还没有指标</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '380px', margin: '0 auto 1.5rem' }}>
            指标是数据分析的核心单元，通过 AI 对话描述业务需求即可快速定义。
          </p>
          <Link to="/metrics/new" style={{ display: 'inline-block', padding: '0.625rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
            + 新建指标
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>没有符合条件的指标</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>指标名称</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>类型</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>计算口径</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => navigate(`/metrics/${m.id}`)}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.875rem' }}>{m.name}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.8125rem', marginTop: '0.125rem' }}>
                      <code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem' }}>{m.id}</code>
                      {m.aliases?.length ? <span style={{ marginLeft: '0.5rem' }}>{m.aliases.slice(0, 2).join(' · ')}</span> : null}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {m.type === 'simple'
                      ? <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: '500' }}>简单</span>
                      : <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', background: '#fdf4ff', color: '#7e22ce', border: '1px solid #e9d5ff', fontWeight: '500' }}>复合</span>
                    }
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.8125rem' }}>
                    {m.type === 'simple' ? (
                      <div>
                        <code style={{ color: '#1e40af' }}>{m.view}</code>
                        {m.measure && <span style={{ color: '#6b7280' }}> · <code style={{ color: '#15803d' }}>{m.measure}</code></span>}
                        {m.filter_sql && <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.125rem' }}>过滤: <code>{m.filter_sql}</code></div>}
                      </div>
                    ) : (
                      <div>
                        {m.formula && <code style={{ color: '#7c3aed', background: '#f5f3ff', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>{m.formula}</code>}
                        {m.measure_map && Object.keys(m.measure_map).length > 0 && (
                          <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {Object.entries(m.measure_map).slice(0, 2).map(([k, v]) => (
                              <span key={k} style={{ marginRight: '0.5rem' }}><code style={{ color: '#7c3aed' }}>{k}</code>={v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/metrics/${m.id}/edit`)} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>编辑</button>
                      <button onClick={() => setDeleting(m)} style={{ padding: '0.375rem 0.75rem', border: '1px solid #fca5a5', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#dc2626' }}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && <DeleteDialog metric={deleting} onConfirm={() => handleDelete(deleting)} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
