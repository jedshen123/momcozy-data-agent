import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { streamChat } from '../lib/llm.js'

const ai = new Hono()

// ——————————————————————————————————————————
// POST /api/ai/infer-cube-draft
// 根据表结构 AI 推断 Cube 草稿
// ——————————————————————————————————————————
const INFER_SYSTEM_PROMPT = `你是数据仓库语义层专家。根据用户提供的数仓表信息，帮助推断 Cube 草稿。

Cube 格式规范（标准 cubes.yaml 结构）：
- 顶层字段：name（英文下划线）、title（中文）、sql_table、description
- dimensions：每个维度含 name、type、sql（通常同 name）、title（中文）、description，可选 primary_key: true 和 meta.ai_context
- measures：每个度量含 name、title（中文）、type（聚合方式）、sql（"{CUBE}.字段名" 格式）、description，可选 filters 和 meta.ai_context
- 聚合类型（type）：sum / count / avg / max / min / count_distinct
- joins：关联其他 Cube，含 name（目标表名）、relationship（one_to_many/many_to_one/many_to_many）、sql（JOIN 条件）
- meta.ai_context：给 AI 理解此 Cube 用途的提示

你的任务：
1. 为每个字段标注角色：dimension（普通维度）、time_dimension（也是 dimension 类型，用 meta.ai_context 注明时间语义）、measure（度量）、ignore（分区字段或无意义字段）
2. 给出合理的 Cube name（英文）和 title（中文）
3. 为度量推荐聚合类型（type），特别注意 uid/user_id 类字段应用 count_distinct
4. 指出主键字段（primary_key: true）
5. 对业务含义特殊的字段补充 meta.ai_context
6. 指出数据质量问题（主键缺失、无时间维度等）
7. 根据字段命名推断可能需要的 JOIN 关联

输出格式：流畅分析文字 + 最后附字段角色映射表（Markdown 表格，含 name/role/type/title/ai_context 列）。
语言：简体中文，专业简洁。`

ai.post('/infer-cube-draft', async c => {
  const { tableId, tableName, schema, columns, displayName, description } = await c.req.json<{
    tableId: string
    tableName: string
    schema: string
    columns: Array<{ name: string; type: string; display_name: string; comment?: string }>
    displayName?: string
    description?: string
  }>()

  const columnList = columns.map(col =>
    `- ${col.name} (${col.type})：${col.display_name}${col.comment ? `，${col.comment}` : ''}`
  ).join('\n')

  const userPrompt = `请分析以下数仓表并推断 Cube 草稿：

**表名**：${schema}.${tableName}
**业务描述**：${description || displayName || '无'}
**字段列表**（共 ${columns.length} 个）：
${columnList}

请给出：
1. 推荐的 Cube 名称（英文）和展示名（中文）
2. 推荐的业务域分类
3. 每个字段的角色（dimension/time_dimension/measure/ignore）和对度量的聚合方式
4. 数据质量评估和注意事项`

  const messages = [{ role: 'user' as const, content: userPrompt }]

  return stream(c, async s => {
    try {
      for await (const token of streamChat(messages, INFER_SYSTEM_PROMPT)) {
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

// ——————————————————————————————————————————
// POST /api/ai/supplement-cube
// AI 检查 Cube 草稿是否有缺口并追问
// ——————————————————————————————————————————
const SUPPLEMENT_SYSTEM_PROMPT = `你是数据仓库语义层质检专家。检查 Cube 草稿的完整性和正确性。

检查要点：
1. 是否有主键/唯一维度（uid、id 等）
2. 是否有时间维度（date、time 等）
3. 度量是否有合理的聚合方式
4. 展示名是否都已填写（中文）
5. 业务描述是否清晰

如果有明显缺口，提出 1-2 个最关键的改进建议（每次不超过 2 个）。
如果草稿质量良好，输出：【草稿已完整，可以保存】

语言：简体中文，简洁直接。`

ai.post('/supplement-cube', async c => {
  const { cubeDraft, conversationHistory } = await c.req.json<{
    cubeDraft: Record<string, unknown>
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }>()

  const draftSummary = JSON.stringify(cubeDraft, null, 2)

  const baseMessage = {
    role: 'user' as const,
    content: `请检查以下 Cube 草稿是否完整：\n\`\`\`json\n${draftSummary}\n\`\`\``
  }

  const messages = conversationHistory?.length
    ? [...conversationHistory, baseMessage]
    : [baseMessage]

  return stream(c, async s => {
    try {
      for await (const token of streamChat(messages, SUPPLEMENT_SYSTEM_PROMPT)) {
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

// ——————————————————————————————————————————
// POST /api/ai/validate-cube
// AI 快速校验（可选）
// ——————————————————————————————————————————
const VALIDATE_SYSTEM_PROMPT = `你是数据仓库语义层质检专家。快速校验 Cube 定义，输出一份简短的质检报告（不超过 200 字）。

检查维度：命名规范、字段完整性、类型匹配、业务语义清晰度。
输出格式：直接给出结论（通过/警告/需修复）和关键问题列表。`

ai.post('/validate-cube', async c => {
  const { cubeDraft } = await c.req.json<{ cubeDraft: Record<string, unknown> }>()

  const messages = [{
    role: 'user' as const,
    content: `请快速校验这个 Cube 定义：\n\`\`\`json\n${JSON.stringify(cubeDraft, null, 2)}\n\`\`\``
  }]

  return stream(c, async s => {
    try {
      for await (const token of streamChat(messages, VALIDATE_SYSTEM_PROMPT)) {
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

// ——————————————————————————————————————————
// POST /api/ai/define-metric
// 通过多轮对话帮助用户定义指标
// ——————————————————————————————————————————
const DEFINE_METRIC_SYSTEM_PROMPT = `你是数据仓库指标层专家，专门帮助 PM 用自然语言定义业务指标。

指标分为两种类型：
- 简单指标（simple）：直接引用某个 View 中的一个 Measure，可附加 SQL 过滤条件
- 复合指标（composite）：通过公式组合多个 Measure，支持跨 View 引用

交互规则：
1. 先判断类型，再逐步问关键信息
2. 简单指标：需确认 view 名称 → measure 字段 → 是否有过滤条件
3. 复合指标：需确认公式结构 → 各占位符对应的 view.measure
4. 每次只问一个问题，优先从上下文推断
5. 推断成功时明确说明（如「我推断这是简单指标，measure 为 m_app_dau」）
6. 有相似指标时主动提示区别

字段提示格式（嵌入回复中，前端解析用）：
【简单指标】
- 类型：{{type:simple}}
- 指标名称：{{name:APP日活用户数}}
- 业务含义：{{description:统计每日打开 APP 的去重用户数}}
- View 名称：{{view:app_standard_indicators}}
- 度量字段：{{measure:m_app_dau}}
- 过滤条件：{{filter_sql:country = 'CN'}}
- 区分说明：{{disambiguation:仅统计大陆用户，不含港澳台}}

【复合指标】
- 类型：{{type:composite}}
- 指标名称：{{name:客单价}}
- 业务含义：{{description:每笔订单平均金额}}
- 公式：{{formula:\${m1} / \${m2}}}
- 度量映射：{{measure_map.m1:orders_view.total_amount}}  {{measure_map.m2:orders_view.order_count}}
- 区分说明：{{disambiguation:与 GMV 的区别在于仅统计已完成订单}}

语言：简体中文，简洁专业。`

ai.post('/define-metric', async c => {
  const { conversationHistory, currentDraft, isEdit } = await c.req.json<{
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
    currentDraft: Record<string, unknown>
    isEdit?: boolean
  }>()

  return stream(c, async s => {
    try {
      for await (const token of streamChat(conversationHistory, DEFINE_METRIC_SYSTEM_PROMPT)) {
        await s.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`)
      }
      await s.write('data: [DONE]\n\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      await s.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    }
  }, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
})

// ——————————————————————————————————————————
// POST /api/ai/infer-view-fields
// 分析 View 字段组合，给出语义建议
// ——————————————————————————————————————————
const VIEW_FIELDS_SYSTEM_PROMPT = `你是数据仓库语义层专家。根据用户选择的 Cube 组合和字段列表，给出字段语义建议。

分析要点：
1. 字段组合是否合理（是否适合某类分析）
2. 是否存在重复字段（需去重）
3. JOIN 条件是否合理（LEFT/INNER 的选择）
4. 哪些字段应忽略（运维字段如 dt、ds、updated_at 等）
5. 适合哪类分析场景

语言：简体中文，200 字以内，直接给出建议。`

ai.post('/infer-view-fields', async c => {
  const { cubes, joins, fields, cubeDesc, joinDesc, conversationHistory } = await c.req.json<{
    cubes: Record<string, unknown>[]
    joins: Record<string, unknown>[]
    fields: Record<string, unknown>[]
    cubeDesc?: string
    joinDesc?: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }>()

  const fieldsSummary = (fields as Array<{ included: boolean; name: string; type: string; source: string }>)
    .filter(f => f.included)
    .map(f => `${f.name}（${f.type}）来自 ${f.source}`)
    .join(', ')

  const baseMsg = {
    role: 'user' as const,
    content: `请分析这个 View 的字段配置是否合理：

**Cube 组合**：${cubeDesc || cubes.map((c: Record<string, unknown>) => c.name).join(', ')}
**JOIN 关系**：${joinDesc || (joins.length === 0 ? '无 JOIN（单 Cube）' : joins.map((j: Record<string, unknown>) => `${j.left_cube} ${j.join_type} ${j.right_cube}`).join(', '))}
**已选字段**：${fieldsSummary || '（无）'}

请指出潜在问题并给出字段筛选建议。`
  }

  const messages = conversationHistory?.length
    ? [...conversationHistory, baseMsg]
    : [baseMsg]

  return stream(c, async s => {
    try {
      for await (const token of streamChat(messages, VIEW_FIELDS_SYSTEM_PROMPT)) {
        await s.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`)
      }
      await s.write('data: [DONE]\n\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      await s.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    }
  }, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
})

// ——————————————————————————————————————————
// POST /api/ai/scan-view
// AI 扫描 View 结构是否有语义缺口
// ——————————————————————————————————————————
const SCAN_VIEW_SYSTEM_PROMPT = `你是数据仓库语义层质检专家。扫描 View 的完整性和业务说明清晰度。

检查要点：
1. 是否有双时间维度（需在说明中区分）
2. JOIN 条件是否与字段语义匹配
3. 业务说明是否清晰（让 LLM 能正确理解该 View 的用途）
4. 如果没有问题，输出：【✅ 扫描完成，View 配置清晰，可以直接保存。】并建议 2-3 个适用分析场景

语言：简体中文，直接给出结论。`

ai.post('/scan-view', async c => {
  const { viewName, displayName, description, cubes, joins, fieldsSummary, conversationHistory } = await c.req.json<{
    viewName: string
    displayName: string
    description: string
    cubes: string[]
    joins: Record<string, unknown>[]
    fieldsSummary: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }>()

  const baseMsg = {
    role: 'user' as const,
    content: `请扫描这个 View 的配置：

**View 名称**：${viewName}（${displayName}）
**业务说明**：${description || '（未填写）'}
**Cube 组合**：${cubes.join(', ')}
**JOIN 数量**：${joins.length}
**字段摘要**：${fieldsSummary}

请检查是否有语义缺口或需要改进的地方。`
  }

  const messages = conversationHistory?.length
    ? [...conversationHistory, baseMsg]
    : [baseMsg]

  return stream(c, async s => {
    try {
      for await (const token of streamChat(messages, SCAN_VIEW_SYSTEM_PROMPT)) {
        await s.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`)
      }
      await s.write('data: [DONE]\n\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      await s.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    }
  }, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
})

// ——————————————————————————————————————————
// POST /api/ai/suggest-experience
// AI 为经验条目生成优化建议和相似问法
// ——————————————————————————————————————————
const SUGGEST_EXPERIENCE_SYSTEM_PROMPT = `你是数据仓库知识库专家，帮助优化分析经验条目的质量。

任务：
1. 补充 2-3 个相似问法（用不同角度表达同一个业务问题）
2. 检查分析结论是否清晰、可操作
3. 建议哪些指标或 View 可能与此问题相关
4. 如有不当之处，给出修改建议

输出格式：直接给出建议，简洁有用。语言：简体中文。`

ai.post('/suggest-experience', async c => {
  const { original_question, analysis_conclusion } = await c.req.json<{
    original_question: string
    analysis_conclusion: string
  }>()

  const messages = [{
    role: 'user' as const,
    content: `请为以下分析经验提供优化建议：

**原始问题**：${original_question}
**分析结论**：${analysis_conclusion}

请给出：相似问法建议、结论改进意见、关联资源建议。`
  }]

  return stream(c, async s => {
    try {
      for await (const token of streamChat(messages, SUGGEST_EXPERIENCE_SYSTEM_PROMPT)) {
        await s.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`)
      }
      await s.write('data: [DONE]\n\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      await s.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    }
  }, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
})

// ——————————————————————————————————————————
// POST /api/ai/define-disambiguation
// AI 帮助用户澄清两个相似概念的区别
// ——————————————————————————————————————————
const DEFINE_DISAMBIGUATION_SYSTEM_PROMPT = `你是数据仓库语义层专家，专门帮助分析和澄清相似业务概念的区别。

交互规则：
1. 每次只问最关键的一个问题，逐步收敛
2. 优先从对话中推断概念的定义，不要重复问已明确的内容
3. 推断成功时明确告知（如「我推断概念A是指…」）
4. 给出实际可用的使用场景建议（"当…时用A，当…时用B"格式）
5. 核心差异要一句话说清楚，不要废话

字段提示格式（嵌入回复中，前端可解析）：
- 概念A名称：{{concept_a_name:GMV}}
- 概念A定义：{{concept_a_definition:含未付款订单的成交总额}}
- 概念A类型：{{concept_a_type:metric}}
- 概念A实体ID：{{concept_a_id:MTR-001}}
- 概念B名称：{{concept_b_name:收入}}
- 概念B定义：{{concept_b_definition:实际收款金额}}
- 概念B类型：{{concept_b_type:metric}}
- 概念B实体ID：{{concept_b_id:MTR-002}}
- 核心差异：{{core_difference:GMV包含未付款订单，收入只计实收}}
- 使用场景：{{scenario:分析商品热度|GMV}}

语言：简体中文，简洁专业。`

ai.post('/define-disambiguation', async c => {
  const { conversationHistory, currentDraft } = await c.req.json<{
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
    currentDraft: Record<string, unknown>
  }>()

  return stream(c, async s => {
    try {
      for await (const token of streamChat(conversationHistory, DEFINE_DISAMBIGUATION_SYSTEM_PROMPT)) {
        await s.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`)
      }
      await s.write('data: [DONE]\n\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      await s.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    }
  }, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
})

export default ai
