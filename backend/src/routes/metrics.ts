import { Hono } from 'hono'
import { readAll, readOne, write, remove } from '../lib/storage.js'

// metrics 使用 id 字段（MTR-xxx）作为文件名，与 name（中文名）分离
const metrics = new Hono()

metrics.get('/', async c => c.json(await readAll('metrics')))

metrics.get('/:id', async c => {
  const data = await readOne('metrics', c.req.param('id'))
  if (!data) return c.json({ error: 'not found' }, 404)
  return c.json(data)
})

metrics.post('/', async c => {
  const body = await c.req.json<Record<string, unknown>>()
  const fileId = (body.id as string) || `MTR-${Date.now().toString().slice(-6)}`
  body.id = fileId
  await write('metrics', fileId, body)
  return c.json(body, 201)
})

metrics.put('/:id', async c => {
  const body = await c.req.json<Record<string, unknown>>()
  const fileId = c.req.param('id')
  body.id = fileId
  await write('metrics', fileId, body)
  return c.json(body)
})

metrics.delete('/:id', async c => {
  await remove('metrics', c.req.param('id'))
  return c.json({ ok: true })
})

export default metrics
