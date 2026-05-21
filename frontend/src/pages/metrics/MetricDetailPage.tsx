import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Metric } from './MetricsPage'

type Tab = 'yaml' | 'json'

function toYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'boolean') return obj ? 'true' : 'false'
  if (typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') {
    if (obj.includes(':') || obj.includes('#') || obj.startsWith(' ')) {
      return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
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

export default function MetricDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [metric, setMetric] = useState<Metric | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('yaml')
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function loadMetric() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/metrics/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Metric = await res.json()
      setMetric(data)
      setEditorContent(toYaml(data, 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMetric() }, [id])

  function handleTabChange(newTab: Tab) {
    setTab(newTab)
    if (!metric) return
    setEditorContent(newTab === 'json' ? JSON.stringify(metric, null, 2) : toYaml(metric, 0))
  }

  async function handleSave() {
    if (!metric) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const body = tab === 'json' ? JSON.parse(editorContent) : metric
      const res = await fetch(`/api/metrics/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMetric(await res.json())
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
        {error} <button onClick={loadMetric} style={{ marginLeft: '1rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
      </div>
    </div>
  )
  if (!metric) return null

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      {/* 返回 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/metrics" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>← 返回指标</Link>
      </div>

      {/* 标题区 */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>{metric.name}</h1>
              {metric.type === 'simple'
                ? <span style={{ fontSize: '0.8125rem', padding: '0.1875rem 0.625rem', borderRadius: '9999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: '500' }}>简单指标</span>
                : <span style={{ fontSize: '0.8125rem', padding: '0.1875rem 0.625rem', borderRadius: '9999px', background: '#fdf4ff', color: '#7e22ce', border: '1px solid #e9d5ff', fontWeight: '500' }}>复合指标</span>
              }
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '0.8125rem', background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem' }}>{metric.id}</code>
              {metric.aliases?.length ? <span>别名：{metric.aliases.join('、')}</span> : null}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => navigate(`/metrics/${id}/edit`)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>向导编辑</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem', background: saving ? '#93c5fd' : '#2563eb', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>
              {saving ? '保存中…' : '保存终稿'}
            </button>
          </div>
        </div>

        {/* 指标口径速览 */}
        {metric.type === 'simple' ? (
          <div style={{ marginTop: '0.75rem', padding: '0.625rem 0.875rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.375rem', fontSize: '0.8125rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span><span style={{ color: '#6b7280' }}>View：</span><code style={{ color: '#1d4ed8' }}>{metric.view}</code></span>
            <span><span style={{ color: '#6b7280' }}>Measure：</span><code style={{ color: '#15803d' }}>{metric.measure}</code></span>
            {metric.filter_sql && <span><span style={{ color: '#6b7280' }}>过滤：</span><code style={{ color: '#374151' }}>{metric.filter_sql}</code></span>}
            {metric.dimensions?.length ? <span><span style={{ color: '#6b7280' }}>维度：</span>{metric.dimensions.join('、')}</span> : null}
          </div>
        ) : (
          <div style={{ marginTop: '0.75rem', padding: '0.625rem 0.875rem', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '0.375rem', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span><span style={{ color: '#6b7280' }}>公式：</span><code style={{ color: '#7e22ce' }}>{metric.formula}</code></span>
            </div>
            {metric.measure_map && Object.keys(metric.measure_map).length > 0 && (
              <div style={{ marginTop: '0.375rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {Object.entries(metric.measure_map).map(([k, v]) => (
                  <span key={k}><code style={{ color: '#7c3aed' }}>{k}</code> = <code style={{ color: '#1e40af' }}>{v}</code></span>
                ))}
              </div>
            )}
          </div>
        )}

        {saveMsg && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: saveMsg.includes('失败') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saveMsg.includes('失败') ? '#fecaca' : '#bbf7d0'}`, borderRadius: '0.375rem', fontSize: '0.8125rem', color: saveMsg.includes('失败') ? '#dc2626' : '#15803d' }}>
            {saveMsg}
          </div>
        )}
      </div>

      {/* Tab + 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex' }}>
          {(['yaml', 'json'] as Tab[]).map(t => (
            <button key={t} onClick={() => handleTabChange(t)} style={{ padding: '0.625rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: tab === t ? '600' : '400', color: tab === t ? '#2563eb' : '#6b7280', borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent', marginBottom: '-1px' }}>
              {t === 'yaml' ? 'YAML' : 'JSON'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '0.5rem' }}>
          <button onClick={() => { if (tab === 'json') { try { setEditorContent(JSON.stringify(JSON.parse(editorContent), null, 2)) } catch { } } else { setEditorContent(toYaml(metric, 0)) } }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>格式化</button>
          <button onClick={() => { navigator.clipboard.writeText(editorContent).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>{copied ? '已复制' : '复制'}</button>
        </div>
      </div>

      <textarea
        value={editorContent}
        onChange={e => setEditorContent(e.target.value)}
        spellCheck={false}
        style={{ width: '100%', minHeight: '450px', padding: '1rem', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: '0.8125rem', lineHeight: '1.6', color: '#111827', background: '#fafafa', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
      />
    </div>
  )
}
