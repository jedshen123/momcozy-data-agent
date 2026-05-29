import type { AnalysisQuerySpec } from './analysisQuerySpec.js'
import type { CubeQuery } from './cubeTypes.js'

/** 构建 timeDimensions 条目，全部时间时省略 dateRange */
function makeTimeDim(spec: AnalysisQuerySpec, granularity?: string) {
  if (spec.timeStart && spec.timeEnd) {
    return { dimension: spec.timeDimension, dateRange: [spec.timeStart, spec.timeEnd], granularity }
  }
  return granularity ? { dimension: spec.timeDimension, granularity } : { dimension: spec.timeDimension }
}

/**
 * 单值聚合查询（queryType === 'scalar'）：
 * 整个时间范围内汇总一个数，不按时间粒度展开，不按维度拆分
 */
export function buildScalarQuery(spec: AnalysisQuerySpec, measure: string): CubeQuery {
  return {
    measures: [measure],
    timeDimensions: [makeTimeDim(spec)],
    filters: spec.filters,
    limit: 1
  }
}

/**
 * 趋势查询：按天聚合时间序列，不需要 breakdown 维度
 */
export function buildTrendQuery(spec: AnalysisQuerySpec, measure: string): CubeQuery {
  return {
    measures: [measure],
    timeDimensions: [makeTimeDim(spec, 'day')],
    filters: spec.filters,
    order: { [spec.timeDimension]: 'asc' },
    limit: 500
  }
}

/**
 * 分布查询：按维度分组聚合，不展开时间轴（只用时间范围过滤）
 */
export function buildBreakdownQuery(spec: AnalysisQuerySpec, measure: string): CubeQuery {
  if (!spec.breakdownDimension) {
    return {
      measures: [measure],
      timeDimensions: [makeTimeDim(spec)],
      filters: spec.filters,
      limit: 1
    }
  }

  return {
    measures: [measure],
    dimensions: [spec.breakdownDimension],
    timeDimensions: [makeTimeDim(spec)],
    filters: spec.filters,
    order: { [measure]: 'desc' },
    limit: 50
  }
}

/**
 * 纯分布查询（queryType === 'breakdown'）：
 * 不需要时间粒度，直接按维度分组，若没有维度则返回总量
 */
export function buildDistributionQuery(spec: AnalysisQuerySpec, measure: string): CubeQuery {
  if (!spec.breakdownDimension) {
    return {
      measures: [measure],
      timeDimensions: [makeTimeDim(spec)],
      filters: spec.filters,
      limit: 1
    }
  }

  return {
    measures: [measure],
    dimensions: [spec.breakdownDimension],
    timeDimensions: [makeTimeDim(spec)],
    filters: spec.filters,
    order: { [measure]: 'desc' },
    limit: 100
  }
}

/** 第一步：按维度计算 Top N，用于后续逐个维度值查趋势。 */
export function buildTopNRankQuery(spec: AnalysisQuerySpec, rankMeasure: string): CubeQuery {
  if (!spec.breakdownDimension) {
    throw new Error('TopN 查询缺少排名维度')
  }
  return {
    measures: [rankMeasure],
    dimensions: [spec.breakdownDimension],
    timeDimensions: [makeTimeDim(spec)],
    filters: spec.filters,
    order: { [rankMeasure]: 'desc' },
    limit: spec.topN || 5
  }
}

/** 第二步：限定 Top N 维度值后，按天拉取每个维度值的趋势。 */
export function buildTopNTrendQuery(
  spec: AnalysisQuerySpec,
  measure: string,
  topValues: string[]
): CubeQuery {
  if (!spec.breakdownDimension) {
    throw new Error('TopN 趋势查询缺少排名维度')
  }
  return {
    measures: [measure],
    dimensions: [spec.breakdownDimension],
    timeDimensions: [makeTimeDim(spec, 'day')],
    filters: [
      ...spec.filters,
      { member: spec.breakdownDimension, operator: 'equals', values: topValues }
    ],
    order: { [spec.timeDimension]: 'asc' },
    limit: Math.max(500, topValues.length * 120)
  }
}
