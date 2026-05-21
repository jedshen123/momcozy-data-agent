import { useState, useRef } from 'react'

interface ReportSection {
  title: string
  content: string
}

type Phase = 'idle' | 'generating' | 'done' | 'error'

// 解析流式报告文本为章节
function parseSections(text: string): ReportSection[] {
  if (!text) return []
  const lines = text.split('\n')
  const sections: ReportSection[] = []
  let current: ReportSection | null = null

  for (const line of lines) {
    // 检测标题行（数字开头 或 ## 标题）
    const headingMatch = line.match(/^(?:#{1,3}\s+|(\d+)[.、]\s+)(.+)/)
    if (headingMatch) {
      if (current) sections.push(current)
      current = { title: (headingMatch[2] || headingMatch[0]).trim(), content: '' }
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line
    } else {
      // 在第一个标题前的内容作为序言
      if (!sections.find(s => s.title === '概述')) {
        sections.push({ title: '概述', content: line })
        current = sections[0]
      } else {
        sections[0].content += '\n' + line
      }
    }
  }
  if (current && !sections.includes(current)) sections.push(current)
  return sections.filter(s => s.title || s.content)
}

// 健康分颜色
function scoreColor(score: number) {
  if (score >= 80) return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', badge: '#dcfce7' }
  if (score >= 60) return { bg: '#fefce8', border: '#fef08a', text: '#854d0e', badge: '#fef9c3' }
  return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', badge: '#fee2e2' }
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const c = scoreColor(score)
  return (
    <div style={{ border: `1.5px solid ${c.border}`, borderRadius: '0.75rem', padding: '1rem 1.25rem', background: c.bg, textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: '2rem', fontWeight: '700', color: c.text }}>{score}</div>
      <div style={{ fontSize: '0.75rem', color: c.text, marginTop: '0.25rem', fontWeight: '500' }}>{label}</div>
    </div>
  )
}

interface SuggestionItem {
  text: string
  status: 'pending' | 'adopted' | 'ignored'
}

function extractSuggestions(text: string): string[] {
  const results: string[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    // 匹配以 - 或 • 或数字开头的建议行
    const match = line.match(/^[\-•*]\s+(.+)|^\d+[.、]\s+(.+)/)
    if (match) {
      const suggestion = (match[1] || match[2]).trim()
      if (suggestion.length > 10) results.push(suggestion)
    }
  }
  return results.slice(0, 8)
}

export default function OptimizerPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [reportText, setReportText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [showRaw, setShowRaw] = useState(false)
  const abortRef = useRef(false)

  // 模拟健康分（实际可从报告文本中解析）
  const scores = { overall: 72, experience: 68, disambiguation: 85, semantic: 78 }

  async function generateReport() {
    setPhase('generating')
    setReportText('')
    setErrorMsg('')
    setSuggestions([])
    abortRef.current = false

    let fullText = ''
    try {
      const res = await fetch('/api/optimizer/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: '请分析过去 30 天的语义层运行数据，生成包含健康度评分、经验层命中率、澄清效率和具体优化建议的完整报告。' })
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (abortRef.current) { reader.cancel(); break }
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(parsed.error)
            const token = parsed.choices?.[0]?.delta?.content
            if (token) {
              fullText += token
              setReportText(fullText)
            }
          } catch { }
        }
      }

      const extracted = extractSuggestions(fullText)
      setSuggestions(extracted.map(t => ({ text: t, status: 'pending' })))
      setPhase('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '生成失败')
      setPhase('error')
    }
  }

  function updateSuggestion(i: number, status: 'adopted' | 'ignored' | 'pending') {
    setSuggestions(prev => prev.map((s, j) => j === i ? { ...s, status } : s))
  }

  const sections = parseSections(reportText)
  const adoptedCount = suggestions.filter(s => s.status === 'adopted').length
  const ignoredCount = suggestions.filter(s => s.status === 'ignored').length

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>语义层优化器</h1>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>扫描 Cube / View / 指标 / 经验层，生成健康度报告和优化建议</p>
        </div>
        {phase !== 'generating' && (
          <button
            onClick={generateReport}
            style={{ padding: '0.625rem 1.5rem', border: 'none', borderRadius: '0.5rem', background: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}
          >
            {phase === 'done' || phase === 'error' ? '重新生成' : '生成报告'}
          </button>
        )}
        {phase === 'generating' && (
          <button onClick={() => { abortRef.current = true; setPhase('done') }} style={{ padding: '0.625rem 1.5rem', border: 'none', borderRadius: '0.5rem', background: '#fee2e2', cursor: 'pointer', fontSize: '0.875rem', color: '#dc2626' }}>
            停止生成
          </button>
        )}
      </div>

      {/* 空状态 */}
      {phase === 'idle' && (
        <div style={{ textAlign: 'center', padding: '5rem 2rem', border: '2px dashed #e5e7eb', borderRadius: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔬</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>准备好了吗？</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '380px', margin: '0 auto 1.5rem' }}>
            AI 将扫描整个语义层，分析数据质量、经验命中率和澄清效率，生成可操作的优化建议。
          </p>
          <button onClick={generateReport} style={{ padding: '0.75rem 2rem', border: 'none', borderRadius: '0.5rem', background: '#2563eb', cursor: 'pointer', fontSize: '0.9375rem', color: '#fff', fontWeight: '600' }}>
            开始扫描
          </button>
        </div>
      )}

      {/* 生成中 */}
      {phase === 'generating' && (
        <div>
          {/* 进度条动画 */}
          <div style={{ background: '#f3f4f6', borderRadius: '9999px', height: '6px', marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: '9999px', animation: 'progress-indeterminate 2s ease-in-out infinite', width: '60%' }} />
          </div>
          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            AI 正在扫描语义层数据…
          </div>
          {/* 流式预览 */}
          {reportText && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fafafa', fontFamily: 'monospace', fontSize: '0.8125rem', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto' }}>
              {reportText}
              <span style={{ display: 'inline-block', width: '6px', height: '14px', background: '#6b7280', marginLeft: '2px', verticalAlign: 'text-bottom' }} />
            </div>
          )}
        </div>
      )}

      {/* 错误 */}
      {phase === 'error' && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
          生成失败：{errorMsg}
        </div>
      )}

      {/* 报告 */}
      {(phase === 'done' || (phase === 'generating' && reportText)) && phase === 'done' && (
        <div>
          {/* 健康分概览 */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>健康度概览</div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <ScoreCard label="综合健康分" score={scores.overall} />
              <ScoreCard label="经验层命中" score={scores.experience} />
              <ScoreCard label="澄清覆盖" score={scores.disambiguation} />
              <ScoreCard label="语义完整度" score={scores.semantic} />
            </div>
          </div>

          {/* 优化建议快速操作区 */}
          {suggestions.length > 0 && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>优化建议（{suggestions.length} 条）</div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                  {adoptedCount > 0 && <span style={{ color: '#15803d' }}>已采纳 {adoptedCount}</span>}
                  {ignoredCount > 0 && <span style={{ color: '#6b7280' }}>已忽略 {ignoredCount}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem',
                    background: s.status === 'adopted' ? '#f0fdf4' : s.status === 'ignored' ? '#f9fafb' : '#fff',
                    border: `1px solid ${s.status === 'adopted' ? '#bbf7d0' : s.status === 'ignored' ? '#e5e7eb' : '#e5e7eb'}`,
                    opacity: s.status === 'ignored' ? 0.6 : 1
                  }}>
                    <div style={{ flex: 1, fontSize: '0.875rem', color: s.status === 'ignored' ? '#9ca3af' : '#374151', lineHeight: '1.5', textDecoration: s.status === 'ignored' ? 'line-through' : 'none' }}>
                      {s.text}
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                      {s.status !== 'adopted' && (
                        <button onClick={() => updateSuggestion(i, 'adopted')} style={{ padding: '0.25rem 0.625rem', border: '1px solid #bbf7d0', borderRadius: '0.375rem', background: '#f0fdf4', cursor: 'pointer', fontSize: '0.75rem', color: '#15803d' }}>采纳</button>
                      )}
                      {s.status === 'adopted' && (
                        <button onClick={() => updateSuggestion(i, 'pending')} style={{ padding: '0.25rem 0.625rem', border: '1px solid #bbf7d0', borderRadius: '0.375rem', background: '#dcfce7', cursor: 'pointer', fontSize: '0.75rem', color: '#15803d', fontWeight: '600' }}>✓ 已采纳</button>
                      )}
                      {s.status !== 'ignored' && (
                        <button onClick={() => updateSuggestion(i, 'ignored')} style={{ padding: '0.25rem 0.625rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#9ca3af' }}>忽略</button>
                      )}
                      {s.status === 'ignored' && (
                        <button onClick={() => updateSuggestion(i, 'pending')} style={{ padding: '0.25rem 0.625rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#9ca3af' }}>撤销</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 完整报告 */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>完整分析报告</div>
              <button onClick={() => setShowRaw(!showRaw)} style={{ padding: '0.25rem 0.625rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280' }}>
                {showRaw ? '格式视图' : '原始文本'}
              </button>
            </div>
            <div style={{ padding: '1.25rem' }}>
              {showRaw ? (
                <pre style={{ fontSize: '0.8125rem', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>{reportText}</pre>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {sections.length > 0 ? sections.map((sec, i) => (
                    <div key={i}>
                      {sec.title && (
                        <h3 style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '1px solid #f3f4f6' }}>{sec.title}</h3>
                      )}
                      <div style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.75', whiteSpace: 'pre-wrap' }}>{sec.content.trim()}</div>
                    </div>
                  )) : (
                    <div style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.75', whiteSpace: 'pre-wrap' }}>{reportText}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(60%); }
          100% { transform: translateX(160%); }
        }
      `}</style>
    </div>
  )
}
