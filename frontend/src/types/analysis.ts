export type AnalysisPhase =
  | 'idle'
  | 'clarifying'
  | 'intent_confirm'
  | 'executing'
  | 'result'
  | 'deposition'
  | 'capability_gap'

export interface TurnMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface IntentCard {
  summary: string
  timeRange: string
  defaultNote: string
  metric?: string
  metricId?: string
  view?: string
}

export interface ExecutionStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  highlight?: 'exp_reuse' | 'dis_apply'
  detail?: string
}

export interface CapabilityGapPayload {
  missingConcept: string
  alternatives: string[]
  recordedNote: string
}

export type ChartType = 'line' | 'bar' | 'bar_vertical' | 'scalar' | 'pie'

export interface ResultPayload {
  summary: string
  chartTitle: string
  chartType?: ChartType
  breakdown: Array<{ label: string; value: string; width: string; raw?: number }>
  series?: Array<{ date: string; value: number }>
  sql?: string
  rowCount?: number
  /** 发向 Cube Core 的原始查询体，用于调试 */
  cubeQueries?: unknown[]
}

export interface ContextSnapshot {
  statusLabel: string
  metric?: string
  view?: string
  timeRange?: string
  disApplied?: string
  expHit?: string
  executedSql?: string
  queryEngine?: string
}

export interface DepositionPrefill {
  question: string
  conclusion: string
  path: {
    metrics: string[]
    views: string[]
    filters: string[]
  }
}

export interface AnalysisSession {
  phase: AnalysisPhase
  turns: TurnMessage[]
  /** AI 正在思考中（LLM 调用期间） */
  thinking?: boolean
  chips?: string[]
  gapType?: 'A' | 'B' | 'C'
  intent?: IntentCard
  intentEditing?: boolean
  steps?: ExecutionStep[]
  capabilityGap?: CapabilityGapPayload
  result?: ResultPayload
  depositionPrefill?: DepositionPrefill
  context: ContextSnapshot
  userQuery: string
  clarifyRound: number
}

export type ClientEvent =
  | { type: 'user_message'; text: string }
  | { type: 'confirm_intent' }
  | { type: 'edit_intent' }
  | { type: 'update_intent'; intent: IntentCard }
  | { type: 'capability_continue' }
  | { type: 'capability_new_question' }
  | { type: 'feedback_ok' }
  | { type: 'feedback_deep' }
  | { type: 'feedback_reframe' }
  | { type: 'save_experience'; conclusion: string }
  | { type: 'skip_experience' }
  | { type: 'new_conversation' }

export type SseEvent =
  | { type: 'session'; session: AnalysisSession }
  | { type: 'token'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export function emptySession(): AnalysisSession {
  return {
    phase: 'idle',
    turns: [],
    context: { statusLabel: '待开始' },
    userQuery: '',
    clarifyRound: 0
  }
}
