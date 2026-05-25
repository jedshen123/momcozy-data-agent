import type { QueryType } from '../analysis/types.js'

export interface QueryPlan {
  engine?: 'cube' | 'sqlite'
  sql: string
  /** 展示用（参数已内联或占位说明） */
  displaySql: string
  metricId: string
  metricName: string
  viewName: string
  table: string
  measureColumn: string
  timeColumn: string
  breakdownDimension: string | null
  timeStart: string
  timeEnd: string
  queryType?: QueryType
  /** Cube REST 查询体（调试/预览） */
  cubeQueries?: unknown[]
}

export interface QueryRow {
  [key: string]: string | number | null
}

export interface QueryResult {
  plan: QueryPlan
  rows: QueryRow[]
  durationMs: number
  engine: 'sqlite' | 'mysql' | 'cube'
}

export interface AnalysisQueryOutput {
  summary: string
  chartTitle: string
  /** 图表类型：line=折线趋势，bar=横向柱状分布，bar_vertical=竖向柱状趋势 */
  chartType: 'line' | 'bar' | 'bar_vertical'
  breakdown: Array<{ label: string; value: string; width: string; raw: number }>
  series?: Array<{ date: string; value: number }>
  sql: string
  rowCount: number
}
