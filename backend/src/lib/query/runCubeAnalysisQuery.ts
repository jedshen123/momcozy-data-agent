import { buildScalarQuery, buildDistributionQuery, buildBreakdownQuery, buildTrendQuery } from './cubeQueryBuilder.js'
import { cubeLoad, cubeSql } from './cubeClient.js'
import { formatAnalysisResult } from './formatResult.js'
import { getViewEntry } from './viewCatalog.js'
import { resolveViewMember } from './memberResolve.js'
import {
  mergeRatioSeries,
  rowsToBreakdown,
  rowsToMetricSeries
} from './cubeRows.js'
import type { IntentCard } from '../analysis/types.js'
import type { DisambiguationRecord, MetricRecord } from '../analysis/types.js'
import type { AnalysisQueryOutput, QueryPlan, QueryRow } from './types.js'
import { buildAnalysisQuerySpec } from './analysisQuerySpec.js'

function viewFromMember(member: string): string {
  return member.split('.')[0] || ''
}

async function timeDimensionForView(viewName: string): Promise<string> {
  const view = await getViewEntry(viewName)
  return resolveViewMember(viewName, view.timeDimensionShort, view)
}

/** 查询 snapshot 视图最新的 busi_date 分区日期，格式 YYYY-MM-DD */
async function fetchLatestPartitionDate(timeDimension: string): Promise<string | null> {
  try {
    const res = await cubeLoad({
      measures: [],
      dimensions: [timeDimension],
      order: { [timeDimension]: 'desc' },
      limit: 1
    })
    const row = (res.data as Array<Record<string, string | null>>)[0]
    if (!row) return null
    const raw = row[timeDimension] || ''
    // Cube 返回的日期可能带时间部分，截取 YYYY-MM-DD
    return raw.slice(0, 10) || null
  } catch (err) {
    console.warn(`[cube] 获取最新分区日期失败: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function runCubeAnalysisQuery(params: {
  metric: MetricRecord
  intent: IntentCard
  userQuery: string
  dis?: DisambiguationRecord | null
}): Promise<AnalysisQueryOutput> {
  const spec = await buildAnalysisQuerySpec({
    metricId: params.metric.id,
    intent: params.intent,
    userQuery: params.userQuery,
    dis: params.dis
  })

  const queryType = spec.queryType
  let trendRows: QueryRow[] = []
  let breakdownRows: QueryRow[] = []
  const queries: { label: string; query: object }[] = []
  let effectiveSpec = spec  // snapshot scalar 时会替换为含最新日期的 spec

  if (spec.type === 'composite' && spec.compositeMeasures) {
    // 复合指标（比率类）：固定走趋势+分布
    const { numerator, denominator } = spec.compositeMeasures
    const numView = viewFromMember(numerator)
    const denView = viewFromMember(denominator)
    const numTime = await timeDimensionForView(numView)
    const denTime = await timeDimensionForView(denView)

    const numQ = buildTrendQuery({ ...spec, timeDimension: numTime }, numerator)
    const denQ = buildTrendQuery({ ...spec, timeDimension: denTime }, denominator)
    queries.push({ label: '趋势-分子', query: numQ }, { label: '趋势-分母', query: denQ })

    const [numRes, denRes] = await Promise.all([cubeLoad(numQ), cubeLoad(denQ)])
    const series = mergeRatioSeries(
      numRes.data as QueryRow[],
      denRes.data as QueryRow[],
      numerator,
      denominator,
      numTime,
      denTime
    )
    trendRows = series.map(s => ({ dt: s.date, metric_value: s.value }))

    const breakdownShort = spec.breakdownDimension?.split('.').pop()
    const denViewEntry = await getViewEntry(denView)
    const numViewEntry = await getViewEntry(numView)
    let denBreakDim: string | null = null
    let numBreakDim: string | null = null
    if (breakdownShort && denViewEntry.includes.has(breakdownShort)) {
      denBreakDim = await resolveViewMember(denView, breakdownShort, denViewEntry)
    }
    if (breakdownShort && numViewEntry.includes.has(breakdownShort)) {
      numBreakDim = await resolveViewMember(numView, breakdownShort, numViewEntry)
    }

    if (denBreakDim && numBreakDim) {
      const denBreakQ = buildBreakdownQuery({ ...spec, timeDimension: denTime, breakdownDimension: denBreakDim }, denominator)
      const numBreakQ = buildBreakdownQuery({ ...spec, timeDimension: numTime, breakdownDimension: numBreakDim }, numerator)
      queries.push({ label: '拆分', query: denBreakQ }, { label: '拆分-分子', query: numBreakQ })
      const [denBreakRes, numBreakRes] = await Promise.all([cubeLoad(denBreakQ), cubeLoad(numBreakQ)])
      const denMap = rowsToBreakdown(denBreakRes.data as QueryRow[], denominator, denBreakDim)
      const numMap = rowsToBreakdown(numBreakRes.data as QueryRow[], numerator, numBreakDim)
      const denByLabel = new Map(denMap.map(b => [b.label, b.value]))
      breakdownRows = numMap.map(n => ({
        dim_label: n.label,
        metric_value: (denByLabel.get(n.label) || 0) === 0 ? 0 : n.value / (denByLabel.get(n.label) || 1)
      }))
    }
  } else {
    const measure = spec.primaryMeasure!

    if (queryType === 'scalar') {
      // snapshot 视图且未指定时间范围时，先取最新分区日期
      if (spec.snapshot && !spec.timeStart) {
        const latestDate = await fetchLatestPartitionDate(spec.timeDimension)
        if (latestDate) {
          console.log(`[cube] snapshot scalar 使用最新分区日期 ${latestDate}`)
          effectiveSpec = { ...spec, timeStart: latestDate, timeEnd: latestDate }
        }
      }
      // 单值聚合：只查一个汇总数
      const scalarQ = buildScalarQuery(effectiveSpec, measure)
      queries.push({ label: '单值聚合', query: scalarQ })
      const scalarRes = await cubeLoad(scalarQ)
      const row = (scalarRes.data as QueryRow[])[0]
      const val = row ? Number(row[measure] ?? 0) : 0
      breakdownRows = [{ dim_label: '合计', metric_value: val }]
      trendRows = []
    } else if (queryType === 'breakdown') {
      // snapshot 视图且未指定时间范围时，先取最新分区日期
      if (spec.snapshot && !spec.timeStart) {
        const latestDate = await fetchLatestPartitionDate(spec.timeDimension)
        if (latestDate) {
          console.log(`[cube] snapshot breakdown 使用最新分区日期 ${latestDate}`)
          effectiveSpec = { ...spec, timeStart: latestDate, timeEnd: latestDate }
        }
      }
      // 纯分布：只执行分布查询
      const distQ = buildDistributionQuery(effectiveSpec, measure)
      queries.push({ label: '分布', query: distQ })
      const distRes = await cubeLoad(distQ)
      breakdownRows = spec.breakdownDimension
        ? rowsToBreakdown(distRes.data as QueryRow[], measure, spec.breakdownDimension)
            .map(b => ({ dim_label: b.label, metric_value: b.value }))
        : [{ dim_label: '合计', metric_value: Number((distRes.data as QueryRow[])[0]?.[measure] ?? 0) }]
      trendRows = [] // 纯分布无趋势
    } else if (queryType === 'trend') {
      // 纯趋势：只执行趋势查询，不需要 breakdown
      const trendQ = buildTrendQuery(spec, measure)
      queries.push({ label: '趋势', query: trendQ })
      const trendRes = await cubeLoad(trendQ)
      trendRows = rowsToMetricSeries(trendRes.data as QueryRow[], measure, spec.timeDimension)
        .map(s => ({ dt: s.date, metric_value: s.value }))
      breakdownRows = []
    } else if (queryType === 'trend_top_n') {
      // 两步：先取 Top N 维度值，再分别查各自趋势
      const topN = params.intent.topN ?? 5
      const rankMeasureShort = params.intent.rankMeasureShort || params.intent.measureShort || ''
      const rankMeasure = rankMeasureShort && rankMeasureShort !== (spec.primaryMeasure?.split('.').pop() || '')
        ? await (async () => {
            try { return await resolveViewMember(spec.viewName, rankMeasureShort) }
            catch { return measure }
          })()
        : measure

      if (!spec.breakdownDimension) throw new Error('trend_top_n 需要 breakdownShort')

      // 第一步：按排名指标取 Top N
      const rankQ = buildDistributionQuery({ ...spec, queryType: 'breakdown' }, rankMeasure)
      queries.push({ label: `Top${topN} 排名`, query: rankQ })
      const rankRes = await cubeLoad(rankQ)
      const topLabels = rowsToBreakdown(rankRes.data as QueryRow[], rankMeasure, spec.breakdownDimension)
        .slice(0, topN)
        .map(b => b.label)
        .filter(Boolean)

      console.log(`[cube] trend_top_n Top${topN} 维度值: ${topLabels.join(', ')}`)

      // 第二步：对每个维度值分别查趋势
      const SERIES_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626',
        '#0891b2', '#7c3aed', '#65a30d', '#ea580c', '#9333ea']
      const seriesResults = await Promise.all(
        topLabels.map(async (label, i) => {
          const dimFilter = { member: spec.breakdownDimension!, operator: 'equals', values: [label] }
          const trendQ = buildTrendQuery(
            { ...spec, filters: [...spec.filters, dimFilter] },
            measure
          )
          queries.push({ label: `趋势-${label}`, query: trendQ })
          const res = await cubeLoad(trendQ)
          const data = rowsToMetricSeries(res.data as QueryRow[], measure, spec.timeDimension)
          return { name: label, color: SERIES_COLORS[i % SERIES_COLORS.length], data }
        })
      )

      // 合并所有系列的行数用于 rowCount
      trendRows = seriesResults.flatMap(s => s.data.map(d => ({ dt: d.date, metric_value: d.value })))
      breakdownRows = topLabels.map((label, i) => ({
        dim_label: label,
        metric_value: seriesResults[i]?.data.reduce((sum, d) => sum + d.value, 0) ?? 0
      }))

      // 直接构造最终输出，跳过 formatAnalysisResult
      let displaySqlTop = ''
      try {
        const parts = await Promise.all(
          queries.map(async q => `-- ${q.label}\n${await cubeSql(q.query as import('./cubeTypes.js').CubeQuery)}`)
        )
        displaySqlTop = parts.join('\n\n')
      } catch {
        displaySqlTop = queries.map(q => `-- ${q.label}\n${JSON.stringify(q.query, null, 2)}`).join('\n\n')
      }

      return {
        summary: `Top${topN} ${spec.breakdownDimension.split('.').pop() || '维度'} 的 ${spec.metricName} 趋势（近 ${params.intent.timeRange}）：${topLabels.join('、')}`,
        chartTitle: `Top${topN} ${spec.metricName} 趋势`,
        chartType: 'line_multi',
        breakdown: topLabels.map((label, i) => ({
          label,
          value: String(Math.round(seriesResults[i]?.data.reduce((sum, d) => sum + d.value, 0) ?? 0)),
          width: '100%',
          raw: seriesResults[i]?.data.reduce((sum, d) => sum + d.value, 0) ?? 0
        })),
        multiSeries: seriesResults,
        sql: displaySqlTop,
        rowCount: trendRows.length,
        cubeQueries: queries.map(q => q.query)
      }
    } else {
      // trend_breakdown：趋势 + 分布同时查
      const trendQ = buildTrendQuery(spec, measure)
      const breakQ = buildBreakdownQuery(spec, measure)
      queries.push({ label: '趋势', query: trendQ }, { label: '拆分', query: breakQ })

      const [trendRes, breakRes] = await Promise.all([cubeLoad(trendQ), cubeLoad(breakQ)])
      trendRows = rowsToMetricSeries(trendRes.data as QueryRow[], measure, spec.timeDimension)
        .map(s => ({ dt: s.date, metric_value: s.value }))

      if (spec.breakdownDimension) {
        breakdownRows = rowsToBreakdown(breakRes.data as QueryRow[], measure, spec.breakdownDimension)
          .map(b => ({ dim_label: b.label, metric_value: b.value }))
      } else {
        const v = trendRows.length ? Number(trendRows[trendRows.length - 1].metric_value) : 0
        breakdownRows = [{ dim_label: '合计', metric_value: v }]
      }
    }
  }

  let displaySql = ''
  try {
    const parts = await Promise.all(
      queries.map(async q => `-- ${q.label}\n${await cubeSql(q.query as import('./cubeTypes.js').CubeQuery)}`)
    )
    displaySql = parts.join('\n\n')
  } catch {
    displaySql = queries.map(q => `-- ${q.label}\n${JSON.stringify(q.query, null, 2)}`).join('\n\n')
  }

  const plan: QueryPlan = {
    engine: 'cube',
    sql: displaySql,
    displaySql,
    metricId: spec.metricId,
    metricName: spec.metricName,
    viewName: spec.viewName,
    table: spec.viewName,
    measureColumn: spec.primaryMeasure || spec.compositeMeasures?.numerator || '',
    timeColumn: spec.timeDimension,
    breakdownDimension: spec.breakdownDimension,
    timeStart: effectiveSpec.timeStart,
    timeEnd: effectiveSpec.timeEnd,
    displayTimeRange: params.intent.timeRange,
    queryType: spec.queryType,
    cubeQueries: queries.map(q => q.query)
  }

  const region = /华东|华北|华南/.exec(params.userQuery)?.[0] ?? null

  return formatAnalysisResult({
    plan,
    trendRows,
    breakdownRows,
    userQuery: params.userQuery,
    region
  })
}
