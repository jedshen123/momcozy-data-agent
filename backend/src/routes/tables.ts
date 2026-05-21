import { Hono } from 'hono'
import { readFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DW_METADATA_ROOT = join(__dirname, '../../../data/dw_metadata')

const tables = new Hono()

// 获取所有数仓表列表
tables.get('/', async c => {
  try {
    const content = await readFile(join(DW_METADATA_ROOT, 'tables.json'), 'utf-8')
    return c.json(JSON.parse(content))
  } catch {
    return c.json({ error: '元数据文件未找到，请创建 data/dw_metadata/tables.json' }, 404)
  }
})

// 获取指定表的字段列表
tables.get('/:tableId/columns', async c => {
  const tableId = c.req.param('tableId')
  try {
    // 防路径穿越：只允许字母数字下划线
    if (!/^[\w]+$/.test(tableId)) {
      return c.json({ error: 'invalid tableId' }, 400)
    }
    const content = await readFile(join(DW_METADATA_ROOT, 'columns', `${tableId}.json`), 'utf-8')
    return c.json(JSON.parse(content))
  } catch {
    return c.json({ error: `表 ${tableId} 的字段信息未找到` }, 404)
  }
})

export default tables
