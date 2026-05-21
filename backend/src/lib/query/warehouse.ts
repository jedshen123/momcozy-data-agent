import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = join(__dirname, '../../../data/warehouse/agent_dw.sqlite')

let db: Database.Database | null = null

function seedAdsTable(database: Database.Database) {
  const row = database.prepare('SELECT COUNT(*) AS c FROM ads_app_core_indicator_info_di').get() as {
    c: number
  }
  if (row.c > 0) return

  const sources = ['直播', '电商', '私域', '线下']
  const regions = ['华东', '华北', '华南', '全国']
  const insert = database.prepare(`
    INSERT INTO ads_app_core_indicator_info_di (
      busi_date, data_source, country_ad_ch, country_locate_state,
      app_dau, old_app_dau, app_mau, app_user_cn, bind_active_user_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const end = new Date()
  const txn = database.transaction(() => {
    for (let d = 60; d >= 0; d--) {
      const dt = new Date(end)
      dt.setDate(dt.getDate() - d)
      const busiDate = dt.toISOString().slice(0, 10)
      for (const source of sources) {
        for (const region of regions) {
          const base = 8000 + sources.indexOf(source) * 2000 + regions.indexOf(region) * 500
          const noise = Math.floor(Math.random() * 800)
          const appDau = base + noise + d * 10
          const oldDau = Math.floor(appDau * 0.65)
          const bindCount = Math.floor(appDau * 0.55)
          insert.run(
            busiDate,
            source,
            region,
            region === '全国' ? '全国' : `${region}地区`,
            appDau,
            oldDau,
            appDau * 28,
            appDau * 120,
            bindCount
          )
        }
      }
    }
  })
  txn()
}

export function getWarehouse(): Database.Database {
  if (db) return db

  const dbPath = process.env.QUERY_SQLITE_PATH || DEFAULT_DB_PATH
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS ads_app_core_indicator_info_di (
      busi_date TEXT NOT NULL,
      data_source TEXT,
      country_ad_ch TEXT,
      country_locate_state TEXT,
      app_dau INTEGER DEFAULT 0,
      old_app_dau INTEGER DEFAULT 0,
      app_mau INTEGER DEFAULT 0,
      app_user_cn INTEGER DEFAULT 0,
      bind_active_user_count INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ads_date ON ads_app_core_indicator_info_di(busi_date);
    CREATE INDEX IF NOT EXISTS idx_ads_source ON ads_app_core_indicator_info_di(data_source);
  `)

  seedAdsTable(db)
  return db
}

export function getWarehouseInfo() {
  const path = process.env.QUERY_SQLITE_PATH || DEFAULT_DB_PATH
  const database = getWarehouse()
  const tables = database
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all() as Array<{ name: string }>
  const count = database
    .prepare('SELECT COUNT(*) AS c FROM ads_app_core_indicator_info_di')
    .get() as { c: number }
  return {
    engine: 'sqlite' as const,
    path,
    tables: tables.map(t => t.name),
    rowCount: count.c
  }
}
