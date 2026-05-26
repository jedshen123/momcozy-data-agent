import type { AnalysisQueryOutput } from './types.js'
import type { QueryPlan, QueryRow } from './types.js'

function fmtNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万`
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function fmtRatio(n: number) {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function fmt(plan: QueryPlan, n: number) {
  return plan.metricName.includes('客单价') || plan.metricName.includes('率')
    ? fmtRatio(n)
    : fmtNum(n)
}

export function formatAnalysisResult(params: {
  plan: QueryPlan
  trendRows: QueryRow[]
  breakdownRows: QueryRow[]
  userQuery: string
  region?: string | null
}): AnalysisQueryOutput {
  const { plan, trendRows, breakdownRows, userQuery } = params
  const region = params.region || (/华东|华北|华南/.exec(userQuery)?.[0] ?? null)
  const queryType = plan.queryType ?? 'trend_breakdown'

  // 趋势 series
  const series = trendRows
    .map(r => ({
      date: String(r.dt ?? r.busi_date ?? '').slice(0, 10),
      value: Number(r.metric_value ?? 0)
    }))
    .filter(s => s.date)

  // 分布 breakdown
  const breakdownRaw = breakdownRows.map(r => ({
    label: String(r.dim_label ?? r.data_source ?? '未知'),
    value: Number(r.metric_value ?? 0)
  }))
  const totalBreak = breakdownRaw.reduce((a, b) => a + b.value, 0) || 1

  const breakdown = breakdownRaw.slice(0, 10).map(b => ({
    label: b.label,
    value: fmt(plan, b.value),
    raw: b.value,
    width: `${Math.max(4, Math.round((b.value / totalBreak) * 100))}%`
  }))

  // 图表类型
  let chartType: AnalysisQueryOutput['chartType']
  if (queryType === 'scalar') {
    chartType = 'scalar'
  } else if (queryType === 'breakdown') {
    chartType = 'pie'
  } else if (queryType === 'trend') {
    chartType = 'line'
  } else {
    chartType = series.length > 0 ? 'line' : 'bar'
  }

  const timeLabel = plan.displayTimeRange && plan.displayTimeRange !== '待指定'
    ? plan.displayTimeRange
    : (plan.timeStart && plan.timeEnd)
      ? `${plan.timeStart} ~ ${plan.timeEnd}`
      : (plan.timeStart || plan.timeEnd || '不限时间')
  const regionLabel = region ? `${region}` : ''
  const top = breakdownRaw[0]
  const avgDaily = series.length ? series.reduce((a, b) => a + b.value, 0) / series.length : 0

  // 摘要
  const summaryParts: string[] = []
  if (queryType === 'scalar') {
    const val = breakdownRaw[0]?.value ?? 0
    summaryParts.push(
      `${regionLabel}在 ${timeLabel}，${plan.metricName}共 ${fmt(plan, val)}`
    )
  } else if (queryType === 'breakdown' || queryType === 'trend_breakdown') {
    if (top) {
      summaryParts.push(
        `${regionLabel}在 ${timeLabel}，${top.label} 的${plan.metricName}最高（${fmt(plan, top.value)}，占比 ${Math.round((top.value / totalBreak) * 100)}%）`
      )
    }
    if (breakdownRaw.length > 1) summaryParts.push(`共 ${breakdownRaw.length} 个分组`)
  }
  if (queryType === 'trend' || (queryType === 'trend_breakdown' && series.length > 0)) {
    summaryParts.push(
      `${regionLabel}${plan.metricName}在 ${timeLabel} 日均约 ${fmt(plan, avgDaily)}，共 ${series.length} 天数据`
    )
  }

  const chartTitle = queryType === 'scalar'
    ? `${plan.metricName} 汇总（${timeLabel}）`
    : queryType === 'breakdown'
    ? `${plan.metricName} 分布（${timeLabel}）`
    : `${plan.metricName} 趋势${plan.breakdownDimension ? ' & 分布' : ''}（${timeLabel}）`

  return {
    summary: summaryParts.join('；') + '。',
    chartTitle,
    chartType,
    breakdown,
    series: series.length > 0 ? series : undefined,
    sql: plan.displaySql,
    rowCount: trendRows.length + breakdownRows.length,
    cubeQueries: plan.cubeQueries
  }
}
