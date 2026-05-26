export function parseTimeRange(timeRange: string): { start: string; end: string } | null {
  const m = timeRange.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
  if (m) return { start: m[1], end: m[2] }
  return null
}

export function defaultTimeRange(): { start: string; end: string } {
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  return { start, end }
}

export function resolveTimeBounds(timeRange: string): { start: string; end: string } {
  if (timeRange === '不限时间' || timeRange === '全部时间') return { start: '', end: '' }
  return parseTimeRange(timeRange) || defaultTimeRange()
}
