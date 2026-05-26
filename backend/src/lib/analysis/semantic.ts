import { readAll } from '../storage.js'
import { chatOnce } from '../llm.js'
import { loadViewCatalog } from '../query/viewCatalog.js'
import { loadSemanticCatalog } from '../query/semanticCatalog.js'
import type { DisambiguationRecord, ExperienceRecord, MetricRecord, QueryType } from './types.js'

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

export interface FilterCondition {
  dimension: string
  operator: string
  values: string[]
}

export interface LLMViewMatch {
  viewName: string
  measureShort: string
  breakdownShort: string | null
  queryType: QueryType
  filterConditions: FilterCondition[]
}

type RawCandidate = Record<string, unknown>
type ViewMap = Map<string, { name: string; includes: Set<string> }>

function parseCandidate(raw: RawCandidate, catalog: ViewMap): LLMViewMatch | null {
  const validQueryTypes: QueryType[] = ['trend', 'breakdown', 'trend_breakdown', 'scalar']
  const viewName = typeof raw.viewName === 'string' && catalog.has(raw.viewName) ? raw.viewName : null
  if (!viewName) return null
  const measureShort = typeof raw.measureShort === 'string' ? raw.measureShort : ''
  const breakdownShort = raw.breakdownShort === null || raw.breakdownShort === 'null' || !raw.breakdownShort
    ? null
    : typeof raw.breakdownShort === 'string' ? raw.breakdownShort : null
  const queryType: QueryType = validQueryTypes.includes(raw.queryType as QueryType)
    ? (raw.queryType as QueryType)
    : 'trend_breakdown'

  const rawFilters = Array.isArray(raw.filterConditions) ? raw.filterConditions : []
  const filterConditions: FilterCondition[] = rawFilters
    .filter((f): f is Record<string, unknown> => f && typeof f === 'object')
    .map(f => ({
      dimension: typeof f.dimension === 'string' ? f.dimension : '',
      operator: typeof f.operator === 'string' ? f.operator : 'equals',
      values: Array.isArray(f.values) ? f.values.map(String) : []
    }))
    .filter(f => f.dimension && f.values.length > 0)

  return { viewName, measureShort, breakdownShort, queryType, filterConditions }
}

function validateCandidate(c: LLMViewMatch, catalog: ViewMap): boolean {
  const entry = catalog.get(c.viewName)
  if (!entry) return false
  if (c.measureShort && !entry.includes.has(c.measureShort)) return false
  if (c.breakdownShort && !entry.includes.has(c.breakdownShort)) return false
  return true
}

/**
 * 用 LLM 语义理解用户问题，从 viewCatalog 中选出最合适的 View，
 * 并推断用户想查的指标短名、拆分维度短名和查询类型。
 * LLM 返回有序候选列表（最多3个），后端按顺序做 includes 成员校验，
 * 取第一个通过校验的候选，消除对 ai_context 文案精准度的依赖。
 */
export async function matchViewByLLM(userQuery: string): Promise<LLMViewMatch> {
  const catalog = await loadViewCatalog()
  const views = [...catalog.values()]

  const fallback: LLMViewMatch = {
    viewName: views[0]?.name || 'app_standard_indicators',
    measureShort: '',
    breakdownShort: null,
    queryType: 'trend_breakdown',
    filterConditions: []
  }

  if (!views.length || !process.env.DEEPSEEK_API_KEY) return fallback

  // 加载 cube 维度元数据，构建 cubeName → {shortName → {title, aiContext}} 映射
  const { cubes } = await loadSemanticCatalog()
  const cubeDimMeta = new Map<string, Map<string, { title?: string; aiContext?: string }>>()
  for (const [cubeName, cubeDef] of cubes) {
    const dimMap = new Map<string, { title?: string; aiContext?: string }>()
    for (const d of cubeDef.dimensions) {
      dimMap.set(d.name, { title: d.title, aiContext: d.aiContext })
    }
    cubeDimMeta.set(cubeName, dimMap)
  }

  // 构建 views 描述（重点突出 ai_context + 维度元数据）
  const viewsDesc = views.map(v => {
    const explicitMembers = [...v.includes].filter(m => m !== '*')

    // 为该 view 下所有维度拼出描述
    const dimDescLines: string[] = []
    for (const memberShort of explicitMembers) {
      for (const cubeName of v.cubeNames) {
        const meta = cubeDimMeta.get(cubeName)?.get(memberShort)
        if (meta?.title || meta?.aiContext) {
          const desc = [meta.title, meta.aiContext].filter(Boolean).join('；')
          dimDescLines.push(`    - ${memberShort}: ${desc}`)
          break
        }
      }
    }

    const membersStr = explicitMembers.length
      ? explicitMembers.join(', ')
      : '（成员见 Cube meta，包含 view 下全部字段）'
    return [
      `name: ${v.name}`,
      v.title ? `title: ${v.title}` : null,
      v.aiContext ? `ai_context: ${v.aiContext}` : null,
      `includes: ${membersStr}`,
      dimDescLines.length ? `dimension_meta:\n${dimDescLines.join('\n')}` : null
    ].filter(Boolean).join('\n  ')
  }).map(s => `- ${s}`).join('\n\n')

  const prompt = `你是数据仓库查询助手。根据用户问题，从下方可用 Views 中按匹配度从高到低选出最多3个候选，推断每个候选所需的指标、拆分维度、查询类型，以及需要过滤的维度条件。

用户问题：${userQuery}

可用 Views：
${viewsDesc}

查询类型定义：
- "scalar"：用户问总量/合计/是多少，只需返回一个汇总数值，不需要时间序列也不需要维度拆分
- "trend"：用户问趋势、走势、变化、近N天/月，需要按时间粒度（天）聚合的折线数据
- "breakdown"：用户问分布、各个X的Y、按X分组，只需要按维度聚合，不需要时间序列
- "trend_breakdown"：用户同时关心趋势和分布（默认）

选择依据：优先参考每个 View 的 ai_context 字段来判断语义匹配程度；includes 字段列出了 View 可用的成员名，measureShort 和 breakdownShort 必须从对应 View 的 includes 中选取。

filterConditions 提取规则：
- 仔细分析用户问题中的限定条件（产品型号、状态标志、地区、渠道等），将其转为维度过滤
- dimension 必须是该 view 的 includes 中的成员名
- operator 可选值：equals / contains / gt / lt / gte / lte
- 参考 dimension_meta 中的描述来理解维度含义和可选值
- 如果没有额外限定条件则 filterConditions 为空数组

请只输出 JSON 数组，不要 markdown 代码块，不要多余文字：
[
  {
    "viewName": "匹配度最高的 view name（必须是上方列表中的 name 之一）",
    "queryType": "scalar | trend | breakdown | trend_breakdown",
    "measureShort": "用户想查的指标短名（必须来自该 view 的 includes）",
    "breakdownShort": "拆分维度短名（必须来自该 view 的 includes；queryType为trend/scalar时填null；无拆分需求也填null）",
    "filterConditions": [
      {"dimension": "维度短名（必须来自该 view 的 includes）", "operator": "equals", "values": ["过滤值"]}
    ]
  }
]`

  try {
    const t0 = Date.now()
    const raw = await chatOnce([{ role: 'user', content: prompt }])
    console.log(`[llm] chatOnce 完成 ${Date.now() - t0}ms`)
    const json = raw.replace(/^```[a-z]*\n?|\n?```$/g, '').trim()
    const parsed = JSON.parse(json)

    // 兼容 LLM 返回对象（旧格式）或数组（新格式）
    const rawList: RawCandidate[] = Array.isArray(parsed) ? parsed : [parsed]

    const viewMap: ViewMap = catalog
    const candidates: LLMViewMatch[] = rawList
      .map(item => parseCandidate(item, viewMap))
      .filter((c): c is LLMViewMatch => c !== null)

    if (!candidates.length) return fallback

    // 按顺序找第一个 includes 校验通过的候选
    for (const candidate of candidates) {
      if (validateCandidate(candidate, viewMap)) {
        if (candidate !== candidates[0]) {
          console.log(`[llm] view 候选校验：降级 ${candidates[0].viewName} → ${candidate.viewName}（measureShort=${candidate.measureShort}）`)
        }
        return candidate
      }
    }

    // 全部未通过校验 → 降级返回第一个候选（兜底）
    console.log(`[llm] view 候选校验：全部未通过，兜底使用 ${candidates[0].viewName}`)
    return candidates[0]
  } catch {
    return fallback
  }
}
