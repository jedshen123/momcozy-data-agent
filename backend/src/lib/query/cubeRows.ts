import type { QueryRow } from './types.js'

export function rowNumber(row: QueryRow, memberFull: string): number {
  const direct = row[memberFull]
  if (direct != null && direct !== '') return Number(direct)

  const suffix = memberFull.split('.').pop() || memberFull
  const key = Object.keys(row).find(
    k => k === memberFull || k.endsWith(`.${suffix}`) || k.includes(suffix)
  )
  return key ? Number(row[key] ?? 0) : 0
}

export function rowDate(row: QueryRow, timeMemberFull: string): string {
  const withGranularity = Object.keys(row).find(
    k => k.startsWith(`${timeMemberFull}.`) && /\.(day|week|month|year)$/.test(k)
  )
  if (withGranularity) return String(row[withGranularity]).slice(0, 10)

  const direct = row[timeMemberFull]
  if (direct != null) return String(direct).slice(0, 10)

  const short = timeMemberFull.split('.').pop() || ''
  const key = Object.keys(row).find(
    k => k === timeMemberFull || k.startsWith(`${timeMemberFull}.`) || k.includes(short)
  )
  return key ? String(row[key]).slice(0, 10) : ''
}

export function rowLabel(row: QueryRow, dimensionMember: string): string {
  const direct = row[dimensionMember]
  if (direct != null) return String(direct)
  const suffix = dimensionMember.split('.').pop() || ''
  const key = Object.keys(row).find(k => k === dimensionMember || k.endsWith(`.${suffix}`))
  return key ? String(row[key] ?? '未知') : '未知'
}

/** 按日期合并两条趋势序列并计算 ratio */
export function mergeRatioSeries(
  numRows: QueryRow[],
  denRows: QueryRow[],
  numMeasure: string,
  denMeasure: string,
  numTime: string,
  denTime: string
): Array<{ date: string; value: number }> {
  const denByDate = new Map<string, number>()
  for (const r of denRows) {
    const d = rowDate(r, denTime)
    if (d) denByDate.set(d, rowNumber(r, denMeasure))
  }
  const out: Array<{ date: string; value: number }> = []
  for (const r of numRows) {
    const d = rowDate(r, numTime)
    if (!d) continue
    const den = denByDate.get(d) || 0
    const num = rowNumber(r, numMeasure)
    out.push({ date: d, value: den === 0 ? 0 : num / den })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function rowsToMetricSeries(
  rows: QueryRow[],
  measure: string,
  timeMember: string
): Array<{ date: string; value: number }> {
  return rows
    .map(r => ({ date: rowDate(r, timeMember), value: rowNumber(r, measure) }))
    .filter(s => s.date)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function rowsToBreakdown(
  rows: QueryRow[],
  measure: string,
  dimension: string
): Array<{ label: string; value: number }> {
  return rows.map(r => ({
    label: rowLabel(r, dimension),
    value: rowNumber(r, measure)
  }))
}
