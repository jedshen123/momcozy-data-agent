import type { AnalysisQuerySpec } from './analysisQuerySpec.js'
import type { CubeQuery } from './cubeTypes.js'

/**
 * 趋势查询：按天聚合时间序列，不需要 breakdown 维度
 */
export function buildTrendQuery(spec: AnalysisQuerySpec, measure: string): CubeQuery {
  return {
    measures: [measure],
    timeDimensions: [
      {
        dimension: spec.timeDimension,
        dateRange: [spec.timeStart, spec.timeEnd],
        granularity: 'day'
      }
    ],
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
    // 无拆分维度：返回整体聚合
    return {
      measures: [measure],
      timeDimensions: [
        {
          dimension: spec.timeDimension,
          dateRange: [spec.timeStart, spec.timeEnd]
        }
      ],
      filters: spec.filters,
      limit: 1
    }
  }

  return {
    measures: [measure],
    dimensions: [spec.breakdownDimension],
    timeDimensions: [
      {
        dimension: spec.timeDimension,
        dateRange: [spec.timeStart, spec.timeEnd]
      }
    ],
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
      timeDimensions: [
        {
          dimension: spec.timeDimension,
          dateRange: [spec.timeStart, spec.timeEnd]
        }
      ],
      filters: spec.filters,
      limit: 1
    }
  }

  return {
    measures: [measure],
    dimensions: [spec.breakdownDimension],
    timeDimensions: [
      {
        dimension: spec.timeDimension,
        dateRange: [spec.timeStart, spec.timeEnd]
      }
    ],
    filters: spec.filters,
    order: { [measure]: 'desc' },
    limit: 100
  }
}
