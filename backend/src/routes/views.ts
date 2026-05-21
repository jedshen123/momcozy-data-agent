import { Hono } from 'hono'
import { readAll, readOne, write, remove, findFileId, removeByName } from '../lib/storage.js'

interface ViewCubePath {
  join_path: string
  includes?: string[]
  prefix?: boolean
}

interface ViewData {
  name: string
  title: string
  description?: string
  cubes?: ViewCubePath[]
}

interface CubeField {
  name: string
  title?: string
  type?: string
}

interface CubeData {
  name: string
  dimensions?: CubeField[]
  measures?: CubeField[]
}

const views = new Hono()

views.get('/', async c => c.json(await readAll('views')))

// GET /:name/fields — 返回该 View 可用的度量和维度（按 includes 过滤）
views.get('/:id/fields', async c => {
  const viewName = c.req.param('id')
  const view = await readOne<ViewData>('views', viewName)
  if (!view) return c.json({ error: 'view not found' }, 404)

  const measures: Array<{ name: string; title: string; type: string; cube: string }> = []
  const dimensions: Array<{ name: string; title: string; cube: string }> = []

  for (const cubePath of (view.cubes || [])) {
    const cubeName = cubePath.join_path
    const includes = cubePath.includes
    const cube = await readOne<CubeData>('cubes', cubeName)
    if (!cube) continue

    for (const m of (cube.measures || [])) {
      if (!includes || includes.includes(m.name)) {
        measures.push({ name: m.name, title: m.title || m.name, type: m.type || 'unknown', cube: cubeName })
      }
    }

    for (const d of (cube.dimensions || [])) {
      if (!includes || includes.includes(d.name)) {
        dimensions.push({ name: d.name, title: d.title || d.name, cube: cubeName })
      }
    }
  }

  return c.json({ measures, dimensions })
})

views.get('/:id', async c => {
  const data = await readOne('views', c.req.param('id'))
  if (!data) return c.json({ error: 'not found' }, 404)
  return c.json(data)
})

views.post('/', async c => {
  const body = await c.req.json<Record<string, unknown>>()
  const id = (body.name as string) || (body.id as string) || `${Date.now()}`
  await write('views', id, body)
  return c.json(body, 201)
})

views.put('/:id', async c => {
  const body = await c.req.json<Record<string, unknown>>()
  const urlId = c.req.param('id')
  const newName = (body.name as string) || urlId
  const oldFileId = await findFileId('views', urlId)
  await write('views', newName, body)
  if (oldFileId && oldFileId !== newName) {
    await remove('views', oldFileId)
  }
  return c.json(body)
})

views.delete('/:id', async c => {
  await removeByName('views', c.req.param('id'))
  return c.json({ ok: true })
})

export default views
