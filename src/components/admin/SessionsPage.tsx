'use client'

import { useState, useEffect } from 'react'
import { message, Card, Table, Tag, Space, Typography, Button, Modal, Descriptions, Empty, Select, Popconfirm } from 'antd'
import { ReloadOutlined, DeleteOutlined, EyeOutlined, MessageOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface SessionMessage {
  id: number
  sessionId: number
  role: string
  content: string
  tokens?: number
  metadata: Record<string, unknown>
  createdAt: string
}

interface Session {
  id: number
  kbId?: number
  modelType: string
  modelName: string
  provider: string
  status: string
  error?: string
  metadata: Record<string, unknown>
  createdAt: string
  messages?: SessionMessage[]
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'success',
  failed: 'error',
  pending: 'processing',
}

const MODEL_TYPE_ICONS: Record<string, string> = {
  embedding: '📊',
  chat: '💬',
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filters, setFilters] = useState({
    modelType: undefined as string | undefined,
    status: undefined as string | undefined,
  })
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    pending: 0,
  })

  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    loadSessions()
    loadStats()
  }, [filters])

  const loadSessions = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.modelType) params.append('modelType', filters.modelType)
      if (filters.status) params.append('status', filters.status)

      const res = await fetch(`/api/sessions?${params.toString()}`)
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('加载会话失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        setSessions(data.data.sessions)
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const res = await fetch('/api/sessions/stats')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setStats(data.data)
        }
      }
    } catch (err) {
      throw err
    }
  }

  const handleDelete = async (id: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
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
        loadSessions()
        loadStats()
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleView = async (session: Session) => {
    if (!session.messages || session.messages.length === 0) {
      setLoading(true)
      try {
        const res = await fetch(`/api/sessions/${session.id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            setSelectedSession(data.data.session)
          }
        }
      } catch (err) {
        msg.error('加载会话详情失败')
      } finally {
        setLoading(false)
      }
    } else {
      setSelectedSession(session)
    }
    setShowModal(true)
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '类型',
      dataIndex: 'modelType',
      key: 'modelType',
      width: 100,
      render: (type: string) => (
        <Tag color="blue">
          {MODEL_TYPE_ICONS[type] || '⚡'} {type}
        </Tag>
      ),
    },
    {
      title: '模型',
      dataIndex: 'modelName',
      key: 'modelName',
      width: 200,
      render: (name: string, record: Session) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.metadata?.displayName || name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.provider}</Text>
        </Space>
      ),
    },
    {
      title: '知识库ID',
      dataIndex: 'kbId',
      key: 'kbId',
      width: 100,
      render: (id?: number) => id || <Text type="secondary">-</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status]}>{status}</Tag>
      ),
    },
    {
      title: '消息数',
      key: 'messageCount',
      width: 100,
      render: (_: unknown, record: Session) => (
        <Text>{record.messages?.length || 0}</Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Session) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
          <Popconfirm
            title="确定要删除此会话吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={loading}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Select
              placeholder="模型类型"
              allowClear
              style={{ width: 120 }}
              value={filters.modelType}
              onChange={(value) => setFilters({ ...filters, modelType: value })}
              options={[
                { value: 'embedding', label: 'Embedding' },
                { value: 'chat', label: 'Chat' },
              ]}
            />
            <Select
              placeholder="状态"
              allowClear
              style={{ width: 120 }}
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value })}
              options={[
                { value: 'completed', label: '已完成' },
                { value: 'failed', label: '失败' },
                { value: 'pending', label: '处理中' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => { loadSessions(); loadStats(); }}>
              刷新
            </Button>
          </Space>
          <Space>
            <Tag color="blue">总计: {stats.total}</Tag>
            <Tag color="success">完成: {stats.completed}</Tag>
            <Tag color="error">失败: {stats.failed}</Tag>
            <Tag color="processing">处理中: {stats.pending}</Tag>
          </Space>
        </Space>
      </Card>

      <Card>
        {sessions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical">
                <Text>暂无会话记录</Text>
                <Text type="secondary">调用大模型时会自动记录会话</Text>
              </Space>
            }
          />
        ) : (
          <Table
            columns={columns}
            dataSource={sessions}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        )}
      </Card>

      <Modal
        title={
          <Space>
            <MessageOutlined />
            会话详情
          </Space>
        }
        open={showModal}
        onCancel={() => { setShowModal(false); setSelectedSession(null); }}
        footer={null}
        width={800}
      >
        {selectedSession && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="会话 ID">{selectedSession.id}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_COLORS[selectedSession.status]}>{selectedSession.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模型类型">{selectedSession.modelType}</Descriptions.Item>
              <Descriptions.Item label="模型名称">
                {selectedSession.metadata?.displayName || selectedSession.modelName}
              </Descriptions.Item>
              <Descriptions.Item label="提供商">{selectedSession.provider}</Descriptions.Item>
              <Descriptions.Item label="知识库ID">{selectedSession.kbId || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {new Date(selectedSession.createdAt).toLocaleString('zh-CN')}
              </Descriptions.Item>
              {selectedSession.error && (
                <Descriptions.Item label="错误信息" span={2}>
                  <Text type="danger">{selectedSession.error}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Title level={5}>消息记录</Title>
            {selectedSession.messages && selectedSession.messages.length > 0 ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {selectedSession.messages.map((msg, index) => (
                  <Card key={msg.id} size="small" style={{ background: msg.role === 'user' ? '#f0f2f5' : '#fff' }}>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Space>
                        <Tag color={msg.role === 'user' ? 'blue' : msg.role === 'system' ? 'orange' : 'green'}>
                          {msg.role}
                        </Tag>
                        {msg.tokens && <Text type="secondary" style={{ fontSize: 12 }}>tokens: {msg.tokens}</Text>}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(msg.createdAt).toLocaleTimeString('zh-CN')}
                        </Text>
                      </Space>
                      <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {msg.content.length > 1000 ? msg.content.substring(0, 1000) + '...' : msg.content}
                      </Text>
                    </Space>
                  </Card>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息记录" />
            )}
          </Space>
        )}
      </Modal>
    </>
  )
}
