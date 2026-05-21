/** Cube REST API query（与官方 Query format 对齐） */
export interface CubeFilter {
  member: string
  operator: string
  values?: string[]
}

export interface CubeTimeDimension {
  dimension: string
  dateRange?: string[]
  granularity?: string
}

export interface CubeQuery {
  measures: string[]
  dimensions?: string[]
  timeDimensions?: CubeTimeDimension[]
  filters?: CubeFilter[]
  order?: Record<string, 'asc' | 'desc'> | Array<[string, 'asc' | 'desc']>
  limit?: number
}

export interface CubeLoadResponse {
  query: CubeQuery
  data: Array<Record<string, string | number | null>>
  annotation?: Record<string, unknown>
  error?: string
}
