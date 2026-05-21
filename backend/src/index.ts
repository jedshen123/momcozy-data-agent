import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import analysis from './routes/analysis.js'
import cubes from './routes/cubes.js'
import views from './routes/views.js'
import metrics from './routes/metrics.js'
import { disambiguations, experiences } from './routes/crud.js'
import optimizer from './routes/optimizer.js'
import agents from './routes/agents.js'
import tables from './routes/tables.js'
import ai from './routes/ai.js'
import query from './routes/query.js'

const app = new Hono()

// CORS 配置
app.use('/*', cors({
  origin: ['http://localhost:5172'],
  credentials: true
}))

// 健康检查
app.get('/health', c => c.json({ status: 'ok' }))

// 挂载路由
app.route('/api/analysis', analysis)
app.route('/api/cubes', cubes)
app.route('/api/views', views)
app.route('/api/metrics', metrics)
app.route('/api/disambiguations', disambiguations)
app.route('/api/experiences', experiences)
app.route('/api/optimizer', optimizer)
app.route('/api/agents', agents)
app.route('/api/tables', tables)
app.route('/api/ai', ai)
app.route('/api/query', query)

const port = Number(process.env.PORT) || 3001

console.log(`🚀 Momcozy Data Agent 后端启动于 http://localhost:${port}`)
console.log(`📊 API 端点: http://localhost:${port}/api`)
console.log(`🔑 DeepSeek API Key: ${process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置（需要设置 DEEPSEEK_API_KEY 环境变量）'}`)
console.log(`📐 查询引擎: ${process.env.QUERY_ENGINE || 'cube'} · Cube API: ${process.env.CUBE_API_URL || 'http://54.226.190.74:4000/cubejs-api'}`)

serve({
  fetch: app.fetch,
  port
})
