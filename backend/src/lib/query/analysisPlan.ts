import type { IntentCard, AnalysisPlanStep } from '../analysis/types.js'
import type { DisambiguationRecord } from '../analysis/types.js'
import { buildAnalysisQuerySpec } from './analysisQuerySpec.js'
import { buildBreakdownQuery, buildScalarQuery, buildTopNRankQuery, buildTopNTrendQuery, buildTrendQuery } from './cubeQueryBuilder.js'

export async function buildAnalysisPlanPreview(params: {
  metricId: string
  intent: IntentCard
  userQuery: string
  dis?: DisambiguationRecord | null
}): Promise<AnalysisPlanStep[]> {
  const spec = await buildAnalysisQuerySpec(params)
  const measure = spec.primaryMeasure || spec.compositeMeasures?.denominator

  if (spec.queryType === 'trend_top_n' && measure) {
    const rankMeasure = spec.rankMeasure || measure
    const rankQuery = buildTopNRankQuery(spec, rankMeasure)
    const trendQuery = buildTopNTrendQuery(
      spec,
      measure,
      [`{{step:top_n_rank.${spec.breakdownDimension?.split('.').pop() || 'dimension'}_values}}`]
    )

    return [
      {
        id: 'top_n_rank',
        title: `先取 Top${spec.topN || 5} 维度值`,
        description: `按 ${spec.breakdownDimension || '分组维度'} 使用 ${rankMeasure} 排名，得到后续趋势分析的 Top${spec.topN || 5} 设备/维度值。`,
        cubeQuery: rankQuery
      },
      {
        id: 'top_n_trend',
        title: '再拉取 TopN 的逐日趋势',
        description: `把第一步返回的 Top${spec.topN || 5} 值作为过滤条件，按天查询 ${measure}，用于绘制多条趋势线。`,
        cubeQuery: trendQuery
      },
      {
        id: 'top_n_merge',
        title: '最后合并为多折线结果',
        description: '将第二步返回的数据按设备/维度值拆成多条序列，并生成摘要结论。'
      }
    ]
  }

  if (!measure) return []

  if (spec.queryType === 'scalar') {
    return [{
      id: 'scalar_query',
      title: '查询指标汇总值',
      description: `按确认的时间/过滤条件查询 ${measure} 的汇总结果。`,
      cubeQuery: buildScalarQuery(spec, measure)
    }]
  }

  if (spec.queryType === 'trend') {
    return [{
      id: 'trend_query',
      title: '查询指标逐日趋势',
      description: `按天查询 ${measure}，生成趋势折线。`,
      cubeQuery: buildTrendQuery(spec, measure)
    }]
  }

  if (spec.queryType === 'breakdown') {
    return [{
      id: 'breakdown_query',
      title: '查询指标维度分布',
      description: `按 ${spec.breakdownDimension || '合计'} 查询 ${measure} 的分布结果。`,
      cubeQuery: buildBreakdownQuery(spec, measure)
    }]
  }

  return [
    {
      id: 'trend_query',
      title: '查询指标逐日趋势',
      description: `按天查询 ${measure}，生成趋势折线。`,
      cubeQuery: buildTrendQuery(spec, measure)
    },
    {
      id: 'breakdown_query',
      title: '查询指标维度分布',
      description: `按 ${spec.breakdownDimension || '合计'} 查询 ${measure} 的分布结果。`,
      cubeQuery: buildBreakdownQuery(spec, measure)
    }
  ]
}
