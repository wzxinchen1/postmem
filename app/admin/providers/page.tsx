'use client'

import { useState, useEffect } from 'react'

interface Provider {
  id: number
  name: string
  type: string
  apiKey?: string
  baseUrl?: string
  config: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
  models?: Model[]
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

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'local', label: '本地模型' },
  { value: 'custom', label: '自定义' },
]

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'openai',
    apiKey: '',
    baseUrl: '',
    isActive: true,
  })

  useEffect(() => {
    loadProviders()
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const loadProviders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/providers?includeInactive=true')
      const data = await res.json()
      if (data.success) {
        setProviders(data.data.providers)
      }
    } catch (err) {
      showMessage('error', '加载提供商失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = editingProvider
        ? `/api/providers/${editingProvider.id}`
        : '/api/providers'
      const method = editingProvider ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          apiKey: formData.apiKey || undefined,
          baseUrl: formData.baseUrl || undefined,
          isActive: formData.isActive,
        }),
      })

      const data = await res.json()
      if (data.success) {
        showMessage('success', editingProvider ? '更新成功' : '创建成功')
        setShowModal(false)
        resetForm()
        loadProviders()
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
    if (!confirm('确定要删除此提供商吗？相关的模型也会被删除。')) return

    setLoading(true)
    try {
      const res = await fetch(`/api/providers/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '删除成功')
        loadProviders()
      } else {
        showMessage('error', data.error?.message || '删除失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider)
    setFormData({
      name: provider.name,
      type: provider.type,
      apiKey: provider.apiKey || '',
      baseUrl: provider.baseUrl || '',
      isActive: provider.isActive,
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'openai',
      apiKey: '',
      baseUrl: '',
      isActive: true,
    })
    setEditingProvider(null)
  }

  const getProviderTypeLabel = (type: string) => {
    return PROVIDER_TYPES.find(t => t.value === type)?.label || type
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
          共 {providers.length} 个提供商
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          style={{ padding: '0.625rem 1.25rem', background: COLORS.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
        >
          + 新增提供商
        </button>
      </div>

      {/* 提供商列表 */}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {providers.map(provider => (
          <div key={provider.id} style={{ background: COLORS.cardBg, borderRadius: '10px', border: `1px solid ${COLORS.border}`, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '40px', height: '40px', background: COLORS.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                  {provider.type === 'openai' ? '🤖' : provider.type === 'anthropic' ? '🧠' : provider.type === 'local' ? '💻' : '⚙️'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: COLORS.text }}>{provider.name}</h3>
                  <div style={{ fontSize: '0.8125rem', color: COLORS.textSecondary, marginTop: '0.25rem' }}>
                    {getProviderTypeLabel(provider.type)} {provider.baseUrl && `· ${provider.baseUrl}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ background: provider.isActive ? COLORS.successLight : COLORS.errorLight, color: provider.isActive ? '#065f46' : '#991b1b', padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                  {provider.isActive ? '启用' : '禁用'}
                </span>
                <button onClick={() => handleEdit(provider)} style={{ padding: '0.375rem 0.75rem', background: 'transparent', color: COLORS.primary, border: `1px solid ${COLORS.primary}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.8125rem' }}>编辑</button>
                <button onClick={() => handleDelete(provider.id)} style={{ padding: '0.375rem 0.75rem', background: 'transparent', color: COLORS.error, border: `1px solid ${COLORS.error}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.8125rem' }}>删除</button>
              </div>
            </div>
            {provider.models && provider.models.length > 0 && (
              <div style={{ padding: '1rem 1.5rem', background: COLORS.bg }}>
                <div style={{ fontSize: '0.8125rem', color: COLORS.textSecondary, marginBottom: '0.5rem' }}>关联模型 ({provider.models.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {provider.models.map(model => (
                    <span key={model.id} style={{ background: COLORS.cardBg, padding: '0.375rem 0.75rem', borderRadius: '6px', fontSize: '0.8125rem', color: COLORS.text, border: `1px solid ${COLORS.border}` }}>
                      {model.displayName || model.name}
                      {model.isDefault && <span style={{ marginLeft: '0.375rem', color: COLORS.primary }}>★</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {providers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: COLORS.cardBg, borderRadius: '10px', border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🔌</div>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: COLORS.text, marginBottom: '0.5rem' }}>暂无提供商</div>
            <div style={{ fontSize: '0.875rem', color: COLORS.textSecondary }}>点击上方"新增提供商"按钮创建</div>
          </div>
        )}
      </div>

      {/* 模态窗口 */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: COLORS.cardBg, borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: COLORS.text }}>{editingProvider ? '编辑提供商' : '新增提供商'}</h3>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.5rem', color: COLORS.textMuted }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>名称 *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>类型 *</label>
                <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} required style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }}>
                  {PROVIDER_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>API Key</label>
                <input type="password" value={formData.apiKey} onChange={e => setFormData({ ...formData, apiKey: e.target.value })} placeholder="可选" style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: COLORS.text }}>Base URL</label>
                <input type="url" value={formData.baseUrl} onChange={e => setFormData({ ...formData, baseUrl: e.target.value })} placeholder="可选，用于自定义端点" style={{ width: '100%', padding: '0.625rem 0.875rem', border: `1px solid ${COLORS.border}`, borderRadius: '6px', fontSize: '0.875rem', outline: 'none', background: COLORS.bg }} />
              </div>
              <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
                <label htmlFor="isActive" style={{ fontSize: '0.875rem', color: COLORS.text }}>启用此提供商</label>
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