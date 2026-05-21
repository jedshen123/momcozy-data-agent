import { readAll } from '../storage.js'
import type { DisambiguationRecord, ExperienceRecord, MetricRecord } from './types.js'

interface RawMetric {
  id?: string
  name?: string
  view?: string
}

interface RawDis {
  id?: string
  concept_a?: { name?: string; entity_id?: string }
  concept_b?: { name?: string; entity_id?: string }
  core_difference?: string
}

interface RawExp {
  id?: string
  original_question?: string
  similar_questions?: string[]
  analysis_conclusion?: string
}

interface RawView {
  name?: string
}

const UNKNOWN_METRICS: Array<{ keywords: string[]; concept: string; alternatives: string[] }> = [
  {
    keywords: ['退款率'],
    concept: '退款率',
    alternatives: ['退款订单数 / 总订单数（近似比值）', '退款金额趋势（已有数据）']
  },
  {
    keywords: ['ltv', '生命周期价值'],
    concept: '用户 LTV',
    alternatives: ['用累计消费金额趋势近似', '用复购率 + 客单价组合观察']
  },
  {
    keywords: ['广告roi', '广告回报率'],
    concept: '广告投放 ROI',
    alternatives: ['营销花费 / GMV 近似', '渠道转化漏斗分析']
  }
]

let cache: {
  metrics: MetricRecord[]
  disambiguations: DisambiguationRecord[]
  experiences: ExperienceRecord[]
  views: string[]
} | null = null

export async function loadSemanticAssets() {
  if (cache) return cache

  const [metricsRaw, disRaw, expRaw, viewsRaw] = await Promise.all([
    readAll<RawMetric>('metrics'),
    readAll<RawDis>('disambiguations'),
    readAll<RawExp>('experiences'),
    readAll<RawView | { views?: RawView[] }>('views')
  ])

  const views: string[] = []
  for (const v of viewsRaw) {
    if (v && typeof v === 'object' && 'views' in v && Array.isArray((v as { views: RawView[] }).views)) {
      for (const item of (v as { views: RawView[] }).views) {
        if (item.name) views.push(item.name)
      }
    } else if ((v as RawView).name) {
      views.push((v as RawView).name!)
    }
  }

  cache = {
    metrics: metricsRaw.map(m => ({
      id: m.id || '',
      name: m.name || m.id || '',
      view: m.view
    })),
    disambiguations: disRaw.map(d => ({
      id: d.id || '',
      conceptA: d.concept_a?.name || '',
      conceptB: d.concept_b?.name || '',
      entityIdA: d.concept_a?.entity_id,
      entityIdB: d.concept_b?.entity_id,
      coreDifference: d.core_difference || ''
    })),
    experiences: expRaw.map(e => ({
      id: e.id || '',
      originalQuestion: e.original_question || '',
      similarQuestions: e.similar_questions || [],
      conclusion: e.analysis_conclusion || ''
    })),
    views
  }
  return cache
}

export function detectCapabilityGap(text: string, metrics: MetricRecord[]) {
  const lower = text.toLowerCase()
  for (const item of UNKNOWN_METRICS) {
    if (item.keywords.some(k => lower.includes(k.toLowerCase()))) {
      const hasMetric = metrics.some(m =>
        item.keywords.some(k => (m.name + m.id).toLowerCase().includes(k.toLowerCase()))
      )
      if (!hasMetric) return item
    }
  }
  return null
}

export function matchMetric(text: string, metrics: MetricRecord[]): MetricRecord | null {
  const rules: Array<{ keys: string[]; id?: string; name?: string }> = [
    { keys: ['客单价'], id: 'MTR-002401' },
    { keys: ['gmv'], id: 'MTR-002401' },
    { keys: ['销售额', '销售'], name: '客单价' },
    { keys: ['收入'], id: 'MTR-686516', name: 'DAU' },
    { keys: ['dau', '日活', '活跃'], id: 'MTR-686516' }
  ]
  const lower = text.toLowerCase()
  for (const rule of rules) {
    if (rule.keys.some(k => lower.includes(k.toLowerCase()))) {
      const found = metrics.find(m =>
        (rule.id && m.id === rule.id) || (rule.name && m.name.includes(rule.name))
      )
      if (found) return found
    }
  }
  return metrics[0] || null
}

export function matchDisambiguation(text: string, list: DisambiguationRecord[]) {
  const lower = text.toLowerCase()
  return list.find(d => {
    const a = d.conceptA.toLowerCase()
    const b = d.conceptB.toLowerCase()
    return (a && lower.includes(a)) || (b && lower.includes(b)) ||
      (a && b && lower.includes('对比') && (lower.includes(a) || lower.includes(b)))
  }) || null
}

export function matchExperience(text: string, list: ExperienceRecord[]) {
  const norm = text.replace(/\s/g, '')
  let best: { exp: ExperienceRecord; score: number } | null = null
  for (const exp of list) {
    const candidates = [exp.originalQuestion, ...exp.similarQuestions].filter(Boolean)
    for (const c of candidates) {
      const cn = c.replace(/\s/g, '')
      if (!cn) continue
      if (norm.includes(cn) || cn.includes(norm)) {
        const score = Math.min(norm.length, cn.length) / Math.max(norm.length, cn.length)
        if (!best || score > best.score) best = { exp, score: Math.round(score * 100) }
      }
    }
  }
  return best
}

export function pickView(metric: MetricRecord | null, views: string[]) {
  if (metric?.view && views.includes(metric.view)) return metric.view
  return views[0] || 'app_standard_indicators'
}
