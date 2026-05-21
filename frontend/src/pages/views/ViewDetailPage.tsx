import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { View } from './ViewsPage'

type Tab = 'yaml' | 'json' | 'paths'

function toYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'boolean') return obj ? 'true' : 'false'
  if (typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') {
    if (obj.includes(':') || obj.includes('#') || obj.includes('\n') || obj.startsWith(' ') || obj.startsWith('`') || obj.includes('{')) {
      return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
    }
    return obj
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return obj.map(item => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>)
        if (entries.length === 0) return `${pad}-`
        const [k0, v0] = entries[0]
        const rest = entries.slice(1).map(([k, v]) => `${pad}  ${k}: ${toYaml(v, indent + 1)}`).join('\n')
        const firstLine = `${pad}- ${k0}: ${toYaml(v0, indent + 1)}`
        return rest ? `${firstLine}\n${rest}` : firstLine
      }
      return `${pad}- ${toYaml(item, indent + 1)}`
    }).join('\n')
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    return entries.map(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) return `${pad}${k}:\n${toYaml(v, indent + 1)}`
      if (Array.isArray(v)) return (v as unknown[]).length === 0 ? `${pad}${k}: []` : `${pad}${k}:\n${toYaml(v, indent + 1)}`
      return `${pad}${k}: ${toYaml(v, indent + 1)}`
    }).join('\n')
  }
  return String(obj)
}

export default function ViewDetailPage() {
  const { viewId } = useParams<{ viewId: string }>()
  const navigate = useNavigate()
  const [view, setView] = useState<View | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('yaml')
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function loadView() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/views/${viewId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: View = await res.json()
      setView(data)
      setEditorContent(toYaml(data, 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadView() }, [viewId])

  function handleTabChange(newTab: Tab) {
    setTab(newTab)
    if (!view) return
    if (newTab === 'yaml') setEditorContent(toYaml(view, 0))
    else if (newTab === 'json') setEditorContent(JSON.stringify(view, null, 2))
  }

  async function handleSave() {
    if (!view) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const body = tab === 'json' ? JSON.parse(editorContent) : view
      const res = await fetch(`/api/views/${viewId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setView(await res.json())
      setSaveMsg('已保存')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setSaveMsg(e instanceof Error ? `保存失败: ${e.message}` : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>加载中…</div>
  if (error) return (
    <div style={{ padding: '2rem' }}>
      <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
        {error} <button onClick={loadView} style={{ marginLeft: '1rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
      </div>
    </div>
  )
  if (!view) return null

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/views" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>← 返回 Views</Link>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>{view.name}</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              {view.title}
              {view.cubes?.length > 0 && ` · ${view.cubes.length} 条 Cube 路径`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => navigate(`/views/${viewId}/edit`)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>向导编辑</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem', background: saving ? '#93c5fd' : '#2563eb', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>
              {saving ? '保存中…' : '保存终稿'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.375rem', fontSize: '0.8125rem', color: '#1d4ed8' }}>
          AI 与向导收敛后的 View 定义终稿 · 可直接编辑后保存
        </div>
        {saveMsg && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: saveMsg.includes('失败') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saveMsg.includes('失败') ? '#fecaca' : '#bbf7d0'}`, borderRadius: '0.375rem', fontSize: '0.8125rem', color: saveMsg.includes('失败') ? '#dc2626' : '#15803d' }}>
            {saveMsg}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex' }}>
          {(['yaml', 'json', 'paths'] as Tab[]).map(t => (
            <button key={t} onClick={() => handleTabChange(t)} style={{ padding: '0.625rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: tab === t ? '600' : '400', color: tab === t ? '#2563eb' : '#6b7280', borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent', marginBottom: '-1px' }}>
              {t === 'yaml' ? 'YAML' : t === 'json' ? 'JSON' : 'Cube 路径'}
            </button>
          ))}
        </div>
        {tab !== 'paths' && (
          <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.5rem' }}>
            <button onClick={() => { if (tab === 'json') { try { setEditorContent(JSON.stringify(JSON.parse(editorContent), null, 2)) } catch { } } else { setEditorContent(toYaml(view, 0)) } }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>格式化</button>
            <button onClick={() => { navigator.clipboard.writeText(editorContent).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>{copied ? '已复制' : '复制'}</button>
          </div>
        )}
      </div>

      {tab === 'paths' ? (
        <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', overflow: 'hidden' }}>
          {view.cubes?.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>暂无 Cube 路径</div>
          )}
          {view.cubes?.map((cp, i) => (
            <div key={i} style={{ borderBottom: '1px solid #f3f4f6', padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <code style={{ color: '#1e40af', fontSize: '0.875rem', fontWeight: '500' }}>{cp.join_path}</code>
                {cp.prefix && (
                  <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>prefix</span>
                )}
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>{cp.includes?.length || 0} 个字段</span>
              </div>
              {cp.includes?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {cp.includes.map(f => (
                    <span key={f} style={{ fontSize: '0.75rem', color: '#4b5563', background: '#f3f4f6', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontFamily: 'monospace' }}>{f}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {view.description && (
            <div style={{ padding: '0.875rem 1rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>说明</div>
              <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: '1.6' }}>{view.description}</div>
            </div>
          )}
          {view.meta?.ai_context && (
            <div style={{ padding: '0.875rem 1rem', background: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>AI Context</div>
              <pre style={{ fontSize: '0.8125rem', color: '#374151', lineHeight: '1.6', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{view.meta.ai_context}</pre>
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={editorContent}
          onChange={e => setEditorContent(e.target.value)}
          spellCheck={false}
          style={{ width: '100%', minHeight: '500px', padding: '1rem', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace', fontSize: '0.8125rem', lineHeight: '1.6', color: '#111827', background: '#fafafa', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      )}
    </div>
  )
}
