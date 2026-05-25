export type AnalysisPhase =
  | 'idle'
  | 'clarifying'
  | 'intent_confirm'
  | 'executing'
  | 'result'
  | 'deposition'
  | 'capability_gap'

export type GapType = 'A' | 'B' | 'C'

export interface TurnMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 查询类型：趋势 / 分布 / 趋势+分布 / 单值聚合 */
export type QueryType = 'trend' | 'breakdown' | 'trend_breakdown' | 'scalar'

export interface IntentCard {
  summary: string
  timeRange: string
  defaultNote: string
  metric?: string
  metricId?: string
  view?: string
  /** LLM 语义匹配给出的指标短名（优先级低于 metrics 注册表） */
  measureShort?: string
  /** LLM 语义匹配给出的拆分维度短名，null 表示无需拆分 */
  breakdownShort?: string | null
  /** LLM 识别的查询类型 */
  queryType?: QueryType
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

export interface ResultPayload {
  summary: string
  chartTitle: string
  breakdown: Array<{ label: string; value: string; width: string }>
  series?: Array<{ date: string; value: number }>
  sql?: string
  rowCount?: number
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
  gapType?: GapType
  intent?: IntentCard
  intentEditing?: boolean
  steps?: ExecutionStep[]
  capabilityGap?: CapabilityGapPayload
  result?: ResultPayload
  depositionPrefill?: DepositionPrefill
  context: ContextSnapshot
  /** 累积的用户原始问题（首问） */
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

export interface MetricRecord {
  id: string
  name: string
  view?: string
}

export interface DisambiguationRecord {
  id: string
  conceptA: string
  conceptB: string
  entityIdA?: string
  entityIdB?: string
  coreDifference: string
}

export interface ExperienceRecord {
  id: string
  originalQuestion: string
  similarQuestions: string[]
  conclusion: string
}

export function emptySession(): AnalysisSession {
  return {
    phase: 'idle',
    turns: [],
    context: { statusLabel: '待开始' },
    userQuery: '',
    clarifyRound: 0
  }
}
