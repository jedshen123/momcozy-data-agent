import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { handleAnalysisEvent } from '../lib/analysis/orchestrator.js'
import { createSseWriter } from '../lib/analysis/sse.js'
import type { AnalysisSession, ClientEvent } from '../lib/analysis/types.js'
import { streamChat } from '../lib/llm.js'

const analysis = new Hono()

/**
 * 结构化状态机事件（推荐）
 * POST { session?, event: ClientEvent }
 */
analysis.post('/event', async c => {
  const body = await c.req.json<{
    session?: AnalysisSession | null
    event: ClientEvent
  }>()

  return stream(c, async s => {
    const emit = createSseWriter(async line => {
      await s.write(line)
    })
    try {
      await handleAnalysisEvent(body.session ?? null, body.event, emit)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      await emit({ type: 'error', message: msg })
      await emit({ type: 'done' })
    }
  }, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  })
})

/** 旧版自由对话流（保留兼容） */
analysis.post('/stream', async c => {
  const { messages } = await c.req.json<{
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }>()

  const SYSTEM_PROMPT = `你是 Momcozy 的数据分析助手。你的职责是：
1. 理解用户的数据分析需求
2. 澄清缺失的关键信息（时间范围、口径、维度等），每次只问最关键的一个问题
3. 给出清晰的分析思路和结果摘要

请用简体中文回复，语言简洁专业。`

  return stream(c, async s => {
    try {
      for await (const token of streamChat(messages, SYSTEM_PROMPT)) {
        await s.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`
        )
      }
      await s.write('data: [DONE]\n\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      await s.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    }
  }, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  })
})

export default analysis
