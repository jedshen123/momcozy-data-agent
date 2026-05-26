import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Cube } from '../cubes/CubesPage'
import type { View, ViewCubePath } from './ViewsPage'

// ——— 类型 ———

type Step = 1 | 2 | 3

interface CubePathDraft {
  join_path: string   // e.g. "cube_a" 或 "cube_a.cube_b"
  cubeName: string    // join_path 最后一段
  includes: string[]  // 选中的字段
  prefix: boolean
}

// ——— 完成弹窗 ———

function CompletionDialog({
  viewName, title,
  onViewDetail, onCreateMetric, onStayHere,
}: {
  viewName: string
  title: string
  onViewDetail: () => void
  onCreateMetric: () => void
  onStayHere: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '2.5rem', width: '440px', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>View 已保存</h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
          <strong style={{ color: '#111827' }}>{title}</strong>
        </p>
        <code style={{ color: '#4b5563', fontSize: '0.8125rem', background: '#f3f4f6', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>{viewName}</code>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onViewDetail} style={{ flex: 1, padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.875rem' }}>查看 View 详情</button>
            <button onClick={onCreateMetric} style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: '0.5rem', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }}>去建指标</button>
          </div>
          <button onClick={onStayHere} style={{ padding: '0.5rem', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8125rem' }}>留在这里</button>
        </div>
      </div>
    </div>
  )
}

// ——— Step 1：Cube 路径链构建 ———

function Step1PathBuilder({
  cubePaths,
  onCubePathsChange,
  onNext,
}: {
  cubePaths: CubePathDraft[]
  onCubePathsChange: (paths: CubePathDraft[]) => void
  onNext: () => void
}) {
  const [allCubes, setAllCubes] = useState<Cube[]>([])
  const [loadingCubes, setLoadingCubes] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/cubes')
      .then(r => r.ok ? r.json() : [])
      .then((list: Cube[]) => setAllCubes(list))
      .catch(() => { })
      .finally(() => setLoadingCubes(false))
  }, [])

  function addCube(cube: Cube) {
    // 避免重复添加同一个 cube
    if (cubePaths.some(cp => cp.cubeName === cube.name)) return
    const parentPath = cubePaths.length === 0 ? null : cubePaths[cubePaths.length - 1].join_path
    const join_path = parentPath ? `${parentPath}.${cube.name}` : cube.name
    onCubePathsChange([...cubePaths, { join_path, cubeName: cube.name, includes: [], prefix: false }])
  }

  function removePath(idx: number) {
    // 删除该项及之后所有项（后续路径依赖前面的路径）
    onCubePathsChange(cubePaths.slice(0, idx))
  }

  const selectedNames = new Set(cubePaths.map(cp => cp.cubeName))
  const filtered = allCubes.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q)
  })

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧：可用 Cube 列表 */}
      <div style={{ width: '35%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索 Cube…"
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {loadingCubes ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', fontSize: '0.8125rem' }}>加载中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', fontSize: '0.8125rem' }}>
              {allCubes.length === 0 ? '没有可用的 Cube，请先创建 Cube' : '没有匹配的 Cube'}
            </div>
          ) : (
            filtered.map(c => {
              const isSelected = selectedNames.has(c.name)
              return (
                <div
                  key={c.name}
                  onClick={() => !isSelected && addCube(c)}
                  style={{
                    padding: '0.75rem', borderRadius: '0.5rem', cursor: isSelected ? 'default' : 'pointer',
                    marginBottom: '0.5rem', border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isSelected ? '#eff6ff' : '#fff', opacity: isSelected ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem' }}>📦</span>
                    <span style={{ fontWeight: '600', fontSize: '0.8125rem', color: isSelected ? '#1e40af' : '#111827' }}>{c.name}</span>
                    {isSelected && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#2563eb' }}>✓ 已选</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{c.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {(c.dimensions?.length || 0) + (c.measures?.length || 0)} 个字段
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 右侧：路径链 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {cubePaths.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#9ca3af' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔗</div>
              <p style={{ fontSize: '0.875rem' }}>在左侧点击 Cube，第一个成为根路径，后续依次追加</p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                Cube 路径链
              </div>
              {cubePaths.map((cp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  {/* 连线 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '0.5rem', flexShrink: 0 }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: i === 0 ? '#2563eb' : '#10b981', flexShrink: 0 }} />
                    {i < cubePaths.length - 1 && (
                      <div style={{ width: '2px', height: '2.5rem', background: '#e5e7eb', marginTop: '0.25rem' }} />
                    )}
                  </div>
                  {/* 路径卡片 */}
                  <div style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <code style={{ fontSize: '0.8125rem', color: '#1e40af', fontWeight: '500' }}>{cp.join_path}</code>
                      <button
                        onClick={() => removePath(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1 }}
                      >×</button>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {i === 0 ? '根 Cube' : `通过 ${cubePaths[i - 1].cubeName} 关联`}
                    </div>
                  </div>
                </div>
              ))}
              {cubePaths.length > 0 && (
                <div style={{ marginTop: '0.5rem', padding: '0.625rem 0.75rem', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', color: '#9ca3af', textAlign: 'center' }}>
                  继续在左侧点击 Cube 追加路径
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>已配置 {cubePaths.length} 条路径</span>
          <button
            onClick={onNext}
            disabled={cubePaths.length === 0}
            style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.5rem', background: cubePaths.length === 0 ? '#d1d5db' : '#2563eb', cursor: cubePaths.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}
          >
            下一步：字段选择 →
          </button>
        </div>
      </div>
    </div>
  )
}

// ——— Step 2：每条路径的字段选择 ———

function Step2FieldSelector({
  cubePaths,
  cubeMap,
  onCubePathsChange,
  onPrev,
  onNext,
}: {
  cubePaths: CubePathDraft[]
  cubeMap: Record<string, Cube>
  onCubePathsChange: (paths: CubePathDraft[]) => void
  onPrev: () => void
  onNext: () => void
}) {
  function updatePath(idx: number, patch: Partial<CubePathDraft>) {
    const updated = [...cubePaths]
    updated[idx] = { ...updated[idx], ...patch }
    onCubePathsChange(updated)
  }

  function toggleField(pathIdx: number, fieldName: string) {
    const cp = cubePaths[pathIdx]
    const includes = cp.includes.includes(fieldName)
      ? cp.includes.filter(f => f !== fieldName)
      : [...cp.includes, fieldName]
    updatePath(pathIdx, { includes })
  }

  function selectAll(pathIdx: number) {
    const cube = cubeMap[cubePaths[pathIdx].cubeName]
    if (!cube) return
    const all = [
      ...(cube.dimensions || []).map(d => d.name),
      ...(cube.measures || []).map(m => m.name),
    ]
    updatePath(pathIdx, { includes: all })
  }

  function selectNone(pathIdx: number) {
    updatePath(pathIdx, { includes: [] })
  }

  const totalIncluded = cubePaths.reduce((sum, cp) => sum + cp.includes.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {cubePaths.map((cp, pathIdx) => {
          const cube = cubeMap[cp.cubeName]
          const dims = cube?.dimensions || []
          const measures = cube?.measures || []

          return (
            <div key={pathIdx} style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden' }}>
              {/* 路径头 */}
              <div style={{ padding: '0.75rem 1rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <code style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: '600' }}>{cp.join_path}</code>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={cp.prefix}
                      onChange={e => updatePath(pathIdx, { prefix: e.target.checked })}
                    />
                    prefix
                  </label>
                  <button onClick={() => selectAll(pathIdx)} style={{ fontSize: '0.75rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem 0.375rem' }}>全选</button>
                  <button onClick={() => selectNone(pathIdx)} style={{ fontSize: '0.75rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem 0.375rem' }}>清空</button>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>已选 {cp.includes.length} 个</span>
                </div>
              </div>

              {/* 字段列表 */}
              <div>
                {!cube ? (
                  <div style={{ color: '#9ca3af', fontSize: '0.8125rem', padding: '0.75rem 1rem' }}>未找到 Cube：{cp.cubeName}</div>
                ) : (
                  <>
                    {/* 表头 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 1fr', gap: '0.5rem', padding: '0.375rem 1rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.6875rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <div />
                      <div>字段名</div>
                      <div>类型</div>
                      <div>标题</div>
                    </div>
                    {dims.map(d => {
                      const checked = cp.includes.includes(d.name)
                      return (
                        <label
                          key={d.name}
                          style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 1fr', gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid #f3f4f6', alignItems: 'center', cursor: 'pointer', background: checked ? '#f8faff' : 'transparent' }}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleField(pathIdx, d.name)} style={{ margin: 0 }} />
                          <code style={{ fontSize: '0.8125rem', color: '#1e40af' }}>{d.name}</code>
                          <span style={{ fontSize: '0.75rem', color: '#1e40af', background: '#eff6ff', padding: '0.125rem 0.375rem', borderRadius: '9999px', textAlign: 'center' }}>维度</span>
                          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{d.title || '-'}</span>
                        </label>
                      )
                    })}
                    {measures.map(m => {
                      const checked = cp.includes.includes(m.name)
                      return (
                        <label
                          key={m.name}
                          style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 1fr', gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid #f3f4f6', alignItems: 'center', cursor: 'pointer', background: checked ? '#fdf8ff' : 'transparent' }}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleField(pathIdx, m.name)} style={{ margin: 0 }} />
                          <code style={{ fontSize: '0.8125rem', color: '#7c3aed' }}>{m.name}</code>
                          <span style={{ fontSize: '0.75rem', color: '#7c3aed', background: '#fdf4ff', padding: '0.125rem 0.375rem', borderRadius: '9999px', textAlign: 'center' }}>度量</span>
                          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{m.title || '-'}</span>
                        </label>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button onClick={onPrev} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>← 上一步</button>
        <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>共 {totalIncluded} 个字段已选</span>
        <button
          onClick={onNext}
          disabled={totalIncluded === 0}
          style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '0.5rem', background: totalIncluded === 0 ? '#d1d5db' : '#2563eb', cursor: totalIncluded === 0 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '500' }}
        >
          下一步：View 信息 →
        </button>
      </div>
    </div>
  )
}

// ——— Step 3：View 基本信息 ———

function Step3ViewMeta({
  viewName, viewTitle, description, aiContext, snapshot,
  onViewNameChange, onViewTitleChange, onDescriptionChange, onAiContextChange, onSnapshotChange,
  onPrev, onSave, saving,
}: {
  viewName: string
  viewTitle: string
  description: string
  aiContext: string
  snapshot: boolean
  onViewNameChange: (v: string) => void
  onViewTitleChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onAiContextChange: (v: string) => void
  onSnapshotChange: (v: boolean) => void
  onPrev: () => void
  onSave: () => void
  saving: boolean
}) {
  const canSave = viewName.trim() !== '' && viewTitle.trim() !== '' && !saving

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', maxWidth: '640px' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.375rem' }}>View 名称 <span style={{ color: '#dc2626' }}>*</span></label>
          <input
            value={viewName}
            onChange={e => onViewNameChange(e.target.value)}
            placeholder="view_name（英文下划线）"
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.375rem' }}>标题 <span style={{ color: '#dc2626' }}>*</span></label>
          <input
            value={viewTitle}
            onChange={e => onViewTitleChange(e.target.value)}
            placeholder="中文标题"
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.375rem' }}>业务说明</label>
          <textarea
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            rows={3}
            placeholder="描述该 View 的业务用途…"
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
          />
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.375rem' }}>
            AI Context
            <span style={{ fontWeight: '400', color: '#9ca3af', marginLeft: '0.5rem' }}>（meta.ai_context，帮助 AI 理解该 View 的用途）</span>
          </label>
          <textarea
            value={aiContext}
            onChange={e => onAiContextChange(e.target.value)}
            rows={6}
            placeholder="描述该 View 适合回答什么类型的问题、包含哪些关键指标…"
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
          />
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={snapshot}
              onChange={e => onSnapshotChange(e.target.checked)}
              style={{ marginTop: '0.125rem', flexShrink: 0 }}
            />
            <div>
              <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#374151' }}>每日快照表（snapshot）</span>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0' }}>
                勾选后，scalar 查询（问总量/当前值）会自动取最新 busi_date 分区数据，而非聚合全量历史数据
              </p>
            </div>
          </label>
        </div>
      </div>

      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button onClick={onPrev} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>← 上一步</button>
        <button
          onClick={onSave}
          disabled={!canSave}
          style={{ padding: '0.5rem 1.5rem', border: 'none', borderRadius: '0.5rem', background: !canSave ? '#d1d5db' : '#2563eb', cursor: !canSave ? 'not-allowed' : 'pointer', fontSize: '0.875rem', color: '#fff', fontWeight: '600' }}
        >
          {saving ? '保存中…' : '保存 View'}
        </button>
      </div>
    </div>
  )
}

// ——— 主组件 ———

export default function ViewEditorPage() {
  const { viewId } = useParams<{ viewId: string }>()
  const navigate = useNavigate()
  const isEdit = !!viewId

  const [step, setStep] = useState<Step>(1)
  const [cubePaths, setCubePaths] = useState<CubePathDraft[]>([])
  const [cubeMap, setCubeMap] = useState<Record<string, Cube>>({})

  const [viewName, setViewName] = useState('')
  const [viewTitle, setViewTitle] = useState('')
  const [description, setDescription] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [snapshot, setSnapshot] = useState(false)

  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [savedViewName, setSavedViewName] = useState('')

  // 加载所有 Cube（用于字段选择阶段）
  useEffect(() => {
    fetch('/api/cubes')
      .then(r => r.ok ? r.json() : [])
      .then((list: Cube[]) => {
        const map: Record<string, Cube> = {}
        for (const c of list) map[c.name] = c
        setCubeMap(map)
      })
      .catch(() => { })
  }, [])

  // 编辑模式：加载现有 View
  useEffect(() => {
    if (!isEdit) return
    ;(async () => {
      try {
        const res = await fetch(`/api/views/${viewId}`)
        if (!res.ok) return
        const view: View = await res.json()
        setViewName(view.name)
        setViewTitle(view.title || '')
        setDescription(view.description || '')
        setAiContext(view.meta?.ai_context || '')
        setSnapshot(view.meta?.snapshot ?? false)
        const paths: CubePathDraft[] = (view.cubes || []).map(cp => ({
          join_path: cp.join_path,
          cubeName: cp.join_path.split('.').pop() || cp.join_path,
          includes: cp.includes || [],
          prefix: cp.prefix ?? false,
        }))
        setCubePaths(paths)
        setStep(2) // 编辑模式跳过路径构建，直接到字段选择
      } catch { /* ignore */ }
    })()
  }, [isEdit, viewId])

  // Step 1 → 2：自动推断 View 名
  function handleStep1Next() {
    if (cubePaths.length === 0) return
    if (!viewName) {
      setViewName(cubePaths.map(cp => cp.cubeName).join('_'))
    }
    setStep(2)
  }

  // 保存 View
  async function handleSave() {
    setSaving(true)
    try {
      const body: View = {
        name: viewName.trim(),
        title: viewTitle.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        cubes: cubePaths.map(cp => ({
          join_path: cp.join_path,
          includes: cp.includes,
          ...(cp.prefix ? { prefix: true } : {}),
        } satisfies ViewCubePath)),
        ...(aiContext.trim() || snapshot ? {
          meta: {
            ...(aiContext.trim() ? { ai_context: aiContext.trim() } : {}),
            ...(snapshot ? { snapshot: true } : {}),
          }
        } : {}),
      }

      const method = isEdit ? 'PUT' : 'POST'
      const url = isEdit ? `/api/views/${viewId}` : '/api/views'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSavedViewName(viewName.trim())
      setDone(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const steps = ['Cube 路径', '字段选择', 'View 信息']
  const currentStepIdx = step - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶栏 */}
      <div style={{ padding: '0.875rem 2rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/views')} style={{ fontSize: '0.875rem', color: '#6b7280', border: 'none', background: 'none', cursor: 'pointer' }}>← 取消</button>
          <h1 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>{isEdit ? `编辑 View：${viewId}` : '新建 View'}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '600', background: i < currentStepIdx ? '#10b981' : i === currentStepIdx ? '#2563eb' : '#e5e7eb', color: i <= currentStepIdx ? '#fff' : '#9ca3af' }}>
                  {i < currentStepIdx ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '0.8125rem', color: i === currentStepIdx ? '#111827' : '#9ca3af', fontWeight: i === currentStepIdx ? '500' : '400' }}>{s}</span>
              </div>
              {i < steps.length - 1 && <div style={{ width: '1.5rem', height: '1px', background: '#e5e7eb' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* 主内容 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {step === 1 && (
          <Step1PathBuilder
            cubePaths={cubePaths}
            onCubePathsChange={setCubePaths}
            onNext={handleStep1Next}
          />
        )}
        {step === 2 && (
          <Step2FieldSelector
            cubePaths={cubePaths}
            cubeMap={cubeMap}
            onCubePathsChange={setCubePaths}
            onPrev={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3ViewMeta
            viewName={viewName}
            viewTitle={viewTitle}
            description={description}
            aiContext={aiContext}
            snapshot={snapshot}
            onViewNameChange={setViewName}
            onViewTitleChange={setViewTitle}
            onDescriptionChange={setDescription}
            onAiContextChange={setAiContext}
            onSnapshotChange={setSnapshot}
            onPrev={() => setStep(2)}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </div>

      {done && (
        <CompletionDialog
          viewName={savedViewName}
          title={viewTitle}
          onViewDetail={() => navigate(`/views/${savedViewName}`)}
          onCreateMetric={() => navigate('/metrics/new')}
          onStayHere={() => navigate('/views')}
        />
      )}
    </div>
  )
}
