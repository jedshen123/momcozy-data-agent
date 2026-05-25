import { readFile, writeFile, readdir, mkdir, rm } from 'fs/promises'
import { join, dirname } from 'path'
import yaml from 'js-yaml'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = join(__dirname, '../../data/semantic')

/** 各 collection 的可配置目录（环境变量优先，否则用默认路径） */
const COLLECTION_DIR_ENV: Record<string, string | undefined> = {
  cubes: process.env.CUBES_DATA_DIR,
  views: process.env.VIEWS_DATA_DIR,
}

function collectionDir(collection: string): string {
  return COLLECTION_DIR_ENV[collection] ?? join(DATA_ROOT, collection)
}

/**
 * 确保目录存在
 */
async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true })
  } catch { /* 已存在 */ }
}

/**
 * 解包：兼容 { cubes: [...] } 或 { views: [...] } 这类带顶层 key 的格式
 */
function unwrap<T>(collection: string, data: unknown): T | T[] {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj[collection])) return obj[collection] as T[]
  }
  return data as T
}

/**
 * 读取所有文档
 */
export async function readAll<T>(collection: string): Promise<T[]> {
  const dir = collectionDir(collection)
  await ensureDir(dir)
  try {
    const files = await readdir(dir)
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    const results = await Promise.all(
      yamlFiles.map(async f => {
        const content = await readFile(join(dir, f), 'utf-8')
        const parsed = yaml.load(content)
        const unwrapped = unwrap<T>(collection, parsed)
        return Array.isArray(unwrapped) ? unwrapped : [unwrapped]
      })
    )
    return results.flat()
  } catch {
    return []
  }
}

/**
 * 读取单个文档
 * 先按文件名精确匹配，找不到时扫描所有文件按 name 字段匹配
 */
export async function readOne<T>(collection: string, id: string): Promise<T | null> {
  const filePath = join(collectionDir(collection), `${id}.yaml`)
  try {
    const content = await readFile(filePath, 'utf-8')
    const parsed = yaml.load(content)
    const unwrapped = unwrap<T>(collection, parsed)
    if (Array.isArray(unwrapped)) {
      return unwrapped.find((item: unknown) => (item as Record<string, unknown>)['name'] === id) as T ?? unwrapped[0] ?? null
    }
    return unwrapped as T
  } catch { /* 文件名不匹配，继续扫描 */ }

  // 文件名与 name 字段不一致时，扫描所有文件
  const all = await readAll<T>(collection)
  return (all as unknown as Array<Record<string, unknown>>).find(item => item['name'] === id) as T ?? null
}

/**
 * 写入文档
 */
export async function write<T>(collection: string, id: string, data: T): Promise<void> {
  const dir = collectionDir(collection)
  await ensureDir(dir)
  const filePath = join(dir, `${id}.yaml`)
  const content = yaml.dump(data, { indent: 2, lineWidth: -1 })
  await writeFile(filePath, content, 'utf-8')
}

/**
 * 删除文档（按精确文件名）
 */
export async function remove(collection: string, id: string): Promise<void> {
  const filePath = join(collectionDir(collection), `${id}.yaml`)
  try {
    await rm(filePath)
  } catch { /* 不存在 */ }
}

/**
 * 查找实际文件名（不含扩展名）：先精确匹配，再扫描 name 字段
 */
export async function findFileId(collection: string, nameOrId: string): Promise<string | null> {
  const dir = collectionDir(collection)
  // 精确文件名命中
  try {
    await readFile(join(dir, `${nameOrId}.yaml`), 'utf-8')
    return nameOrId
  } catch { /* 继续扫描 */ }
  // 扫描所有文件匹配 name 字段
  try {
    const files = await readdir(dir)
    for (const f of files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))) {
      const content = await readFile(join(dir, f), 'utf-8')
      const parsed = yaml.load(content)
      const items = unwrap<Record<string, unknown>>(collection, parsed)
      const arr: Array<Record<string, unknown>> = Array.isArray(items) ? items : [items as Record<string, unknown>]
      if (arr.some(item => item?.['name'] === nameOrId)) {
        return f.replace(/\.ya?ml$/, '')
      }
    }
  } catch { /* 目录不存在 */ }
  return null
}

/**
 * 按 name 字段删除文档（处理文件名与 name 不一致的情况）
 */
export async function removeByName(collection: string, nameOrId: string): Promise<void> {
  const actualId = await findFileId(collection, nameOrId)
  if (actualId) await remove(collection, actualId)
}
