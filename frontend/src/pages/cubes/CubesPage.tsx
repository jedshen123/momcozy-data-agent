import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

// ——— 类型定义（对应标准 cubes.yaml 格式）———

export interface CubeDimension {
  name: string
  type: string
  sql: string
  title: string
  description?: string
  primary_key?: boolean
  meta?: { ai_context?: string }
}

export interface MeasureFilter {
  sql: string
}

export interface CubeMeasure {
  name: string
  title: string
  type: string   // count_distinct / count / sum / min / max / avg
  sql: string    // "{CUBE}.field" 形式
  description?: string
  filters?: MeasureFilter[]
  meta?: { ai_context?: string }
}

export interface CubeJoin {
  name: string
  relationship: 'one_to_many' | 'many_to_one' | 'many_to_many'
  sql: string
}

export interface Cube {
  name: string
  title: string
  sql_table: string
  description?: string
  dimensions: CubeDimension[]
  measures: CubeMeasure[]
  joins?: CubeJoin[]
  meta?: { ai_context?: string }
}

// 删除确认对话框
function DeleteDialog({
  cubeName,
  title,
  onConfirm,
  onCancel,
}: {
  cubeName: string
  title: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#fff', borderRadius: '0.75rem', padding: '2rem',
        width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.75rem' }}>
          确认删除
        </h3>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          确定要删除 Cube <strong style={{ color: '#111827' }}>{title}</strong>（<code style={{ fontSize: '0.8125rem', color: '#4b5563' }}>{cubeName}</code>）吗？此操作不可撤销。
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>取消</button>
          <button onClick={onConfirm} style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.375rem', background: '#dc2626', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>删除</button>
        </div>
      </div>
    </div>
  )
}

// Cube 列表表格
function CubeTable({ cubes, onDelete }: { cubes: Cube[]; onDelete: (cube: Cube) => void }) {
  const navigate = useNavigate()
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
          <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cube 名称</th>
          <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>数仓表</th>
          <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>字段</th>
          <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {cubes.map(cube => {
          const fieldCount = (cube.dimensions?.length || 0) + (cube.measures?.length || 0)
          return (
            <tr
              key={cube.name}
              style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => navigate(`/cubes/${cube.name}`)}
            >
              <td style={{ padding: '1rem' }}>
                <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.875rem' }}>{cube.name}</div>
                <div style={{ color: '#9ca3af', fontSize: '0.8125rem', marginTop: '0.125rem' }}>{cube.title}</div>
              </td>
              <td style={{ padding: '1rem' }}>
                <code style={{ fontSize: '0.8125rem', color: '#4b5563', background: '#f3f4f6', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                  {cube.sql_table}
                </code>
              </td>
              <td style={{ padding: '1rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{fieldCount} 个字段</span>
              </td>
              <td style={{ padding: '1rem', textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/cubes/${cube.name}/edit`)}
                    style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => onDelete(cube)}
                    style={{ padding: '0.375rem 0.75rem', border: '1px solid #fca5a5', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#dc2626' }}
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>还没有 Cube</h3>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '360px', margin: '0 auto 1.5rem' }}>
        Cube 是物理语义层的基础单元，映射一张数仓表，并定义其中的维度和度量。
      </p>
      <Link to="/cubes/new" style={{ display: 'inline-block', padding: '0.625rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
        + 新建 Cube
      </Link>
    </div>
  )
}

export default function CubesPage() {
  const [cubes, setCubes] = useState<Cube[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<Cube | null>(null)

  async function loadCubes() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cubes')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCubes(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCubes() }, [])

  async function handleDelete(cube: Cube) {
    try {
      const res = await fetch(`/api/cubes/${cube.name}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDeleting(null)
      await loadCubes()
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  const filtered = cubes.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.sql_table?.toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>Cubes</h1>
          {!loading && <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{cubes.length} 个</span>}
        </div>
        <Link to="/cubes/new" style={{ padding: '0.5rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
          + 新建 Cube
        </Link>
      </div>

      {cubes.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索 Cube 名称、标题、数仓表…"
            style={{ width: '100%', padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>加载中…</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {error}
          <button onClick={loadCubes} style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
        </div>
      ) : cubes.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>没有匹配 "{search}" 的 Cube</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <CubeTable cubes={filtered} onDelete={setDeleting} />
        </div>
      )}

      {deleting && (
        <DeleteDialog
          cubeName={deleting.name}
          title={deleting.title || deleting.name}
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
