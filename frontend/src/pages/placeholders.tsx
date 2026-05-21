import { Link } from 'react-router-dom'

// 通用占位页面工厂
function placeholder(title: string, newPath?: string) {
  return function PlaceholderPage() {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>{title}</h1>
          {newPath && (
            <Link to={newPath} style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}>+ 新建</Link>
          )}
        </div>
        <div style={{ color: '#6b7280', padding: '4rem 0', textAlign: 'center', border: '2px dashed #e5e7eb', borderRadius: '0.5rem' }}>
          此模块开发中
        </div>
      </div>
    )
  }
}

export const CubesPage = placeholder('Cubes', '/cubes/new')
export const CubeDetailPage = placeholder('Cube 详情')
export const CubeEditorPage = placeholder('Cube 编辑器')

export const ViewsPage = placeholder('Views', '/views/new')
export const ViewDetailPage = placeholder('View 详情')
export const ViewEditorPage = placeholder('View 编辑器')

export const MetricsPage = placeholder('指标', '/metrics/new')
export const MetricDetailPage = placeholder('指标详情')
export const MetricEditorPage = placeholder('指标编辑器')

export const DisambiguationsPage = placeholder('澄清层', '/disambiguations/new')
export const DisambiguationEditorPage = placeholder('澄清编辑器')
export const DisambiguationDetailPage = placeholder('澄清详情')

export const ExperiencesPage = placeholder('经验层', '/experiences/new')
export const ExperienceDetailPage = placeholder('经验详情')
export const ExperienceEditorPage = placeholder('经验编辑器')

export const OptimizerPage = placeholder('优化师')
export const AgentsPage = placeholder('Agent 配置')
