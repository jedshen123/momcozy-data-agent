import { getWarehouse } from './warehouse.js'
import type { QueryPlan, QueryResult, QueryRow } from './types.js'

const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|PRAGMA|REPLACE)\b/i

export function assertReadOnlySql(sql: string) {
  const trimmed = sql.trim()
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('仅允许 SELECT 查询')
  }
  if (FORBIDDEN.test(trimmed)) {
    throw new Error('SQL 含不允许的关键字')
  }
  if (trimmed.includes(';') && trimmed.indexOf(';') < trimmed.length - 1) {
    throw new Error('不允许多语句执行')
  }
}

export function executeSql(sql: string, plan?: QueryPlan): QueryResult {
  assertReadOnlySql(sql)
  const started = Date.now()
  const database = getWarehouse()
  const stmt = database.prepare(sql)
  const rows = stmt.all() as QueryRow[]
  return {
    plan: plan || {
      sql,
      displaySql: sql,
      metricId: '',
      metricName: '',
      viewName: '',
      table: '',
      measureColumn: '',
      timeColumn: 'busi_date',
      breakdownDimension: null,
      timeStart: '',
      timeEnd: ''
    },
    rows,
    durationMs: Date.now() - started,
    engine: 'sqlite'
  }
}
