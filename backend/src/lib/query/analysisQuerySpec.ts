import type { IntentCard, QueryType } from '../analysis/types.js'
import type { DisambiguationRecord } from '../analysis/types.js'
import { getMetricById, type MetricDef } from './semanticCatalog.js'
import { getViewEntry } from './viewCatalog.js'
import { resolveViewMember } from './memberResolve.js'
import { resolveTimeBounds } from './timeRange.js'
import type { CubeFilter } from './cubeTypes.js'

export interface AnalysisQuerySpec {
  metricId: string
  metricName: string
  type: 'simple' | 'composite' | string
  viewName: string
  queryType: QueryType
  /** 简单指标：单个 measure 全名 */
  primaryMeasure?: string
  /** 复合指标：分子、分母 measure 全名（可跨 View） */
  compositeMeasures?: { numerator: string; denominator: string }
  timeDimension: string
  breakdownDimension: string | null
  timeStart: string
  timeEnd: string
  filters: CubeFilter[]
}

function detectBreakdownShort(userQuery: string): string | null {
  if (/渠道|各渠道|来源/.test(userQuery)) return 'data_source'
  if (/国家|地区|华东|华北|华南/.test(userQuery)) return 'country_ad_ch'
  return 'data_source'
}

function detectRegionFilter(userQuery: string): string | null {
  const m = userQuery.match(/华东|华北|华南|全国/)
  return m ? m[0] : null
}

async function buildFilters(
  viewName: string,
  userQuery: string,
  _metric: MetricDef | null
): Promise<CubeFilter[]> {
  const filters: CubeFilter[] = []
  const region = detectRegionFilter(userQuery)
  if (region && region !== '全国') {
    const dim = await resolveViewMember(viewName, 'country_ad_ch')
    filters.push({ member: dim, operator: 'contains', values: [region] })
  }
  return filters
}

export async function buildAnalysisQuerySpec(params: {
  metricId: string
  intent: IntentCard
  userQuery: string
  dis?: DisambiguationRecord | null
}): Promise<AnalysisQuerySpec> {
  let metricId = params.metricId
  if (params.dis?.entityIdA) metricId = params.dis.entityIdA

  // 语义层指标注册表（可选），找不到时直接走 LLM 语义路径
  const metric = metricId ? ((await getMetricById(metricId)) || null) : null

  const viewName = params.intent.view || metric?.view || 'app_standard_indicators'

  const { start, end } = resolveTimeBounds(params.intent.timeRange)
  const view = await getViewEntry(viewName)
  const timeDimension = await resolveViewMember(viewName, view.timeDimensionShort, view)

  // 拆分维度：intent.breakdownShort（LLM 给出）> 关键词检测
  const breakdownHint = params.intent.breakdownShort !== undefined
    ? params.intent.breakdownShort
    : detectBreakdownShort(params.userQuery)
  let breakdownDimension: string | null = null
  if (breakdownHint) {
    try {
      breakdownDimension = await resolveViewMember(viewName, breakdownHint, view)
    } catch { /* 维度在该 View 中不存在时忽略 */ }
  }

  const filters = await buildFilters(viewName, params.userQuery, metric)

  // queryType：intent 优先（LLM 已识别），否则按是否有拆分维度推断
  const queryType: QueryType = params.intent.queryType
    ?? (breakdownDimension && !params.intent.queryType ? 'breakdown' : 'trend_breakdown')

  // 复合指标
  if (metric?.type === 'composite' && metric.measureMap) {
    const m1Ref = metric.measureMap.m1 || ''
    const m2Ref = metric.measureMap.m2 || ''
    const numerator = await resolveViewMemberFromRef(m1Ref)
    const denominator = await resolveViewMemberFromRef(m2Ref)
    return {
      metricId: metric.id,
      metricName: metric.name,
      type: 'composite',
      viewName,
      queryType,
      compositeMeasures: { numerator, denominator },
      timeDimension,
      breakdownDimension,
      timeStart: start,
      timeEnd: end,
      filters
    }
  }

  // 简单指标：语义层注册 measure > LLM 给出的 measureShort > 兜底
  const measureShort = metric?.measure || params.intent.measureShort || 'm_app_dau'
  const primaryMeasure = await resolveViewMember(viewName, measureShort, view)

  return {
    metricId: metric?.id || '',
    metricName: metric?.name || params.intent.metric || measureShort,
    type: metric?.type || 'simple',
    viewName,
    queryType,
    primaryMeasure,
    timeDimension,
    breakdownDimension,
    timeStart: start,
    timeEnd: end,
    filters
  }
}

async function resolveViewMemberFromRef(ref: string): Promise<string> {
  const [viewName, short] = ref.includes('.') ? ref.split('.', 2) : ['', ref]
  if (!viewName) throw new Error(`无效的 measure 引用: ${ref}`)
  return resolveViewMember(viewName, short)
}
