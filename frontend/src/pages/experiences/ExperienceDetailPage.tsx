import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Experience } from './ExperiencesPage'

type Tab = 'summary' | 'yaml' | 'json'

function toYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'boolean') return obj ? 'true' : 'false'
  if (typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') {
    if (obj.includes(':') || obj.includes('#') || obj.startsWith(' ') || obj.includes('\n')) {
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

export default function ExperienceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [exp, setExp] = useState<Experience | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function loadExp() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/experiences/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Experience = await res.json()
      setExp(data)
      setEditorContent(toYaml(data, 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadExp() }, [id])

  function handleTabChange(newTab: Tab) {
    setTab(newTab)
    if (!exp) return
    if (newTab === 'json') setEditorContent(JSON.stringify(exp, null, 2))
    else if (newTab === 'yaml') setEditorContent(toYaml(exp, 0))
  }

  async function handleSave() {
    if (!exp) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const body = tab === 'json' ? JSON.parse(editorContent) : exp
      const res = await fetch(`/api/experiences/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setExp(await res.json())
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
        {error} <button onClick={loadExp} style={{ marginLeft: '1rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
      </div>
    </div>
  )
  if (!exp) return null

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/experiences" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>← 返回分析经验</Link>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <code style={{ fontSize: '0.8125rem', background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem', color: '#6b7280' }}>{exp.id}</code>
              {exp.source && <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>{exp.source}</span>}
              {exp.usage_count !== undefined && <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>· 调用 {exp.usage_count} 次</span>}
            </div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: '600', color: '#111827', lineHeight: '1.4', marginBottom: '0' }}>{exp.original_question}</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem' }}>
            <button onClick={() => navigate(`/experiences/${id}/edit`)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>编辑</button>
            <button onClick={handleSave} disabled={saving || tab === 'summary'} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem', background: (saving || tab === 'summary') ? '#93c5fd' : '#2563eb', cursor: (saving || tab === 'summary') ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>
              {saving ? '保存中…' : '保存终稿'}
            </button>
          </div>
        </div>
        {saveMsg && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: saveMsg.includes('失败') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saveMsg.includes('失败') ? '#fecaca' : '#bbf7d0'}`, borderRadius: '0.375rem', fontSize: '0.8125rem', color: saveMsg.includes('失败') ? '#dc2626' : '#15803d' }}>
            {saveMsg}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex' }}>
          {(['summary', 'yaml', 'json'] as Tab[]).map(t => (
            <button key={t} onClick={() => handleTabChange(t)} style={{ padding: '0.625rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: tab === t ? '600' : '400', color: tab === t ? '#2563eb' : '#6b7280', borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent', marginBottom: '-1px' }}>
              {t === 'summary' ? '摘要' : t === 'yaml' ? 'YAML' : 'JSON'}
            </button>
          ))}
        </div>
        {tab !== 'summary' && (
          <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.5rem' }}>
            <button onClick={() => { if (tab === 'json') { try { setEditorContent(JSON.stringify(JSON.parse(editorContent), null, 2)) } catch { } } else { setEditorContent(toYaml(exp, 0)) } }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>格式化</button>
            <button onClick={() => { navigator.clipboard.writeText(editorContent).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>{copied ? '已复制' : '复制'}</button>
          </div>
        )}
      </div>

      {tab === 'summary' ? (
        <div style={{ paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 分析结论 */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.625rem' }}>分析结论</h4>
            <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.7' }}>{exp.analysis_conclusion}</p>
          </div>

          {/* 相似问法 */}
          {exp.similar_questions && exp.similar_questions.length > 0 && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.625rem' }}>相似问法（{exp.similar_questions.length} 个）</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {exp.similar_questions.map((q, i) => (
                  <div key={i} style={{ padding: '0.5rem 0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#1d4ed8' }}>{q}</div>
                ))}
              </div>
            </div>
          )}

          {/* 执行路径 */}
          {exp.execution_path && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.625rem' }}>执行路径</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {exp.execution_path.metrics && exp.execution_path.metrics.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginRight: '0.5rem' }}>指标</span>
                    {exp.execution_path.metrics.map(m => (
                      <code key={m} style={{ fontSize: '0.8125rem', background: '#eff6ff', color: '#1e40af', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', marginRight: '0.375rem' }}>{m}</code>
                    ))}
                  </div>
                )}
                {exp.execution_path.views && exp.execution_path.views.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginRight: '0.5rem' }}>View</span>
                    {exp.execution_path.views.map(v => (
                      <code key={v} style={{ fontSize: '0.8125rem', background: '#f0fdf4', color: '#166534', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', marginRight: '0.375rem' }}>{v}</code>
                    ))}
                  </div>
                )}
                {exp.execution_path.filters && exp.execution_path.filters.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginRight: '0.5rem' }}>过滤条件</span>
                    {exp.execution_path.filters.map((f, i) => (
                      <code key={i} style={{ fontSize: '0.8125rem', background: '#f3f4f6', color: '#4b5563', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', marginRight: '0.375rem' }}>{f.field} {f.operator} {f.value}</code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={editorContent}
          onChange={e => setEditorContent(e.target.value)}
          spellCheck={false}
          style={{ width: '100%', minHeight: '450px', padding: '1rem', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: '0.8125rem', lineHeight: '1.6', color: '#111827', background: '#fafafa', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      )}
    </div>
  )
}
