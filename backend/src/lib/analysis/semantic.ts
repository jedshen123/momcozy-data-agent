import { readAll } from '../storage.js'
import { chatOnce, streamChat } from '../llm.js'
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
  title?: string
}

export interface LLMViewMatch {
  viewName: string
  measureShort: string
  /** 指标的中文显示名（从语义目录查找），用于 UI 展示 */
  measureTitle?: string
  breakdownShort: string | null
  queryType: QueryType
  filterConditions: FilterCondition[]
}

type RawCandidate = Record<string, unknown>
type ViewMap = Map<string, { name: string; includes: Set<string>; cubeNames: string[] }>

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

function enrichWithTitle(
  candidate: LLMViewMatch,
  catalog: ViewMap,
  memberMeta: Map<string, Map<string, { title?: string; aiContext?: string }>>
): LLMViewMatch {
  if (!candidate.measureShort) return candidate
  const view = catalog.get(candidate.viewName)
  if (!view) return candidate
  for (const cubeName of view.cubeNames || []) {
    const title = memberMeta.get(cubeName)?.get(candidate.measureShort)?.title
    if (title) return { ...candidate, measureTitle: title }
  }
  return candidate
}

export interface PrevIntentContext {
  measureShort?: string
  breakdownShort?: string | null
  queryType?: string
  filterConditions?: Array<{ dimension: string; operator: string; values: string[] }>
  timeRange?: string
  viewName?: string
}

/**
 * 用 LLM 语义理解用户问题，从 viewCatalog 中选出最合适的 View，
 * 并推断用户想查的指标短名、拆分维度短名和查询类型。
 * LLM 返回有序候选列表（最多3个），后端按顺序做 includes 成员校验，
 * 取第一个通过校验的候选，消除对 ai_context 文案精准度的依赖。
 */
export async function matchViewByLLM(
  userQuery: string,
  prevIntent?: PrevIntentContext,
  onThinkingToken?: (token: string) => void
): Promise<LLMViewMatch> {
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

  // 加载 cube 维度/度量元数据，构建 cubeName → {shortName → {title, aiContext}} 映射
  const { cubes } = await loadSemanticCatalog()
  // 合并 dimensions + measures 的 title 元数据，同时记录哪些是 measure
  const cubeMemberMeta = new Map<string, Map<string, { title?: string; aiContext?: string }>>()
  const cubeMeasureNames = new Map<string, Set<string>>()
  for (const [cubeName, cubeDef] of cubes) {
    const memberMap = new Map<string, { title?: string; aiContext?: string }>()
    const mNames = new Set<string>()
    for (const d of cubeDef.dimensions) {
      memberMap.set(d.name, { title: d.title, aiContext: d.aiContext })
    }
    for (const m of cubeDef.measures) {
      memberMap.set(m.name, { title: m.title })
      mNames.add(m.name)
    }
    cubeMemberMeta.set(cubeName, memberMap)
    cubeMeasureNames.set(cubeName, mNames)
  }

  // 构建 views 描述（measures 和 dimensions 分开列出，方便 LLM 准确选取指标）
  const viewsDesc = views.map(v => {
    const explicitMembers = [...v.includes].filter(m => m !== '*')

    // 按 cube 定义区分 measures 和 dimensions
    const measureMembers: string[] = []
    const dimensionMembers: string[] = []
    for (const memberShort of explicitMembers) {
      let isMeasure = false
      for (const cubeName of v.cubeNames) {
        if (cubeMeasureNames.get(cubeName)?.has(memberShort)) {
          isMeasure = true
          break
        }
      }
      if (isMeasure) {
        measureMembers.push(memberShort)
      } else {
        dimensionMembers.push(memberShort)
      }
    }

    // 为成员拼出元数据描述行
    const memberDescLines: string[] = []
    for (const memberShort of explicitMembers) {
      for (const cubeName of v.cubeNames) {
        const meta = cubeMemberMeta.get(cubeName)?.get(memberShort)
        if (meta?.title || meta?.aiContext) {
          const desc = [meta.title, meta.aiContext].filter(Boolean).join('；')
          memberDescLines.push(`    - ${memberShort}: ${desc}`)
          break
        }
      }
    }

    const measuresStr = measureMembers.length ? measureMembers.join(', ') : '（无明确 measure 列表）'
    const dimensionsStr = dimensionMembers.length ? dimensionMembers.join(', ') : '（无明确 dimension 列表）'
    return [
      `name: ${v.name}`,
      v.title ? `title: ${v.title}` : null,
      v.aiContext ? `ai_context: ${v.aiContext}` : null,
      `measures: ${measuresStr}`,
      `dimensions: ${dimensionsStr}`,
      memberDescLines.length ? `member_meta:\n${memberDescLines.join('\n')}` : null
    ].filter(Boolean).join('\n  ')
  }).map(s => `- ${s}`).join('\n\n')

  const prevIntentSection = prevIntent ? `
上一轮意图（供参考，用户新问题可能是在此基础上修改）：
- View：${prevIntent.viewName || '无'}
- 指标：${prevIntent.measureShort || '无'}
- 查询类型：${prevIntent.queryType || '无'}
- 过滤条件：${prevIntent.filterConditions?.length ? JSON.stringify(prevIntent.filterConditions) : '无'}
- 时间范围：${prevIntent.timeRange || '无'}

如果用户新问题是追问（如只改了某个 filter 值、只换了产品型号等），请继承上一轮的 view/measure/queryType，只更新变化的部分。

` : ''

  const prompt = `你是数据仓库查询助手。根据用户问题，从下方可用 Views 中按匹配度从高到低选出最多3个候选，推断每个候选所需的指标、拆分维度、查询类型，以及需要过滤的维度条件。
${prevIntentSection}
用户问题：${userQuery}

可用 Views：
${viewsDesc}

查询类型定义：
- "scalar"：用户问总量/合计/是多少，只需返回一个汇总数值，不需要时间序列也不需要维度拆分
- "trend"：用户问趋势、走势、变化、近N天/月，需要按时间粒度（天）聚合的折线数据
- "breakdown"：用户问分布、各个X的Y、按X分组，只需要按维度聚合，不需要时间序列
- "trend_breakdown"：用户同时关心趋势和分布（默认）

选择依据：优先参考每个 View 的 ai_context 字段来判断语义匹配程度；每个 View 已按类型列出 measures（度量指标）和 dimensions（维度）。

重要约束：
- measureShort 必须从该 View 的 measures 列表中选取，不能选 dimensions 中的成员
- breakdownShort 必须从该 View 的 dimensions 列表中选取，不能选 measures 中的成员
- filterConditions 中的 dimension 必须来自该 View 的 dimensions 列表
- 如果用户要求的分组维度在当前 view 的 dimensions 中找不到匹配项，必须将支持该维度的其他 view 作为优先候选，不能用不相关的维度凑数

filterConditions 提取规则：
- 仔细分析用户问题中的限定条件（产品型号、状态标志、地区、渠道等），将其转为维度过滤
- operator 可选值：equals / contains / gt / lt / gte / lte
- 参考 member_meta 中的描述来理解维度含义和可选值
- 如果没有额外限定条件则 filterConditions 为空数组
- 【重要】时间范围（最近N天、某日期区间等）不要放入 filterConditions，时间由系统单独处理

breakdownShort 选取规则：
- 仔细识别用户问题中的分组主体："各个X"、"按X分布"、"X维度" → breakdownShort 选与 X 语义最匹配的 dimension
- 优先参考 view 的 ai_context 中明确指定了 breakdownShort 的场景说明
- 不要默认选地理/国家维度；只有用户明确提到"国家/地区"时才选地理维度
- 若用户未指定分组维度且 queryType=breakdown，选该 view 最具业务代表性的维度
- 若当前 view 没有与用户分组意图匹配的 dimension，换一个有该 dimension 的 view 作为候选，不能用与用户意图无关的维度替代

请按以下两步骤输出：

第一步：先用 1-3 句话简述你的推理过程（如：用户在追问上轮结果，只需将 model 过滤从 M9 改为 Air1，其余条件保持不变）。
第二步：紧跟一个 <JSON> 标记，然后输出 JSON 数组，最后加 </JSON>。

格式示例：
用户是追问，只需将 model 过滤条件从 M9 改为 Air1，其余 view/measure/queryType/时间均继承上轮。
<JSON>
[{"viewName":"...","queryType":"trend","measureShort":"...","breakdownShort":null,"filterConditions":[{"dimension":"...","operator":"equals","values":["Air1"]}]}]
</JSON>`

  try {
    const t0 = Date.now()
    let raw = ''
    for await (const token of streamChat([{ role: 'user', content: prompt }])) {
      raw += token
      // 只转发 <JSON> 标记之前的思考内容
      if (onThinkingToken) {
        const jsonStart = raw.indexOf('<JSON>')
        if (jsonStart === -1) {
          onThinkingToken(token)
        } else {
          // 刚刚越过 <JSON>，把边界前还未发送的部分补发一次
          const alreadySent = raw.length - token.length
          if (alreadySent < jsonStart) {
            onThinkingToken(raw.slice(alreadySent, jsonStart))
          }
        }
      }
    }
    console.log(`[llm] matchViewByLLM 完成 ${Date.now() - t0}ms`)

    // 从 <JSON>...</JSON> 中提取 JSON，兼容没有标记的旧格式
    let jsonStr: string
    const jsonTagMatch = raw.match(/<JSON>([\s\S]*?)<\/JSON>/)
    if (jsonTagMatch) {
      jsonStr = jsonTagMatch[1].trim()
    } else {
      jsonStr = raw.replace(/^```[a-z]*\n?|\n?```$/g, '').trim()
    }
    const parsed = JSON.parse(jsonStr)

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
        return enrichWithTitle(candidate, viewMap, cubeMemberMeta)
      }
    }

    // 全部未通过校验 → 降级返回第一个候选（兜底）
    console.log(`[llm] view 候选校验：全部未通过，兜底使用 ${candidates[0].viewName}`)
    return enrichWithTitle(candidates[0], viewMap, cubeMemberMeta)
  } catch {
    return fallback
  }
}
