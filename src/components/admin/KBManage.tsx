'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { message, Card, Row, Col, Button, Empty, Space, Typography, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined, BookOutlined, ImportOutlined } from '@ant-design/icons'
import { StatsResponse } from '@/app/admin/types'
import type { IngestProgressEvent } from '@/app/admin/types'
import { get, post, RequestError } from '@/app/admin/lib/request'
import { CreateKBModal } from '@/src/components/admin/modals/CreateKBModal'
import { IngestModal } from '@/src/components/admin/modals/IngestModal'

const { Title, Text } = Typography

export default function KBManagePage() {
  const [statsResults, setStatsResults] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [showIngestModal, setShowIngestModal] = useState(false)
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null)
  const [selectedKbName, setSelectedKbName] = useState('')
  const [ingestContent, setIngestContent] = useState('')
  const [ingestProgress, setIngestProgress] = useState<IngestProgressEvent | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    handleStats()
  }, [])

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  const handleStats = async () => {
    setLoading(true)
    try {
      const data = await get<StatsResponse>('/api/kb/stats')
      setStatsResults(data)
    } catch (err) {
      msg.error('加载知识库列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleIngest = useCallback(async () => {
    if (!selectedKbId || !ingestContent) {
      msg.info('请填写内容')
      return
    }

    setIngestProgress({ type: 'status', message: '正在入库...' })

    try {
      const result = await post<{ count: number; memoryIds: string[]; topicsInvolved?: string[] }>(
        '/api/kb/ingest',
        { kbId: selectedKbId, content: ingestContent }
      )

      setIngestContent('')
      setIngestProgress({ type: 'complete', data: result })
      handleStats()
      setTimeout(() => {
        setShowIngestModal(false)
        setIngestProgress(null)
      }, 2000)
    } catch (err) {
      if (err instanceof RequestError) {
        msg.error(err.message)
      } else {
        msg.error('入库失败')
      }
      setIngestProgress({ type: 'error', message: '入库失败' })
    }
  }, [selectedKbId, ingestContent])

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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
      {contextHolder}

      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary">点击知识库卡片上的入库按钮进行入库操作</Text>
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
            <Col xs={24} sm={12} md={8} lg={6} key={kb.kbId}>
              <Card>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                  <BookOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                  <Tag color="success">{kb.total} 条</Tag>
                </Space>
                <Title level={5} style={{ marginBottom: 4 }}>{kb.kbName}</Title>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  ID: {kb.kbId}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                  最后更新: {new Date(kb.lastUpdated).toLocaleString('zh-CN')}
                </Text>
                <Button
                  type="primary"
                  icon={<ImportOutlined />}
                  block
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedKbId(kb.kbId)
                    setSelectedKbName(kb.kbName)
                    setIngestProgress(null)
                    setShowIngestModal(true)
                  }}
                >
                  入库
                </Button>
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
                <Text type="secondary">点击上方「新增知识库」按钮创建第一个知识库</Text>
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
          if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
          }
          setShowIngestModal(false)
          setIngestContent('')
          setIngestProgress(null)
          handleStats()
        }}
        selectedKb={selectedKbName}
        content={ingestContent}
        setContent={setIngestContent}
        loading={false}
        result={ingestProgress}
        onIngest={handleIngest}
      />
    </div>
  )
}
