'use client'

import { useState, useEffect } from 'react'
import { message, Card, Button, Space, Typography, Tag, Empty, Modal, Form, Input, Select, Switch, Popconfirm, Spin } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

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

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'local', label: '本地模型' },
  { value: 'custom', label: '自定义' },
]

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'openai',
    apiKey: '',
    baseUrl: '',
    isActive: true,
  })
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null)

  const [msg, contextHolder] = message.useMessage()
  const [form] = Form.useForm()

  useEffect(() => {
    loadProviders()
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

  const handleValidate = async () => {
    if (!formData.type) {
      msg.info('请选择提供商类型')
      return
    }

    if (formData.type === 'openai' && !formData.apiKey) {
      msg.info('OpenAI 需要 API Key')
      return
    }

    if (formData.type === 'anthropic' && !formData.apiKey) {
      msg.info('Anthropic 需要 API Key')
      return
    }

    if (formData.type === 'custom' && !formData.baseUrl) {
      msg.info('自定义提供商需要 Base URL')
      return
    }

    setValidating(true)
    setValidationResult(null)

    try {
      const res = await fetch('/api/providers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          apiKey: formData.apiKey || undefined,
          baseUrl: formData.baseUrl || undefined,
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
        setValidationResult({ valid: true })
        msg.success('验证成功')
      }
    } catch (err) {
      setValidationResult({ valid: false, error: '网络请求失败' })
    } finally {
      setValidating(false)
    }
  }

  const handleSubmit = async () => {
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
          name: formData.name,
          type: formData.type,
          apiKey: formData.apiKey || undefined,
          baseUrl: formData.baseUrl || undefined,
          isActive: formData.isActive,
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
        setShowModal(false)
        resetForm()
        loadProviders()
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

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider)
    setFormData({
      name: provider.name,
      type: provider.type,
      apiKey: provider.apiKey || '',
      baseUrl: provider.baseUrl || '',
      isActive: provider.isActive,
    })
    setValidationResult({ valid: true })
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
    setValidationResult(null)
    form.resetFields()
  }

  const getProviderTypeLabel = (type: string) => {
    return PROVIDER_TYPES.find(t => t.value === type)?.label || type
  }

  return (
    <>
      {contextHolder}

      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary">共 {providers.length} 个提供商</Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { resetForm(); setShowModal(true); }}
          >
            新增提供商
          </Button>
        </Space>
      </Card>

      <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
        {providers.length === 0 ? (
          <Card>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical">
                  <Text>暂无提供商</Text>
                  <Text type="secondary">点击上方"新增提供商"按钮创建</Text>
                </Space>
              }
            />
          </Card>
        ) : (
          providers.map(provider => (
            <Card key={provider.id}>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <Tag color="blue">
                      {provider.type === 'openai' ? '🤖' : provider.type === 'anthropic' ? '🧠' : provider.type === 'local' ? '💻' : '⚙️'}
                    </Tag>
                    <Space direction="vertical" size={0}>
                      <Text strong>{provider.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {getProviderTypeLabel(provider.type)} {provider.baseUrl && `· ${provider.baseUrl}`}
                      </Text>
                    </Space>
                  </Space>
                  <Space>
                    <Tag color={provider.isActive ? 'success' : 'error'}>
                      {provider.isActive ? '启用' : '禁用'}
                    </Tag>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(provider)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确定要删除此提供商吗？相关的模型也会被删除。"
                      onConfirm={() => handleDelete(provider.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} loading={loading}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </Space>
                
                {provider.models && provider.models.length > 0 && (
                  <Card size="small" style={{ background: '#fafafa' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>关联模型 ({provider.models.length})</Text>
                    <Space style={{ marginTop: 8 }}>
                      {provider.models.map(model => (
                        <Tag key={model.id}>
                          {model.displayName || model.name}
                          {model.isDefault && <span style={{ marginLeft: 4 }}>★</span>}
                        </Tag>
                      ))}
                    </Space>
                  </Card>
                )}
              </Space>
            </Card>
          ))
        )}
      </Space>

      <Modal
        title={editingProvider ? '编辑提供商' : '新增提供商'}
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
          <Form.Item label="名称" required>
            <Input
              value={formData.name}
              onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setValidationResult(null) }}
            />
          </Form.Item>
          <Form.Item label="类型" required>
            <Select
              value={formData.type}
              onChange={(value) => { setFormData({ ...formData, type: value }); setValidationResult(null) }}
              options={PROVIDER_TYPES}
            />
          </Form.Item>
          <Form.Item label="API Key" required={formData.type === 'openai' || formData.type === 'anthropic'}>
            <Input.Password
              value={formData.apiKey}
              onChange={(e) => { setFormData({ ...formData, apiKey: e.target.value }); setValidationResult(null) }}
              placeholder={formData.type === 'openai' || formData.type === 'anthropic' ? '必填' : '可选'}
            />
          </Form.Item>
          <Form.Item label="Base URL" required={formData.type === 'custom'}>
            <Input
              value={formData.baseUrl}
              onChange={(e) => { setFormData({ ...formData, baseUrl: e.target.value }); setValidationResult(null) }}
              placeholder={formData.type === 'custom' ? '必填，如：http://localhost:8000' : '可选，用于自定义端点'}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Switch
                checked={formData.isActive}
                onChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Text>启用此提供商</Text>
            </Space>
          </Form.Item>
          
          {validationResult && (
            <Form.Item>
              <Space>
                {validationResult.valid ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                )}
                <Text type={validationResult.valid ? 'success' : 'danger'}>
                  {validationResult.valid ? '验证成功' : validationResult.error}
                </Text>
              </Space>
            </Form.Item>
          )}

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button 
                icon={validating ? <Spin size="small" /> : undefined}
                onClick={handleValidate} 
                loading={validating}
                disabled={validating}
              >
                {validating ? '验证中...' : '验证配置'}
              </Button>
              <Space>
                <Button onClick={() => { setShowModal(false); resetForm(); }}>取消</Button>
                <Button type="primary" onClick={handleSubmit} loading={loading} disabled={!validationResult?.valid}>保存</Button>
              </Space>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}