import { getCubeApiUrl } from './cubeClient.js'
import { getWarehouseInfo } from './warehouse.js'

export type QueryEngineMode = 'cube' | 'sqlite'

export function getQueryEngineMode(): QueryEngineMode {
  const forced = process.env.QUERY_ENGINE?.toLowerCase()
  if (forced === 'sqlite') return 'sqlite'
  return 'cube'
}

export function getQueryEngineInfo() {
  const mode = getQueryEngineMode()
  if (mode === 'cube') {
    return {
      engine: 'cube' as const,
      cubeApiUrl: getCubeApiUrl(),
      hasToken: Boolean(process.env.CUBE_API_TOKEN?.trim())
    }
  }
  const wh = getWarehouseInfo()
  return { ...wh, engine: 'sqlite' as const }
}
