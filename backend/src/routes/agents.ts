import { Hono } from 'hono'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const agents = new Hono()

agents.get('/', async c => {
  try {
    const registryPath = join(__dirname, '../../../design/agents/registry.json')
    const content = await readFile(registryPath, 'utf-8')
    return c.json(JSON.parse(content))
  } catch {
    return c.json({ agents: [] })
  }
})

export default agents
