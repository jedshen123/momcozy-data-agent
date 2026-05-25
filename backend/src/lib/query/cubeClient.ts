import type { CubeLoadResponse, CubeQuery } from './cubeTypes.js'

const DEFAULT_API_URL = 'http://54.226.190.74:4000/cubejs-api'

export function getCubeApiUrl(): string {
  return (process.env.CUBE_API_URL || DEFAULT_API_URL).replace(/\/$/, '')
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = process.env.CUBE_API_TOKEN?.trim()
  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }
  return headers
}

export async function cubeLoad(query: CubeQuery): Promise<CubeLoadResponse> {
  const url = `${getCubeApiUrl()}/v1/load`
  const measures = query.measures?.join(',') ?? ''
  const dims = query.dimensions?.join(',') ?? ''
  console.log(`[cube] load 开始 measures=[${measures}] dimensions=[${dims}]`)
  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ query })
  })

  const body = (await res.json()) as CubeLoadResponse & {
    error?: string
    type?: string
    message?: string
  }

  if (body.type === 'UserError' && body.error) {
    console.error(`[cube] load 失败 ${Date.now() - t0}ms: ${body.error}`)
    throw new Error(`Cube 查询失败: ${body.error}`)
  }

  if (!res.ok || body.error) {
    const errMsg = body.error || body.message || JSON.stringify(body).slice(0, 400)
    console.error(`[cube] load 失败 ${Date.now() - t0}ms: ${errMsg}`)
    throw new Error(`Cube 查询失败: ${errMsg}`)
  }

  console.log(`[cube] load 完成 ${Date.now() - t0}ms，返回 ${(body.data as unknown[])?.length ?? 0} 行`)
  return body
}

/** 调试：将 REST query 转为 SQL（不执行） */
export async function cubeSql(query: CubeQuery): Promise<string> {
  const url = `${getCubeApiUrl()}/v1/sql`
  const params = new URLSearchParams({
    query: JSON.stringify(query),
    format: 'rest'
  })
  const res = await fetch(`${url}?${params}`, { headers: authHeaders() })
  const body = (await res.json()) as { sql?: { sql?: [string, unknown[]]; error?: string } }
  if (!res.ok || body.sql?.error) {
    throw new Error(body.sql?.error || `Cube SQL 生成失败 (${res.status})`)
  }
  const pair = body.sql?.sql
  if (!pair?.[0]) return '-- (empty)'
  return pair[0]
}
