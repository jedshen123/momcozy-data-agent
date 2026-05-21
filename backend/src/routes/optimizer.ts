import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { streamChat } from '../lib/llm.js'

const optimizer = new Hono()

const OPTIMIZER_PROMPT = `你是 Momcozy 数据平台的优化师 Agent。基于语义层的整体运行状况，生成一份结构化的数据健康度报告。

报告结构（必须包含以下四个章节，每章节以 ## 开头）：

## 1. 健康度评分
- 综合健康分（0-100）
- 经验层命中率评分
- 澄清覆盖率评分
- 语义完整度评分
- 附简短评价

## 2. 经验层分析
- 过去 30 天查询量与命中次数
- 命中率趋势分析
- 空命中查询类型分布
- 改善建议

## 3. 澄清效率分析
- 现有澄清条目数量与覆盖的业务概念
- 常见混淆概念识别
- 缺失澄清条目建议（列举 2-3 个最紧迫的）

## 4. 优化建议清单
以列表格式输出至少 5 条可操作的具体建议，每条格式：
- [建议内容]，预期效果：[效果描述]

语言：简体中文，专业精确，配合真实数据假设合理模拟。`

optimizer.post('/generate', async c => {
  const body = await c.req.json<{ context?: string }>()
  const userMsg = body.context || '请分析过去 30 天的运行数据并生成优化报告'

  return stream(c, async s => {
    try {
      for await (const token of streamChat(
        [{ role: 'user', content: userMsg }],
        OPTIMIZER_PROMPT
      )) {
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

export default optimizer

