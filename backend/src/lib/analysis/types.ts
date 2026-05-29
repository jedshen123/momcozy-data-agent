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

/** 查询类型：趋势 / 分布 / 趋势+分布 / 单值聚合 / Top N 各自趋势 */
export type QueryType = 'trend' | 'breakdown' | 'trend_breakdown' | 'scalar' | 'trend_top_n'

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
  /** LLM 识别的维度过滤条件 */
  filterConditions?: Array<{ dimension: string; operator: string; values: string[]; title?: string }>
  /** trend_top_n：取 Top N 的数量 */
  topN?: number
  /** trend_top_n：用于排名的指标短名（不填则与 measureShort 相同） */
  rankMeasureShort?: string
  /** 用户确认前可查看的分步分析计划，每一步可附带 Cube 请求参数预览 */
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
  /** 本轮查询对应的用户问题（冗余一份，便于 LLM / 对比逻辑识别） */
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
  gapType?: GapType
  intent?: IntentCard
  intentEditing?: boolean
  steps?: ExecutionStep[]
  capabilityGap?: CapabilityGapPayload
  result?: ResultPayload
  /** 历史查询结果，用于多轮对比（前后端共同维护） */
  resultHistory?: ResultHistoryEntry[]
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
  | { type: 'thinking_token'; content: string }
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
