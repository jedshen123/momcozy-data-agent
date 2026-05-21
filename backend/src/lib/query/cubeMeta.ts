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
    return metaCache.index
  }

  const url = `${metaBaseUrl()}/v1/meta`
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cube meta 请求失败 (${res.status}): ${text.slice(0, 300)}`)
  }

  const body = (await res.json()) as {
    cubes?: Array<{
      name: string
      measures?: Array<{ name: string; aliasMember?: string }>
      dimensions?: Array<{ name: string; aliasMember?: string }>
    }>
  }

  const byViewShort = new Map<string, string>()

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
        if (short) byViewShort.set(`${viewName}:${short}`, full)
      }

      // 从 full 名还原 short：去掉 view.cubePart_ 前缀
      const underscore = rest.indexOf('_')
      if (underscore > 0) {
        const shortGuess = rest.slice(underscore + 1)
        if (shortGuess) byViewShort.set(`${viewName}:${shortGuess}`, full)
      }
      byViewShort.set(`${viewName}:${rest}`, full)
    }
  }

  const index: CubeMetaIndex = { byViewShort }
  metaCache = { index, fetchedAt: Date.now() }
  return index
}

export function invalidateCubeMeta() {
  metaCache = null
}
