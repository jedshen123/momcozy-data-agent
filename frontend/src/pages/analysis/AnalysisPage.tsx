import { useState, useRef, useEffect } from 'react'
import type { AnalysisSession, ClientEvent, IntentCard } from '../../types/analysis'
import { emptySession } from '../../types/analysis'
import { dispatchAnalysisEvent } from './analysisApi'

const examples = [
  '上个月各渠道的销售额是多少？',
  '最近 30 天活跃用户数趋势',
  '本季度 GMV vs 去年同期对比',
  '退款率是多少？',
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

export default function AnalysisPage() {
  const [session, setSession] = useState<AnalysisSession>(emptySession())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [depositionConclusion, setDepositionConclusion] = useState('')
  const [editIntent, setEditIntent] = useState<IntentCard | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.turns, session.phase, session.steps])

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
    let local = session

    try {
      await dispatchAnalysisEvent(
        event.type === 'new_conversation' ? null : session,
        event,
        ev => {
          if (ev.type === 'session') {
            local = ev.session
            setSession(ev.session)
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
                  <button key={ex} type="button" onClick={() => setInput(ex)} style={chipStyle}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {session.turns.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              <div
                style={{
                  maxWidth: '70%',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem',
                  backgroundColor: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                  color: msg.role === 'user' ? '#fff' : '#111827',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {msg.content || (busy && i === session.turns.length - 1 && msg.role === 'assistant' ? '▌' : '')}
              </div>
            </div>
          ))}

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

          {session.phase === 'result' && session.result && (
            <ResultBlock
              result={session.result}
              busy={busy}
              onOk={() => runEvent({ type: 'feedback_ok' })}
              onDeep={() => runEvent({ type: 'feedback_deep' })}
              onReframe={() => runEvent({ type: 'feedback_reframe' })}
            />
          )}

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
  onOk,
  onDeep,
  onReframe
}: {
  result: NonNullable<AnalysisSession['result']>
  busy: boolean
  onOk: () => void
  onDeep: () => void
  onReframe: () => void
}) {
  const maxVal = Math.max(...(result.series?.map(s => s.value) ?? [1]), 1)

  return (
    <div style={{ margin: '1rem 0', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.75rem' }}>
      <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.5rem' }}>{result.chartTitle}</div>
      {result.series && result.series.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100px', marginBottom: '1rem', padding: '0 0.25rem' }}>
          {result.series.map(s => (
            <div
              key={s.date}
              title={`${s.date}: ${s.value}`}
              style={{
                flex: 1,
                minWidth: '4px',
                height: `${Math.max(4, (s.value / maxVal) * 100)}%`,
                background: '#2563eb',
                borderRadius: '2px 2px 0 0'
              }}
            />
          ))}
        </div>
      ) : (
        <div style={{ height: '80px', background: '#f3f4f6', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.8125rem', marginBottom: '1rem' }}>
          暂无趋势数据
        </div>
      )}
      {result.breakdown.map(row => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', marginBottom: '0.35rem' }}>
          <span style={{ width: '3rem' }}>{row.label}</span>
          <div style={{ flex: 1, height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: row.width, height: '100%', background: '#2563eb' }} />
          </div>
          <span>{row.value}</span>
        </div>
      ))}
      <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>结果符合预期吗？</p>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" style={btn()} disabled={busy} onClick={onOk}>✅ 符合</button>
        <button type="button" style={btn()} disabled={busy} onClick={onDeep}>🔄 深入分析</button>
        <button type="button" style={btn()} disabled={busy} onClick={onReframe}>✏ 换个角度</button>
      </div>
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
