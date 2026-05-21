import { Hono } from 'hono'
import { readAll, readOne, write, remove } from '../lib/storage.js'

const cubes = new Hono()

cubes.get('/', async c => {
  const data = await readAll('cubes')
  return c.json(data)
})

cubes.get('/:id', async c => {
  const data = await readOne('cubes', c.req.param('id'))
  if (!data) return c.json({ error: 'not found' }, 404)
  return c.json(data)
})

cubes.post('/', async c => {
  const body = await c.req.json()
  await write('cubes', body.name, body)
  return c.json(body, 201)
})

cubes.put('/:id', async c => {
  const body = await c.req.json()
  await write('cubes', c.req.param('id'), body)
  return c.json(body)
})

cubes.delete('/:id', async c => {
  await remove('cubes', c.req.param('id'))
  return c.json({ ok: true })
})

export default cubes
