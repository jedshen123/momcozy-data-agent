import { useState, useEffect } from 'react'

interface AgentVersion {
  version: string
  path: string
  role: 'latest' | 'archived'
  summary: string
}

interface Agent {
  id: string
  name: string
  codeRef: string
  latestVersion: string
  latestPath: string
  versions: AgentVersion[]
}

interface Registry {
  runtimePolicy: string
  agents: Agent[]
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  latest: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  archived: { bg: '#f9fafb', text: '#9ca3af', border: '#e5e7eb' }
}

const AGENT_ICONS: Record<string, string> = {
  analysis: '🔍',
  semantic_builder: '🧱',
  optimizer: '🔬'
}

export default function AgentsPage() {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function loadRegistry() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // 处理两种响应格式：{ agents: [...] } 或 Registry 对象
      if (Array.isArray(data)) {
        setRegistry({ runtimePolicy: '', agents: data })
      } else {
        setRegistry(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRegistry() }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>加载中…</div>
  if (error) return (
    <div style={{ padding: '2rem' }}>
      <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
        {error} <button onClick={loadRegistry} style={{ marginLeft: '1rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}>重试</button>
      </div>
    </div>
  )
  if (!registry) return null

  const agents = registry.agents ?? []

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      {/* 标题栏 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', marginBottom: '0.375rem' }}>Agent 配置</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>系统注册的 AI Agent 版本管理（只读视图）</p>
      </div>

      {/* 运行策略 */}
      {registry.runtimePolicy && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.8125rem', color: '#854d0e', lineHeight: '1.6' }}>
          <span style={{ fontWeight: '600' }}>运行策略：</span>{registry.runtimePolicy}
        </div>
      )}

      {/* Agent 卡片列表 */}
      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#9ca3af', fontSize: '0.875rem' }}>暂无 Agent 注册信息</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {agents.map(agent => {
            const isExpanded = expanded[agent.id]
            const icon = AGENT_ICONS[agent.id] || '🤖'
            const latestVer = agent.versions.find(v => v.role === 'latest')
            const archivedVers = agent.versions.filter(v => v.role === 'archived')

            return (
              <div key={agent.id} style={{ border: '1px solid #e5e7eb', borderRadius: '0.875rem', overflow: 'hidden', background: '#fff' }}>
                {/* 卡片头 */}
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
                      <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>{agent.name}</h2>
                      <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontFamily: 'monospace' }}>v{agent.latestVersion}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                      <span><span style={{ color: '#9ca3af' }}>ID:</span> <code style={{ background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem' }}>{agent.id}</code></span>
                      <span>·</span>
                      <span><span style={{ color: '#9ca3af' }}>代码:</span> <code style={{ background: '#f3f4f6', padding: '0.0625rem 0.25rem', borderRadius: '0.25rem', color: '#4b5563' }}>{agent.codeRef}</code></span>
                    </div>
                    {latestVer && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#4b5563', lineHeight: '1.5' }}>
                        <span style={{ color: '#9ca3af' }}>当前版本说明：</span>{latestVer.summary}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpand(agent.id)}
                    style={{ padding: '0.375rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', color: '#6b7280', flexShrink: 0 }}
                  >
                    {isExpanded ? '收起' : '版本历史'}
                  </button>
                </div>

                {/* 规格文件路径 */}
                <div style={{ padding: '0.75rem 1.5rem', background: '#f9fafb', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>规格文件</span>
                  <code style={{ fontSize: '0.8125rem', color: '#2563eb', background: '#eff6ff', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>{agent.latestPath}</code>
                </div>

                {/* 版本历史（展开） */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #e5e7eb', padding: '1rem 1.5rem' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>版本历史（{agent.versions.length} 个版本）</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {agent.versions.map((ver, i) => {
                        const colors = STATUS_COLORS[ver.role] ?? STATUS_COLORS.archived
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.75rem', alignItems: 'start', padding: '0.75rem', border: '1px solid #f3f4f6', borderRadius: '0.5rem', background: ver.role === 'latest' ? '#f0fdf4' : '#fff' }}>
                            <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, fontWeight: '500', whiteSpace: 'nowrap' }}>
                              {ver.role === 'latest' ? '当前' : '归档'}
                            </span>
                            <div>
                              <div style={{ fontSize: '0.8125rem', color: '#374151', marginBottom: '0.125rem' }}>{ver.summary}</div>
                              <code style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{ver.path}</code>
                            </div>
                            <code style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{ver.version}</code>
                          </div>
                        )
                      })}
                    </div>
                    {archivedVers.length > 0 && (
                      <div style={{ marginTop: '0.75rem', padding: '0.625rem 0.875rem', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#854d0e' }}>
                        ⚠️ 归档版本仅供参考，运行时只绑定当前版本
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
