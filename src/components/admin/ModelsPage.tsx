'use client'

import { useState, useEffect } from 'react'
import { message, Card, Button, Space, Typography, Tag, Empty, Modal, Form, Input, Select, Switch, Popconfirm, Spin } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, StarOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface Provider {
  id: number
  name: string
  type: string
  apiKey?: string
  baseUrl?: string
  isActive: boolean
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
  provider?: Provider
}

const MODEL_CAPABILITIES = [
  { value: 'chat', label: '对话' },
  { value: 'reasoning', label: '思考' },
  { value: 'embedding', label: '嵌入' },
  { value: 'vision', label: '视觉' },
]

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingModel, setEditingModel] = useState<Model | null>(null)
  const [formData, setFormData] = useState({
    providerId: '',
    name: '',
    displayName: '',
    capabilities: ['chat'] as string[],
    isActive: true,
    isDefault: false,
  })
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)

  const [msg, contextHolder] = message.useMessage()
  const [form] = Form.useForm()

  useEffect(() => {
    loadProviders()
    loadModels()
  }, [])

  const loadProviders = async () => {
    try {
      const res = await fetch('/api/providers')
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
        if (data.data.providers.length === 0) {
          msg.warning('请先创建提供商后再添加模型')
        }
      }
    } catch (err) {
      msg.error('网络请求失败')
    }
  }

  const fetchAvailableModels = async (providerId: number) => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider) return

    setFetchingModels(true)
    setAvailableModels([])

    try {
      const res = await fetch('/api/providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: provider.type,
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

  const loadModels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/models?includeInactive=true')
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('加载模型失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        setModels(data.data.models)
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
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
          capabilities: formData.capabilities,
          isActive: formData.isActive,
          isDefault: formData.isDefault,
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
        setShowModal(false)
        resetForm()
        loadModels()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
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
        loadModels()
      }
    } catch (err) {
      msg.error('网络请求失败')
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
      capabilities: model.capabilities,
      isActive: model.isActive,
      isDefault: model.isDefault,
    })
    fetchAvailableModels(model.providerId)
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
        loadModels()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      providerId: providers.length > 0 ? providers[0].id.toString() : '',
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

  const getProviderName = (providerId: number) => {
    return providers.find(p => p.id === providerId)?.name || '未知'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
      {contextHolder}

      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary">共 {models.length} 个模型</Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { resetForm(); setShowModal(true); }}
            disabled={providers.length === 0}
          >
            新增模型
          </Button>
        </Space>
      </Card>

      <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
        {models.length === 0 ? (
          <Card>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical">
                  <Text>暂无模型</Text>
                  <Text type="secondary">点击上方"新增模型"按钮创建</Text>
                </Space>
              }
            />
          </Card>
        ) : (
          models.map(model => (
            <Card key={model.id}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Tag color="blue">{model.capabilities.includes('reasoning') ? '🧠' : model.capabilities.includes('vision') ? '👁️' : model.capabilities.includes('embedding') ? '📊' : '💬'}</Tag>
                  <Space direction="vertical" size={0}>
                    <Space>
                      <Text strong>{model.displayName || model.name}</Text>
                      {model.isDefault && <Tag color="blue">默认</Tag>}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {model.name} · {getProviderName(model.providerId)} · {getCapabilityLabels(model.capabilities)}
                    </Text>
                  </Space>
                </Space>
                <Space>
                  <Tag color={model.isActive ? 'success' : 'error'}>
                    {model.isActive ? '启用' : '禁用'}
                  </Tag>
                  {!model.isDefault && (
                    <Button size="small" onClick={() => handleSetDefault(model)}>
                      <StarOutlined /> 设为默认
                    </Button>
                  )}
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(model)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="确定要删除此模型吗？"
                    onConfirm={() => handleDelete(model.id)}
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
          ))
        )}
      </Space>

      <Modal
        title={editingModel ? '编辑模型' : '新增模型'}
        open={showModal}
        onCancel={() => { setShowModal(false); resetForm(); }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={formData}
        >
          <Form.Item label="提供商" required>
            <Select
              value={formData.providerId}
              onChange={(value) => {
                setFormData({ ...formData, providerId: value, name: '' })
                fetchAvailableModels(Number(value))
              }}
              options={providers.map(p => ({ value: p.id.toString(), label: p.name }))}
            />
          </Form.Item>
          <Form.Item label="模型名称" required>
            {fetchingModels ? (
              <Spin size="small" style={{ marginRight: 8 }} />
            ) : availableModels.length > 0 ? (
              <Select
                value={formData.name}
                onChange={(value) => setFormData({ ...formData, name: value })}
                options={availableModels.map(m => ({ value: m, label: m }))}
                placeholder="请选择模型"
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            ) : (
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={editingModel ? '编辑时可直接输入' : '请先选择提供商'}
                disabled={!editingModel && !formData.providerId}
              />
            )}
          </Form.Item>
          <Form.Item label="显示名称">
            <Input
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="可选，用于友好显示"
            />
          </Form.Item>
          <Form.Item label="模型能力" required>
            <Select
              mode="multiple"
              value={formData.capabilities}
              onChange={(values) => setFormData({ ...formData, capabilities: values })}
              options={MODEL_CAPABILITIES}
              placeholder="请选择模型能力"
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Switch
                checked={formData.isActive}
                onChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Text>启用</Text>
              <Switch
                checked={formData.isDefault}
                onChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
              <Text>设为默认</Text>
            </Space>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setShowModal(false); resetForm(); }}>取消</Button>
              <Button type="primary" onClick={handleSubmit} loading={loading}>保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}