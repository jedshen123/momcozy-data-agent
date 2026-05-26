import { loadSemanticCatalog } from './semanticCatalog.js'
import { compileAnalysisQuery, compileBreakdownSql } from './sqlCompiler.js'
import { executeSql } from './executor.js'
import { formatAnalysisResult } from './formatResult.js'
import { getQueryEngineMode } from './queryEngine.js'
import { runCubeAnalysisQuery } from './runCubeAnalysisQuery.js'
import type { IntentCard } from '../analysis/types.js'
import type { DisambiguationRecord, MetricRecord } from '../analysis/types.js'
import type { AnalysisQueryOutput } from './types.js'

export async function runAnalysisQuery(params: {
  metric: MetricRecord
  intent: IntentCard
  userQuery: string
  dis?: DisambiguationRecord | null
}): Promise<AnalysisQueryOutput> {
  if (getQueryEngineMode() === 'cube') {
    return runCubeAnalysisQuery(params)
  }

  const plan = await compileAnalysisQuery({
    metricId: params.metric.id,
    intent: params.intent,
    userQuery: params.userQuery,
    dis: params.dis
  })

  const catalog = await loadSemanticCatalog()
  const metricDef = catalog.metrics.get(plan.metricId)
  if (!metricDef) throw new Error(`指标 ${plan.metricId} 未在目录中`)

  const breakdownSql = compileBreakdownSql(plan, metricDef)

  const trendResult = executeSql(plan.sql, plan)
  const breakdownResult = executeSql(breakdownSql, plan)

  const region = /华东|华北|华南/.exec(params.userQuery)?.[0] ?? null

  return formatAnalysisResult({
    plan: { ...plan, engine: 'sqlite', displayTimeRange: params.intent.timeRange },
    trendRows: trendResult.rows,
    breakdownRows: breakdownResult.rows,
    userQuery: params.userQuery,
    region
  })
}
