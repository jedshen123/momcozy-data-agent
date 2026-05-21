import type { IntentCard } from '../analysis/types.js'
import type { DisambiguationRecord } from '../analysis/types.js'
import {
  getMetricById,
  loadSemanticCatalog,
  resolveMeasureColumn,
  resolveMeasureFromMap,
  type MetricDef
} from './semanticCatalog.js'
import type { QueryPlan } from './types.js'

function parseTimeRange(timeRange: string): { start: string; end: string } | null {
  const m = timeRange.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
  if (m) return { start: m[1], end: m[2] }
  return null
}

function detectBreakdownDimension(userQuery: string): string | null {
  if (/渠道|各渠道|来源/.test(userQuery)) return 'data_source'
  if (/国家|地区|华东|华北|华南/.test(userQuery)) return 'country_ad_ch'
  return 'data_source'
}

function detectRegionFilter(userQuery: string): string | null {
  const m = userQuery.match(/华东|华北|华南|全国/)
  return m ? m[0] : null
}

function quoteIdent(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, '') === name ? name : `"${name}"`
}

function buildWhere(
  table: string,
  timeColumn: string,
  start: string,
  end: string,
  region: string | null,
  extraFilter?: string
): string {
  const parts = [
    `${quoteIdent(timeColumn)} >= '${start}'`,
    `${quoteIdent(timeColumn)} <= '${end}'`
  ]
  if (region && region !== '全国') {
    parts.push(`${quoteIdent('country_ad_ch')} LIKE '%${region}%'`)
  }
  if (extraFilter && /^[\w\s=.']+$/.test(extraFilter) && !/status|u\s*=/.test(extraFilter)) {
    parts.push(`(${extraFilter})`)
  }
  return parts.join(' AND ')
}

function aggregateExpr(measureCol: string, agg = 'SUM') {
  return `${agg}(${quoteIdent(measureCol)})`
}

export async function compileAnalysisQuery(params: {
  metricId: string
  intent: IntentCard
  userQuery: string
  dis?: DisambiguationRecord | null
}): Promise<QueryPlan> {
  const catalog = await loadSemanticCatalog()
  let metricId = params.metricId
  if (params.dis?.entityIdA) metricId = params.dis.entityIdA

  const metric = (await getMetricById(metricId)) || catalog.metrics.values().next().value
  if (!metric) throw new Error('未找到指标定义')

  const viewName = params.intent.view || metric.view || 'app_standard_indicators'
  const view = catalog.views.get(viewName)
  if (!view) throw new Error(`未找到 View: ${viewName}`)

  const cube = catalog.cubes.get(view.primaryCube)
  if (!cube) throw new Error(`未找到 Cube: ${view.primaryCube}`)

  const timeParsed = parseTimeRange(params.intent.timeRange)
  const end = timeParsed?.end || new Date().toISOString().slice(0, 10)
  const start =
    timeParsed?.start ||
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const timeColumn =
    cube.dimensions.find(d => /date|time/i.test(d.name))?.name || 'busi_date'
  const breakdownDimension = detectBreakdownDimension(params.userQuery)
  const region = detectRegionFilter(params.userQuery)
  const table = cube.sqlTable
  const where = buildWhere(table, timeColumn, start, end, region, metric.filterSql)

  let measureColumn: string
  let sql: string

  if (metric.type === 'composite' && metric.measureMap) {
    const m2Ref = metric.measureMap.m2 || ''
    const m1Ref = metric.measureMap.m1 || ''
    const m2 = resolveMeasureFromMap(m2Ref)
    const m1 = resolveMeasureFromMap(m1Ref)
    const col2 = resolveMeasureColumn(m2.measure)
    const col1 = resolveMeasureColumn(m1.measure)
    measureColumn = `${col1}_per_${col2}`
    const agg2 = aggregateExpr(col2)
    const agg1 = aggregateExpr(col1)
    const dim = breakdownDimension ? quoteIdent(breakdownDimension) : null
    if (dim) {
      sql = `SELECT ${dim} AS dim_label, ${agg1} AS num, ${agg2} AS den,
        CASE WHEN ${agg2} = 0 THEN NULL ELSE CAST(${agg1} AS REAL) / ${agg2} END AS metric_value
        FROM ${quoteIdent(table)}
        WHERE ${where}
        GROUP BY ${dim}
        ORDER BY metric_value DESC`
    } else {
      sql = `SELECT ${agg1} AS num, ${agg2} AS den,
        CASE WHEN ${agg2} = 0 THEN NULL ELSE CAST(${agg1} AS REAL) / ${agg2} END AS metric_value
        FROM ${quoteIdent(table)}
        WHERE ${where}`
    }
  } else {
    const measureRef = metric.measure || 'm_app_dau'
    measureColumn = resolveMeasureColumn(measureRef)
    const agg = aggregateExpr(measureColumn)
    const dim = breakdownDimension ? quoteIdent(breakdownDimension) : null
    if (dim) {
      sql = `SELECT ${dim} AS dim_label, ${agg} AS metric_value
        FROM ${quoteIdent(table)}
        WHERE ${where}
        GROUP BY ${dim}
        ORDER BY metric_value DESC`
    } else {
      sql = `SELECT ${agg} AS metric_value
        FROM ${quoteIdent(table)}
        WHERE ${where}`
    }
  }

  const trendSql = `SELECT ${quoteIdent(timeColumn)} AS dt, ${aggregateExpr(
    metric.type === 'composite' && metric.measureMap
      ? resolveMeasureColumn(resolveMeasureFromMap(metric.measureMap.m2 || '').measure)
      : resolveMeasureColumn(metric.measure || 'm_app_dau')
  )} AS metric_value
    FROM ${quoteIdent(table)}
    WHERE ${where}
    GROUP BY ${quoteIdent(timeColumn)}
    ORDER BY dt`

  return {
    sql: trendSql,
    displaySql: `-- 趋势\n${trendSql}\n\n-- 拆分\n${sql}`,
    metricId: metric.id,
    metricName: metric.name,
    viewName,
    table,
    measureColumn,
    timeColumn,
    breakdownDimension,
    timeStart: start,
    timeEnd: end
  }
}

/** 拆分查询（与趋势分开执行） */
export function compileBreakdownSql(plan: QueryPlan, metric: MetricDef): string {
  const where = buildWhere(
    plan.table,
    plan.timeColumn,
    plan.timeStart,
    plan.timeEnd,
    null,
    metric.filterSql
  )
  const dim = plan.breakdownDimension
  if (!dim) {
    return `SELECT SUM(${quoteIdent(plan.measureColumn)}) AS metric_value FROM ${quoteIdent(plan.table)} WHERE ${where}`
  }

  if (metric.type === 'composite' && metric.measureMap) {
    const m2 = resolveMeasureFromMap(metric.measureMap.m2 || '')
    const m1 = resolveMeasureFromMap(metric.measureMap.m1 || '')
    const col2 = resolveMeasureColumn(m2.measure)
    const col1 = resolveMeasureColumn(m1.measure)
    return `SELECT ${quoteIdent(dim)} AS dim_label,
      CASE WHEN SUM(${quoteIdent(col2)}) = 0 THEN NULL
           ELSE CAST(SUM(${quoteIdent(col1)}) AS REAL) / SUM(${quoteIdent(col2)}) END AS metric_value
      FROM ${quoteIdent(plan.table)}
      WHERE ${where}
      GROUP BY ${quoteIdent(dim)}
      ORDER BY metric_value DESC`
  }

  return `SELECT ${quoteIdent(dim)} AS dim_label, SUM(${quoteIdent(plan.measureColumn)}) AS metric_value
    FROM ${quoteIdent(plan.table)}
    WHERE ${where}
    GROUP BY ${quoteIdent(dim)}
    ORDER BY metric_value DESC`
}
