import type { AnalysisQuerySpec } from './analysisQuerySpec.js'
import type { CubeQuery } from './cubeTypes.js'

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

export function buildBreakdownQuery(spec: AnalysisQuerySpec, measure: string): CubeQuery {
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
    limit: 50
  }
}
