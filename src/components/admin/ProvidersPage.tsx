'use client'

import { useState, useEffect } from 'react'
import { message, Card, Button, Space, Typography, Tag, Empty, Modal, Form, Input, Select, Switch, Popconfirm, Spin } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'

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
  modelType: string
  config: Record<string, unknown>
  isActive: boolean
  isDefault: boolean
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    vendorId: undefined as number | undefined,
    apiKey: '',
    baseUrl: '',
    isActive: true,
  })
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string; models?: string[] } | null>(null)

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
        if (data.data.vendors.length > 0 && !formData.vendorId) {
          setFormData(prev => ({ ...prev, vendorId: data.data.vendors[0].id }))
        }
      }
    } catch (err) {
      msg.error('网络请求失败')
    }
  }

  const handleValidate = async () => {
    if (!formData.vendorId) {
      msg.info('请选择类型')
      return
    }

    const selectedVendor = vendors.find(v => v.id === formData.vendorId)
    if (!selectedVendor) {
      msg.info('类型不存在')
      return
    }

    if (selectedVendor.chatModelClass === 'ChatOpenAI' && !formData.apiKey) {
      msg.info('OpenAI 需要 API Key')
      return
    }

    if (selectedVendor.chatModelClass === 'ChatAnthropic' && !formData.apiKey) {
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
          vendorId: formData.vendorId,
          apiKey: formData.apiKey || undefined,
          baseUrl: formData.baseUrl,
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
          vendorId: formData.vendorId,
          apiKey: formData.apiKey || undefined,
          baseUrl: formData.baseUrl,
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
      vendorId: provider.vendorId,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
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
                      {provider.vendor?.chatModelClass === 'ChatOpenAI' ? '🤖' : provider.vendor?.chatModelClass === 'ChatAnthropic' ? '🧠' : '⚙️'}
                    </Tag>
                    <Space direction="vertical" size={0}>
                      <Text strong>{provider.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {getVendorLabel(provider.vendorId)} {provider.baseUrl && `· ${provider.baseUrl}`}
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
              value={formData.vendorId}
              onChange={(value) => {
                const selected = vendors.find(v => v.id === value)
                setFormData({ ...formData, vendorId: value, baseUrl: selected?.url || '' })
                setValidationResult(null)
              }}
              options={vendors.map(v => ({ value: v.id, label: v.name }))}
              placeholder="请选择类型"
            />
          </Form.Item>
          <Form.Item label="API Key">
            <Input.Password
              value={formData.apiKey}
              onChange={(e) => { setFormData({ ...formData, apiKey: e.target.value }); setValidationResult(null) }}
              placeholder="可选"
            />
          </Form.Item>
          <Form.Item label="Base URL" required>
            <Input
              value={formData.baseUrl}
              onChange={(e) => { setFormData({ ...formData, baseUrl: e.target.value }); setValidationResult(null) }}
              placeholder={`如：${vendors.find(v => v.id === formData.vendorId)?.url || ''}`}
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
    </div>
  )
}
