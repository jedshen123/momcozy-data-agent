import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Metric } from './MetricsPage'

// ——— 类型 ———

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ViewMeta {
  name: string
  title: string
}

interface FieldMeta {
  name: string
  title: string
  type?: string
  cube: string
}

interface ViewFields {
  measures: FieldMeta[]
  dimensions: FieldMeta[]
}

interface MeasureEntry {
  key: string     // m1, m2 ...
  view: string    // view name
  measure: string // measure field name
}

interface MetricDraft {
  id: string
  name: string
  type: 'simple' | 'composite'
  description: string
  aliases: string[]
  disambiguation: string
  // 简单指标
  view: string
  measure: string
  filter_sql: string
  dimensions: string[]
  // 复合指标
  formula: string
  measure_entries: MeasureEntry[]
}

const EMPTY_DRAFT: MetricDraft = {
  id: '', name: '', type: 'simple', description: '',
  aliases: [], disambiguation: '',
  view: '', measure: '', filter_sql: '', dimensions: [],
  formula: '', measure_entries: [],
}

// ——— SSE 流式工具 ———

async function streamRequest(
  url: string,
  body: Record<string, unknown>,
  onToken: (token: string) => void,
  signal?: AbortSignal
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) throw new Error(parsed.error)
          const token = parsed.choices?.[0]?.delta?.content ?? ''
          if (token) onToken(token)
        } catch (e) {
          if (e instanceof Error && !e.message.includes('JSON')) throw e
        }
      }
    }
  }
}

// ——— 类型切换按钮 ———

function TypeToggle({ value, onChange }: { value: 'simple' | 'composite'; onChange: (t: 'simple' | 'composite') => void }) {
  const btn = (t: 'simple' | 'composite', label: string) => {
    const active = value === t
    return (
      <button
        key={t}
        onClick={() => onChange(t)}
        style={{
          flex: 1, padding: '0.4rem 0', fontSize: '0.8125rem', fontWeight: active ? '600' : '400',
          border: 'none', cursor: 'pointer', borderRadius: '0.375rem',
          background: active ? (t === 'simple' ? '#1d4ed8' : '#7e22ce') : 'transparent',
          color: active ? '#fff' : '#6b7280',
          transition: 'all 0.15s',
        }}
      >
        {label}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '0.5rem', padding: '0.1875rem', gap: '0.1875rem' }}>
      {btn('simple', '简单指标')}
      {btn('composite', '复合指标')}
    </div>
  )
}

// ——— 简单指标草稿卡 ———

function SimpleDraftCard({
  draft, views, viewFields, onViewChange, onChange,
}: {
  draft: MetricDraft
  views: ViewMeta[]
  viewFields: ViewFields | null
  onViewChange: (v: string) => void
  onChange: (d: MetricDraft) => void
}) {
  function update(patch: Partial<MetricDraft>) { onChange({ ...draft, ...patch }) }

  const inputStyle = { width: '100%', padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block' as const, fontSize: '0.75rem', fontWeight: '600' as const, color: '#374151', marginBottom: '0.25rem' }

  function toggleDimension(name: string) {
    const dims = draft.dimensions.includes(name)
      ? draft.dimensions.filter(d => d !== name)
      : [...draft.dimensions, name]
    update({ dimensions: dims })
  }

  return (
    <>
      <div style={{ marginBottom: '0.875rem' }}>
        <label style={labelStyle}>指标名称 <span style={{ color: '#dc2626' }}>*</span></label>
        <input value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="如：APP 日活用户数" style={inputStyle} />
      </div>

      <div style={{ marginBottom: '0.875rem' }}>
        <label style={labelStyle}>业务含义</label>
        <textarea value={draft.description} onChange={e => update({ description: e.target.value })} rows={2} placeholder="AI 会自动填充，也可手动编辑" style={{ ...inputStyle, resize: 'none' }} />
      </div>

      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', marginTop: '0.25rem' }}>计算口径</div>

      {/* View 选择 */}
      <div style={{ marginBottom: '0.625rem' }}>
        <label style={labelStyle}>View <span style={{ color: '#dc2626' }}>*</span></label>
        <select
          value={draft.view}
          onChange={e => onViewChange(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer', background: '#fff' }}
        >
          <option value="">— 选择 View —</option>
          {views.map(v => <option key={v.name} value={v.name}>{v.name}{v.title ? ` · ${v.title}` : ''}</option>)}
        </select>
      </div>

      {/* Measure 选择 */}
      <div style={{ marginBottom: '0.625rem' }}>
        <label style={labelStyle}>度量 (Measure) <span style={{ color: '#dc2626' }}>*</span></label>
        <select
          value={draft.measure}
          onChange={e => update({ measure: e.target.value })}
          disabled={!viewFields}
          style={{ ...inputStyle, cursor: viewFields ? 'pointer' : 'not-allowed', background: '#fff', opacity: viewFields ? 1 : 0.6 }}
        >
          <option value="">{viewFields ? '— 选择度量 —' : '先选择 View'}</option>
          {viewFields?.measures.map(m => (
            <option key={m.name} value={m.name}>{m.name}{m.title && m.title !== m.name ? ` · ${m.title}` : ''}</option>
          ))}
        </select>
      </div>

      {/* 过滤条件 */}
      <div style={{ marginBottom: '0.625rem' }}>
        <label style={labelStyle}>过滤条件 <span style={{ fontWeight: '400', color: '#9ca3af' }}>（SQL 片段，可选）</span></label>
        <input
          value={draft.filter_sql}
          onChange={e => update({ filter_sql: e.target.value })}
          placeholder="如：status = 'paid' AND country = 'CN'"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
        />
      </div>

      {/* 支持的维度 */}
      <div style={{ marginBottom: '0.875rem' }}>
        <label style={labelStyle}>支持的筛选/分组维度 <span style={{ fontWeight: '400', color: '#9ca3af' }}>（可选）</span></label>
        {!viewFields ? (
          <div style={{ fontSize: '0.8125rem', color: '#d1d5db' }}>先选择 View 后可选择维度</div>
        ) : viewFields.dimensions.length === 0 ? (
          <div style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>该 View 无可用维度</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.125rem' }}>
            {viewFields.dimensions.map(d => {
              const selected = draft.dimensions.includes(d.name)
              return (
                <button
                  key={d.name}
                  onClick={() => toggleDimension(d.name)}
                  style={{
                    padding: '0.25rem 0.625rem', fontSize: '0.75rem', borderRadius: '9999px', cursor: 'pointer',
                    border: `1px solid ${selected ? '#1d4ed8' : '#d1d5db'}`,
                    background: selected ? '#eff6ff' : '#fff',
                    color: selected ? '#1d4ed8' : '#6b7280',
                    fontWeight: selected ? '500' : '400',
                  }}
                >
                  {d.name}{d.title && d.title !== d.name ? ` (${d.title})` : ''}
                </button>
              )
            })}
          </div>
        )}
        {draft.dimensions.length > 0 && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.375rem' }}>
            已选 {draft.dimensions.length} 个：{draft.dimensions.join('、')}
          </div>
        )}
      </div>
    </>
  )
}

// ——— 复合指标草稿卡 ———

function CompositeDraftCard({
  draft, views, viewFieldsMap, onViewChange, onChange,
}: {
  draft: MetricDraft
  views: ViewMeta[]
  viewFieldsMap: Record<string, ViewFields>
  onViewChange: (entryKey: string, viewName: string) => void
  onChange: (d: MetricDraft) => void
}) {
  function update(patch: Partial<MetricDraft>) { onChange({ ...draft, ...patch }) }

  const inputStyle = { width: '100%', padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block' as const, fontSize: '0.75rem', fontWeight: '600' as const, color: '#374151', marginBottom: '0.25rem' }

  function addEntry() {
    const newKey = `m${draft.measure_entries.length + 1}`
    update({ measure_entries: [...draft.measure_entries, { key: newKey, view: '', measure: '' }] })
  }

  function updateEntry(idx: number, patch: Partial<MeasureEntry>) {
    const updated = draft.measure_entries.map((e, i) => i === idx ? { ...e, ...patch } : e)
    update({ measure_entries: updated })
  }

  function removeEntry(idx: number) {
    update({ measure_entries: draft.measure_entries.filter((_, i) => i !== idx) })
  }

  // 公式预览：将 ${mN} 替换为 view.measure
  const formulaPreview = draft.formula.replace(/\$\{(\w+)\}/g, (_, k) => {
    const entry = draft.measure_entries.find(e => e.key === k)
    return entry?.view && entry?.measure ? `${entry.view}.${entry.measure}` : `\${${k}}`
  })

  return (
    <>
      <div style={{ marginBottom: '0.875rem' }}>
        <label style={labelStyle}>指标名称 <span style={{ color: '#dc2626' }}>*</span></label>
        <input value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="如：客单价 (AOV)" style={inputStyle} />
      </div>

      <div style={{ marginBottom: '0.875rem' }}>
        <label style={labelStyle}>业务含义</label>
        <textarea value={draft.description} onChange={e => update({ description: e.target.value })} rows={2} placeholder="AI 会自动填充，也可手动编辑" style={{ ...inputStyle, resize: 'none' }} />
      </div>

      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', marginTop: '0.25rem' }}>计算逻辑</div>

      {/* 公式 */}
      <div style={{ marginBottom: '0.625rem' }}>
        <label style={labelStyle}>
          公式 <span style={{ color: '#dc2626' }}>*</span>{' '}
          <span style={{ fontWeight: '400', color: '#9ca3af' }}>（用 {'${'}m1{'}'} 引用下方度量）</span>
        </label>
        <input
          value={draft.formula}
          onChange={e => update({ formula: e.target.value })}
          placeholder="如：${m1} / ${m2}"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
        />
        {draft.formula && draft.measure_entries.length > 0 && (
          <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', padding: '0.375rem 0.5rem', borderRadius: '0.25rem', fontFamily: 'monospace' }}>
            {formulaPreview}
          </div>
        )}
      </div>

      {/* 度量映射 */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
          <label style={labelStyle}>度量映射</label>
          <button onClick={addEntry} style={{ fontSize: '0.75rem', color: '#7e22ce', background: 'none', border: 'none', cursor: 'pointer' }}>+ 添加</button>
        </div>
        {draft.measure_entries.length === 0 && (
          <div style={{ fontSize: '0.8125rem', color: '#d1d5db', padding: '0.375rem 0' }}>点击「+ 添加」增加度量</div>
        )}
        {draft.measure_entries.map((entry, idx) => {
          const entryFields = viewFieldsMap[entry.view]
          return (
            <div key={idx} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.625rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                <input
                  value={entry.key}
                  onChange={e => updateEntry(idx, { key: e.target.value })}
                  placeholder="m1"
                  style={{ width: '60px', padding: '0.25rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8125rem', fontFamily: 'monospace', color: '#7c3aed', outline: 'none' }}
                />
                <button onClick={() => removeEntry(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
              </div>
              {/* View 下拉 */}
              <select
                value={entry.view}
                onChange={e => { updateEntry(idx, { view: e.target.value, measure: '' }); onViewChange(entry.key, e.target.value) }}
                style={{ ...inputStyle, marginBottom: '0.375rem', cursor: 'pointer', background: '#fff' }}
              >
                <option value="">— 选择 View —</option>
                {views.map(v => <option key={v.name} value={v.name}>{v.name}{v.title ? ` · ${v.title}` : ''}</option>)}
              </select>
              {/* Measure 下拉 */}
              <select
                value={entry.measure}
                onChange={e => updateEntry(idx, { measure: e.target.value })}
                disabled={!entryFields}
                style={{ ...inputStyle, cursor: entryFields ? 'pointer' : 'not-allowed', background: '#fff', opacity: entryFields ? 1 : 0.6 }}
              >
                <option value="">{entryFields ? '— 选择度量 —' : '先选择 View'}</option>
                {entryFields?.measures.map(m => (
                  <option key={m.name} value={m.name}>{m.name}{m.title && m.title !== m.name ? ` · ${m.title}` : ''}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ——— 草稿卡外框 ———

function MetricDraftCard({
  draft, views, viewFields, viewFieldsMap,
  onTypeChange, onSimpleViewChange, onCompositeViewChange,
  onChange, onSave, onCancel, saving, aiPending,
}: {
  draft: MetricDraft
  views: ViewMeta[]
  viewFields: ViewFields | null            // 简单指标用
  viewFieldsMap: Record<string, ViewFields> // 复合指标用
  onTypeChange: (t: 'simple' | 'composite') => void
  onSimpleViewChange: (v: string) => void
  onCompositeViewChange: (key: string, v: string) => void
  onChange: (d: MetricDraft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  aiPending: boolean
}) {
  function update(patch: Partial<MetricDraft>) { onChange({ ...draft, ...patch }) }

  const inputStyle = { width: '100%', padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block' as const, fontSize: '0.75rem', fontWeight: '600' as const, color: '#374151', marginBottom: '0.25rem' }

  const canSave = draft.type === 'simple'
    ? !!draft.name && !!draft.view && !!draft.measure && !saving
    : !!draft.name && !!draft.formula && !saving

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #e5e7eb', background: '#fafafa' }}>
      {/* 卡片标题 */}
      <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#fff' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>指标草稿</span>
        {aiPending && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>AI 实时填充中…</span>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {/* 类型切换 */}
        <div style={{ marginBottom: '1rem' }}>
          <TypeToggle value={draft.type} onChange={onTypeChange} />
        </div>

        {/* 类型说明 */}
        <div style={{ marginBottom: '0.875rem', padding: '0.5rem 0.625rem', background: draft.type === 'simple' ? '#eff6ff' : '#fdf4ff', borderRadius: '0.375rem', fontSize: '0.75rem', color: draft.type === 'simple' ? '#1d4ed8' : '#7e22ce' }}>
          {draft.type === 'simple'
            ? '从某个 View 的 Measure 中直接引用，可附加 SQL 过滤条件'
            : '通过公式组合多个 Measure 的计算结果，支持跨 View 引用'}
        </div>

        {/* 按类型渲染主字段 */}
        {draft.type === 'simple' ? (
          <SimpleDraftCard
            draft={draft} views={views} viewFields={viewFields}
            onViewChange={onSimpleViewChange} onChange={onChange}
          />
        ) : (
          <CompositeDraftCard
            draft={draft} views={views} viewFieldsMap={viewFieldsMap}
            onViewChange={onCompositeViewChange} onChange={onChange}
          />
        )}

        {/* 通用字段 */}
        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>通用信息</div>

        <div style={{ marginBottom: '0.625rem' }}>
          <label style={labelStyle}>别名（逗号分隔）</label>
          <input
            value={draft.aliases.join('、')}
            onChange={e => update({ aliases: e.target.value.split(/[,，、]/).map(s => s.trim()).filter(Boolean) })}
            placeholder="DAU、日活"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '0.625rem' }}>
          <label style={labelStyle}>区分说明（vs 相似指标）</label>
          <textarea value={draft.disambiguation} onChange={e => update({ disambiguation: e.target.value })} rows={2} placeholder="如：与活跃用户的区别在于计算粒度不同" style={{ ...inputStyle, resize: 'none' }} />
        </div>
      </div>

      {/* 操作按钮 */}
      <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.5rem', flexShrink: 0, background: '#fff' }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>取消</button>
        <button
          onClick={onSave}
          disabled={!canSave}
          style={{ flex: 2, padding: '0.5rem', border: 'none', borderRadius: '0.375rem', background: canSave ? (draft.type === 'simple' ? '#1d4ed8' : '#7e22ce') : '#d1d5db', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}
        >
          {saving ? '保存中…' : '保存指标'}
        </button>
      </div>
    </div>
  )
}

// ——— 完成弹窗 ———

function SavedDialog({ metricId, name, onViewDetail, onCreateDisambiguation, onStayHere }: {
  metricId: string; name: string
  onViewDetail: () => void; onCreateDisambiguation: () => void; onStayHere: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '2rem', width: '440px', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111827', marginBottom: '0.375rem' }}>指标已保存</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.25rem' }}><strong style={{ color: '#111827' }}>{name}</strong></p>
        <code style={{ color: '#4b5563', fontSize: '0.8125rem', background: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>{metricId}</code>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onViewDetail} style={{ flex: 1, padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.875rem' }}>查看详情</button>
            <button onClick={onCreateDisambiguation} style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: '0.5rem', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }}>去建澄清条目</button>
          </div>
          <button onClick={onStayHere} style={{ padding: '0.5rem', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8125rem' }}>留在这里</button>
        </div>
      </div>
    </div>
  )
}

// ——— 主组件 ———

export default function MetricEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id

  const [draft, setDraft] = useState<MetricDraft>({ ...EMPTY_DRAFT })
  const [allViews, setAllViews] = useState<ViewMeta[]>([])
  // 简单指标：当前选中 view 的 fields
  const [simpleViewFields, setSimpleViewFields] = useState<ViewFields | null>(null)
  // 复合指标：已加载的 view fields 缓存，key = view name
  const [viewFieldsMap, setViewFieldsMap] = useState<Record<string, ViewFields>>({})

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState('')
  const [done, setDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 加载所有 Views 列表
  useEffect(() => {
    fetch('/api/views')
      .then(r => r.json())
      .then((data: unknown[]) => {
        // views 可能带 top-level wrapping，已由后端 readAll 解包
        const list = (data as Array<{ name?: string; title?: string }>)
          .filter(v => v.name)
          .map(v => ({ name: v.name!, title: v.title || '' }))
        setAllViews(list)
      })
      .catch(() => {})
  }, [])

  // 获取某个 view 的 fields
  async function fetchViewFields(viewName: string): Promise<ViewFields | null> {
    if (!viewName) return null
    if (viewFieldsMap[viewName]) return viewFieldsMap[viewName]
    try {
      const res = await fetch(`/api/views/${viewName}/fields`)
      if (!res.ok) return null
      const data: ViewFields = await res.json()
      setViewFieldsMap(prev => ({ ...prev, [viewName]: data }))
      return data
    } catch {
      return null
    }
  }

  // 简单指标：view 变更
  async function handleSimpleViewChange(viewName: string) {
    setDraft(prev => ({ ...prev, view: viewName, measure: '', dimensions: [] }))
    if (viewName) {
      const fields = await fetchViewFields(viewName)
      setSimpleViewFields(fields)
    } else {
      setSimpleViewFields(null)
    }
  }

  // 复合指标：某个 measure entry 的 view 变更
  async function handleCompositeViewChange(entryKey: string, viewName: string) {
    if (viewName) await fetchViewFields(viewName)
    // 不需要额外操作，viewFieldsMap 已更新，子组件从 map 读取
  }

  // 类型切换：重置对应字段
  function handleTypeChange(t: 'simple' | 'composite') {
    setDraft(prev => ({ ...prev, type: t }))
    setSimpleViewFields(null)
  }

  // 编辑模式：加载现有指标
  useEffect(() => {
    if (!isEdit) return
    ;(async () => {
      try {
        const res = await fetch(`/api/metrics/${id}`)
        if (!res.ok) return
        const m: Metric = await res.json()
        const base = {
          id: m.id,
          name: m.name || '',
          type: (m.type || 'simple') as 'simple' | 'composite',
          description: m.description || '',
          aliases: m.aliases || [],
          disambiguation: m.disambiguation || '',
        }
        if (m.type === 'composite') {
          const entries: MeasureEntry[] = Object.entries(m.measure_map || {}).map(([key, val]) => {
            const parts = val.split('.')
            return { key, view: parts[0] || '', measure: parts.slice(1).join('.') || '' }
          })
          setDraft({ ...EMPTY_DRAFT, ...base, formula: m.formula || '', measure_entries: entries })
          // 预加载所有涉及的 view fields
          const uniqueViews = [...new Set(entries.map(e => e.view).filter(Boolean))]
          for (const v of uniqueViews) await fetchViewFields(v)
        } else {
          setDraft({ ...EMPTY_DRAFT, ...base, view: m.view || '', measure: m.measure || '', filter_sql: m.filter_sql || '', dimensions: m.dimensions || [] })
          if (m.view) {
            const fields = await fetchViewFields(m.view)
            setSimpleViewFields(fields)
          }
        }
      } catch { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 从 AI 回复中提取字段更新
  function applyFieldPatches(accumulated: string) {
    const matches = accumulated.matchAll(/\{\{([\w.]+):([^}]+)\}\}/g)
    const patches: Partial<MetricDraft> = {}
    const measureMapPatches: Record<string, { view?: string; measure?: string }> = {}

    for (const m of matches) {
      const key = m[1], val = m[2].trim()
      if (key === 'name' || key === 'description' || key === 'formula' || key === 'filter_sql' || key === 'disambiguation') {
        (patches as Record<string, unknown>)[key] = val
      } else if (key === 'type' && (val === 'simple' || val === 'composite')) {
        patches.type = val
      } else if (key === 'view') {
        patches.view = val
      } else if (key === 'measure') {
        patches.measure = val
      } else if (key.startsWith('measure_map.')) {
        // 格式：{{measure_map.m1:view_name.measure_name}}
        const entryKey = key.slice('measure_map.'.length)
        const dotIdx = val.indexOf('.')
        if (dotIdx > -1) {
          measureMapPatches[entryKey] = { view: val.slice(0, dotIdx), measure: val.slice(dotIdx + 1) }
        }
      }
    }

    setDraft(prev => {
      let updated = { ...prev, ...patches }
      if (Object.keys(measureMapPatches).length > 0) {
        const existingKeys = new Set(prev.measure_entries.map(e => e.key))
        const newEntries = [...prev.measure_entries]
        for (const [k, v] of Object.entries(measureMapPatches)) {
          if (existingKeys.has(k)) {
            const idx = newEntries.findIndex(e => e.key === k)
            if (idx >= 0) newEntries[idx] = { ...newEntries[idx], ...v }
          } else {
            newEntries.push({ key: k, view: v.view || '', measure: v.measure || '' })
          }
        }
        updated = { ...updated, measure_entries: newEntries }
      }
      return updated
    })

    // 预加载 AI 建议的 view fields
    if (patches.view) handleSimpleViewChange(patches.view)
    for (const v of Object.values(measureMapPatches)) {
      if (v.view) fetchViewFields(v.view)
    }
  }

  // 发送消息
  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return
    setError(null)
    setInput('')

    const userMsg: ChatMessage = { role: 'user', content: text }
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    let accumulated = ''
    try {
      await streamRequest(
        '/api/ai/define-metric',
        { conversationHistory: [...messages, userMsg], currentDraft: draft, isEdit },
        token => {
          accumulated += token
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: accumulated }
            return updated
          })
          applyFieldPatches(accumulated)
        }
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setStreaming(false)
    }
  }

  // 保存指标
  async function handleSave() {
    setSaving(true)
    try {
      const metricId = isEdit ? id! : `MTR-${String(Date.now()).slice(-6)}`
      let body: Metric

      if (draft.type === 'simple') {
        body = {
          id: metricId,
          name: draft.name,
          type: 'simple',
          view: draft.view,
          measure: draft.measure,
          ...(draft.filter_sql ? { filter_sql: draft.filter_sql } : {}),
          ...(draft.dimensions.length > 0 ? { dimensions: draft.dimensions } : {}),
          ...(draft.description ? { description: draft.description } : {}),
          ...(draft.aliases.length > 0 ? { aliases: draft.aliases } : {}),
          ...(draft.disambiguation ? { disambiguation: draft.disambiguation } : {}),
        }
      } else {
        const measure_map: Record<string, string> = {}
        for (const e of draft.measure_entries) {
          if (e.key && e.view && e.measure) {
            measure_map[e.key] = `${e.view}.${e.measure}`
          }
        }
        body = {
          id: metricId,
          name: draft.name,
          type: 'composite',
          formula: draft.formula,
          measure_map,
          ...(draft.description ? { description: draft.description } : {}),
          ...(draft.aliases.length > 0 ? { aliases: draft.aliases } : {}),
          ...(draft.disambiguation ? { disambiguation: draft.disambiguation } : {}),
        }
      }

      const method = isEdit ? 'PUT' : 'POST'
      const url = isEdit ? `/api/metrics/${id}` : '/api/metrics'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSavedId(metricId)
      setDone(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const examples = [
    'APP 日活用户数（DAU）',
    '新用户 7 日留存率',
    '客单价 = 销售额 / 订单数',
    '实付销售额，只统计已完成支付的订单',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶栏 */}
      <div style={{ padding: '0.875rem 2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '1rem', background: '#fff', flexShrink: 0 }}>
        <button onClick={() => navigate('/metrics')} style={{ fontSize: '0.875rem', color: '#6b7280', border: 'none', background: 'none', cursor: 'pointer' }}>← 取消</button>
        <h1 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>{isEdit ? `编辑指标：${id}` : '新建指标'}</h1>
      </div>

      {/* 主内容：左 55% 对话 / 右 45% 草稿卡 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧 AI 对话 */}
        <div style={{ width: '55%', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💬</div>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>我来帮你定义指标</h3>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>描述你的指标需求，我会帮你确定类型、口径和度量映射。</p>
                <p style={{ color: '#9ca3af', fontSize: '0.8125rem', marginBottom: '2rem' }}>简单指标：直接引用 View 中的 Measure；复合指标：通过公式组合多个 Measure</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '360px', margin: '0 auto' }}>
                  {examples.map(ex => (
                    <button key={ex} onClick={() => sendMessage(ex)} style={{ padding: '0.625rem 1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', background: '#f9fafb', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', textAlign: 'left' }}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: '0.875rem', display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', padding: '0.75rem 1rem', borderRadius: '0.75rem', backgroundColor: msg.role === 'user' ? '#2563eb' : '#f3f4f6', color: msg.role === 'user' ? '#fff' : '#111827', fontSize: '0.875rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content || (streaming && msg.role === 'assistant' ? '▌' : '')}
                </div>
              </div>
            ))}

            {error && (
              <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                {error}
                <button onClick={() => { setError(null); if (messages.length > 0) sendMessage(messages[messages.length - 2]?.content || '') }} style={{ marginLeft: '0.75rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626', fontSize: '0.875rem' }}>重试</button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 输入区 */}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
              placeholder={messages.length === 0 ? '请描述你的指标…' : '追问 AI…'}
              disabled={streaming}
              style={{ flex: 1, padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
              style={{ padding: '0.75rem 1.25rem', border: 'none', borderRadius: '0.5rem', background: streaming || !input.trim() ? '#d1d5db' : '#2563eb', cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}
            >
              {streaming ? '生成中…' : '发送'}
            </button>
          </div>
        </div>

        {/* 右侧草稿卡 */}
        <div style={{ flex: 1, height: '100%' }}>
          <MetricDraftCard
            draft={draft}
            views={allViews}
            viewFields={simpleViewFields}
            viewFieldsMap={viewFieldsMap}
            onTypeChange={handleTypeChange}
            onSimpleViewChange={handleSimpleViewChange}
            onCompositeViewChange={handleCompositeViewChange}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={() => navigate('/metrics')}
            saving={saving}
            aiPending={streaming}
          />
        </div>
      </div>

      {done && (
        <SavedDialog
          metricId={savedId}
          name={draft.name}
          onViewDetail={() => navigate(`/metrics/${savedId}`)}
          onCreateDisambiguation={() => navigate('/disambiguations/new')}
          onStayHere={() => navigate('/metrics')}
        />
      )}
    </div>
  )
}
