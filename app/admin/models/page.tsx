'use client'

import { useState, useEffect } from 'react'

interface Provider {
  id: number
  name: string
  type: string
  isActive: boolean
}

interface Model {
  id: number
  providerId: number
  name: string
  displayName?: string
  modelType: string
  config: Record<string, unknown>
  isActive: boolean
  isDefault: boolean
  provider?: Provider
}

const COLORS = {
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryLight: '#eff6ff',
  secondary: '#64748b',
  success: '#10b981',
  successLight: '#d1fae5',
  error: '#ef4444',
  errorLight: '#fee2e2',
  warning: '#f59e0b',
  border: '#e2e8f0',
  bg: '#f8fafc',
  cardBg: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
}

const MODEL_TYPES = [
  { value: 'embedding', label: 'Embedding' },
  { value: 'chat', label: 'Chat' },
]

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingModel, setEditingModel] = useState<Model | null>(null)
  const [formData, setFormData] = useState({
    providerId: '',
    name: '',
    displayName: '',
    modelType: 'embedding',
    isActive: true,
    isDefault: false,
  })

  useEffect(() => {
    loadProviders()
    loadModels()
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const loadProviders = async () => {
    try {
      const res = await fetch('/api/providers')
      const data = await res.json()
      if (data.success) {
        setProviders(data.data.providers)
      }
    } catch (err) {
      showMessage('error', '加载提供商失败')
    }
  }

  const loadModels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/models?includeInactive=true')
      const data = await res.json()
      if (data.success) {
        setModels(data.data.models)
      }
    } catch (err) {
      showMessage('error', '加载模型失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = editingModel ? `/api/models/${editingModel.id}` : '/api/models'
      const method = editingModel ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: Number(formData.providerId),
          name: formData.name,
          displayName: formData.displayName || undefined,
          modelType: formData.modelType,
          isActive: formData.isActive,
          isDefault: formData.isDefault,
        }),
      })

      const data = await res.json()
      if (data.success) {
        showMessage('success', editingModel ? '更新成功' : '创建成功')
        setShowModal(false)
        resetForm()
        loadModels()
      } else {
        showMessage('error', data.error?.message || '操作失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此模型吗？')) return

    setLoading(true)
    try {
      const res = await fetch(`/api/models/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '删除成功')
        loadModels()
      } else {
        showMessage('error', data.error?.message || '删除失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (model: Model) => {
    setEditingModel(model)
    setFormData({
      providerId: model.providerId.toString(),
      name: model.name,
      displayName: model.displayName || '',
      modelType: model.modelType,
      isActive: model.isActive,
      isDefault: model.isDefault,
    })
    setShowModal(true)
  }

  const handleSetDefault = async (model: Model) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/models/${model.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '已设为默认模型')
        loadModels()
      } else {
        showMessage('error', data.error?.message || '操作失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      providerId: providers.length > 0 ? providers[0].id.toString() : '',
      name: '',
      displayName: '',
      modelType: 'embedding',
      isActive: true,
      isDefault: false,
    })
    setEditingModel(null)
  }

  const getModelTypeLabel = (type: string) => {
    return MODEL_TYPES.find(t => t.value === type)?.label || type
  }

  const getProviderName = (providerId: number) => {
    return providers.find(p => p.id === providerId)?.name || '未知'
  }

  return (
    <>
      {/* 消息提示 */}
      {message && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.875rem 1rem', borderRadius: '8px', background: message.type === 'success' ? COLORS.successLight : COLORS.errorLight, color: message.type === 'success' ? '#065f46' : '#991b1b', border: `1px solid ${message.type === 'success' ? '#6ee7b7' : '#fca5a5'}`, fontSize: '0.875rem' }}>
            {message.type === 'success' ? '✓' : '✕'} {message.text}
          </div>
        </div>
      )}

      {/* 操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.875rem', color: COLORS.textSecondary }}>
          共 {models.length} 个模型
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          disabled={providers.length === 0}
          style={{ padding: '0.625rem 1.25rem', background: providers.length === 0 ? COLORS.border : COLORS.primary, color: providers.length === 0 ? COLORS.textMuted : 'white', border: 'none', borderRadius: '6px', cursor: providers.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
        >
          + 新增模型
        </button>
      </div>

      {providers.length === 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: COLORS.warning + '20', border: `1px solid ${COLORS.warning}`, borderRadius: '8px', fontSize: '0.875rem', color: COLORS.text }}>
          请先创建提供商后再添加模型。前往提供商管理页面创建。
        </div>
      )}

      {/* 模型列表 */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {models.map(model => (
          <div key={model.id} style={{ background: COLORS.cardBg, borderRadius: '10px', border: `1px solid ${COLORS.border}`, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '40px', height: '40px', background: COLORS.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                {model.modelType === 'embedding' ? '📊' : model.modelType === 'chat' ? '💬' : '⚡'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: COLORS.text }}>{model.displayName || model.name}</h3>
                  {model.isDefault && <span style={{ background: COLORS.primary, color: 'white', padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '600' }}>默认</span>}
                </div>
                <div style={{ fontSize: '0.8125rem', color: COLORS.textSecondary, marginTop: '0.25rem' }}>
                  {model.name} · {getProviderName(model.providerId)} · {getModelTypeLabel(model.modelType)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ background: model.isActive ? COLORS.successLight : COLORS.errorLight, color: model.isActive ? '#065f46' : '#991b1b', padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                {model.isActive ? '启用' : '禁用'}
              </span>
              {!model.isDefault && (
                <button onClick={() => handleSetDefault(model)} style={{ padding: '0.375rem 0.75rem', background: 'transparent', color: COLORS.warning, border: `1px solid ${COLORS.warning}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.8125rem' }}>设为默认</button>
              )}
              <button onClick={() => handleEdit(model)} style={{ padding: '0.375rem 0.75rem', background: 'transparent', color: COLORS.primary, border: `1px solid ${COLORS.primary}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.8125rem' }}>编辑</button>
              <button onClick={() => handleDelete(model.id)} style={{ padding: '0.375rem 0.75rem', background: 'transparent', color: COLORS.error, border: `1px solid ${COLORS.error}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.8125rem' }}>删除</button>
            </div>
          </div>
        ))}

        {models.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: COLORS.cardBg, borderRadius: '10px', border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🤖</div>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: COLORS.text, marginBottom: '0.5rem' }}>暂无模型</div>
            <div style={{ fontSize: '0.875rem', color: COLORS.textSecondary }}>点击上方"新增模型"按钮创建</div>
          </div>
        )}
      </div>

      {/* 模态窗口 */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: COLORS.cardBg, borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: COLORS.text }}>{editingModel ? '编辑模型' : '新增模型'}</h3>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.5rem', color: COLORS.textMuted }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>提供商 *</label>
                <select value={formData.providerId} onChange={e => setFormData({ ...formData, providerId: e.target.value })} required style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }}>
                  {providers.map(provider => (
                    <option key={provider.id} value={provider.id}>{provider.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>模型名称 *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="如：text-embedding-3-small" required style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>显示名称</label>
                <input type="text" value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} placeholder="可选，用于友好显示" style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>模型类型 *</label>
                <select value={formData.modelType} onChange={e => setFormData({ ...formData, modelType: e.target.value })} required style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }}>
                  {MODEL_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
                  <label htmlFor="isActive" style={{ fontSize: '0.875rem', color: COLORS.text }}>启用</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="isDefault" checked={formData.isDefault} onChange={e => setFormData({ ...formData, isDefault: e.target.checked })} />
                  <label htmlFor="isDefault" style={{ fontSize: '0.875rem', color: COLORS.text }}>设为默认</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" disabled={loading} style={{ flex: 1, padding: '0.75rem 1.5rem', background: loading ? COLORS.border : COLORS.primary, color: loading ? COLORS.textMuted : 'white', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '500', fontSize: '0.875rem' }}>{loading ? '处理中...' : '保存'}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} style={{ padding: '0.75rem 1.5rem', background: 'transparent', color: COLORS.textSecondary, border: `1px solid ${COLORS.border}`, borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}