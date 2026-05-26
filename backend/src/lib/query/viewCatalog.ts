import { readAll } from '../storage.js'

export interface ViewCatalogEntry {
  name: string
  title?: string
  includes: Set<string>
  /** view 中所有 join_path 首段 cube 名列表，用于维度元数据查找 */
  cubeNames: string[]
  /** join_path 首段，用于无 meta 时的成员名回退 */
  primaryJoinPath: string
  /** 是否 prefix: true */
  prefixed: boolean
  timeDimensionShort: string
  aiContext?: string
  /** 每日快照表：scalar 查询需取最新 busi_date 分区，默认 false */
  snapshot: boolean
}

let catalogCache: Map<string, ViewCatalogEntry> | null = null

function unwrapViews(raw: unknown): Array<Record<string, unknown>> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const arr = (raw as Record<string, unknown>).views
    if (Array.isArray(arr)) return arr as Array<Record<string, unknown>>
  }
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [raw as Record<string, unknown>]
}

function pickTimeDimensionShort(includes: string[]): string {
  const hit = includes.find(n => /^(busi_date|event_date|.*_date)$/i.test(n) || /date|time/i.test(n))
  return hit || 'busi_date'
}

export async function loadViewCatalog(): Promise<Map<string, ViewCatalogEntry>> {
  if (catalogCache) return catalogCache

  const viewsRaw = await readAll<unknown>('views')
  const map = new Map<string, ViewCatalogEntry>()

  for (const raw of viewsRaw) {
    for (const v of unwrapViews(raw)) {
      const name = v.name as string
      if (!name) continue
      const cubeList = (v.cubes as Array<Record<string, unknown>>) || []
      const first = cubeList[0] || {}
      const joinPath = (first.join_path as string) || ''
      const prefixed = first.prefix === true

      // 收集所有 cube 的 includes（不只是第一个）
      const allIncludes: string[] = []
      const cubeNames: string[] = []
      for (const cube of cubeList) {
        const jp = (cube.join_path as string) || ''
        const rootCube = jp.split('.')[0]
        if (rootCube && !cubeNames.includes(rootCube)) cubeNames.push(rootCube)
        const inc = ((cube.includes as string[]) || []).filter(Boolean)
        for (const m of inc) {
          if (!allIncludes.includes(m)) allIncludes.push(m)
        }
      }

      map.set(name, {
        name,
        title: v.title as string | undefined,
        includes: new Set(allIncludes),
        cubeNames,
        primaryJoinPath: joinPath.split('.')[0] || joinPath,
        prefixed,
        timeDimensionShort: pickTimeDimensionShort(allIncludes),
        aiContext: (v.meta as Record<string, unknown> | undefined)?.ai_context as string | undefined,
        snapshot: ((v.meta as Record<string, unknown> | undefined)?.snapshot as boolean | undefined) ?? false
      })
    }
  }

  catalogCache = map
  return map
}

export function invalidateViewCatalog() {
  catalogCache = null
}

export async function getViewEntry(viewName: string): Promise<ViewCatalogEntry> {
  const catalog = await loadViewCatalog()
  const entry = catalog.get(viewName)
  if (!entry) throw new Error(`未找到 View: ${viewName}`)
  return entry
}

/** 回退：prefix view 的成员名 view.{join_path_underscores}_{short} */
export function fallbackViewMember(view: ViewCatalogEntry, shortName: string): string {
  const cubePart = view.primaryJoinPath.replace(/\./g, '_')
  if (view.prefixed) return `${view.name}.${cubePart}_${shortName}`
  return `${view.name}.${shortName}`
}
