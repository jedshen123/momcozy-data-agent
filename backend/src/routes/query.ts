import { Hono } from 'hono'
import { getQueryEngineInfo, getQueryEngineMode } from '../lib/query/queryEngine.js'
import { getWarehouseInfo } from '../lib/query/warehouse.js'
import { executeSql, assertReadOnlySql } from '../lib/query/executor.js'
import { compileAnalysisQuery } from '../lib/query/sqlCompiler.js'
import { buildAnalysisQuerySpec } from '../lib/query/analysisQuerySpec.js'
import { buildTrendQuery, buildBreakdownQuery } from '../lib/query/cubeQueryBuilder.js'
import { cubeLoad } from '../lib/query/cubeClient.js'

const query = new Hono()

query.get('/health', c => {
  try {
    const mode = getQueryEngineMode()
    if (mode === 'cube') {
      const info = getQueryEngineInfo()
      return c.json({ ok: true, ...info })
    }
    const info = getWarehouseInfo()
    return c.json({ ok: true, ...info })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** 调试：预览分析查询（Cube JSON 或 SQLite SQL） */
query.post('/preview', async c => {
  const body = await c.req.json<{
    metricId?: string
    view?: string
    timeRange?: string
    userQuery?: string
  }>()
  const intent = {
    summary: 'preview',
    timeRange: body.timeRange || '2025-04-01 ~ 2025-04-30',
    defaultNote: '',
    view: body.view || 'app_standard_indicators',
    metric: '',
    metricId: body.metricId || 'MTR-686516'
  }

  if (getQueryEngineMode() === 'cube') {
    const spec = await buildAnalysisQuerySpec({
      metricId: intent.metricId!,
      intent,
      userQuery: body.userQuery || '最近30天各渠道DAU',
      dis: null
    })
    const measure =
      spec.primaryMeasure || spec.compositeMeasures?.denominator || ''
    const trend = buildTrendQuery(spec, measure)
    const breakdown = buildBreakdownQuery(spec, measure)
    return c.json({
      engine: 'cube',
      spec,
      queries: { trend, breakdown }
    })
  }

  const plan = await compileAnalysisQuery({
    metricId: intent.metricId!,
    intent,
    userQuery: body.userQuery || '最近30天各渠道DAU',
    dis: null
  })
  return c.json({ engine: 'sqlite', plan })
})

/** 调试：执行 Cube 查询或 SQLite SQL */
query.post('/execute', async c => {
  const body = await c.req.json<{ sql?: string; query?: object }>()

  if (body.query && getQueryEngineMode() === 'cube') {
    try {
      const result = await cubeLoad(body.query as import('../lib/query/cubeTypes.js').CubeQuery)
      return c.json({
        rows: result.data.slice(0, 200),
        rowCount: result.data.length,
        engine: 'cube'
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'execute failed'
      return c.json({ error: msg }, 400)
    }
  }

  const { sql } = body
  if (!sql) return c.json({ error: '需要 sql 或 query' }, 400)
  try {
    assertReadOnlySql(sql)
    const result = executeSql(sql)
    return c.json({
      rows: result.rows.slice(0, 200),
      rowCount: result.rows.length,
      durationMs: result.durationMs,
      engine: result.engine
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'execute failed'
    return c.json({ error: msg }, 400)
  }
})

export default query
