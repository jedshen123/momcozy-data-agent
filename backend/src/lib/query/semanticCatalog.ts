import { readAll } from '../storage.js'

export interface CubeMeasure {
  name: string
  type: string
  sql?: string
}

export interface CubeDef {
  name: string
  sqlTable: string
  dimensions: Array<{ name: string; sql?: string }>
  measures: CubeMeasure[]
}

export interface ViewDef {
  name: string
  primaryCube: string
  title?: string
}

export interface MetricDef {
  id: string
  name: string
  type: 'simple' | 'composite' | string
  view?: string
  measure?: string
  formula?: string
  measureMap?: Record<string, string>
  filterSql?: string
}

let catalogCache: {
  cubes: Map<string, CubeDef>
  views: Map<string, ViewDef>
  metrics: Map<string, MetricDef>
} | null = null

function unwrapList<T>(collection: string, data: unknown): T[] {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const key = collection
    const arr = (data as Record<string, unknown>)[key]
    if (Array.isArray(arr)) return arr as T[]
  }
  return Array.isArray(data) ? (data as T[]) : [data as T]
}

export async function loadSemanticCatalog() {
  if (catalogCache) return catalogCache

  const cubesRaw = await readAll<unknown>('cubes')
  const viewsRaw = await readAll<unknown>('views')
  const metricsRaw = await readAll<unknown>('metrics')

  const cubes = new Map<string, CubeDef>()
  for (const raw of cubesRaw) {
    for (const c of unwrapList<Record<string, unknown>>('cubes', raw)) {
      const name = c.name as string
      if (!name) continue
      cubes.set(name, {
        name,
        sqlTable: (c.sql_table as string) || name,
        dimensions: ((c.dimensions as Array<Record<string, unknown>>) || []).map(d => ({
          name: d.name as string,
          sql: d.sql as string | undefined
        })),
        measures: ((c.measures as Array<Record<string, unknown>>) || []).map(m => ({
          name: m.name as string,
          type: (m.type as string) || 'sum',
          sql: m.sql as string | undefined
        }))
      })
    }
  }

  const views = new Map<string, ViewDef>()
  for (const raw of viewsRaw) {
    for (const v of unwrapList<Record<string, unknown>>('views', raw)) {
      const name = v.name as string
      if (!name) continue
      const cubeList = v.cubes as Array<{ join_path?: string }> | undefined
      const primaryCube = cubeList?.[0]?.join_path?.split('.')[0] || ''
      views.set(name, { name, primaryCube, title: v.title as string })
    }
  }

  const metrics = new Map<string, MetricDef>()
  for (const m of metricsRaw as Array<Record<string, unknown>>) {
    const id = (m.id as string) || ''
    if (!id) continue
    metrics.set(id, {
      id,
      name: (m.name as string) || id,
      type: (m.type as string) || 'simple',
      view: m.view as string | undefined,
      measure: m.measure as string | undefined,
      formula: m.formula as string | undefined,
      measureMap: m.measure_map as Record<string, string> | undefined,
      filterSql: m.filter_sql as string | undefined
    })
  }

  catalogCache = { cubes, views, metrics }
  return catalogCache
}

export async function getMetricById(id: string): Promise<MetricDef | null> {
  const { metrics } = await loadSemanticCatalog()
  return metrics.get(id) ?? null
}

/** m_old_app_dau → old_app_dau */
export function resolveMeasureColumn(measureRef: string): string {
  const raw = measureRef.replace(/^m_/, '')
  return raw
}

export function resolveMeasureFromMap(ref: string): { viewName: string; measure: string } {
  const [viewName, measure] = ref.split('.')
  return { viewName: viewName || '', measure: measure || ref }
}
