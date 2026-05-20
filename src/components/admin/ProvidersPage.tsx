'use client'

import { useState, useEffect, useCallback } from 'react'
import { message, Card, Button, Space, Typography, Tag, Empty, Modal, Form, Input, Select, Switch, Popconfirm, Spin, Collapse, Divider } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, StarOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface Vendor {
  id: number
  name: string
  url: string
  chatModelClass?: string | null
  factoryCode?: string | null
  isActive: boolean
}

interface Provider {
  id: number
  name: string
  vendorId: number
  vendor?: {
    chatModelClass?: string | null
    name?: string
  }
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
  capabilities: string[]
  config: Record<string, unknown>
  isActive: boolean
  isDefault: boolean
}

const MODEL_CAPABILITIES = [
  { value: 'chat', label: '对话' },
  { value: 'reasoning', label: '思考' },
  { value: 'embedding', label: '嵌入' },
  { value: 'vision', label: '视觉' },
]

interface ModelFormData {
  providerId: number
  name: string
  displayName: string
  capabilities: string[]
  isActive: boolean
  isDefault: boolean
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState<'provider' | 'model' | null>(null)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)

  const [providerForm, setProviderForm] = useState({
    name: '',
    vendorId: undefined as number | undefined,
    apiKey: '',
    baseUrl: '',
    isActive: true,
  })
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string; models?: string[] } | null>(null)

  const [editingModel, setEditingModel] = useState<Model | null>(null)
  const [modelForm, setModelForm] = useState<ModelFormData>({
    providerId: 0,
    name: '',
    displayName: '',
    capabilities: ['chat'],
    isActive: true,
    isDefault: false,
  })
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)

  const [msg, contextHolder] = message.useMessage()
  const [form] = Form.useForm()

  useEffect(() => {
    loadProviders()
    loadVendors()
  }, [])

  const loadProviders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/providers?includeInactive=true')
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('加载提供商失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        setProviders(data.data.providers)
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const loadVendors = async () => {
    try {
      const res = await fetch('/api/vendors?includeInactive=false')
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('加载厂商失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        setVendors(data.data.vendors)
        if (data.data.vendors.length > 0 && !providerForm.vendorId) {
          setProviderForm(prev => ({ ...prev, vendorId: data.data.vendors[0].id }))
        }
      }
    } catch (err) {
      msg.error('网络请求失败')
    }
  }

  const handleValidateProvider = async () => {
    if (!providerForm.vendorId) {
      msg.info('请选择类型')
      return
    }

    const selectedVendor = vendors.find(v => v.id === providerForm.vendorId)
    if (!selectedVendor) {
      msg.info('类型不存在')
      return
    }

    if (selectedVendor.chatModelClass === 'ChatOpenAI' && !providerForm.apiKey) {
      msg.info('OpenAI 需要 API Key')
      return
    }

    if (selectedVendor.chatModelClass === 'ChatAnthropic' && !providerForm.apiKey) {
      msg.info('Anthropic 需要 API Key')
      return
    }

    setValidating(true)
    setValidationResult(null)

    try {
      const res = await fetch('/api/providers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: providerForm.vendorId,
          apiKey: providerForm.apiKey || undefined,
          baseUrl: providerForm.baseUrl,
        }),
      })

      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          setValidationResult({ valid: false, error: errorMessage })
        } else {
          setValidationResult({ valid: false, error: '验证失败' })
        }
        return
      }

      const data = await res.json()
      if (data.success) {
        setValidationResult({ valid: true, models: data.data.models })
        msg.success(`验证成功，获取到 ${data.data.models.length} 个模型`)
      }
    } catch (err) {
      setValidationResult({ valid: false, error: '网络请求失败' })
    } finally {
      setValidating(false)
    }
  }

  const handleSubmitProvider = async () => {
    if (!validationResult?.valid) {
      msg.info('请先验证提供商配置')
      return
    }

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
          name: providerForm.name,
          vendorId: providerForm.vendorId,
          apiKey: providerForm.apiKey || undefined,
          baseUrl: providerForm.baseUrl,
          isActive: providerForm.isActive,
        }),
      })

      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('操作失败')
        }
        return
      }

      const data = await res.json()
      if (data.success) {
        msg.success(editingProvider ? '更新成功' : '创建成功')
        setShowModal(null)
        resetProviderForm()
        loadProviders()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProvider = async (id: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/providers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('删除失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        msg.success('删除成功')
        loadProviders()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider)
    setProviderForm({
      name: provider.name,
      vendorId: provider.vendorId,
      apiKey: provider.apiKey || '',
      baseUrl: provider.baseUrl || '',
      isActive: provider.isActive,
    })
    setValidationResult({ valid: true })
    setShowModal('provider')
  }

  const resetProviderForm = () => {
    setProviderForm({
      name: '',
      vendorId: vendors.length > 0 ? vendors[0].id : undefined,
      apiKey: '',
      baseUrl: '',
      isActive: true,
    })
    setEditingProvider(null)
    setValidationResult(null)
    form.resetFields()
  }

  const getVendorLabel = (vendorId: number) => {
    const vendor = vendors.find(v => v.id === vendorId)
    return vendor?.name || '未知'
  }

  const openAddModelModal = useCallback((provider: Provider) => {
    setEditingModel(null)
    setModelForm({
      providerId: provider.id,
      name: '',
      displayName: '',
      capabilities: ['chat'],
      isActive: true,
      isDefault: false,
    })
    setAvailableModels([])
    setShowModal('model')
    fetchAvailableModelsForProvider(provider)
  }, [])

  const fetchAvailableModelsForProvider = async (provider: Provider) => {
    setFetchingModels(true)
    setAvailableModels([])

    try {
      const res = await fetch('/api/providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: provider.vendorId,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
        }),
      })

      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('获取模型列表失败')
        }
        return
      }

      const data = await res.json()
      if (data.success) {
        setAvailableModels(data.data.models)
        if (data.data.models.length === 0) {
          msg.info('该提供商暂无可用模型，请手动输入模型名称')
        }
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setFetchingModels(false)
    }
  }

  const handleSubmitModel = async () => {
    setLoading(true)

    try {
      const url = editingModel ? `/api/models/${editingModel.id}` : '/api/models'
      const method = editingModel ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: modelForm.providerId,
          name: modelForm.name,
          displayName: modelForm.displayName || undefined,
          capabilities: modelForm.capabilities,
          isActive: modelForm.isActive,
          isDefault: modelForm.isDefault,
        }),
      })

      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('操作失败')
        }
        return
      }

      const data = await res.json()
      if (data.success) {
        msg.success(editingModel ? '更新成功' : '创建成功')
        setShowModal(null)
        resetModelForm()
        loadProviders()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteModel = async (id: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/models/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('删除失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        msg.success('删除成功')
        loadProviders()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEditModel = (model: Model, provider: Provider) => {
    setEditingModel(model)
    setModelForm({
      providerId: provider.id,
      name: model.name,
      displayName: model.displayName || '',
      capabilities: model.capabilities,
      isActive: model.isActive,
      isDefault: model.isDefault,
    })
    setShowModal('model')
    fetchAvailableModelsForProvider(provider)
  }

  const handleSetDefaultModel = async (model: Model) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/models/${model.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('操作失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        msg.success('已设为默认模型')
        loadProviders()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const resetModelForm = () => {
    setModelForm({
      providerId: providers.length > 0 ? providers[0].id : 0,
      name: '',
      displayName: '',
      capabilities: ['chat'],
      isActive: true,
      isDefault: false,
    })
    setEditingModel(null)
    setAvailableModels([])
    form.resetFields()
  }

  const getCapabilityLabels = (capabilities: string[]) => {
    return capabilities.map(c => MODEL_CAPABILITIES.find(t => t.value === c)?.label || c).join(', ')
  }

  const collapseItems = providers.map(provider => ({
    key: provider.id,
    label: (
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Tag color="blue">
            {provider.vendor?.chatModelClass === 'ChatOpenAI' ? '🤖' : provider.vendor?.chatModelClass === 'ChatAnthropic' ? '🧠' : '⚙️'}
          </Tag>
          <Space direction="vertical" size={0}>
            <Text strong>{provider.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {getVendorLabel(provider.vendorId)} {provider.baseUrl && `· ${provider.baseUrl}`}
            </Text>
          </Space>
        </Space>
        <Space onClick={(e) => e.stopPropagation()}>
          <Tag color={provider.isActive ? 'success' : 'error'}>
            {provider.isActive ? '启用' : '禁用'}
          </Tag>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); handleEditProvider(provider); }}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此提供商吗？相关的模型也会被删除。"
            onConfirm={() => handleDeleteProvider(provider.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={loading}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      </Space>
    ),
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Divider style={{ margin: '4px 0 12px 0' }}>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => openAddModelModal(provider)}
          >
            新增模型
          </Button>
        </Divider>

        {(provider.models?.length ?? 0) === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary">暂无模型，点击上方按钮添加</Text>
            }
          />
        ) : (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {provider.models!.map(model => (
              <Card key={model.id} size="small">
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <Tag color={model.capabilities.includes('reasoning') ? 'orange' : model.capabilities.includes('vision') ? 'purple' : model.capabilities.includes('embedding') ? 'blue' : 'green'}>
                      {model.capabilities.includes('reasoning') ? '🧠' : model.capabilities.includes('vision') ? '👁️' : model.capabilities.includes('embedding') ? '📊' : '💬'}
                    </Tag>
                    <Space direction="vertical" size={0}>
                      <Space>
                        <Text strong>{model.displayName || model.name}</Text>
                        {model.isDefault && <Tag color="blue">默认</Tag>}
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {model.name} · {getCapabilityLabels(model.capabilities)}
                      </Text>
                    </Space>
                  </Space>

                  <Space onClick={(e) => e.stopPropagation()}>
                    <Tag color={model.isActive ? 'success' : 'error'}>
                      {model.isActive ? '启用' : '禁用'}
                    </Tag>
                    {!model.isDefault && (
                      <Button
                        size="small"
                        onClick={() => handleSetDefaultModel(model)}
                      >
                        <StarOutlined /> 设为默认
                      </Button>
                    )}
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditModel(model, provider)}
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="确定要删除此模型吗？"
                      onConfirm={() => handleDeleteModel(model.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} loading={loading}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </Space>
              </Card>
            ))}
          </Space>
        )}
      </div>
    ),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
      {contextHolder}

      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary">共 {providers.length} 个提供商</Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { resetProviderForm(); setShowModal('provider'); }}
          >
            新增提供商
          </Button>
        </Space>
      </Card>

      {providers.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical">
                <Text>暂无提供商</Text>
                <Text type="secondary">点击上方「新增提供商」按钮创建</Text>
              </Space>
            }
          />
        </Card>
      ) : (
        <Collapse
          items={collapseItems}
          bordered={false}
          defaultActiveKey={[]}
          style={{ background: '#fff' }}
          expandIconPosition="end"
        />
      )}

      {/* 提供商弹窗 */}
      <Modal
        title={editingProvider ? '编辑提供商' : '新增提供商'}
        open={showModal === 'provider'}
        onCancel={() => { setShowModal(null); resetProviderForm(); }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={providerForm}
        >
          <Form.Item label="名称" required>
            <Input
              value={providerForm.name}
              onChange={(e) => { setProviderForm({ ...providerForm, name: e.target.value }); setValidationResult(null) }}
            />
          </Form.Item>
          <Form.Item label="类型" required>
            <Select
              value={providerForm.vendorId}
              onChange={(value) => {
                const selected = vendors.find(v => v.id === value)
                setProviderForm({ ...providerForm, vendorId: value, baseUrl: selected?.url || '' })
                setValidationResult(null)
              }}
              options={vendors.map(v => ({ value: v.id, label: v.name }))}
              placeholder="请选择类型"
            />
          </Form.Item>
          <Form.Item label="API Key">
            <Input.Password
              value={providerForm.apiKey}
              onChange={(e) => { setProviderForm({ ...providerForm, apiKey: e.target.value }); setValidationResult(null) }}
              placeholder="可选"
            />
          </Form.Item>
          <Form.Item label="Base URL" required>
            <Input
              value={providerForm.baseUrl}
              onChange={(e) => { setProviderForm({ ...providerForm, baseUrl: e.target.value }); setValidationResult(null) }}
              placeholder={`如：${vendors.find(v => v.id === providerForm.vendorId)?.url || ''}`}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Switch
                checked={providerForm.isActive}
                onChange={(checked) => setProviderForm({ ...providerForm, isActive: checked })}
              />
              <Text>启用此提供商</Text>
            </Space>
          </Form.Item>

          {validationResult && (
            <>
              <Form.Item>
                <Space>
                  {validationResult.valid ? (
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                  )}
                  <Text type={validationResult.valid ? 'success' : 'danger'}>
                    {validationResult.valid
                      ? `验证成功，获取到 ${validationResult.models?.length || 0} 个模型`
                      : validationResult.error}
                  </Text>
                </Space>
              </Form.Item>
              {validationResult.valid && validationResult.models && (
                <Form.Item label="可用模型">
                  <div style={{
                    maxHeight: 150,
                    overflowY: 'auto',
                    padding: '8px 12px',
                    background: '#fafafa',
                    borderRadius: 6,
                    border: '1px solid #f0f0f0',
                  }}>
                    <Space size={[4, 4]} wrap>
                      {validationResult.models.map(m => (
                        <Tag key={m} style={{ margin: 0 }}>{m}</Tag>
                      ))}
                    </Space>
                  </div>
                </Form.Item>
              )}
            </>
          )}

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button
                icon={validating ? <Spin size="small" /> : undefined}
                onClick={handleValidateProvider}
                loading={validating}
                disabled={validating}
              >
                {validating ? '验证中...' : '验证配置'}
              </Button>
              <Space>
                <Button onClick={() => { setShowModal(null); resetProviderForm(); }}>取消</Button>
                <Button type="primary" onClick={handleSubmitProvider} loading={loading} disabled={!validationResult?.valid}>保存</Button>
              </Space>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 模型弹窗 */}
      <Modal
        title={editingModel ? '编辑模型' : '新增模型'}
        open={showModal === 'model'}
        onCancel={() => { setShowModal(null); resetModelForm(); }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={modelForm}
        >
          <Form.Item label="提供商" required>
            <Input value={providers.find(p => p.id === modelForm.providerId)?.name} disabled />
          </Form.Item>
          <Form.Item label="模型名称" required>
            {fetchingModels ? (
              <Spin size="small" style={{ marginRight: 8 }} />
            ) : availableModels.length > 0 ? (
              <Select
                value={modelForm.name}
                onChange={(value) => setModelForm({ ...modelForm, name: value })}
                options={availableModels.map(m => ({ value: m, label: m }))}
                placeholder="请选择模型"
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            ) : (
              <Input
                value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                placeholder={editingModel ? '编辑时可直接输入' : '请输入模型名称'}
              />
            )}
          </Form.Item>
          <Form.Item label="显示名称">
            <Input
              value={modelForm.displayName}
              onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
              placeholder="可选，用于友好显示"
            />
          </Form.Item>
          <Form.Item label="模型能力" required>
            <Select
              mode="multiple"
              value={modelForm.capabilities}
              onChange={(values) => setModelForm({ ...modelForm, capabilities: values })}
              options={MODEL_CAPABILITIES}
              placeholder="请选择模型能力"
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Space size={8}>
                <Switch
                  checked={modelForm.isActive}
                  onChange={(checked) => setModelForm({ ...modelForm, isActive: checked })}
                />
                <Text>启用</Text>
              </Space>
              <Space size={8}>
                <Switch
                  checked={modelForm.isDefault}
                  onChange={(checked) => setModelForm({ ...modelForm, isDefault: checked })}
                />
                <Text>设为默认</Text>
              </Space>
            </Space>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setShowModal(null); resetModelForm(); }}>取消</Button>
              <Button type="primary" onClick={handleSubmitModel} loading={loading}>保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
