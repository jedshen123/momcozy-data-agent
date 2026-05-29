import { streamChat } from '../llm.js'
import { write } from '../storage.js'
import {
  chipsForGap,
  clarifyingPrompt,
  classifyGaps,
  inferTimeRange
} from './gapClassifier.js'
import {
  detectCapabilityGap,
  loadSemanticAssets,
  matchDisambiguation,
  matchExperience,
  matchViewByLLM,
  type PrevIntentContext,
} from './semantic.js'
import type { SseWriter } from './sse.js'
import type {
  AnalysisSession,
  ClientEvent,
  ExecutionStep,
  IntentCard,
  QueryType,
  ResultHistoryEntry,
  ResultPayload
} from './types.js'
import { emptySession } from './types.js'
import { runAnalysisQuery } from '../query/runAnalysisQuery.js'
import { getQueryEngineInfo } from '../query/queryEngine.js'
import { getDimensionTitle } from '../query/cubeMeta.js'
import { buildAnalysisPlanPreview } from '../query/analysisPlan.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function pushTurn(session: AnalysisSession, role: 'user' | 'assistant', content: string) {
  session.turns.push({ role, content })
}

function buildIntent(
  userText: string,
  metricName: string,
  metricId: string,
  viewName: string,
  timeRange: string,
  defaultNote: string,
  measureShort?: string,
  breakdownShort?: string | null,
  queryType?: QueryType,
  filterConditions?: Array<{ dimension: string; operator: string; values: string[]; title?: string }>,
  topN?: number,
  rankMeasureShort?: string
): IntentCard {
  const region = /华东|华北|华南|渠道/.test(userText)
    ? userText.match(/华东|华北|华南|各渠道|渠道/)?.[0] || ''
    : ''
  const analysisLabel = queryType === 'scalar' ? '指标查询'
    : queryType === 'breakdown' ? '分布分析'
    : queryType === 'trend' ? '趋势分析'
    : queryType === 'trend_breakdown' ? '趋势 & 分布分析'
    : queryType === 'trend_top_n' ? `Top${topN ?? 5} 趋势分析`
    : '数据分析'

  // 只有时间已实际确定时才显示，避免「待指定」等占位符出现在摘要里
  // scalar 查询自动使用「不限时间」，不在摘要中重复展示
  const timeDisplay = (queryType === 'scalar' && timeRange === '不限时间') ? ''
    : timeRange.includes('~') ? timeRange
    : timeRange === '不限时间' ? '不限时间'
    : ''
  const filterDesc = filterConditions?.length
    ? filterConditions.map(f => `${f.title || f.dimension}=${f.values.join('/')}`).join('·')
    : ''
  const summary = [filterDesc, timeDisplay, metricName, analysisLabel]
    .filter(Boolean)
    .join(' · ')

  return {
    summary: summary || `${metricName} · ${viewName}`,
    timeRange,
    defaultNote,
    metric: metricName,
    metricId,
    view: viewName,
    measureShort,
    breakdownShort,
    queryType,
    filterConditions: filterConditions?.length ? filterConditions : undefined,
    topN,
    rankMeasureShort
  }
}

async function attachAnalysisPlan(
  intent: IntentCard,
  userQuery: string,
  metricId = ''
): Promise<IntentCard> {
  if (getQueryEngineInfo().engine !== 'cube') return intent
  try {
    const analysisPlan = await buildAnalysisPlanPreview({
      metricId,
      intent,
      userQuery,
      dis: null
    })
    return { ...intent, analysisPlan }
  } catch (err) {
    console.warn(`[analysis] 生成分析计划失败: ${err instanceof Error ? err.message : err}`)
    return intent
  }
}

async function streamAssistantText(
  emit: SseWriter,
  session: AnalysisSession,
  text: string
) {
  pushTurn(session, 'assistant', '')
  const idx = session.turns.length - 1
  // 先把含空 assistant turn 的 session 推给前端，让它准备好接收 token
  await emit({ type: 'session', session: { ...session } })
  for (const ch of text) {
    session.turns[idx].content += ch
    await emit({ type: 'token', content: ch })
    await sleep(30)
  }
}

async function maybeLlmClarify(
  userQuery: string,
  question: string
): Promise<string> {
  if (!process.env.DEEPSEEK_API_KEY) return question
  try {
    let out = ''
    for await (const t of streamChat(
      [{ role: 'user', content: `用户问题：${userQuery}\n请用一句话追问：${question}` }],
      '你是数据分析助手。只输出一句简体中文追问，不要多余解释。'
    )) {
      out += t
    }
    return out.trim() || question
  } catch {
    return question
  }
}

async function runExecuting(
  session: AnalysisSession,
  emit: SseWriter
) {
  const tExec = Date.now()
  console.log(`[analysis] 开始执行 query="${session.userQuery.slice(0, 60)}"`)
  session.phase = 'executing'
  session.context.statusLabel = '执行中'
  await emit({ type: 'session', session: { ...session } })

  const assets = await loadSemanticAssets()
  const query = session.userQuery + ' ' + session.turns.filter(t => t.role === 'user').map(t => t.content).join(' ')
  const dis = matchDisambiguation(query, assets.disambiguations)
  const expMatch = matchExperience(query, assets.experiences)
  const view = session.intent?.view || ''

  const semanticSteps: ExecutionStep[] = [
    {
      id: 'semantic_exp',
      label: expMatch
        ? `命中经验层案例 ${expMatch.exp.id}（相似度 ${expMatch.score}%）`
        : '未命中经验层案例',
      status: 'pending',
      highlight: expMatch ? 'exp_reuse' : undefined
    },
    {
      id: 'semantic_dis',
      label: dis
        ? `应用澄清层 ${dis.id}（${dis.conceptA} vs ${dis.conceptB}）→ ${dis.entityIdA || session.intent?.metricId || ''}`
        : '无需应用澄清层',
      status: 'pending',
      highlight: dis ? 'dis_apply' : undefined
    }
  ]
  const planSteps: ExecutionStep[] = (session.intent?.analysisPlan || []).map(step => ({
    id: step.id,
    label: step.title,
    status: 'pending',
    detail: step.cubeQuery ? JSON.stringify(step.cubeQuery, null, 2) : step.description
  }))
  const steps: ExecutionStep[] = [
    ...semanticSteps,
    ...(planSteps.length
      ? planSteps
      : [{ id: 'query_execute', label: `执行查询：${session.intent?.metric || session.intent?.measureShort || '指标'}`, status: 'pending' as const }])
  ]

  session.steps = steps
  session.context.queryEngine = getQueryEngineInfo().engine
  await emit({ type: 'session', session: { ...session } })

  for (let i = 0; i < semanticSteps.length; i++) {
    steps[i].status = 'running'
    await emit({ type: 'session', session: { ...session } })
    steps[i].status = 'done'
    if (expMatch && steps[i].id === 'semantic_exp') {
      session.context.expHit = `${expMatch.exp.id}（${expMatch.score}%）`
    }
    if (dis && steps[i].id === 'semantic_dis') {
      session.context.disApplied = `${dis.id} → ${dis.entityIdA || session.intent?.metricId}`
    }
    await emit({ type: 'session', session: { ...session } })
  }
  session.context.view = view

  const metricForQuery = {
    id: session.intent?.metricId || '',
    name: session.intent?.metric || session.intent?.measureShort || '指标',
    view: session.intent?.view || ''
  }

  try {
    if (!session.intent) throw new Error('缺少意图确认信息')
    const tq = Date.now()
    console.log(`[analysis] 执行查询 view=${session.intent.view} queryType=${session.intent.queryType} measure=${session.intent.measureShort}`)
    const updateStep = async (
      stepId: string,
      status: 'running' | 'done' | 'error',
      detail?: string
    ) => {
      const step = steps.find(s => s.id === stepId) || steps.find(s => !s.id.startsWith('semantic_') && s.status === 'pending')
      if (!step) return
      step.status = status
      if (detail) step.detail = detail
      await emit({ type: 'session', session: { ...session } })
    }
    if (!planSteps.length) {
      await updateStep('query_execute', 'running')
    }
    const output = await runAnalysisQuery({
      metric: metricForQuery,
      intent: session.intent,
      userQuery: query,
      dis: dis ?? undefined,
      onProgress: updateStep
    })
    console.log(`[analysis] 查询完成 ${Date.now() - tq}ms rowCount=${output.rowCount} chartType=${output.chartType}`)
    for (const step of steps) {
      if (!step.id.startsWith('semantic_') && step.status === 'pending') {
        step.status = 'done'
      }
    }
    if (!planSteps.length) {
      const executeStep = steps.find(s => s.id === 'query_execute')
      if (executeStep) {
        executeStep.status = 'done'
        executeStep.label = `查询完成（${output.rowCount} 行）`
        executeStep.detail = output.sql
      }
    }
    session.context.metric = session.intent.metric || session.intent.measureShort
    session.context.executedSql = output.sql
    session.context.statusLabel = '执行完成'
    session.context.timeRange = session.intent.timeRange
    session.phase = 'result'
    session.result = {
      summary: output.summary,
      chartTitle: output.chartTitle,
      chartType: output.chartType,
      breakdown: output.breakdown,
      series: output.series,
      multiSeries: output.multiSeries,
      sql: output.sql,
      rowCount: output.rowCount,
      cubeQueries: output.cubeQueries
    }
    // 把本轮结果追加到 resultHistory，供后续对比使用
    const historyLabel = session.intent.filterConditions?.length
      ? session.intent.filterConditions.map(f => f.values.join('/')).join('·')
      : (session.intent.metric || session.intent.measureShort || '本轮')
    const entry: ResultHistoryEntry = { label: historyLabel, result: session.result! }
    session.resultHistory = [...(session.resultHistory ?? []), entry]
    pushTurn(session, 'assistant', '分析完成。\n\n' + output.summary)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败'
    console.error(`[analysis] 查询失败: ${msg}`)
    const active = steps.find(s => !s.id.startsWith('semantic_') && s.status === 'running')
      || steps.find(s => !s.id.startsWith('semantic_') && s.status === 'pending')
      || steps[steps.length - 1]
    if (active) {
      active.status = 'error'
      active.label = `${active.label}：${msg}`
    }
    session.context.statusLabel = '查询失败'
    session.phase = 'result'
    session.result = {
      summary: `查询未能完成：${msg}。请检查语义层配置或本地数仓文件。`,
      chartTitle: '无数据',
      breakdown: []
    }
    pushTurn(session, 'assistant', session.result.summary)
  }

  console.log(`[analysis] 执行完成 总耗时 ${Date.now() - tExec}ms`)
  await emit({ type: 'session', session: { ...session } })
}

const COMPARE_PATTERN = /对比|比较|一起看|放一起|叠加|同图|合并/
const EXISTING_RESULT_REASONING_PATTERN = /当前趋势|按照.*趋势|按.*趋势|预测|预计|预估|推算|外推|年底|年末|月底|月末|能否|能不能|能.*达|会不会|多久|什么时候.*达/

/**
 * 检测"对比已有数据"意图：用户问"对比它们"/"比较两个"时，
 * 若 session.resultHistory 已有 ≥2 条趋势数据，直接合并出图，无需重新查询。
 * 返回 true 表示已处理完毕，false 表示需走正常流程。
 */
async function tryHandleComparison(
  session: AnalysisSession,
  text: string,
  emit: SseWriter
): Promise<boolean> {
  if (!COMPARE_PATTERN.test(text)) return false
  const history = session.resultHistory ?? []
  const trendEntries = history.filter(e => e.result.series && e.result.series.length > 0)
  if (trendEntries.length < 2) return false

  // 取最近两条趋势结果合并
  const targets = trendEntries.slice(-2)
  const combinedSeries = targets.flatMap(e =>
    (e.result.series ?? []).map(pt => ({ ...pt, __series: e.label }))
  )

  // 构造对比结果：chartType = 'line_multi'，series 里区分多条线
  const comparisonResult = {
    summary: `对比 ${targets.map(e => e.label).join(' vs ')} 的趋势：以下为叠加折线图，直接基于已有数据绘制，无需重新查询。`,
    chartTitle: targets.map(e => e.label).join(' vs '),
    chartType: 'line_multi' as const,
    breakdown: [],
    multiSeries: targets.map((e, i) => ({
      name: e.label,
      color: i === 0 ? '#2563eb' : '#7c3aed',
      data: e.result.series ?? []
    }))
  }

  pushTurn(session, 'assistant', '')
  const idx = session.turns.length - 1
  session.phase = 'result'
  session.result = comparisonResult
  session.context.statusLabel = '对比完成'
  await emit({ type: 'session', session: { ...session } })

  const summaryText = comparisonResult.summary
  for (const ch of summaryText) {
    session.turns[idx].content += ch
    await emit({ type: 'token', content: ch })
    await sleep(20)
  }
  await emit({ type: 'session', session: { ...session } })
  await emit({ type: 'done' })
  return true
}

function fmtValue(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万`
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function parseLocalDate(s: string) {
  const [year, month, day] = s.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLocalDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(d: Date, days: number) {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function parseTargetValue(text: string): number | null {
  const m = text.match(/(?:达到|到达|超过|突破|破|到)\s*(\d+(?:\.\d+)?)\s*(亿|千万|百万|万)?/)
    || text.match(/(\d+(?:\.\d+)?)\s*(亿|千万|百万|万)/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const unit = m[2]
  if (unit === '亿') return n * 100000000
  if (unit === '千万') return n * 10000000
  if (unit === '百万') return n * 1000000
  if (unit === '万') return n * 10000
  return n
}

function inferDeadline(text: string, lastDate: Date): Date | null {
  if (/明年.*(年底|年末)/.test(text)) return new Date(lastDate.getFullYear() + 1, 11, 31)
  if (/年底|年末|今年底/.test(text)) return new Date(lastDate.getFullYear(), 11, 31)
  if (/月底|月末/.test(text)) return new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0)
  return null
}

function buildExistingTrendAnswer(text: string, result: ResultPayload): string | null {
  const series = (result.series || [])
    .filter(p => p.date && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (series.length < 2) return null

  const first = series[0]
  const last = series[series.length - 1]
  const firstDate = parseLocalDate(first.date)
  const lastDate = parseLocalDate(last.date)
  const observedDays = diffDays(firstDate, lastDate)
  if (observedDays <= 0) return null

  const dailyChange = (last.value - first.value) / observedDays
  const target = parseTargetValue(text)
  const deadline = inferDeadline(text, lastDate)
  const metricLabel = (result.chartTitle.split('（')[0] || '该指标')
    .replace(/\s*(趋势|分布|汇总|& 分布)\s*$/, '')
  const trendDesc = dailyChange >= 0 ? '增长' : '下降'

  const lines = [
    `可以，当前问题能直接基于上一轮已查询出的 ${series.length} 个趋势点推算，不需要再次查询数据。`,
    '',
    `从 ${first.date} 到 ${last.date}，${metricLabel}从 ${fmtValue(first.value)} 变为 ${fmtValue(last.value)}，平均每天${trendDesc}约 ${fmtValue(Math.abs(dailyChange))}。`
  ]

  if (target != null && deadline) {
    const daysToDeadline = diffDays(lastDate, deadline)
    const forecast = last.value + dailyChange * daysToDeadline
    const gap = forecast - target
    const canReach = forecast >= target
    lines.push(
      `按这个线性趋势外推到 ${formatLocalDate(deadline)}，预计约 ${fmtValue(forecast)}。`,
      canReach
        ? `结论：有机会达到 ${fmtValue(target)}，预计高出目标约 ${fmtValue(Math.abs(gap))}。`
        : `结论：按当前趋势还到不了 ${fmtValue(target)}，预计差约 ${fmtValue(Math.abs(gap))}。`
    )
    return lines.join('\n')
  }

  if (target != null) {
    if (last.value >= target) {
      lines.push(`结论：当前最新值已经达到 ${fmtValue(target)}。`)
    } else if (dailyChange > 0) {
      const daysToTarget = Math.ceil((target - last.value) / dailyChange)
      lines.push(`按当前趋势，预计在 ${formatLocalDate(addDays(lastDate, daysToTarget))} 左右达到 ${fmtValue(target)}。`)
    } else {
      lines.push(`结论：当前趋势不是上升趋势，暂时无法按现有走势达到 ${fmtValue(target)}。`)
    }
    return lines.join('\n')
  }

  lines.push(`结论：现有数据已经足够支撑趋势推断，无需补充视图查询。`)
  return lines.join('\n')
}

async function tryHandleExistingResultReasoning(
  session: AnalysisSession,
  text: string,
  emit: SseWriter
): Promise<boolean> {
  if (!EXISTING_RESULT_REASONING_PATTERN.test(text)) return false
  const latest = [...(session.resultHistory || [])]
    .reverse()
    .find(entry => (entry.result.series?.length || 0) >= 2)
  if (!latest) return false

  const answer = buildExistingTrendAnswer(text, latest.result)
  if (!answer) return false

  session.thinking = false
  session.phase = 'idle'
  session.chips = undefined
  session.steps = undefined
  session.intentEditing = false
  session.context.statusLabel = '已基于已有结果回答'
  await streamAssistantText(emit, session, answer)
  await emit({ type: 'session', session: { ...session } })
  await emit({ type: 'done' })
  return true
}

export async function handleAnalysisEvent(
  sessionIn: AnalysisSession | null,
  event: ClientEvent,
  emit: SseWriter
) {
  let session = sessionIn ? { ...sessionIn, turns: [...sessionIn.turns] } : emptySession()

  if (event.type === 'new_conversation') {
    session = emptySession()
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'user_message') {
    const text = event.text.trim()
    if (!text) return

    // 保存上一轮 intent 供多轮上下文传递；result 由前端 resultHistory 保留，此处不清空
    const prevIntent: PrevIntentContext | undefined = session.intent ? {
      measureShort: session.intent.measureShort,
      breakdownShort: session.intent.breakdownShort,
      queryType: session.intent.queryType,
      filterConditions: session.intent.filterConditions?.map(f => ({
        dimension: f.dimension, operator: f.operator, values: f.values
      })),
      timeRange: session.intent.timeRange,
      viewName: session.intent.view,
    } : undefined

    if (session.phase === 'result' || session.phase === 'deposition') {
      session.result = undefined
      session.steps = undefined
      session.depositionPrefill = undefined
    }

    pushTurn(session, 'user', text)
    if (!session.userQuery) session.userQuery = text

    // 立刻把用户消息推到前端，然后显示思考状态
    session.thinking = true
    await emit({ type: 'session', session: { ...session } })

    // 优先检测"对比已有数据"意图，避免重新发起查询
    if (await tryHandleComparison(session, text, emit)) return
    if (await tryHandleExistingResultReasoning(session, text, emit)) return

    const assets = await loadSemanticAssets()
    const cap = detectCapabilityGap(text, assets.metrics)
    if (cap) {
      session.thinking = false
      session.phase = 'capability_gap'
      session.capabilityGap = {
        missingConcept: cap.concept,
        alternatives: cap.alternatives,
        recordedNote: `「${cap.concept}」已记录为待建设需求，会通知数据 PM 跟进。`
      }
      session.context.statusLabel = '待建设能力'
      await streamAssistantText(
        emit,
        session,
        `你想看「${cap.concept}」，但目前系统还没有这个指标。\n\n替代方案：\n${cap.alternatives.map(a => `→ ${a}`).join('\n')}\n\n${session.capabilityGap.recordedNote}`
      )
      await emit({ type: 'session', session })
      await emit({ type: 'done' })
      return
    }

    // 先做 LLM 语义匹配，拿到 queryType 后再决定是否需要时间
    const t0 = Date.now()
    console.log(`[analysis] LLM 语义匹配开始 query="${text.slice(0, 60)}"`)
    session.thinkingText = ''
    const llmMatch = await matchViewByLLM(
      text,
      prevIntent,
      async (chunk: string) => {
        session.thinkingText = (session.thinkingText || '') + chunk
        await emit({ type: 'thinking_token', content: chunk })
      },
      session.turns
    )
    console.log(`[analysis] LLM 语义匹配完成 ${Date.now() - t0}ms → view=${llmMatch.viewName} queryType=${llmMatch.queryType} measure=${llmMatch.measureShort} breakdown=${llmMatch.breakdownShort}`)

    // 回填维度中文标题（失败静默）
    if (llmMatch.filterConditions?.length) {
      await Promise.all(llmMatch.filterConditions.map(async f => {
        const t = await getDimensionTitle(f.dimension)
        if (t) f.title = t
      }))
    }

    // LLM 判断信息不足，触发澄清而非猜测
    if (llmMatch.needsClarification && session.clarifyRound < 2) {
      session.thinking = false
      session.phase = 'clarifying'
      session.gapType = 'A'
      session.clarifyRound += 1
      session.chips = llmMatch.clarifyOptions?.length ? llmMatch.clarifyOptions : undefined
      session.context.statusLabel = '澄清中'
      const question = llmMatch.clarifyQuestion || '请问你具体想看哪方面的数据？'
      await streamAssistantText(emit, session, question)
      await emit({ type: 'session', session })
      await emit({ type: 'done' })
      return
    }

    // 问题与数据分析无关，友好婉拒
    if (llmMatch.isOffTopic) {
      session.thinking = false
      session.phase = 'idle'
      session.context.statusLabel = '待开始'
      await streamAssistantText(
        emit,
        session,
        '抱歉，我是专注于数据查询与分析的 Agent。如果你有数据分析方面的需求，欢迎随时告诉我！'
      )
      await emit({ type: 'session', session })
      await emit({ type: 'done' })
      return
    }

    // scalar 查询（问总量/当前值）不需要用户指定时间段，直接取最新分区
    const needsTime = llmMatch.queryType !== 'scalar'

    if (needsTime) {
      const hasResolvedTime = Boolean(session.intent?.timeRange) || Boolean(inferTimeRange(text))
      const gap = classifyGaps(text, hasResolvedTime)

      if (gap.gapType === 'A' && session.clarifyRound < 2) {
        session.thinking = false
        session.phase = 'clarifying'
        session.gapType = 'A'
        session.clarifyRound += 1
        session.chips = chipsForGap(gap.missingAspect)
        session.context.statusLabel = '澄清中'
        const q = await maybeLlmClarify(session.userQuery, clarifyingPrompt(gap.missingAspect))
        await streamAssistantText(emit, session, q)
        await emit({ type: 'session', session })
        await emit({ type: 'done' })
        return
      }
    }

    const inferred = inferTimeRange(text) || inferTimeRange(session.userQuery)
    // scalar 查询：自动使用「不限时间」，取最新分区数据
    const timeRange = needsTime
      ? (inferred?.timeRange || session.intent?.timeRange || '待指定')
      : (inferred?.timeRange || session.intent?.timeRange || '不限时间')
    const defaultNote = inferred?.defaultNote || session.intent?.defaultNote || ''

    session.thinking = false
    session.phase = 'intent_confirm'
    session.chips = undefined
    const builtIntent = buildIntent(
      text,
      llmMatch.measureTitle || llmMatch.measureShort || '业务指标',
      '',
      llmMatch.viewName,
      timeRange,
      defaultNote,
      llmMatch.measureShort || undefined,
      llmMatch.breakdownShort,
      llmMatch.queryType,
      llmMatch.filterConditions,
      llmMatch.topN,
      llmMatch.rankMeasureShort
    )
    session.intent = await attachAnalysisPlan(builtIntent, text)
    session.context = {
      statusLabel: '待确认意图',
      metric: llmMatch.measureTitle || llmMatch.measureShort || undefined,
      view: llmMatch.viewName,
      timeRange
    }
    const intentLines = [
      '好的，确认方案：',
      '',
      session.intent.summary,
      session.intent.timeRange !== '待指定' ? `时间：${session.intent.timeRange}` : null,
      session.intent.defaultNote || null
    ].filter((l): l is string => l !== null).join('\n')
    await streamAssistantText(emit, session, intentLines)
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'edit_intent') {
    session.intentEditing = true
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'update_intent') {
    session.intent = await attachAnalysisPlan(event.intent, session.userQuery || event.intent.summary, event.intent.metricId || '')
    session.intentEditing = false
    session.context.timeRange = session.intent.timeRange
    session.context.metric = session.intent.metric
    session.context.view = session.intent.view
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'confirm_intent') {
    pushTurn(session, 'user', '✅ 开始分析')
    await runExecuting(session, emit)
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'capability_continue') {
    session.phase = 'clarifying'
    session.capabilityGap = undefined
    session.clarifyRound = 0
    const alt = '用替代方案继续分析'
    pushTurn(session, 'user', alt)
    await streamAssistantText(emit, session, '好的，我们改用近似指标继续。请补充时间范围或点选快捷项。')
    session.chips = chipsForGap('time')
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'capability_new_question') {
    session = emptySession()
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'feedback_deep') {
    session.phase = 'clarifying'
    session.clarifyRound = 0
    session.chips = ['按渠道下钻', '按地区下钻', '看同比', '看环比']
    await streamAssistantText(emit, session, '想从哪个方向深入？')
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'feedback_reframe') {
    session.phase = 'intent_confirm'
    session.result = undefined
    session.steps = undefined
    session.context.statusLabel = '待确认意图'
    await streamAssistantText(emit, session, '已清空结果，请修改意图卡后重新开始分析。')
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'feedback_ok') {
    session.phase = 'deposition'
    session.depositionPrefill = {
      question: session.userQuery,
      conclusion: session.result?.summary.split('。')[0] || '',
      path: {
        metrics: session.context.metric ? [session.context.metric] : [],
        views: session.context.view ? [session.context.view] : [],
        filters: []
      }
    }
    await streamAssistantText(
      emit,
      session,
      '很好！是否把这条路径存入经验层？只需确认一句分析结论。'
    )
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'save_experience') {
    const id = `EXP-${Date.now().toString().slice(-6)}`
    await write('experiences', id, {
      id,
      original_question: session.userQuery,
      analysis_conclusion: event.conclusion,
      similar_questions: [],
      execution_path: session.depositionPrefill?.path || { metrics: [], views: [], filters: [] },
      source: '分析沉淀',
      usage_count: 0,
      created_at: new Date().toISOString().slice(0, 10)
    })
    session = emptySession()
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  if (event.type === 'skip_experience') {
    session = emptySession()
    await emit({ type: 'session', session })
    await emit({ type: 'done' })
    return
  }

  await emit({ type: 'session', session })
  await emit({ type: 'done' })
}
