import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Experience } from './ExperiencesPage'

interface ExpDraft {
  original_question: string
  analysis_conclusion: string
  similar_questions: string[]
  metrics: string[]
  views: string[]
  source: string
}

const EMPTY_DRAFT: ExpDraft = {
  original_question: '',
  analysis_conclusion: '',
  similar_questions: [],
  metrics: [],
  views: [],
  source: '手动录入'
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

function SavedDialog({ id, navigate }: { id: string; navigate: (p: string) => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '2.5rem', width: '480px', textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>经验已保存</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          <code style={{ background: '#f3f4f6', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>{id}</code> 已写入语义层
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={() => navigate(`/experiences/${id}`)} style={{ padding: '0.625rem 1.25rem', border: 'none', borderRadius: '0.5rem', background: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}>查看详情</button>
          <button onClick={() => navigate('/experiences/new')} style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>再建一个</button>
          <button onClick={() => navigate('/experiences')} style={{ padding: '0.625rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>返回列表</button>
        </div>
      </div>
    </div>
  )
}

export default function ExperienceEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'new'

  const [draft, setDraft] = useState<ExpDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [aiSuggestion, setAiSuggestion] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showAi, setShowAi] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [allMetrics, setAllMetrics] = useState<Array<{ id: string; name: string }>>([])
  const [newView, setNewView] = useState('')
  const abortRef = useRef(false)

  useEffect(() => {
    fetch('/api/metrics')
      .then(r => r.json())
      .then((data: Array<{ id?: string; name?: string }>) => {
        setAllMetrics(data.filter(m => m.id).map(m => ({ id: m.id!, name: m.name || m.id! })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isEdit) {
      fetch(`/api/experiences/${id}`)
        .then(r => r.json())
        .then((data: Experience) => {
          setDraft({
            original_question: data.original_question,
            analysis_conclusion: data.analysis_conclusion,
            similar_questions: data.similar_questions ?? [],
            metrics: data.execution_path?.metrics ?? [],
            views: data.execution_path?.views ?? [],
            source: data.source ?? '手动录入'
          })
        })
        .catch(e => setLoadError(e instanceof Error ? e.message : '加载失败'))
    }
  }, [id, isEdit])

  async function generateAiSuggestion() {
    if (!draft.original_question || !draft.analysis_conclusion) return
    setAiLoading(true)
    setAiError(null)
    setAiSuggestion('')
    setShowAi(true)
    abortRef.current = false

    let text = ''
    try {
      for await (const token of streamRequest('/api/ai/suggest-experience', {
        original_question: draft.original_question,
        analysis_conclusion: draft.analysis_conclusion
      })) {
        if (abortRef.current) break
        text += token
        setAiSuggestion(text)
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '生成失败')
    }
    setAiLoading(false)
  }

  async function handleSave() {
    if (saving || !draft.original_question || !draft.analysis_conclusion) return
    setSaving(true)
    try {
      const exp: Record<string, unknown> = {
        original_question: draft.original_question,
        analysis_conclusion: draft.analysis_conclusion,
        similar_questions: draft.similar_questions,
        execution_path: {
          metrics: draft.metrics,
          views: draft.views,
          filters: []
        },
        source: draft.source,
        usage_count: 0,
        created_at: new Date().toISOString().split('T')[0]
      }

      if (isEdit) {
        const res = await fetch(`/api/experiences/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...exp }) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setSavedId(id!)
      } else {
        const newId = `EXP-${String(Date.now()).slice(-6)}`
        const res = await fetch('/api/experiences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: newId, ...exp }) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setSavedId(newId)
      }
    } catch (e) {
      alert(e instanceof Error ? `保存失败: ${e.message}` : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return (
    <div style={{ padding: '2rem' }}>
      <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
        加载失败：{loadError}
      </div>
    </div>
  )

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/experiences" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>← 返回</Link>
          <span style={{ color: '#d1d5db' }}>|</span>
          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>{isEdit ? `编辑经验 ${id}` : '新建分析经验'}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !draft.original_question || !draft.analysis_conclusion}
          style={{
            padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.5rem',
            background: (saving || !draft.original_question || !draft.analysis_conclusion) ? '#93c5fd' : '#2563eb',
            cursor: (saving || !draft.original_question || !draft.analysis_conclusion) ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem', color: '#fff', fontWeight: '500'
          }}
        >
          {saving ? '保存中…' : '保存经验'}
        </button>
      </div>

      {/* 核心信息 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>核心信息</h3>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.375rem' }}>原始问题 <span style={{ color: '#dc2626' }}>*</span></label>
          <input
            value={draft.original_question}
            onChange={e => setDraft(p => ({ ...p, original_question: e.target.value }))}
            placeholder="例如：上个月的 GMV 是多少？"
            style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.375rem' }}>分析结论 <span style={{ color: '#dc2626' }}>*</span></label>
          <textarea
            value={draft.analysis_conclusion}
            onChange={e => setDraft(p => ({ ...p, analysis_conclusion: e.target.value }))}
            placeholder="该问题的正确分析思路和结论…"
            rows={4}
            style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.375rem' }}>来源</label>
          <select value={draft.source} onChange={e => setDraft(p => ({ ...p, source: e.target.value }))} style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', background: '#fff', outline: 'none' }}>
            <option value="手动录入">手动录入</option>
            <option value="对话沉淀">对话沉淀</option>
            <option value="AI 生成">AI 生成</option>
          </select>
        </div>
      </div>

      {/* 相似问法 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>相似问法</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newQuestion.trim()) { setDraft(p => ({ ...p, similar_questions: [...p.similar_questions, newQuestion.trim()] })); setNewQuestion('') } }} placeholder="输入相似问法后按 Enter…" style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', outline: 'none' }} />
          <button onClick={() => { if (newQuestion.trim()) { setDraft(p => ({ ...p, similar_questions: [...p.similar_questions, newQuestion.trim()] })); setNewQuestion('') } }} style={{ padding: '0.5rem 0.875rem', border: 'none', borderRadius: '0.375rem', background: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', color: '#fff' }}>添加</button>
        </div>
        {draft.similar_questions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {draft.similar_questions.map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.625rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.375rem' }}>
                <span style={{ flex: 1, fontSize: '0.875rem', color: '#1d4ed8' }}>{q}</span>
                <button onClick={() => setDraft(p => ({ ...p, similar_questions: p.similar_questions.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: '0.875rem' }}>✕</button>
              </div>
            ))}
          </div>
        ) : <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>暂无，添加有助于 AI 匹配问题</div>}
      </div>

      {/* 执行路径 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>执行路径</h3>
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.375rem' }}>关联指标</div>
          <select
            value=""
            onChange={e => {
              const val = e.target.value
              if (val && !draft.metrics.includes(val)) {
                setDraft(p => ({ ...p, metrics: [...p.metrics, val] }))
              }
            }}
            style={{ width: '100%', padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', background: '#fff', outline: 'none', marginBottom: '0.5rem', cursor: 'pointer' }}
          >
            <option value="">— 选择指标 —</option>
            {allMetrics.filter(m => !draft.metrics.includes(m.id)).map(m => (
              <option key={m.id} value={m.id}>{m.id} · {m.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {draft.metrics.map((m, i) => {
              const meta = allMetrics.find(a => a.id === m)
              return (
                <span key={i} style={{ fontSize: '0.8125rem', padding: '0.125rem 0.5rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '0.25rem', cursor: 'pointer' }} onClick={() => setDraft(p => ({ ...p, metrics: p.metrics.filter((_, j) => j !== i) }))}>
                  {meta ? `${meta.id} · ${meta.name}` : m} ✕
                </span>
              )
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.375rem' }}>关联 View</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input value={newView} onChange={e => setNewView(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newView.trim()) { setDraft(p => ({ ...p, views: [...p.views, newView.trim()] })); setNewView('') } }} placeholder="VW-001…" style={{ flex: 1, padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none' }} />
            <button onClick={() => { if (newView.trim()) { setDraft(p => ({ ...p, views: [...p.views, newView.trim()] })); setNewView('') } }} style={{ padding: '0.375rem 0.75rem', border: 'none', borderRadius: '0.375rem', background: '#2563eb', cursor: 'pointer', fontSize: '0.8125rem', color: '#fff' }}>+</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {draft.views.map((v, i) => (
              <span key={i} style={{ fontSize: '0.8125rem', padding: '0.125rem 0.5rem', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '0.25rem', cursor: 'pointer' }} onClick={() => setDraft(p => ({ ...p, views: p.views.filter((_, j) => j !== i) }))}>
                {v} ✕
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* AI 优化建议 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAi ? '0.75rem' : '0' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>AI 优化建议</h3>
          <button
            onClick={generateAiSuggestion}
            disabled={aiLoading || !draft.original_question || !draft.analysis_conclusion}
            style={{
              padding: '0.375rem 0.875rem', border: '1px solid #bfdbfe', borderRadius: '0.375rem',
              background: (aiLoading || !draft.original_question || !draft.analysis_conclusion) ? '#f9fafb' : '#eff6ff',
              cursor: (aiLoading || !draft.original_question || !draft.analysis_conclusion) ? 'not-allowed' : 'pointer',
              fontSize: '0.8125rem', color: '#1d4ed8', fontWeight: '500'
            }}
          >
            {aiLoading ? '生成中…' : '✨ 生成建议'}
          </button>
        </div>
        {showAi && (
          <div>
            {aiError ? (
              <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
                {aiError}
              </div>
            ) : (
              <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap', minHeight: '3rem' }}>
                {aiSuggestion || <span style={{ color: '#9ca3af' }}>生成中…</span>}
                {aiLoading && <span style={{ display: 'inline-block', width: '6px', height: '14px', background: '#6b7280', marginLeft: '2px', verticalAlign: 'text-bottom' }} />}
              </div>
            )}
          </div>
        )}
      </div>

      {savedId && <SavedDialog id={savedId} navigate={navigate} />}
    </div>
  )
}
