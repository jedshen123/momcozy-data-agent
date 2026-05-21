import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Disambiguation, DisambiguationEntity, UsageScenario } from './DisambiguationsPage'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DisDraft {
  concept_a_name: string
  concept_a_definition: string
  concept_a_entity_type: string
  concept_a_entity_id: string
  concept_b_name: string
  concept_b_definition: string
  concept_b_entity_type: string
  concept_b_entity_id: string
  core_difference: string
  scenarios: Array<{ condition: string; use: string }>
}

const EMPTY_DRAFT: DisDraft = {
  concept_a_name: '', concept_a_definition: '', concept_a_entity_type: 'metric', concept_a_entity_id: '',
  concept_b_name: '', concept_b_definition: '', concept_b_entity_type: 'metric', concept_b_entity_id: '',
  core_difference: '', scenarios: []
}

async function* streamRequest(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        if (parsed.error) throw new Error(parsed.error)
        const token = parsed.choices?.[0]?.delta?.content
        if (token) yield token as string
      } catch { }
    }
  }
}

// 从 AI 回复中提取结构化字段
function parseTokens(text: string, draft: DisDraft): Partial<DisDraft> {
  const updates: Partial<DisDraft> = {}
  const patterns: Array<[RegExp, keyof DisDraft]> = [
    [/\{\{concept_a_name:([^}]+)\}\}/g, 'concept_a_name'],
    [/\{\{concept_a_definition:([^}]+)\}\}/g, 'concept_a_definition'],
    [/\{\{concept_a_type:([^}]+)\}\}/g, 'concept_a_entity_type'],
    [/\{\{concept_a_id:([^}]+)\}\}/g, 'concept_a_entity_id'],
    [/\{\{concept_b_name:([^}]+)\}\}/g, 'concept_b_name'],
    [/\{\{concept_b_definition:([^}]+)\}\}/g, 'concept_b_definition'],
    [/\{\{concept_b_type:([^}]+)\}\}/g, 'concept_b_entity_type'],
    [/\{\{concept_b_id:([^}]+)\}\}/g, 'concept_b_entity_id'],
    [/\{\{core_difference:([^}]+)\}\}/g, 'core_difference'],
  ]
  for (const [regex, key] of patterns) {
    const match = regex.exec(text)
    if (match) (updates as Record<string, unknown>)[key] = match[1].trim()
  }
  // 解析场景
  const scenarioMatches = [...text.matchAll(/\{\{scenario:([^|]+)\|([^}]+)\}\}/g)]
  if (scenarioMatches.length > 0) {
    updates.scenarios = [...draft.scenarios, ...scenarioMatches.map(m => ({ condition: m[1].trim(), use: m[2].trim() }))]
  }
  return updates
}

function removeTokens(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, '').trim()
}

function SavedDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '2.5rem', width: '480px', textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>澄清条目已保存</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          <code style={{ background: '#f3f4f6', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>{id}</code> 已写入语义层
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={() => navigate(`/disambiguations/${id}`)} style={{ padding: '0.625rem 1.25rem', border: 'none', borderRadius: '0.5rem', background: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>查看详情</button>
          <button onClick={() => navigate('/disambiguations/new')} style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>再建一个</button>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>留在这里</button>
        </div>
      </div>
    </div>
  )
}

export default function DisambiguationEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'new'

  const [draft, setDraft] = useState<DisDraft>(EMPTY_DRAFT)
  const [metrics, setMetrics] = useState<Array<{ id: string; name: string }>>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const abortRef = useRef<boolean>(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/metrics')
      .then(r => r.json())
      .then((data: Array<{ id?: string; name?: string }>) => {
        setMetrics(data.filter(m => m.id).map(m => ({ id: m.id!, name: m.name || m.id! })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isEdit) {
      fetch(`/api/disambiguations/${id}`)
        .then(r => r.json())
        .then((data: Disambiguation) => {
          setDraft({
            concept_a_name: data.concept_a.name,
            concept_a_definition: data.concept_a.definition,
            concept_a_entity_type: data.concept_a.entity_type,
            concept_a_entity_id: data.concept_a.entity_id ?? '',
            concept_b_name: data.concept_b.name,
            concept_b_definition: data.concept_b.definition,
            concept_b_entity_type: data.concept_b.entity_type,
            concept_b_entity_id: data.concept_b.entity_id ?? '',
            core_difference: data.core_difference,
            scenarios: data.usage_scenarios ?? []
          })
        })
        .catch(e => setLoadError(e instanceof Error ? e.message : '加载失败'))
    }
  }, [id, isEdit])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  async function sendMessage(userMsg: string) {
    if (!userMsg.trim() || streaming) return
    setInput('')
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setStreaming(true)
    setStreamText('')
    abortRef.current = false

    let fullText = ''
    try {
      const draftContext = `
当前草稿状态：
- 概念A: ${draft.concept_a_name || '未填'}（${draft.concept_a_entity_type}）
- 概念B: ${draft.concept_b_name || '未填'}（${draft.concept_b_entity_type}）
- 核心差异: ${draft.core_difference || '未填'}
- 场景数: ${draft.scenarios.length}`

      const apiMessages = [
        ...newMessages.slice(0, -1),
        { role: 'user' as const, content: userMsg + '\n\n[当前草稿]\n' + draftContext }
      ]

      for await (const token of streamRequest('/api/ai/define-disambiguation', { conversationHistory: apiMessages, currentDraft: draft })) {
        if (abortRef.current) break
        fullText += token
        setStreamText(fullText)
      }
    } catch (e) {
      fullText = `[错误：${e instanceof Error ? e.message : '未知错误'}]`
      setStreamText(fullText)
    }

    const updates = parseTokens(fullText, draft)
    if (Object.keys(updates).length > 0) {
      setDraft(prev => ({ ...prev, ...updates }))
    }
    setMessages(prev => [...prev, { role: 'assistant', content: fullText }])
    setStreamText('')
    setStreaming(false)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const dis: Record<string, unknown> = {
        concept_a: {
          name: draft.concept_a_name,
          definition: draft.concept_a_definition,
          entity_type: draft.concept_a_entity_type,
          ...(draft.concept_a_entity_id ? { entity_id: draft.concept_a_entity_id } : {})
        },
        concept_b: {
          name: draft.concept_b_name,
          definition: draft.concept_b_definition,
          entity_type: draft.concept_b_entity_type,
          ...(draft.concept_b_entity_id ? { entity_id: draft.concept_b_entity_id } : {})
        },
        core_difference: draft.core_difference,
        usage_scenarios: draft.scenarios,
        auto_generated: false
      }
      if (isEdit) {
        const res = await fetch(`/api/disambiguations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...dis }) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setSavedId(id!)
      } else {
        const newId = `DIS-${String(Date.now()).slice(-6)}`
        const res = await fetch('/api/disambiguations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: newId, ...dis }) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setSavedId(newId)
      }
    } catch (e) {
      alert(e instanceof Error ? `保存失败: ${e.message}` : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function updateScenario(i: number, field: 'condition' | 'use', value: string) {
    setDraft(prev => {
      const s = [...prev.scenarios]
      s[i] = { ...s[i], [field]: value }
      return { ...prev, scenarios: s }
    })
  }

  if (loadError) return (
    <div style={{ padding: '2rem' }}>
      <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
        加载失败：{loadError}
      </div>
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/disambiguations" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>← 返回</Link>
          <span style={{ color: '#d1d5db' }}>|</span>
          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>{isEdit ? `编辑澄清 ${id}` : '新建概念澄清'}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !draft.concept_a_name || !draft.concept_b_name || !draft.core_difference}
          style={{
            padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.5rem',
            background: (saving || !draft.concept_a_name || !draft.concept_b_name || !draft.core_difference) ? '#93c5fd' : '#2563eb',
            cursor: (saving || !draft.concept_a_name || !draft.concept_b_name || !draft.core_difference) ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem', color: '#fff', fontWeight: '500'
          }}
        >
          {saving ? '保存中…' : '保存终稿'}
        </button>
      </div>

      {/* 主体：左对话 / 右草稿卡 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧 AI 对话 */}
        <div style={{ flex: '0 0 45%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fff' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f3f4f6', background: '#f9fafb', flexShrink: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>AI 澄清助手</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>描述两个相似概念，AI 帮你写清楚区别</div>
          </div>

          {/* 消息列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {messages.length === 0 && !streaming && (
              <div style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', paddingTop: '2rem', lineHeight: '1.7' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔀</div>
                <div>告诉我你想澄清哪两个概念</div>
                <div style={{ marginTop: '0.5rem', color: '#d1d5db', fontSize: '0.8125rem' }}>例如："GMV 和收入有什么区别？"</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '0.75rem 1rem', borderRadius: msg.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                  background: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                  color: msg.role === 'user' ? '#fff' : '#111827',
                  fontSize: '0.875rem', lineHeight: '1.6', whiteSpace: 'pre-wrap'
                }}>
                  {removeTokens(msg.content)}
                </div>
              </div>
            ))}
            {streaming && streamText && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ maxWidth: '85%', padding: '0.75rem 1rem', borderRadius: '1rem 1rem 1rem 0.25rem', background: '#f3f4f6', color: '#111827', fontSize: '0.875rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {removeTokens(streamText)}
                  <span style={{ display: 'inline-block', width: '6px', height: '14px', background: '#6b7280', marginLeft: '2px', animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 快捷提示 */}
          {messages.length === 0 && (
            <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
              {[
                'GMV 和收入有什么区别？',
                '新增用户 vs 注册用户 如何区分？',
                '付费 DAU 和活跃用户哪个更准确？'
              ].map(tip => (
                <button key={tip} onClick={() => sendMessage(tip)} style={{ padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', background: '#f9fafb', cursor: 'pointer', fontSize: '0.8125rem', color: '#374151', textAlign: 'left' }}>
                  {tip}
                </button>
              ))}
            </div>
          )}

          {/* 输入框 */}
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
              placeholder="描述概念或提问…"
              disabled={streaming}
              style={{ flex: 1, padding: '0.625rem 0.875rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none', background: streaming ? '#f9fafb' : '#fff' }}
            />
            {streaming ? (
              <button onClick={() => { abortRef.current = true }} style={{ padding: '0.625rem 0.875rem', border: 'none', borderRadius: '0.5rem', background: '#fee2e2', cursor: 'pointer', fontSize: '0.8125rem', color: '#dc2626' }}>停止</button>
            ) : (
              <button onClick={() => sendMessage(input)} disabled={!input.trim()} style={{ padding: '0.625rem 1rem', border: 'none', borderRadius: '0.5rem', background: input.trim() ? '#2563eb' : '#e5e7eb', cursor: input.trim() ? 'pointer' : 'not-allowed', fontSize: '0.875rem', color: input.trim() ? '#fff' : '#9ca3af' }}>发送</button>
            )}
          </div>
        </div>

        {/* 右侧草稿卡 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', background: '#f9fafb' }}>
          <div style={{ marginBottom: '1rem', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>概念澄清草稿</div>

          {/* 两个概念并排 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {/* 概念 A */}
            <div style={{ border: '1.5px solid #bfdbfe', borderRadius: '0.625rem', padding: '1rem', background: '#eff6ff' }}>
              <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: '600', marginBottom: '0.5rem' }}>概念 A</div>
              <input value={draft.concept_a_name} onChange={e => setDraft(p => ({ ...p, concept_a_name: e.target.value }))} placeholder="概念名称" style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #bfdbfe', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '0.5rem', boxSizing: 'border-box', background: '#fff' }} />
              <textarea value={draft.concept_a_definition} onChange={e => setDraft(p => ({ ...p, concept_a_definition: e.target.value }))} placeholder="定义说明…" rows={2} style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #bfdbfe', borderRadius: '0.375rem', fontSize: '0.8125rem', marginBottom: '0.5rem', resize: 'vertical', boxSizing: 'border-box', background: '#fff' }} />
              <select
                value={draft.concept_a_entity_id}
                onChange={e => setDraft(p => ({ ...p, concept_a_entity_id: e.target.value, concept_a_entity_type: 'metric' }))}
                style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #bfdbfe', borderRadius: '0.375rem', fontSize: '0.8125rem', background: '#fff' }}
              >
                <option value="">— 关联指标（可选）—</option>
                {metrics.map(m => (
                  <option key={m.id} value={m.id}>{m.id} · {m.name}</option>
                ))}
              </select>
            </div>
            {/* 概念 B */}
            <div style={{ border: '1.5px solid #bbf7d0', borderRadius: '0.625rem', padding: '1rem', background: '#f0fdf4' }}>
              <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: '600', marginBottom: '0.5rem' }}>概念 B</div>
              <input value={draft.concept_b_name} onChange={e => setDraft(p => ({ ...p, concept_b_name: e.target.value }))} placeholder="概念名称" style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #bbf7d0', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '0.5rem', boxSizing: 'border-box', background: '#fff' }} />
              <textarea value={draft.concept_b_definition} onChange={e => setDraft(p => ({ ...p, concept_b_definition: e.target.value }))} placeholder="定义说明…" rows={2} style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #bbf7d0', borderRadius: '0.375rem', fontSize: '0.8125rem', marginBottom: '0.5rem', resize: 'vertical', boxSizing: 'border-box', background: '#fff' }} />
              <select
                value={draft.concept_b_entity_id}
                onChange={e => setDraft(p => ({ ...p, concept_b_entity_id: e.target.value, concept_b_entity_type: 'metric' }))}
                style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #bbf7d0', borderRadius: '0.375rem', fontSize: '0.8125rem', background: '#fff' }}
              >
                <option value="">— 关联指标（可选）—</option>
                {metrics.map(m => (
                  <option key={m.id} value={m.id}>{m.id} · {m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 核心差异 */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.625rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>核心差异</div>
            <textarea
              value={draft.core_difference}
              onChange={e => setDraft(p => ({ ...p, core_difference: e.target.value }))}
              placeholder="描述两个概念最本质的区别，一两句话说清楚…"
              rows={3}
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {/* 使用场景 */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.625rem', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#374151' }}>使用场景</div>
              <button onClick={() => setDraft(p => ({ ...p, scenarios: [...p.scenarios, { condition: '', use: '' }] }))} style={{ padding: '0.25rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#374151' }}>+ 添加</button>
            </div>
            {draft.scenarios.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: '0.8125rem', textAlign: 'center', padding: '1rem 0' }}>暂无场景，与 AI 对话后自动填入</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {draft.scenarios.map((s, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                    <input value={s.condition} onChange={e => updateScenario(i, 'condition', e.target.value)} placeholder="触发条件…" style={{ padding: '0.375rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none' }} />
                    <input value={s.use} onChange={e => updateScenario(i, 'use', e.target.value)} placeholder="使用哪个…" style={{ padding: '0.375rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none' }} />
                    <button onClick={() => setDraft(p => ({ ...p, scenarios: p.scenarios.filter((_, j) => j !== i) }))} style={{ padding: '0.25rem 0.5rem', border: 'none', borderRadius: '0.25rem', background: '#fee2e2', cursor: 'pointer', color: '#dc2626', fontSize: '0.75rem' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {savedId && <SavedDialog id={savedId} onClose={() => setSavedId(null)} />}
    </div>
  )
}
