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
  measureShort?: string
  breakdownShort?: string | null
  queryType?: 'trend' | 'breakdown' | 'trend_breakdown' | 'scalar' | 'trend_top_n'
  filterConditions?: Array<{ dimension: string; operator: string; values: string[]; title?: string }>
  topN?: number
  rankMeasureShort?: string
  analysisPlan?: AnalysisPlanStep[]
}

export interface AnalysisPlanStep {
  id: string
  title: string
  description: string
  cubeQuery?: unknown
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

export type ChartType = 'line' | 'bar' | 'bar_vertical' | 'scalar' | 'pie' | 'line_multi'

export interface ResultPayload {
  summary: string
  chartTitle: string
  chartType?: ChartType
  breakdown: Array<{ label: string; value: string; width: string; raw?: number }>
  series?: Array<{ date: string; value: number }>
  /** 多系列对比（chartType=line_multi 时使用） */
  multiSeries?: Array<{ name: string; color: string; data: Array<{ date: string; value: number }> }>
  sql?: string
  rowCount?: number
  /** 发向 Cube Core 的原始查询体，用于调试 */
  cubeQueries?: unknown[]
}

/** 历史查询结果条目（用于多轮对比） */
export interface ResultHistoryEntry {
  label: string
  result: ResultPayload
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
  /** LLM 意图识别阶段的流式思考文字 */
  thinkingText?: string
  chips?: string[]
  gapType?: 'A' | 'B' | 'C'
  intent?: IntentCard
  intentEditing?: boolean
  steps?: ExecutionStep[]
  capabilityGap?: CapabilityGapPayload
  result?: ResultPayload
  /** 历史查询结果，用于多轮对比（前后端共同维护） */
  resultHistory?: ResultHistoryEntry[]
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
  | { type: 'thinking_token'; content: string }
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
