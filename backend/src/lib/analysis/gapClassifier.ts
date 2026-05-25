import type { GapType } from './types.js'

const IMPLICIT_TIME = /上个月|上月|最近|本周|本季度|过去\s*\d+\s*天|近\s*\d+\s*天|今年|昨天|今日|本月/
const EXPLICIT_TIME = /\d{4}[-/年]\d{1,2}|Q[1-4]|季度/

export interface TimeInference {
  gapType: GapType
  timeRange?: string
  defaultNote?: string
  missingAspect?: 'time' | 'metric' | 'region'
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** 以服务端当前日为基准推断区间（v1 规则，对齐设计 B 类） */
export function inferTimeRange(text: string, now = new Date()): { timeRange: string; defaultNote: string } | null {
  const t = text
  const end = new Date(now)
  let start = new Date(now)

  if (/上个月|上月/.test(t)) {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endLast = new Date(now.getFullYear(), now.getMonth(), 0)
    return {
      timeRange: `${formatDate(start)} ~ ${formatDate(endLast)}`,
      defaultNote: '📌 时间：已按「上个月」解析为自然月区间'
    }
  }
  if (/过去\s*30\s*天|最近\s*30\s*天|近\s*30\s*天/.test(t)) {
    start.setDate(start.getDate() - 30)
    return {
      timeRange: `${formatDate(start)} ~ ${formatDate(end)}`,
      defaultNote: '📌 时间：已按「过去 30 天」解析'
    }
  }
  if (/过去\s*7\s*天|最近\s*7\s*天|本周/.test(t)) {
    start.setDate(start.getDate() - 7)
    return {
      timeRange: `${formatDate(start)} ~ ${formatDate(end)}`,
      defaultNote: '📌 时间：已按「过去 7 天 / 本周」解析'
    }
  }
  if (/本季度/.test(t)) {
    const q = Math.floor(now.getMonth() / 3)
    start = new Date(now.getFullYear(), q * 3, 1)
    return {
      timeRange: `${formatDate(start)} ~ ${formatDate(end)}`,
      defaultNote: '📌 时间：已按「本季度」解析'
    }
  }
  if (IMPLICIT_TIME.test(t)) {
    start.setDate(start.getDate() - 30)
    return {
      timeRange: `${formatDate(start)} ~ ${formatDate(end)}`,
      defaultNote: '📌 时间：已从自然语言推断默认区间'
    }
  }
  return null
}

export function classifyGaps(
  text: string,
  hasResolvedTime: boolean
): TimeInference {
  if (IMPLICIT_TIME.test(text) || EXPLICIT_TIME.test(text) || hasResolvedTime) {
    const inferred = inferTimeRange(text)
    return {
      gapType: 'B',
      timeRange: inferred?.timeRange,
      defaultNote: inferred?.defaultNote
    }
  }

  if (/怎么样|情况|趋势|分析/.test(text) && !/销售额|gmv|收入|活跃|客单价|渠道/.test(text.toLowerCase())) {
    return { gapType: 'A', missingAspect: 'metric' }
  }

  if (!hasResolvedTime) {
    return { gapType: 'A', missingAspect: 'time' }
  }

  return { gapType: 'B' }
}

export function chipsForGap(missing: TimeInference['missingAspect']): string[] {
  if (missing === 'metric') {
    return ['销售额趋势', '活跃用户数', '渠道对比', '自定义指标']
  }
  return ['本月至今', '过去 30 天', '过去 7 天', '自定义']
}

export function clarifyingPrompt(missing: TimeInference['missingAspect']): string {
  if (missing === 'metric') {
    return '你想重点看哪类指标？可选下方快捷项，或直接说明。'
  }
  return '请问你想查哪个时间段的数据？可选下方快捷项或直接说明。'
}
