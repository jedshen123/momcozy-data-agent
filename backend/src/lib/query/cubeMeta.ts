import type { CubeMetaIndex } from './memberResolve.js'

const DEFAULT_META_URL = 'http://54.226.190.74:4000/cubejs-api'

let metaCache: { index: CubeMetaIndex; fetchedAt: number } | null = null
const TTL_MS = 5 * 60 * 1000

function metaBaseUrl(): string {
  const base = (process.env.CUBE_API_URL || DEFAULT_META_URL).replace(/\/$/, '')
  return base
}

function authHeaders(): Record<string, string> {
  const token = process.env.CUBE_API_TOKEN?.trim()
  if (!token) return {}
  return { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` }
}

/** 从 Cube /v1/meta 构建 view.shortName → view.fullMember */
export async function loadCubeMetaIndex(): Promise<CubeMetaIndex> {
  if (metaCache && Date.now() - metaCache.fetchedAt < TTL_MS) {
    console.log('[cube] meta 命中缓存')
    return metaCache.index
  }

  const url = `${metaBaseUrl()}/v1/meta`
  console.log(`[cube] 拉取 meta ${url}`)
  const t0 = Date.now()
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cube meta 请求失败 (${res.status}): ${text.slice(0, 300)}`)
  }

  const body = (await res.json()) as {
    cubes?: Array<{
      name: string
      measures?: Array<{ name: string; shortTitle?: string; aliasMember?: string }>
      dimensions?: Array<{ name: string; shortTitle?: string; aliasMember?: string }>
    }>
  }

  const byViewShort = new Map<string, string>()
  const shortTitleByShort = new Map<string, string>()

  for (const cube of body.cubes || []) {
    const viewName = cube.name
    const members = [...(cube.measures || []), ...(cube.dimensions || [])]
    for (const m of members) {
      const full = m.name
      if (!full.includes('.')) continue
      const [view, rest] = full.split('.', 2)
      if (view !== viewName) continue

      if (m.aliasMember) {
        const short = m.aliasMember.split('.').pop()
        if (short) {
          byViewShort.set(`${viewName}:${short}`, full)
          if (m.shortTitle) shortTitleByShort.set(short, m.shortTitle)
        }
      }

      // 从 full 名还原 short：去掉 view.cubePart_ 前缀
      const underscore = rest.indexOf('_')
      if (underscore > 0) {
        const shortGuess = rest.slice(underscore + 1)
        if (shortGuess) {
          byViewShort.set(`${viewName}:${shortGuess}`, full)
          if (m.shortTitle) shortTitleByShort.set(shortGuess, m.shortTitle)
        }
      }
      byViewShort.set(`${viewName}:${rest}`, full)
      if (m.shortTitle) shortTitleByShort.set(rest, m.shortTitle)
    }
  }

  const index: CubeMetaIndex = { byViewShort, shortTitleByShort }
  metaCache = { index, fetchedAt: Date.now() }
  console.log(`[cube] meta 拉取完成 ${Date.now() - t0}ms，共 ${body.cubes?.length ?? 0} 个 cube，${byViewShort.size} 个成员映射`)
  return index
}

export async function getDimensionTitle(shortName: string): Promise<string | null> {
  try {
    const index = await loadCubeMetaIndex()
    return index.shortTitleByShort.get(shortName) ?? null
  } catch {
    return null
  }
}

export function invalidateCubeMeta() {
  metaCache = null
}
