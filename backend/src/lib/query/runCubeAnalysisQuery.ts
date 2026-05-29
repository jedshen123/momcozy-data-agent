import {
  buildScalarQuery,
  buildDistributionQuery,
  buildBreakdownQuery,
  buildTrendQuery,
  buildTopNRankQuery,
  buildTopNTrendQuery
} from './cubeQueryBuilder.js'
import { cubeLoad, cubeSql } from './cubeClient.js'
import { formatAnalysisResult } from './formatResult.js'
import { getViewEntry } from './viewCatalog.js'
import { resolveViewMember } from './memberResolve.js'
import {
  mergeRatioSeries,
  rowDate,
  rowLabel,
  rowNumber,
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

async function displayQueries(queries: { label: string; query: object }[]) {
  try {
    const parts = await Promise.all(
      queries.map(async q => `-- ${q.label}\n${await cubeSql(q.query as import('./cubeTypes.js').CubeQuery)}`)
    )
    return parts.join('\n\n')
  } catch {
    return queries.map(q => `-- ${q.label}\n${JSON.stringify(q.query, null, 2)}`).join('\n\n')
  }
}

export async function runCubeAnalysisQuery(params: {
  metric: MetricRecord
  intent: IntentCard
  userQuery: string
  dis?: DisambiguationRecord | null
  onProgress?: (stepId: string, status: 'running' | 'done' | 'error', detail?: string) => Promise<void>
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

    if (queryType === 'trend_top_n') {
      if (!spec.breakdownDimension) throw new Error('TopN 趋势分析缺少分组维度')
      const topN = spec.topN || 5
      const rankMeasure = spec.rankMeasure || measure

      const rankQ = buildTopNRankQuery(spec, rankMeasure)
      queries.push({ label: `Top${topN} 排名`, query: rankQ })
      await params.onProgress?.('top_n_rank', 'running', JSON.stringify(rankQ, null, 2))
      const rankRes = await cubeLoad(rankQ)
      const ranked = rowsToBreakdown(rankRes.data as QueryRow[], rankMeasure, spec.breakdownDimension)
        .filter(item => item.label && item.label !== '未知')
        .slice(0, topN)
      const topValues = ranked.map(item => item.label)
      await params.onProgress?.(
        'top_n_rank',
        'done',
        `Top${topN}: ${topValues.join('、') || '无数据'}\n\n${JSON.stringify(rankQ, null, 2)}`
      )

      if (topValues.length) {
        const trendQ = buildTopNTrendQuery(spec, measure, topValues)
        queries.push({ label: `Top${topN} 趋势`, query: trendQ })
        await params.onProgress?.('top_n_trend', 'running', JSON.stringify(trendQ, null, 2))
        const trendRes = await cubeLoad(trendQ)
        const rows = trendRes.data as QueryRow[]
        const byLabel = new Map<string, Array<{ date: string; value: number }>>()

        for (const row of rows) {
          const label = rowLabel(row, spec.breakdownDimension)
          const date = rowDate(row, spec.timeDimension)
          if (!label || !date) continue
          const series = byLabel.get(label) || []
          series.push({ date, value: rowNumber(row, measure) })
          byLabel.set(label, series)
        }

        const colors = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626']
        const multiSeries = topValues.map((label, idx) => ({
          name: label,
          color: colors[idx % colors.length],
          data: (byLabel.get(label) || []).sort((a, b) => a.date.localeCompare(b.date))
        }))

        breakdownRows = ranked.map(item => ({ dim_label: item.label, metric_value: item.value }))
        await params.onProgress?.(
          'top_n_trend',
          'done',
          `已返回 ${rows.length} 行趋势数据。\n\n${JSON.stringify(trendQ, null, 2)}`
        )
        await params.onProgress?.('top_n_merge', 'running')
        await params.onProgress?.('top_n_merge', 'done', `已生成 ${multiSeries.length} 条趋势线。`)

        const displaySql = await displayQueries(queries)
        const timeLabel = params.intent.timeRange && params.intent.timeRange !== '待指定'
          ? params.intent.timeRange
          : `${spec.timeStart} ~ ${spec.timeEnd}`
        const totalRank = ranked.reduce((sum, item) => sum + item.value, 0) || 1

        return {
          summary: `已先按绑定/排名指标筛选 Top${topN}：${topValues.join('、')}；随后查询这些设备在 ${timeLabel} 的${spec.metricName}逐日趋势，共生成 ${multiSeries.length} 条趋势线。`,
          chartTitle: `${spec.metricName} Top${topN} 趋势（${timeLabel}）`,
          chartType: 'line_multi',
          breakdown: ranked.map(item => ({
            label: item.label,
            value: item.value >= 10000 ? `${(item.value / 10000).toFixed(2)}万` : item.value.toLocaleString('zh-CN'),
            raw: item.value,
            width: `${Math.max(4, Math.round((item.value / totalRank) * 100))}%`
          })),
          multiSeries,
          sql: displaySql,
          rowCount: rows.length + ranked.length,
          cubeQueries: queries.map(q => q.query)
        }
      }

      breakdownRows = []
      trendRows = []
    } else if (queryType === 'scalar') {
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

  const displaySql = await displayQueries(queries)

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
