'use client'

import { useState, useEffect } from 'react'
import { message, Card, Row, Col, Button, Empty, Space, Typography, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined, BookOutlined } from '@ant-design/icons'
import { StatsResponse, IngestResponse } from '@/app/admin/types'
import { post } from '@/app/admin/lib/request'
import { CreateKBModal } from '@/src/components/admin/modals/CreateKBModal'
import { IngestModal } from '@/src/components/admin/modals/IngestModal'

const { Title, Text } = Typography

export default function KBManagePage() {
  const [statsResults, setStatsResults] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [showIngestModal, setShowIngestModal] = useState(false)
  const [selectedKbForIngest, setSelectedKbForIngest] = useState<string>('')
  const [ingestContent, setIngestContent] = useState('')
  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null)
  
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    handleStats()
  }, [])

  const handleStats = async () => {
    setLoading(true)
    try {
      const data = await post<StatsResponse>('/api/kb/stats', {})
      setStatsResults(data)
    } catch (err) {
      msg.error('加载知识库列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleIngest = async () => {
    if (!selectedKbForIngest || !ingestContent) {
      msg.info('请填写知识库名和内容')
      return
    }

    try {
      const data = await post<IngestResponse>('/api/kb/ingest', { kbName: selectedKbForIngest, content: ingestContent })
      setIngestResult(data)
      if (data.success) {
        setIngestContent('')
        handleStats()
        setTimeout(() => {
          setShowIngestModal(false)
          setIngestResult(null)
        }, 2000)
      }
    } catch (err) {
      msg.error('入库失败')
    }
  }

  const handleCreateKB = async () => {
    if (!newKbName.trim()) {
      msg.info('请输入知识库名称')
      return
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(newKbName)) {
      msg.info('名称只能包含字母、数字、中划线和下划线')
      return
    }
    
    try {
      const data = await post<{ success: boolean }>('/api/kb/create', { name: newKbName })
      
      if (data.success) {
        msg.success(`知识库 "${newKbName}" 创建成功`)
        setShowCreateModal(false)
        setNewKbName('')
        handleStats()
      }
    } catch (err) {
      msg.error('创建知识库失败')
    }
  }

  return (
    <>
      {contextHolder}

      <Card
        style={{ marginBottom: 24 }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary">点击知识库卡片进行入库操作</Text>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setNewKbName('')
                setShowCreateModal(true)
              }}
            >
              新增知识库
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleStats}
              loading={loading}
            >
              刷新列表
            </Button>
          </Space>
        </Space>
      </Card>

      {statsResults?.data?.kbNames && statsResults.data.kbNames.length > 0 ? (
        <Row gutter={[16, 16]}>
          {statsResults.data.kbNames.map((kb) => (
            <Col xs={24} sm={12} md={8} lg={6} key={kb.kbName}>
              <Card
                hoverable
                onClick={() => {
                  setSelectedKbForIngest(kb.kbName)
                  setShowIngestModal(true)
                }}
              >
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                  <BookOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                  <Tag color="success">{kb.total} 条</Tag>
                </Space>
                <Title level={5} style={{ marginBottom: 8 }}>{kb.kbName}</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  最后更新: {new Date(kb.lastUpdated).toLocaleString('zh-CN')}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical">
                <Text>暂无知识库</Text>
                <Text type="secondary">点击上方"新增知识库"按钮创建第一个知识库</Text>
              </Space>
            }
          />
        </Card>
      )}

      <CreateKBModal
        show={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setNewKbName('')
        }}
        newKbName={newKbName}
        setNewKbName={setNewKbName}
        loading={loading}
        onCreated={() => {
          setShowCreateModal(false)
          setNewKbName('')
          handleStats()
        }}
      />

      <IngestModal
        show={showIngestModal}
        onClose={() => {
          setShowIngestModal(false)
          setIngestContent('')
          setIngestResult(null)
          handleStats()
        }}
        selectedKb={selectedKbForIngest}
        content={ingestContent}
        setContent={setIngestContent}
        loading={loading}
        result={ingestResult}
        onIngest={handleIngest}
      />
    </>
  )
}