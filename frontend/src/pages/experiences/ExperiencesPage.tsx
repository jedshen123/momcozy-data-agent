import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export interface ExecutionPath {
  metrics?: string[]
  views?: string[]
  filters?: Array<{ field: string; operator: string; value: string }>
}

export interface Experience {
  id: string
  original_question: string
  analysis_conclusion: string
  similar_questions?: string[]
  execution_path?: ExecutionPath
  version_lock?: Record<string, unknown>
  created_at?: string
  usage_count?: number
  source?: string
}

function HeatBar({ count = 0 }: { count: number }) {
  const max = 20
  const level = Math.min(Math.ceil((count / max) * 5), 5)
  const colors = ['#e5e7eb', '#bfdbfe', '#93c3fb', '#3b82f6', '#1d4ed8', '#1e3a8a']
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ width: '8px', height: '14px', borderRadius: '2px', background: i <= level ? colors[level] : colors[0] }} />
      ))}
      <span style={{ marginLeft: '4px', fontSize: '0.75rem', color: '#9ca3af' }}>{count}</span>
    </div>
  )
}

function DeleteDialog({ exp, onConfirm, onCancel }: { exp: Experience; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.75rem' }}>确认删除</h3>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          确定要删除经验条目 <code style={{ fontSize: '0.8125rem' }}>{exp.id}</code> 吗？此操作不可撤销。
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>取消</button>
          <button onClick={onConfirm} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.375rem', background: '#dc2626', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>删除</button>
        </div>
      </div>
    </div>
  )
}

export default function ExperiencesPage() {
  const [items, setItems] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [deleting, setDeleting] = useState<Experience | null>(null)
  const navigate = useNavigate()

  async function loadItems() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/experiences')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setItems(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [])

  async function handleDelete(exp: Experience) {
    try {
      const res = await fetch(`/api/experiences/${exp.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDeleting(null)
      await loadItems()
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  const sources = [...new Set(items.map(i => i.source).filter(Boolean))] as string[]

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      i.original_question?.toLowerCase().includes(q) ||
      i.analysis_conclusion?.toLowerCase().includes(q) ||
      i.id?.toLowerCase().includes(q) ||
      i.similar_questions?.some(s => s.toLowerCase().includes(q))
    const matchSource = sourceFilter === 'all' || i.source === sourceFilter
    return matchSearch && matchSource
  })

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>分析经验</h1>
          {!loading && <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{items.length} 条</span>}
        </div>
        <Link to="/experiences/new" style={{ padding: '0.5rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
          + 新建经验
        </Link>
      </div>

      {/* 搜索 + 筛选 */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索问题、结论、相似问法…"
            style={{ flex: 1, padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none' }}
          />
          {sources.length > 0 && (
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', background: '#fff', cursor: 'pointer', outline: 'none' }}>
              <option value="all">全部来源</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
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
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>还没有分析经验</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            将已解决的分析问题沉淀为经验，帮助 AI 理解业务背景，避免重复踩坑。
          </p>
          <Link to="/experiences/new" style={{ display: 'inline-block', padding: '0.625rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
            + 新建经验
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>没有符合条件的经验条目</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(exp => (
            <div
              key={exp.id}
              style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              onClick={() => navigate(`/experiences/${exp.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
                    <code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem', color: '#6b7280' }}>{exp.id}</code>
                    {exp.source && <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>{exp.source}</span>}
                  </div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#111827', marginBottom: '0.375rem', lineHeight: '1.4' }}>{exp.original_question}</div>
                  <div style={{ fontSize: '0.8125rem', color: '#6b7280', lineHeight: '1.5', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {exp.analysis_conclusion}
                  </div>
                  {exp.similar_questions && exp.similar_questions.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {exp.similar_questions.slice(0, 3).map((q, i) => (
                        <span key={i} style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '0.25rem', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe' }}>{q}</span>
                      ))}
                      {exp.similar_questions.length > 3 && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>+{exp.similar_questions.length - 3}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
                  <HeatBar count={exp.usage_count ?? 0} />
                  <div style={{ display: 'flex', gap: '0.375rem' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => navigate(`/experiences/${exp.id}/edit`)} style={{ padding: '0.25rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#374151' }}>编辑</button>
                    <button onClick={() => setDeleting(exp)} style={{ padding: '0.25rem 0.625rem', border: '1px solid #fca5a5', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#dc2626' }}>删除</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleting && <DeleteDialog exp={deleting} onConfirm={() => handleDelete(deleting)} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
