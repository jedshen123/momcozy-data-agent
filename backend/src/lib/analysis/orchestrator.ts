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
  QueryType
} from './types.js'
import { emptySession } from './types.js'
import { runAnalysisQuery } from '../query/runAnalysisQuery.js'
import { getQueryEngineInfo } from '../query/queryEngine.js'
import { getDimensionTitle } from '../query/cubeMeta.js'

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
  filterConditions?: Array<{ dimension: string; operator: string; values: string[]; title?: string }>
): IntentCard {
  const region = /华东|华北|华南|渠道/.test(userText)
    ? userText.match(/华东|华北|华南|各渠道|渠道/)?.[0] || ''
    : ''
  const analysisLabel = queryType === 'scalar' ? '指标查询'
    : queryType === 'breakdown' ? '分布分析'
    : queryType === 'trend' ? '趋势分析'
    : queryType === 'trend_breakdown' ? '趋势 & 分布分析'
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
    filterConditions: filterConditions?.length ? filterConditions : undefined
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

  const steps: ExecutionStep[] = [
    { id: 's1', label: '⏳ 查询中…', status: 'pending' },
    {
      id: 's2',
      label: expMatch
        ? `命中经验层案例 ${expMatch.exp.id}（相似度 ${expMatch.score}%）`
        : '未命中经验层案例',
      status: 'pending',
      highlight: expMatch ? 'exp_reuse' : undefined
    },
    {
      id: 's3',
      label: dis
        ? `应用澄清层 ${dis.id}（${dis.conceptA} vs ${dis.conceptB}）→ ${dis.entityIdA || session.intent?.metricId || ''}`
        : '无需应用澄清层',
      status: 'pending',
      highlight: dis ? 'dis_apply' : undefined
    },
    { id: 's4', label: `查询 View：${view}`, status: 'pending' },
    { id: 's5', label: `执行 SQL：${session.intent?.metric || session.intent?.measureShort || '指标'}`, status: 'pending' }
  ]

  session.steps = steps
  session.context.queryEngine = getQueryEngineInfo().engine
  await emit({ type: 'session', session: { ...session } })

  for (let i = 0; i < steps.length; i++) {
    if (steps[i].id === 's5') continue
    steps[i].status = 'running'
    await emit({ type: 'session', session: { ...session } })
    steps[i].status = 'done'
    if (expMatch && steps[i].id === 's2') {
      session.context.expHit = `${expMatch.exp.id}（${expMatch.score}%）`
    }
    if (dis && steps[i].id === 's3') {
      session.context.disApplied = `${dis.id} → ${dis.entityIdA || session.intent?.metricId}`
    }
    if (steps[i].id === 's4') session.context.view = view
    await emit({ type: 'session', session: { ...session } })
  }

  const s5 = steps.find(s => s.id === 's5')!
  s5.status = 'running'
  await emit({ type: 'session', session: { ...session } })

  const metricForQuery = {
    id: session.intent?.metricId || '',
    name: session.intent?.metric || session.intent?.measureShort || '指标',
    view: session.intent?.view || ''
  }

  try {
    if (!session.intent) throw new Error('缺少意图确认信息')
    const tq = Date.now()
    console.log(`[analysis] 执行查询 view=${session.intent.view} queryType=${session.intent.queryType} measure=${session.intent.measureShort}`)
    const output = await runAnalysisQuery({
      metric: metricForQuery,
      intent: session.intent,
      userQuery: query,
      dis: dis ?? undefined
    })
    console.log(`[analysis] 查询完成 ${Date.now() - tq}ms rowCount=${output.rowCount} chartType=${output.chartType}`)
    s5.status = 'done'
    s5.label = `SQL 执行完成（${output.rowCount} 行）`
    s5.detail = output.sql
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
      sql: output.sql,
      rowCount: output.rowCount,
      cubeQueries: output.cubeQueries
    }
    pushTurn(session, 'assistant', '分析完成。\n\n' + output.summary)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败'
    console.error(`[analysis] 查询失败: ${msg}`)
    s5.status = 'error'
    s5.label = `SQL 执行失败：${msg}`
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
      session.steps = undefined
      session.depositionPrefill = undefined
    }

    pushTurn(session, 'user', text)
    if (!session.userQuery) session.userQuery = text

    // 立刻把用户消息推到前端，然后显示思考状态
    session.thinking = true
    await emit({ type: 'session', session: { ...session } })

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
      text + ' ' + session.userQuery,
      prevIntent,
      async (token: string) => {
        session.thinkingText = (session.thinkingText || '') + token
        await emit({ type: 'thinking_token', content: token })
      }
    )
    console.log(`[analysis] LLM 语义匹配完成 ${Date.now() - t0}ms → view=${llmMatch.viewName} queryType=${llmMatch.queryType} measure=${llmMatch.measureShort} breakdown=${llmMatch.breakdownShort}`)

    // 回填维度中文标题（失败静默）
    if (llmMatch.filterConditions?.length) {
      await Promise.all(llmMatch.filterConditions.map(async f => {
        const t = await getDimensionTitle(f.dimension)
        if (t) f.title = t
      }))
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
    session.intent = buildIntent(
      text,
      llmMatch.measureTitle || llmMatch.measureShort || '业务指标',
      '',
      llmMatch.viewName,
      timeRange,
      defaultNote,
      llmMatch.measureShort || undefined,
      llmMatch.breakdownShort,
      llmMatch.queryType,
      llmMatch.filterConditions
    )
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
    session.intent = event.intent
    session.intentEditing = false
    session.context.timeRange = event.intent.timeRange
    session.context.metric = event.intent.metric
    session.context.view = event.intent.view
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
