import { useState, useRef, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts'
import type { AnalysisSession, ClientEvent, IntentCard } from '../../types/analysis'
import { emptySession } from '../../types/analysis'
import { dispatchAnalysisEvent } from './analysisApi'

const examples = [
  '查询APP总用户数是多少',
  '绑定各个设备的用户数分布',
  '最近15天有效绑定M9的社区活跃用户数趋势',
]

const btn = (primary?: boolean): React.CSSProperties => ({
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: primary ? 'none' : '1px solid #d1d5db',
  background: primary ? '#2563eb' : '#fff',
  color: primary ? '#fff' : '#374151',
  cursor: 'pointer',
  fontSize: '0.875rem'
})

const chipStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  border: '1px solid #d1d5db',
  borderRadius: '9999px',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '0.8125rem'
}

import type { ResultPayload } from '../../types/analysis'

interface HistoryEntry {
  result: ResultPayload
  /** 对应的最后一条 assistant turn 的 index（在 session.turns 中） */
  turnIndex: number
}

interface ThinkingEntry {
  text: string
  /** 对应的 user turn index */
  turnIndex: number
}

export default function AnalysisPage() {
  const [session, setSession] = useState<AnalysisSession>(emptySession())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [depositionConclusion, setDepositionConclusion] = useState('')
  const [editIntent, setEditIntent] = useState<IntentCard | null>(null)
  // resultHistory：每轮查询结果，按 turnIndex 锚定到对应 assistant turn
  const [resultHistory, setResultHistory] = useState<HistoryEntry[]>([])
  // thinkingHistory：每轮 LLM 思考过程，按 user turn index 锚定
  const [thinkingHistory, setThinkingHistory] = useState<ThinkingEntry[]>([])
  const pendingThinkingRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.turns, session.phase, session.steps, session.thinking])

  useEffect(() => {
    if (session.depositionPrefill) {
      setDepositionConclusion(session.depositionPrefill.conclusion)
    }
  }, [session.depositionPrefill])

  useEffect(() => {
    if (session.intent && session.intentEditing) {
      setEditIntent({ ...session.intent })
    }
  }, [session.intent, session.intentEditing])

  async function runEvent(event: ClientEvent) {
    if (busy) return
    setError(null)
    setBusy(true)
    if (event.type === 'new_conversation') {
      setResultHistory([])
      setThinkingHistory([])
      pendingThinkingRef.current = ''
    }
    let local = session
    // 记录本轮 user turn 的 index（发消息前 turns 长度即为新 user turn 的 index）
    const userTurnIndex = event.type === 'user_message' ? session.turns.length : -1
    let resultCaptured = false

    try {
      await dispatchAnalysisEvent(
        event.type === 'new_conversation' ? null : session,
        event,
        ev => {
          if (ev.type === 'session') {
            local = ev.session
            setSession(ev.session)

            // 当 phase 首次切到 result 且有 result 时，捕获一次
            if (ev.session.phase === 'result' && ev.session.result && !resultCaptured) {
              resultCaptured = true
              // 找最后一条 assistant turn 的 index
              const turns = ev.session.turns
              let assistantIdx = turns.length - 1
              while (assistantIdx >= 0 && turns[assistantIdx].role !== 'assistant') assistantIdx--
              setResultHistory(prev => {
                const last = prev[prev.length - 1]
                if (last?.result === ev.session.result) return prev
                return [...prev, { result: ev.session.result!, turnIndex: assistantIdx }]
              })
            }

            // 思考结束时（thinking 从 true 变 false），保存本轮 thinkingText
            if (!ev.session.thinking && pendingThinkingRef.current && userTurnIndex >= 0) {
              const text = pendingThinkingRef.current
              pendingThinkingRef.current = ''
              setThinkingHistory(prev => {
                if (prev.some(t => t.turnIndex === userTurnIndex)) return prev
                return [...prev, { text, turnIndex: userTurnIndex }]
              })
            }
          }
          if (ev.type === 'token') {
            setSession(prev => {
              const turns = [...prev.turns]
              const last = turns[turns.length - 1]
              if (last?.role === 'assistant') {
                turns[turns.length - 1] = { ...last, content: last.content + ev.content }
              }
              return { ...prev, turns }
            })
          }
          if (ev.type === 'thinking_token') {
            pendingThinkingRef.current += ev.content
            setSession(prev => ({
              ...prev,
              thinkingText: (prev.thinkingText || '') + ev.content
            }))
          }
          if (ev.type === 'error') setError(ev.message)
        }
      )
      setSession(local)
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  function sendText(text: string) {
    const t = text.trim()
    if (!t) return
    runEvent({ type: 'user_message', text: t })
    setInput('')
  }

  const showInput = session.phase !== 'executing'
  const inputDisabled =
    busy || (session.phase === 'intent_confirm' && !session.intentEditing)

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: '65', display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {session.phase === 'idle' && session.turns.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <h2 style={{ fontSize: '1.5rem', color: '#111827', marginBottom: '0.5rem' }}>你好，我是分析 Agent</h2>
              <p style={{ color: '#6b7280', marginBottom: '2rem' }}>告诉我你想分析什么，我来帮你找答案</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {examples.map(ex => (
                  <button key={ex} type="button" onClick={() => sendText(ex)} style={chipStyle}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {session.turns.map((msg, i) => (
            <div key={i}>
              <div
                style={{
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                {msg.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '0.5rem', flexShrink: 0, alignSelf: 'flex-end' }}>
                    <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>AI</span>
                  </div>
                )}
                <div
                  style={{
                    maxWidth: '72%',
                    padding: '0.75rem 1rem',
                    borderRadius: msg.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                    backgroundColor: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                    color: msg.role === 'user' ? '#fff' : '#111827',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.875rem',
                    lineHeight: 1.6
                  }}
                >
                  {msg.content || (busy && i === session.turns.length - 1 && msg.role === 'assistant' ? '▌' : '')}
                </div>
              </div>

              {/* user turn 后：渲染对应的折叠思考过程 */}
              {msg.role === 'user' && thinkingHistory
                .filter(t => t.turnIndex === i)
                .map((t, j) => (
                  <details key={`think-${i}-${j}`} style={{ marginBottom: '0.75rem', marginLeft: '0.5rem' }}>
                    <summary style={{ fontSize: '0.8rem', color: '#9ca3af', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.7rem' }}>▶</span> AI 思考过程
                    </summary>
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: '0.8125rem', color: '#6b7280', fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {t.text}
                    </div>
                  </details>
                ))
              }

              {/* assistant turn 后：渲染锚定到该 turn 的结果卡片 */}
              {msg.role === 'assistant' && resultHistory
                .map((entry, idx) => ({ entry, idx }))
                .filter(({ entry }) => entry.turnIndex === i)
                .map(({ entry, idx }) => {
                  const isLatest = idx === resultHistory.length - 1
                  return isLatest && session.phase === 'result'
                    ? <ResultBlock
                        key={`res-${idx}`}
                        result={entry.result}
                        busy={busy}
                        onOk={() => runEvent({ type: 'feedback_ok' })}
                        onDeep={() => runEvent({ type: 'feedback_deep' })}
                        onReframe={() => runEvent({ type: 'feedback_reframe' })}
                      />
                    : <ResultBlock key={`res-${idx}`} result={entry.result} busy={false} readonly />
                })
              }
            </div>
          ))}

          {/* AI 思考中：流式思考文字（进行中） */}
          {session.thinking && (
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>AI</span>
              </div>
              <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', borderRadius: '1rem 1rem 1rem 0.25rem', maxWidth: '72%' }}>
                {session.thinkingText
                  ? <span style={{ fontSize: '0.8125rem', color: '#6b7280', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{session.thinkingText}</span>
                  : <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ThinkingDots /></div>
                }
              </div>
            </div>
          )}

          {session.phase === 'clarifying' && session.chips && (
            <ChipRow chips={session.chips} disabled={busy} onPick={sendText} />
          )}

          {session.phase === 'intent_confirm' && session.intent && (
            <IntentBlock
              intent={session.intentEditing && editIntent ? editIntent : session.intent}
              editing={Boolean(session.intentEditing)}
              onEdit={setEditIntent}
              busy={busy}
              onConfirm={() => runEvent({ type: 'confirm_intent' })}
              onStartEdit={() => runEvent({ type: 'edit_intent' })}
              onSaveEdit={() => editIntent && runEvent({ type: 'update_intent', intent: editIntent })}
              onCancelEdit={() => {
                setEditIntent(null)
                setSession(s => ({ ...s, intentEditing: false }))
              }}
            />
          )}

          {session.phase === 'executing' && session.steps && <ExecutionLog steps={session.steps} />}

          {session.phase === 'capability_gap' && (
            <div style={{ margin: '1rem 0', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" style={btn(true)} disabled={busy} onClick={() => runEvent({ type: 'capability_continue' })}>
                用替代方案继续分析
              </button>
              <button type="button" style={btn()} disabled={busy} onClick={() => runEvent({ type: 'capability_new_question' })}>
                换个问题
              </button>
            </div>
          )}

          {session.phase === 'deposition' && session.depositionPrefill && (
            <DepositionBlock
              prefill={session.depositionPrefill}
              conclusion={depositionConclusion}
              onConclusionChange={setDepositionConclusion}
              busy={busy}
              onSave={() => runEvent({ type: 'save_experience', conclusion: depositionConclusion })}
              onSkip={() => runEvent({ type: 'skip_experience' })}
            />
          )}

          {error && (
            <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', marginBottom: '1rem' }}>
              {error}
              <button type="button" onClick={() => setError(null)} style={{ marginLeft: '1rem', textDecoration: 'underline', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
                关闭
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {showInput && (
          <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.5rem' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendText(input)
                }
              }}
              placeholder="想分析什么？"
              disabled={inputDisabled || busy}
              style={{ flex: 1, padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem' }}
            />
            <button type="button" onClick={() => sendText(input)} disabled={busy || !input.trim() || inputDisabled} style={btn(true)}>
              {busy ? '处理中…' : '发送'}
            </button>
          </div>
        )}
      </div>

      <ContextPanel session={session} onNewChat={() => runEvent({ type: 'new_conversation' })} busy={busy} />
    </div>
  )
}

function ChipRow({ chips, disabled, onPick }: { chips: string[]; disabled: boolean; onPick: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0 1rem' }}>
      {chips.map(c => (
        <button key={c} type="button" disabled={disabled} style={chipStyle} onClick={() => onPick(c)}>
          {c}
        </button>
      ))}
    </div>
  )
}

function IntentBlock({
  intent,
  editing,
  onEdit,
  busy,
  onConfirm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit
}: {
  intent: IntentCard
  editing: boolean
  onEdit: (i: IntentCard) => void
  busy: boolean
  onConfirm: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}) {
  const renderField = (label: string, key: keyof IntentCard) => (
    <div style={{ marginTop: '0.5rem' }}>
      <strong>{label}</strong>
      {editing ? (
        <input
          value={(intent[key] as string) || ''}
          onChange={e => onEdit({ ...intent, [key]: e.target.value })}
          style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem', fontSize: '0.875rem', display: 'block' }}
        />
      ) : (
        <div style={{ marginTop: '0.15rem' }}>{intent[key] as string}</div>
      )}
    </div>
  )

  return (
    <div style={{ margin: '1rem 0', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.75rem', background: '#fff' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>意图确认</div>
      {renderField('方案', 'summary')}
      {renderField('时间', 'timeRange')}
      {intent.filterConditions && intent.filterConditions.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <strong>过滤条件</strong>
          <div style={{ marginTop: '0.15rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {intent.filterConditions.map((f, i) => (
              <span key={i} style={{ fontSize: '0.8125rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '0.375rem', padding: '0.1rem 0.5rem' }}>
                {f.title || f.dimension}：{f.values.join(' / ')}
              </span>
            ))}
          </div>
        </div>
      )}
      {renderField('说明', 'defaultNote')}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        {editing ? (
          <>
            <button type="button" style={btn(true)} disabled={busy} onClick={onSaveEdit}>保存</button>
            <button type="button" style={btn()} disabled={busy} onClick={onCancelEdit}>取消</button>
          </>
        ) : (
          <>
            <button type="button" style={btn(true)} disabled={busy} onClick={onConfirm}>✅ 开始分析</button>
            <button type="button" style={btn()} disabled={busy} onClick={onStartEdit}>✏ 修改</button>
          </>
        )}
      </div>
    </div>
  )
}

function ExecutionLog({ steps }: { steps: NonNullable<AnalysisSession['steps']> }) {
  return (
    <div style={{ margin: '1rem 0', padding: '1rem', background: '#f9fafb', borderRadius: '0.75rem', border: '1px solid #e5e7eb' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>执行日志</div>
      {steps.map(step => (
        <div key={step.id} style={{ fontSize: '0.875rem', padding: '0.35rem 0', color: step.status === 'error' ? '#dc2626' : step.status === 'done' ? '#111827' : '#6b7280' }}>
          {step.status === 'running' ? '⏳ ' : step.status === 'done' ? '✅ ' : step.status === 'error' ? '✗ ' : '○ '}
          {step.label}
          {step.highlight === 'exp_reuse' && step.status === 'done' && (
            <span style={{ marginLeft: '0.5rem', color: '#15803d', fontWeight: 600 }}>🟢 复用中</span>
          )}
          {step.detail && step.status === 'done' && (
            <pre style={{ marginTop: '0.35rem', padding: '0.5rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.375rem', fontSize: '0.7rem', overflow: 'auto', maxHeight: '120px' }}>
              {step.detail}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

function ResultBlock({
  result,
  busy,
  readonly,
  onOk,
  onDeep,
  onReframe
}: {
  result: NonNullable<AnalysisSession['result']>
  busy: boolean
  readonly?: boolean
  onOk?: () => void
  onDeep?: () => void
  onReframe?: () => void
}) {
  const chartType = result.chartType ?? (result.series && result.series.length > 0 ? 'line' : 'bar')
  const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#be185d', '#0284c7', '#16a34a']

  const formatDate = (d: string) => d.slice(5) // "MM-DD"
  const formatVal = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString('zh-CN')

  const breakdownData = result.breakdown.map(b => ({
    label: b.label,
    value: b.raw ?? (Number(b.value.replace(/[万,]/g, '')) || 0),
    display: b.value
  }))
  const totalBreak = breakdownData.reduce((s, b) => s + b.value, 0) || 1

  return (
    <div style={{ margin: '1rem 0', padding: '1.25rem', border: '1px solid #e5e7eb', borderRadius: '0.875rem', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.25rem' }}>{result.chartTitle}</div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1rem' }}>
        {result.rowCount != null ? `${result.rowCount} 行数据` : ''}
      </div>

      {/* 单值卡片 */}
      {chartType === 'scalar' && breakdownData.length > 0 && (
        <div style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '1.5rem 0' }}>
          <div style={{ fontSize: '3rem', fontWeight: 700, color: '#2563eb', lineHeight: 1 }}>
            {breakdownData[0].display}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            {result.chartTitle.split('（')[0]}
          </div>
        </div>
      )}

      {/* 趋势折线图 */}
      {(chartType === 'line') && result.series && result.series.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={result.series} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatVal}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                formatter={(v: unknown) => [formatVal(Number(v)), result.chartTitle.split('（')[0]]}
                labelFormatter={(l: unknown) => String(l)}
                contentStyle={{ fontSize: '0.8125rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2}
                dot={result.series.length <= 30 ? { r: 3, fill: '#2563eb' } : false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 分布横向柱状图（bar）或无趋势时的竖向柱状图 */}
      {(chartType === 'bar' || chartType === 'bar_vertical') && breakdownData.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <ResponsiveContainer width="100%" height={Math.max(180, breakdownData.length * 36)}>
            <BarChart
              layout="vertical"
              data={breakdownData}
              margin={{ top: 4, right: 60, bottom: 4, left: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis
                type="number"
                tickFormatter={formatVal}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={90}
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: unknown) => [formatVal(Number(v)), '数值']}
                contentStyle={{ fontSize: '0.8125rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {breakdownData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: unknown) => formatVal(Number(v))}
                  style={{ fontSize: '11px', fill: '#6b7280' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 分布饼图 */}
      {chartType === 'pie' && breakdownData.length > 0 && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ width: 220, height: 220, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdownData}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={48}
                  paddingAngle={2}
                >
                  {breakdownData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: unknown, name: unknown, props: { payload?: { display?: string } }) =>
                    [props?.payload?.display ?? formatVal(Number(v)), String(name)]
                  }
                  contentStyle={{ fontSize: '0.8125rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            {breakdownData.slice(0, 10).map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>{b.label || '—'}</span>
                <span style={{ color: '#6b7280', marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>{b.display}</span>
                <span style={{ color: '#9ca3af', minWidth: '2.5rem', textAlign: 'right' }}>{Math.round((b.value / totalBreak) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 趋势+分布：趋势折线下方显示分布详情 */}
      {chartType === 'line' && breakdownData.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>分布详情</div>
          {breakdownData.slice(0, 8).map((b, i) => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', marginBottom: '0.4rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span style={{ minWidth: '5rem', maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>{b.label}</span>
              <div style={{ flex: 1, height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((b.value / totalBreak) * 100)}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: '3px' }} />
              </div>
              <span style={{ color: '#6b7280', minWidth: '3rem', textAlign: 'right' }}>{b.display}</span>
              <span style={{ color: '#9ca3af', minWidth: '2.5rem', textAlign: 'right' }}>{Math.round((b.value / totalBreak) * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 摘要 */}
      <p style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.6, marginBottom: '1rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
        {result.summary}
      </p>

      {!readonly && (
        <>
          <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>结果符合预期吗？</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" style={btn(true)} disabled={busy} onClick={onOk}>✅ 符合</button>
            <button type="button" style={btn()} disabled={busy} onClick={onDeep}>🔄 深入分析</button>
            <button type="button" style={btn()} disabled={busy} onClick={onReframe}>✏ 换个角度</button>
          </div>
        </>
      )}
    </div>
  )
}

function DepositionBlock({
  prefill,
  conclusion,
  onConclusionChange,
  busy,
  onSave,
  onSkip
}: {
  prefill: NonNullable<AnalysisSession['depositionPrefill']>
  conclusion: string
  onConclusionChange: (s: string) => void
  busy: boolean
  onSave: () => void
  onSkip: () => void
}) {
  return (
    <div style={{ margin: '1rem 0', padding: '1rem', border: '1px solid #bbf7d0', borderRadius: '0.75rem', background: '#f0fdf4' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>💡 存入经验层？</div>
      <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>问题：{prefill.question}</p>
      <label style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.875rem' }}>分析结论（一句话）</label>
      <textarea
        value={conclusion}
        onChange={e => onConclusionChange(e.target.value)}
        rows={2}
        style={{ width: '100%', marginTop: '0.25rem', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
      />
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button type="button" style={btn(true)} disabled={busy || !conclusion.trim()} onClick={onSave}>✅ 保存到经验层</button>
        <button type="button" style={btn()} disabled={busy} onClick={onSkip}>不了</button>
      </div>
    </div>
  )
}

function ContextPanel({
  session,
  onNewChat,
  busy
}: {
  session: AnalysisSession
  onNewChat: () => void
  busy: boolean
}) {
  const ctx = session.context
  const cubeQueries = session.result?.cubeQueries
  return (
    <div style={{ flex: '35', padding: '1.5rem', backgroundColor: '#f9fafb', overflowY: 'auto' }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', marginBottom: '1rem', textTransform: 'uppercase' }}>本次分析</h3>
      <dl style={{ fontSize: '0.875rem', lineHeight: 1.8, margin: 0 }}>
        <Row label="状态" value={ctx.statusLabel} />
        {ctx.metric && <Row label="指标" value={ctx.metric} />}
        {ctx.view && <Row label="View" value={ctx.view} />}
        {ctx.timeRange && <Row label="时间" value={ctx.timeRange} />}
        {ctx.disApplied && <Row label="澄清层" value={`已应用 ${ctx.disApplied}`} />}
        {ctx.expHit && <Row label="经验层" value={`命中 ${ctx.expHit} 🟢`} />}
        {ctx.queryEngine && <Row label="引擎" value={ctx.queryEngine} />}
      </dl>
      {ctx.executedSql && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ fontSize: '0.8125rem', color: '#2563eb', cursor: 'pointer' }}>查看执行的 SQL</summary>
          <pre style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: '0.7rem', overflow: 'auto', maxHeight: '200px', whiteSpace: 'pre-wrap' }}>
            {ctx.executedSql}
          </pre>
        </details>
      )}
      {cubeQueries && cubeQueries.length > 0 && (
        <details style={{ marginTop: '0.75rem' }}>
          <summary style={{ fontSize: '0.8125rem', color: '#2563eb', cursor: 'pointer' }}>
            查看 Cube 请求参数（{cubeQueries.length} 个查询）
          </summary>
          {cubeQueries.map((q, i) => (
            <pre
              key={i}
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                fontSize: '0.7rem',
                overflow: 'auto',
                maxHeight: '260px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}
            >
              {cubeQueries.length > 1 && (
                <span style={{ display: 'block', color: '#9ca3af', marginBottom: '0.35rem' }}>
                  # 查询 {i + 1}
                </span>
              )}
              {JSON.stringify(q, null, 2)}
            </pre>
          ))}
        </details>
      )}
      <button type="button" style={{ ...btn(), marginTop: '1.5rem', width: '100%' }} disabled={busy} onClick={onNewChat}>
        🆕 新建对话
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <dt style={{ color: '#6b7280', minWidth: '4rem' }}>{label}</dt>
      <dd style={{ margin: 0, color: '#111827' }}>{value}</dd>
    </div>
  )
}

function ThinkingDots() {
  return (
    <>
      <style>{`
        @keyframes thinking-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        .thinking-dot {
          width: 7px; height: 7px;
          background: #9ca3af;
          border-radius: 50%;
          animation: thinking-bounce 1.2s ease-in-out infinite;
        }
        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
      <div className="thinking-dot" />
      <div className="thinking-dot" />
      <div className="thinking-dot" />
    </>
  )
}
