import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// ——— 类型定义 ———

interface DWTable {
  id: string
  name: string
  schema: string
  display_name: string
  description: string
  column_count: number
  update_frequency?: string
}

interface DWColumn {
  name: string
  type: string
  display_name: string
  comment?: string
}

type FieldRole = 'dimension' | 'measure'
type MeasureType = 'count_distinct' | 'count' | 'sum' | 'min' | 'max' | 'avg'
type JoinRelationship = 'one_to_many' | 'many_to_one' | 'many_to_many'

interface FieldDraft {
  id: string           // React key（内部）
  name: string
  role: FieldRole
  // 维度字段
  type: string         // string / number / boolean / date 等
  sql: string          // SQL 表达式，通常等于字段名
  title: string        // 中文标题
  description: string
  primary_key?: boolean
  // 度量字段
  measure_type?: MeasureType
  filters_sql?: string  // 对应 filters[0].sql
  // 通用
  ai_context: string   // meta.ai_context
}

interface JoinDraft {
  name: string
  relationship: JoinRelationship
  sql: string
}

interface CubeDraft {
  name: string
  title: string
  sql_table: string
  description: string
  ai_context: string   // meta.ai_context
  fields: FieldDraft[]
  joins: JoinDraft[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type Stage = 1 | 2 | 3 | 4

// ——— 工具函数 ———

let _fieldIdCounter = 0
function newFieldId() { return `f_${++_fieldIdCounter}_${Date.now()}` }

function guessRole(col: DWColumn): FieldRole {
  const t = col.type.toLowerCase()
  if (t.startsWith('decimal') || t === 'bigint' || t === 'double' || t === 'float') return 'measure'
  const n = col.name.toLowerCase()
  if (n.endsWith('_count') || n.endsWith('_num') || n.endsWith('_amount') || n.endsWith('_cnt') || n.endsWith('_sum')) return 'measure'
  return 'dimension'
}

function guessMeasureType(col: DWColumn): MeasureType {
  const n = col.name.toLowerCase()
  if (n.endsWith('_rate') || n.endsWith('_ratio') || n.endsWith('_pct') || n.endsWith('_avg')) return 'avg'
  if (n === 'uid' || n.endsWith('_uid') || n.endsWith('_id')) return 'count_distinct'
  return 'sum'
}

// ——— 阶段一：选表 ———

function Stage1TableSelector({ onSelect }: { onSelect: (table: DWTable, columns: DWColumn[]) => void }) {
  const [tables, setTables] = useState<DWTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selecting, setSelecting] = useState<string | null>(null)

  async function loadTables() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/tables')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTables(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTables() }, [])

  async function handleSelect(table: DWTable) {
    setSelecting(table.id); setError(null)
    try {
      const res = await fetch(`/api/tables/${table.id}/columns`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      onSelect(table, data.columns)
    } catch (e) { setError(e instanceof Error ? e.message : '加载字段失败'); setSelecting(null) }
  }

  const filtered = tables.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.display_name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827', marginBottom: '0.375rem' }}>选择数仓表</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>从数仓元数据中选择一张表，AI 将自动分析字段结构并生成 Cube 草稿</p>
      </div>
      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {error} <button onClick={loadTables} style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
        </div>
      )}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索表名、描述、schema…" style={{ width: '100%', padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }} />
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>加载中…</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>表名</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Schema</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>字段数</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '500', color: '#111827', fontSize: '0.875rem' }}>{t.name}</div>
                    <div style={{ color: '#6b7280', fontSize: '0.8125rem', marginTop: '0.125rem' }}>{t.display_name}</div>
                    {t.description && <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.125rem' }}>{t.description}</div>}
                  </td>
                  <td style={{ padding: '1rem' }}><code style={{ fontSize: '0.8125rem', color: '#4b5563', background: '#f3f4f6', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>{t.schema}</code></td>
                  <td style={{ padding: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>{t.column_count} 个</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button onClick={() => handleSelect(t)} disabled={selecting === t.id} style={{ padding: '0.375rem 0.875rem', border: 'none', borderRadius: '0.375rem', background: selecting === t.id ? '#93c5fd' : '#2563eb', cursor: selecting === t.id ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', color: '#fff', fontWeight: '500' }}>
                      {selecting === t.id ? '加载中…' : '选择'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ——— 字段配置组件 ———

const DIMENSION_TYPES = ['string', 'number', 'boolean', 'date', 'time', 'object']
const MEASURE_TYPES: MeasureType[] = ['count_distinct', 'count', 'sum', 'min', 'max', 'avg']

function FieldSection({ role, fields, allFields, onChange }: {
  role: FieldRole
  fields: FieldDraft[]        // 该 role 的字段（含原始索引）
  allFields: FieldDraft[]     // 全量字段，用于写回
  onChange: (fields: FieldDraft[]) => void
}) {
  const isDim = role === 'dimension'

  function updateField(id: string, patch: Partial<FieldDraft>) {
    onChange(allFields.map(f => f.id === id ? { ...f, ...patch } : f))
  }
  function removeField(id: string) {
    onChange(allFields.filter(f => f.id !== id))
  }
  function addField() {
    onChange([...allFields, {
      id: newFieldId(),
      name: '',
      role,
      type: 'string',
      sql: '',
      title: '',
      description: '',
      measure_type: role === 'measure' ? 'count' : undefined,
      filters_sql: '',
      ai_context: '',
    }])
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: isDim ? '#1e40af' : '#6d28d9' }}>
          {isDim ? 'Dimensions 维度' : 'Measures 度量'}
          <span style={{ marginLeft: '0.375rem', fontWeight: '400', color: '#9ca3af' }}>{fields.length}</span>
        </span>
        <button
          onClick={addField}
          style={{ padding: '0.2rem 0.625rem', border: `1px solid ${isDim ? '#2563eb' : '#7c3aed'}`, borderRadius: '0.375rem', background: isDim ? '#eff6ff' : '#f5f3ff', cursor: 'pointer', fontSize: '0.75rem', color: isDim ? '#2563eb' : '#7c3aed', fontWeight: '500' }}
        >+ 添加</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {fields.map((f, sectionIdx) => (
          <div key={f.id} style={{ border: `1px solid ${isDim ? '#bfdbfe' : '#ddd6fe'}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
            {/* 首行：序号 / 字段名 / 标题 / 删除 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.625rem', background: isDim ? '#eff6ff' : '#f5f3ff' }}>
              <span style={{ flex: '0 0 20px', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sectionIdx + 1}</span>
              <input
                value={f.name}
                onChange={e => {
                  const name = e.target.value
                  updateField(f.id, { name, ...(f.sql === f.name || f.sql === '' ? { sql: name } : {}) })
                }}
                placeholder="字段名"
                style={{ flex: '0 0 140px', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8125rem', fontFamily: 'monospace', outline: 'none', background: '#fff' }}
              />
              <input
                value={f.title}
                onChange={e => updateField(f.id, { title: e.target.value })}
                placeholder="中文标题"
                style={{ flex: 1, padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8125rem', outline: 'none', background: '#fff' }}
              />
              <button
                onClick={() => removeField(f.id)}
                title="删除此字段"
                style={{ flex: '0 0 auto', width: '1.5rem', height: '1.5rem', border: 'none', borderRadius: '0.25rem', background: '#fee2e2', cursor: 'pointer', color: '#dc2626', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>

            {/* 详细属性 */}
            <div style={{ padding: '0.5rem 0.625rem', background: '#fff', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem 0.625rem' }}>
              {isDim ? (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>类型 (type)</label>
                    <select value={f.type} onChange={e => updateField(f.id, { type: e.target.value })} style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', background: '#fff', boxSizing: 'border-box' }}>
                      {DIMENSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>SQL 表达式 (sql)</label>
                    <input value={f.sql} onChange={e => updateField(f.id, { sql: e.target.value })} placeholder={f.name || 'field_name'} style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>描述 (description)</label>
                    <input value={f.description} onChange={e => updateField(f.id, { description: e.target.value })} placeholder="字段业务含义" style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>AI 提示 (meta.ai_context)</label>
                    <input value={f.ai_context} onChange={e => updateField(f.id, { ai_context: e.target.value })} placeholder="帮助 AI 理解该字段" style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', paddingTop: '1.125rem' }}>
                    <input type="checkbox" id={`pk_${f.id}`} checked={!!f.primary_key} onChange={e => updateField(f.id, { primary_key: e.target.checked })} style={{ cursor: 'pointer', width: '0.875rem', height: '0.875rem' }} />
                    <label htmlFor={`pk_${f.id}`} style={{ fontSize: '0.8125rem', color: '#374151', cursor: 'pointer' }}>主键 (primary_key)</label>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>聚合类型 (type)</label>
                    <select value={f.measure_type || 'count'} onChange={e => updateField(f.id, { measure_type: e.target.value as MeasureType })} style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', background: '#fff', boxSizing: 'border-box' }}>
                      {MEASURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>SQL 字段 (sql)</label>
                    <input value={f.sql} onChange={e => updateField(f.id, { sql: e.target.value })} placeholder={f.name || 'field_name'} style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>描述 (description)</label>
                    <input value={f.description} onChange={e => updateField(f.id, { description: e.target.value })} placeholder="度量业务含义" style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>过滤条件 (filters.sql)</label>
                    <input value={f.filters_sql || ''} onChange={e => updateField(f.id, { filters_sql: e.target.value })} placeholder="{CUBE}.status = 1" style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.125rem' }}>AI 提示 (meta.ai_context)</label>
                    <input value={f.ai_context} onChange={e => updateField(f.id, { ai_context: e.target.value })} placeholder="帮助 AI 理解该度量" style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <div style={{ textAlign: 'center', padding: '0.75rem', color: '#9ca3af', fontSize: '0.8125rem', border: '1px dashed #e5e7eb', borderRadius: '0.5rem' }}>
            暂无{isDim ? '维度' : '度量'}，点击「+ 添加」
          </div>
        )}
      </div>
    </div>
  )
}

// ——— 关联配置组件 ———

const RELATIONSHIP_OPTIONS: Array<{ value: JoinRelationship; label: string }> = [
  { value: 'one_to_many', label: '一对多 (1:N)' },
  { value: 'many_to_one', label: '多对一 (N:1)' },
  { value: 'many_to_many', label: '多对多 (N:M)' },
]

function JoinsEditor({ cubeName, joins, onChange }: { cubeName: string; joins: JoinDraft[]; onChange: (joins: JoinDraft[]) => void }) {
  const [cubeOptions, setCubeOptions] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/cubes')
      .then(r => r.ok ? r.json() : [])
      .then((list: Array<{ name: string }>) => {
        setCubeOptions(list.map(c => c.name).filter(n => n !== cubeName))
      })
      .catch(() => {})
  }, [cubeName])

  function updateJoin(idx: number, patch: Partial<JoinDraft>) {
    onChange(joins.map((j, i) => i === idx ? { ...j, ...patch } : j))
  }
  function addJoin() {
    onChange([...joins, { name: '', relationship: 'one_to_many', sql: '' }])
  }
  function removeJoin(idx: number) {
    onChange(joins.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>关联 Cube（Joins）</label>
        <button onClick={addJoin} style={{ padding: '0.2rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#374151' }}>+ 添加</button>
      </div>
      {joins.length === 0 ? (
        <div style={{ padding: '0.625rem 0.75rem', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: '0.375rem', color: '#9ca3af', fontSize: '0.8125rem', textAlign: 'center' }}>
          暂无关联，点击"添加"关联其他 Cube
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {joins.map((j, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', background: '#fafafa' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', marginBottom: '0.375rem', alignItems: 'center' }}>
                <select
                  value={j.name}
                  onChange={e => {
                    const name = e.target.value
                    updateJoin(i, { name, sql: j.sql || (name ? `{CUBE}.uid = {${name}.uid}` : '') })
                  }}
                  style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8125rem', background: '#fff', cursor: 'pointer', outline: 'none', color: j.name ? '#111827' : '#9ca3af' }}
                >
                  <option value="">选择关联 Cube…</option>
                  {cubeOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={j.relationship} onChange={e => updateJoin(i, { relationship: e.target.value as JoinRelationship })} style={{ padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8125rem', background: '#fff', cursor: 'pointer' }}>
                  {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => removeJoin(i)} style={{ padding: '0.25rem 0.5rem', border: 'none', borderRadius: '0.25rem', background: '#fee2e2', cursor: 'pointer', color: '#dc2626', fontSize: '0.75rem' }}>✕</button>
              </div>
              <input
                value={j.sql}
                onChange={e => updateJoin(i, { sql: e.target.value })}
                placeholder={`{CUBE}.uid = {${j.name || 'target'}.uid}`}
                style={{ width: '100%', padding: '0.25rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: '0.25rem', fontSize: '0.75rem', fontFamily: 'monospace', outline: 'none', color: '#4b5563', boxSizing: 'border-box', background: '#fff' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ——— AI 对话组件 ———

function AIChat({ messages, streaming, error, input, onInputChange, onSend, onRetry }: {
  messages: ChatMessage[]; streaming: boolean; error: string | null
  input: string; onInputChange: (v: string) => void; onSend: (text: string) => void; onRetry: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderLeft: '1px solid #e5e7eb' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', padding: '0.625rem 0.875rem', borderRadius: '0.75rem', backgroundColor: msg.role === 'user' ? '#2563eb' : '#f3f4f6', color: msg.role === 'user' ? '#fff' : '#111827', fontSize: '0.8125rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content || (streaming && msg.role === 'assistant' ? '▌' : '')}
            </div>
          </div>
        ))}
        {error && (
          <div style={{ padding: '0.625rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
            {error} <button onClick={onRetry} style={{ marginLeft: '0.75rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626', fontSize: '0.8125rem' }}>重试</button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '0.75rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.5rem' }}>
        <input value={input} onChange={e => onInputChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input) } }} placeholder="追问 AI…" disabled={streaming} style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none' }} />
        <button onClick={() => onSend(input)} disabled={streaming || !input.trim()} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem', background: streaming || !input.trim() ? '#d1d5db' : '#2563eb', cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', color: '#fff' }}>
          {streaming ? '…' : '发送'}
        </button>
      </div>
    </div>
  )
}

// ——— 草稿卡（阶段二左侧）———

function CubeDraftCard({ table, draft, onDraftChange, onChangeTable, onSaveAndNext }: {
  table: DWTable; draft: CubeDraft; onDraftChange: (d: CubeDraft) => void
  onChangeTable: () => void; onSaveAndNext: () => void
}) {
  function update(patch: Partial<CubeDraft>) { onDraftChange({ ...draft, ...patch }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '1rem', borderRight: '1px solid #e5e7eb' }}>
      {/* 表信息头 */}
      <div style={{ padding: '0.625rem 0.75rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.125rem' }}>
          <code style={{ fontSize: '0.8125rem', color: '#1e40af', fontWeight: '500' }}>{table.schema ? `${table.schema}.${table.name}` : table.name}</code>
          <button onClick={onChangeTable} style={{ fontSize: '0.75rem', color: '#6b7280', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>换表</button>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{table.display_name} · {table.column_count} 个字段</div>
      </div>

      {/* 基本信息 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.625rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.2rem' }}>Cube 名称 (name)</label>
          <input value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="cube_name" style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.2rem' }}>中文标题 (title)</label>
          <input value={draft.title} onChange={e => update({ title: e.target.value })} placeholder="中文标题" style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      <div style={{ marginBottom: '0.625rem' }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.2rem' }}>数仓表 (sql_table)</label>
        <input value={draft.sql_table} onChange={e => update({ sql_table: e.target.value })} placeholder="table_name 或 schema.table_name" style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: '0.625rem' }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.2rem' }}>业务描述 (description)</label>
        <textarea value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="描述此 Cube 的业务含义" rows={2} style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: '0.875rem' }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.2rem' }}>AI 上下文提示 (meta.ai_context)</label>
        <input value={draft.ai_context} onChange={e => update({ ai_context: e.target.value })} placeholder="帮助 AI 理解此 Cube 用途的提示词" style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* 字段配置 */}
      <div style={{ marginBottom: '0.875rem', flex: 1 }}>
        <FieldSection
          role="dimension"
          fields={draft.fields.filter(f => f.role === 'dimension')}
          allFields={draft.fields}
          onChange={fields => update({ fields })}
        />
        <FieldSection
          role="measure"
          fields={draft.fields.filter(f => f.role === 'measure')}
          allFields={draft.fields}
          onChange={fields => update({ fields })}
        />
      </div>

      {/* 关联配置 */}
      <div style={{ marginBottom: '0.875rem' }}>
        <JoinsEditor cubeName={draft.name} joins={draft.joins} onChange={joins => update({ joins })} />
      </div>

      {/* 底部按钮 */}
      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
        <button onClick={onChangeTable} style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>取消</button>
        <button onClick={onSaveAndNext} disabled={!draft.name || !draft.title} style={{ flex: 2, padding: '0.5rem', border: 'none', borderRadius: '0.375rem', fontWeight: '500', background: !draft.name || !draft.title ? '#d1d5db' : '#2563eb', cursor: !draft.name || !draft.title ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff' }}>
          下一步：AI 补全检查 →
        </button>
      </div>
    </div>
  )
}

// ——— 阶段四：完成弹窗 ———

function CompletionDialog({ cubeName, title, suggestions, onViewDetail, onCreateView, onCreateMetric, onStayHere }: {
  cubeName: string; title: string; suggestions: string
  onViewDetail: () => void; onCreateView: () => void; onCreateMetric: () => void; onStayHere: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '2.5rem', width: '480px', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>Cube 已保存</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.25rem' }}><strong style={{ color: '#111827' }}>{title}</strong></p>
        <code style={{ color: '#4b5563', fontSize: '0.8125rem', background: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>{cubeName}</code>
        {suggestions && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.5rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#0369a1', marginBottom: '0.375rem' }}>AI 建议</div>
            <div style={{ fontSize: '0.8125rem', color: '#0c4a6e', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{suggestions}</div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onCreateView} style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: '0.5rem', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }}>去建 View</button>
            <button onClick={onCreateMetric} style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: '0.5rem', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }}>去建指标</button>
          </div>
          <button onClick={onViewDetail} style={{ padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.875rem' }}>查看 Cube 详情</button>
          <button onClick={onStayHere} style={{ padding: '0.5rem', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8125rem' }}>留在这里</button>
        </div>
      </div>
    </div>
  )
}

// ——— SSE 流式请求 ———

async function streamRequest(url: string, body: Record<string, unknown>, onToken: (token: string) => void): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        if (parsed.error) throw new Error(parsed.error)
        const token = parsed.choices?.[0]?.delta?.content ?? ''
        if (token) onToken(token)
      } catch (e) { if (e instanceof Error && !e.message.startsWith('Unexpected')) throw e }
    }
  }
}

// ——— 将草稿转换为标准 Cube 格式 ———

function draftToCube(draft: CubeDraft) {
  const dimensions = draft.fields
    .filter(f => f.role === 'dimension')
    .map(f => ({
      name: f.name,
      type: f.type || 'string',
      sql: f.sql || f.name,
      title: f.title,
      ...(f.description ? { description: f.description } : {}),
      ...(f.primary_key ? { primary_key: true } : {}),
      ...(f.ai_context ? { meta: { ai_context: f.ai_context } } : {}),
    }))

  const measures = draft.fields
    .filter(f => f.role === 'measure')
    .map(f => ({
      name: f.name,
      title: f.title,
      type: f.measure_type || 'count',
      sql: `{CUBE}.${f.sql || f.name}`,
      ...(f.description ? { description: f.description } : {}),
      ...(f.filters_sql ? { filters: [{ sql: f.filters_sql }] } : {}),
      ...(f.ai_context ? { meta: { ai_context: f.ai_context } } : {}),
    }))

  const joins = draft.joins
    .filter(j => j.name && j.sql)
    .map(j => ({ name: j.name, relationship: j.relationship, sql: j.sql }))

  return {
    name: draft.name,
    title: draft.title,
    sql_table: draft.sql_table,
    ...(draft.description ? { description: draft.description } : {}),
    dimensions,
    measures,
    ...(joins.length > 0 ? { joins } : {}),
    ...(draft.ai_context ? { meta: { ai_context: draft.ai_context } } : {}),
  }
}

// ——— 主组件 ———

export default function CubeEditorPage() {
  const { cubeId } = useParams<{ cubeId: string }>()
  const navigate = useNavigate()
  const isEdit = !!cubeId

  const [stage, setStage] = useState<Stage>(isEdit ? 2 : 1)
  const [selectedTable, setSelectedTable] = useState<DWTable | null>(null)
  const [columns, setColumns] = useState<DWColumn[]>([])
  const [draft, setDraft] = useState<CubeDraft>({
    name: '', title: '', sql_table: '', description: '', ai_context: '', fields: [], joins: [],
  })

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [savedCubeName, setSavedCubeName] = useState('')
  const [completionSuggestions, setCompletionSuggestions] = useState('')

  // 编辑模式：加载现有 Cube
  useEffect(() => {
    if (!isEdit) return
    ;(async () => {
      try {
        const res = await fetch(`/api/cubes/${cubeId}`)
        if (!res.ok) return
        const cube = await res.json()

        setSelectedTable({
          id: cube.sql_table || cubeId!,
          name: cube.sql_table || cubeId!,
          schema: '',
          display_name: cube.title || cubeId!,
          description: cube.description || '',
          column_count: (cube.dimensions?.length || 0) + (cube.measures?.length || 0),
        })

        const fields: FieldDraft[] = [
          ...(cube.dimensions || []).map((d: { name: string; type?: string; sql?: string; title?: string; description?: string; primary_key?: boolean; meta?: { ai_context?: string } }) => ({
            id: newFieldId(),
            name: d.name,
            role: 'dimension' as FieldRole,
            type: d.type || 'string',
            sql: d.sql || d.name,
            title: d.title || '',
            description: d.description || '',
            primary_key: d.primary_key,
            ai_context: d.meta?.ai_context || '',
          })),
          ...(cube.measures || []).map((m: { name: string; type?: string; sql?: string; title?: string; description?: string; filters?: Array<{sql: string}>; meta?: { ai_context?: string } }) => ({
            id: newFieldId(),
            name: m.name,
            role: 'measure' as FieldRole,
            type: 'number',
            sql: (m.sql || `{CUBE}.${m.name}`).replace('{CUBE}.', ''),
            title: m.title || '',
            description: m.description || '',
            measure_type: (m.type || 'count') as MeasureType,
            filters_sql: m.filters?.[0]?.sql || '',
            ai_context: m.meta?.ai_context || '',
          })),
        ]

        const joins: JoinDraft[] = (cube.joins || []).map((j: { name: string; relationship: JoinRelationship; sql: string }) => ({
          name: j.name,
          relationship: j.relationship,
          sql: j.sql,
        }))

        setDraft({
          name: cube.name || '',
          title: cube.title || '',
          sql_table: cube.sql_table || '',
          description: cube.description || '',
          ai_context: cube.meta?.ai_context || '',
          fields,
          joins,
        })
      } catch { /* 忽略 */ }
    })()
  }, [isEdit, cubeId])

  async function enterStage2(table: DWTable, cols: DWColumn[]) {
    setSelectedTable(table)
    setColumns(cols)

    const fields: FieldDraft[] = cols.map(col => {
      const role = guessRole(col)
      return {
        id: newFieldId(),
        name: col.name,
        role,
        type: col.type || 'string',
        sql: col.name,
        title: col.display_name,
        description: col.comment || '',
        measure_type: role === 'measure' ? guessMeasureType(col) : undefined,
        filters_sql: '',
        ai_context: '',
      }
    })

    setDraft(prev => ({
      ...prev,
      name: table.name,
      title: table.display_name,
      sql_table: table.name,
      description: table.description,
      fields,
    }))

    setChatMessages([])
    setChatError(null)
    setStage(2)
    await triggerAIAnalysis(table, cols)
  }

  async function triggerAIAnalysis(table: DWTable, cols: DWColumn[]) {
    setChatStreaming(true)
    setChatError(null)
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    setChatMessages([assistantMsg])
    let accumulated = ''
    try {
      await streamRequest(
        '/api/ai/infer-cube-draft',
        { tableId: table.id, tableName: table.name, schema: table.schema, columns: cols, displayName: table.display_name, description: table.description },
        token => { accumulated += token; setChatMessages([{ role: 'assistant', content: accumulated }]) }
      )
    } catch (e) {
      setChatError(e instanceof Error ? e.message : '分析失败')
      setChatMessages([])
    } finally {
      setChatStreaming(false)
    }
  }

  async function sendChat(text: string) {
    if (!text.trim() || chatStreaming) return
    setChatInput('')
    setChatError(null)

    const userMsg: ChatMessage = { role: 'user', content: text }
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    const newMessages = [...chatMessages, userMsg, assistantMsg]
    setChatMessages(newMessages)
    setChatStreaming(true)

    const endpoint = stage === 2 ? '/api/ai/infer-cube-draft' : '/api/ai/supplement-cube'
    const body = stage === 2
      ? { tableId: selectedTable?.id, tableName: selectedTable?.name, schema: selectedTable?.schema, columns, displayName: selectedTable?.display_name, description: selectedTable?.description }
      : { cubeDraft: draftToCube(draft), conversationHistory: [...chatMessages, userMsg] }

    let accumulated = ''
    try {
      await streamRequest(endpoint, body, token => {
        accumulated += token
        setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: accumulated }; return u })
      })
    } catch (e) {
      setChatError(e instanceof Error ? e.message : '请求失败')
      setChatMessages(prev => prev.slice(0, -1))
    } finally {
      setChatStreaming(false)
    }
  }

  async function enterStage3() {
    setStage(3)
    setChatMessages([])
    setChatError(null)
    setChatStreaming(true)
    const cube = draftToCube(draft)
    setChatMessages([{ role: 'assistant', content: '' }])
    let accumulated = ''
    try {
      await streamRequest('/api/ai/supplement-cube', { cubeDraft: cube, conversationHistory: [] }, token => {
        accumulated += token
        setChatMessages([{ role: 'assistant', content: accumulated }])
      })
    } catch (e) {
      setChatError(e instanceof Error ? e.message : '请求失败')
      setChatMessages([])
    } finally {
      setChatStreaming(false)
    }
  }

  async function saveCube() {
    const cube = draftToCube(draft)
    const method = isEdit ? 'PUT' : 'POST'
    const url = isEdit ? `/api/cubes/${cubeId}` : '/api/cubes'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cube) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const lastAIMsg = [...chatMessages].reverse().find(m => m.role === 'assistant')
    const suggestions = lastAIMsg?.content?.includes('完整') || lastAIMsg?.content?.includes('可以保存')
      ? `已保存 Cube「${draft.title}」。建议接下来：\n1. 基于此 Cube 创建 View，定义常用查询维度组合\n2. 在指标模块中定义核心业务指标`
      : `已保存 Cube「${draft.title}」。可根据 AI 的建议继续完善字段配置。`

    setSavedCubeName(cube.name)
    setCompletionSuggestions(suggestions)
    setStage(4)
  }

  const steps = isEdit ? ['草稿编辑', 'AI 补全', '完成'] : ['选择表', '草稿编辑', 'AI 补全', '完成']
  const currentStepIdx = isEdit ? stage - 2 : stage - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶栏 */}
      <div style={{ padding: '0.875rem 2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/cubes')} style={{ fontSize: '0.875rem', color: '#6b7280', border: 'none', background: 'none', cursor: 'pointer' }}>← 取消</button>
          <h1 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>{isEdit ? `编辑 Cube：${cubeId}` : '新建 Cube'}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {steps.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '600', background: i < currentStepIdx ? '#10b981' : i === currentStepIdx ? '#2563eb' : '#e5e7eb', color: i <= currentStepIdx ? '#fff' : '#9ca3af' }}>
                  {i < currentStepIdx ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '0.8125rem', color: i === currentStepIdx ? '#111827' : '#9ca3af', fontWeight: i === currentStepIdx ? '500' : '400' }}>{step}</span>
              </div>
              {i < steps.length - 1 && <div style={{ width: '1.5rem', height: '1px', background: '#e5e7eb' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {stage === 1 && (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <Stage1TableSelector onSelect={enterStage2} />
          </div>
        )}

        {(stage === 2 || stage === 3) && selectedTable && (
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: '42%', height: '100%', overflowY: 'auto' }}>
              <CubeDraftCard table={selectedTable} draft={draft} onDraftChange={setDraft} onChangeTable={() => { if (!isEdit) setStage(1) }} onSaveAndNext={enterStage3} />
            </div>
            <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
              {stage === 3 && (
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', background: '#fafafa', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>AI 已检查 Cube 完整性</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setStage(2)} style={{ padding: '0.375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>← 返回编辑</button>
                  <button onClick={saveCube} disabled={!draft.name || !draft.title} style={{ padding: '0.375rem 1rem', border: 'none', borderRadius: '0.375rem', background: !draft.name || !draft.title ? '#d1d5db' : '#2563eb', cursor: !draft.name || !draft.title ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', color: '#fff', fontWeight: '500' }}>
                    保存 Cube ✓
                  </button>
                </div>
              )}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <AIChat messages={chatMessages} streaming={chatStreaming} error={chatError} input={chatInput} onInputChange={setChatInput} onSend={sendChat} onRetry={() => { if (stage === 2 && selectedTable) triggerAIAnalysis(selectedTable, columns); else if (stage === 3) enterStage3() }} />
              </div>
            </div>
          </div>
        )}

        {stage === 4 && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
            <CompletionDialog cubeName={savedCubeName} title={draft.title} suggestions={completionSuggestions} onViewDetail={() => navigate(`/cubes/${savedCubeName}`)} onCreateView={() => navigate('/views/new')} onCreateMetric={() => navigate('/metrics/new')} onStayHere={() => navigate('/cubes')} />
          </div>
        )}
      </div>
    </div>
  )
}
