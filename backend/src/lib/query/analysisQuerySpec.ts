import type { IntentCard } from '../analysis/types.js'
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
  _metric: MetricDef
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

  const metric = (await getMetricById(metricId)) || null
  if (!metric) throw new Error('未找到指标定义')

  const viewName = params.intent.view || metric.view || 'app_standard_indicators'
  await getViewEntry(viewName)

  const { start, end } = resolveTimeBounds(params.intent.timeRange)
  const view = await getViewEntry(viewName)
  const timeDimension = await resolveViewMember(viewName, view.timeDimensionShort, view)

  const breakdownShort = detectBreakdownShort(params.userQuery)
  let breakdownDimension: string | null = null
  if (breakdownShort && view.includes.has(breakdownShort)) {
    breakdownDimension = await resolveViewMember(viewName, breakdownShort, view)
  }

  const filters = await buildFilters(viewName, params.userQuery, metric)

  if (metric.type === 'composite' && metric.measureMap) {
    const m1Ref = metric.measureMap.m1 || ''
    const m2Ref = metric.measureMap.m2 || ''
    const numerator = await resolveViewMemberFromRef(m1Ref)
    const denominator = await resolveViewMemberFromRef(m2Ref)
    return {
      metricId: metric.id,
      metricName: metric.name,
      type: 'composite',
      viewName,
      compositeMeasures: { numerator, denominator },
      timeDimension,
      breakdownDimension,
      timeStart: start,
      timeEnd: end,
      filters
    }
  }

  const measureShort = metric.measure || 'm_app_dau'
  const primaryMeasure = await resolveViewMember(viewName, measureShort, view)

  return {
    metricId: metric.id,
    metricName: metric.name,
    type: metric.type || 'simple',
    viewName,
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
