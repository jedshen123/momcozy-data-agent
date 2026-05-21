import { Hono } from 'hono'
import { readAll, readOne, write, remove, findFileId, removeByName } from '../lib/storage.js'

// 通用 CRUD 工厂，用于 views / metrics / disambiguations / experiences
function crudRouter(collection: string) {
  const router = new Hono()

  router.get('/', async c => c.json(await readAll(collection)))

  router.get('/:id', async c => {
    const data = await readOne(collection, c.req.param('id'))
    if (!data) return c.json({ error: 'not found' }, 404)
    return c.json(data)
  })

  router.post('/', async c => {
    const body = await c.req.json<Record<string, unknown>>()
    const id = (body.name as string) || (body.id as string) || `${Date.now()}`
    await write(collection, id, body)
    return c.json(body, 201)
  })

  router.put('/:id', async c => {
    const body = await c.req.json<Record<string, unknown>>()
    const urlId = c.req.param('id')
    const newName = (body.name as string) || urlId
    // 找到旧文件的实际文件名（可能与 urlId 或 newName 不同）
    const oldFileId = await findFileId(collection, urlId)
    // 写入新文件
    await write(collection, newName, body)
    // 旧文件名与新文件名不同时，删除旧文件
    if (oldFileId && oldFileId !== newName) {
      await remove(collection, oldFileId)
    }
    return c.json(body)
  })

  router.delete('/:id', async c => {
    await removeByName(collection, c.req.param('id'))
    return c.json({ ok: true })
  })

  return router
}

export const views = crudRouter('views')
export const metrics = crudRouter('metrics')
export const disambiguations = crudRouter('disambiguations')
export const experiences = crudRouter('experiences')
