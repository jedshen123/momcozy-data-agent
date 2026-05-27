import { loadCubeMetaIndex } from './cubeMeta.js'
import { fallbackViewMember, getViewEntry, type ViewCatalogEntry } from './viewCatalog.js'

export interface CubeMetaIndex {
  byViewShort: Map<string, string>
  /** shortName → 中文短标题，用于 UI 展示过滤条件 */
  shortTitleByShort: Map<string, string>
}

/**
 * 将配置中的成员引用解析为 Cube REST 可用的全名。
 * 支持：app_standard_indicators.m_app_dau、m_app_dau（需 view）、已是全名。
 */
export async function resolveViewMember(
  viewName: string,
  ref: string,
  viewEntry?: ViewCatalogEntry
): Promise<string> {
  const view = viewEntry || (await getViewEntry(viewName))
  const trimmed = ref.trim()

  if (trimmed.startsWith(`${viewName}.`) && trimmed.split('.').length >= 2) {
    const short = trimmed.slice(viewName.length + 1)
    return resolveShort(view, short, trimmed)
  }

  if (trimmed.includes('.') && !trimmed.startsWith(`${viewName}.`)) {
    const [otherView, short] = trimmed.split('.', 2)
    if (otherView && short) {
      const other = await getViewEntry(otherView)
      return resolveShort(other, short, trimmed)
    }
  }

  return resolveShort(view, trimmed, null)
}

async function resolveShort(
  view: ViewCatalogEntry,
  shortName: string,
  explicitFull: string | null
): Promise<string> {
  const meta = await loadCubeMetaIndex()
  const fromMeta = meta.byViewShort.get(`${view.name}:${shortName}`)
  if (fromMeta) return fromMeta

  if (explicitFull) {
    const values = [...meta.byViewShort.values()]
    if (values.includes(explicitFull)) return explicitFull
  }

  if (!view.includes.has(shortName)) {
    throw new Error(`成员 ${shortName} 不在 View ${view.name} 的 includes 中`)
  }

  return fallbackViewMember(view, shortName)
}
