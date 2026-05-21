import type { AnalysisQueryOutput } from './types.js'
import type { QueryPlan, QueryRow } from './types.js'

function fmtNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万`
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function fmtRatio(n: number) {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function formatAnalysisResult(params: {
  plan: QueryPlan
  trendRows: QueryRow[]
  breakdownRows: QueryRow[]
  userQuery: string
  region?: string | null
}): AnalysisQueryOutput {
  const { plan, trendRows, breakdownRows, userQuery } = params
  const region = params.region || (/华东|华北|华南/.exec(userQuery)?.[0] ?? '全区域')

  const series = trendRows
    .map(r => ({
      date: String(r.dt ?? r.busi_date ?? ''),
      value: Number(r.metric_value ?? 0)
    }))
    .filter(s => s.date)

  const totalTrend = series.reduce((a, b) => a + b.value, 0)
  const avgDaily = series.length ? totalTrend / series.length : 0

  const breakdownRaw = breakdownRows.map(r => ({
    label: String(r.dim_label ?? r.data_source ?? '未知'),
    value: Number(r.metric_value ?? 0)
  }))
  const totalBreak = breakdownRaw.reduce((a, b) => a + b.value, 0) || 1

  const breakdown = breakdownRaw.slice(0, 6).map(b => ({
    label: b.label,
    value: plan.metricName.includes('客单价') ? fmtRatio(b.value) : fmtNum(b.value),
    width: `${Math.max(8, Math.round((b.value / totalBreak) * 100))}%`
  }))

  const top = breakdownRaw[0]
  const summaryParts = [
    `${region}在 ${plan.timeStart} ~ ${plan.timeEnd} 的${plan.metricName}`,
    series.length
      ? `日均约 ${plan.metricName.includes('客单价') ? fmtRatio(avgDaily) : fmtNum(avgDaily)}`
      : '已完成聚合',
    top ? `${top.label} 贡献最高（约 ${Math.round((top.value / totalBreak) * 100)}%）` : ''
  ].filter(Boolean)

  return {
    summary: summaryParts.join('，') + '。',
    chartTitle: `${plan.metricName}趋势（${plan.timeStart} ~ ${plan.timeEnd}）`,
    breakdown,
    series,
    sql: plan.displaySql,
    rowCount: trendRows.length + breakdownRows.length
  }
}
