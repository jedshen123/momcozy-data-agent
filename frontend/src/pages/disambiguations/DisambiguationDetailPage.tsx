import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Disambiguation } from './DisambiguationsPage'

type Tab = 'card' | 'yaml' | 'json'

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

export default function DisambiguationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [dis, setDis] = useState<Disambiguation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('card')
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function loadDis() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/disambiguations/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Disambiguation = await res.json()
      setDis(data)
      setEditorContent(toYaml(data, 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDis() }, [id])

  function handleTabChange(newTab: Tab) {
    setTab(newTab)
    if (!dis) return
    if (newTab === 'json') setEditorContent(JSON.stringify(dis, null, 2))
    else if (newTab === 'yaml') setEditorContent(toYaml(dis, 0))
  }

  async function handleSave() {
    if (!dis) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const body = tab === 'json' ? JSON.parse(editorContent) : dis
      const res = await fetch(`/api/disambiguations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDis(await res.json())
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
        {error} <button onClick={loadDis} style={{ marginLeft: '1rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
      </div>
    </div>
  )
  if (!dis) return null

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/disambiguations" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>← 返回概念澄清</Link>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>
                <span style={{ color: '#1d4ed8' }}>{dis.concept_a.name}</span>
                <span style={{ color: '#9ca3af', margin: '0 0.5rem' }}>vs</span>
                <span style={{ color: '#15803d' }}>{dis.concept_b.name}</span>
              </h1>
              {dis.auto_generated && (
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a', fontWeight: '500' }}>AI 生成</span>
              )}
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              <code style={{ fontSize: '0.8125rem', background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem' }}>{dis.id}</code>
              {dis.usage_scenarios?.length ? <span style={{ marginLeft: '0.5rem' }}>· {dis.usage_scenarios.length} 个使用场景</span> : null}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => navigate(`/disambiguations/${id}/edit`)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>编辑</button>
            <button onClick={handleSave} disabled={saving || tab === 'card'} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem', background: (saving || tab === 'card') ? '#93c5fd' : '#2563eb', cursor: (saving || tab === 'card') ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>
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
          {(['card', 'yaml', 'json'] as Tab[]).map(t => (
            <button key={t} onClick={() => handleTabChange(t)} style={{ padding: '0.625rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: tab === t ? '600' : '400', color: tab === t ? '#2563eb' : '#6b7280', borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent', marginBottom: '-1px' }}>
              {t === 'card' ? '对比卡片' : t === 'yaml' ? 'YAML' : 'JSON'}
            </button>
          ))}
        </div>
        {tab !== 'card' && (
          <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.5rem' }}>
            <button onClick={() => { if (tab === 'json') { try { setEditorContent(JSON.stringify(JSON.parse(editorContent), null, 2)) } catch { } } else { setEditorContent(toYaml(dis, 0)) } }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>格式化</button>
            <button onClick={() => { navigator.clipboard.writeText(editorContent).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>{copied ? '已复制' : '复制'}</button>
          </div>
        )}
      </div>

      {tab === 'card' ? (
        <div style={{ paddingTop: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ border: '2px solid #bfdbfe', borderRadius: '0.75rem', padding: '1.25rem', background: '#eff6ff' }}>
              <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>概念 A</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1e3a8a', marginBottom: '0.5rem' }}>{dis.concept_a.name}</h3>
              <p style={{ fontSize: '0.875rem', color: '#1d4ed8', lineHeight: '1.6', marginBottom: '0.75rem' }}>{dis.concept_a.definition}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>{dis.concept_a.entity_type}</span>
                {dis.concept_a.entity_id && <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#fff', color: '#3b82f6', border: '1px solid #bfdbfe' }}>{dis.concept_a.entity_id}</span>}
              </div>
            </div>
            <div style={{ border: '2px solid #bbf7d0', borderRadius: '0.75rem', padding: '1.25rem', background: '#f0fdf4' }}>
              <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>概念 B</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#14532d', marginBottom: '0.5rem' }}>{dis.concept_b.name}</h3>
              <p style={{ fontSize: '0.875rem', color: '#15803d', lineHeight: '1.6', marginBottom: '0.75rem' }}>{dis.concept_b.definition}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>{dis.concept_b.entity_type}</span>
                {dis.concept_b.entity_id && <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#fff', color: '#22c55e', border: '1px solid #bbf7d0' }}>{dis.concept_b.entity_id}</span>}
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.25rem', background: '#fff' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>核心差异</h4>
            <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.7' }}>{dis.core_difference}</p>
          </div>

          {dis.usage_scenarios && dis.usage_scenarios.length > 0 && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>使用场景（{dis.usage_scenarios.length} 个）</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {dis.usage_scenarios.map((s, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>触发条件</div>
                      <div style={{ fontSize: '0.875rem', color: '#374151' }}>{s.condition}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>使用哪个</div>
                      <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>{s.use}</div>
                    </div>
                  </div>
                ))}
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
