'use client'

import { useState, useEffect } from 'react'
import { message, Card, Table, Button, Space, Typography, Empty, Tag, Modal } from 'antd'
import {
  SearchOutlined, ScissorOutlined, MergeCellsOutlined,
  TagOutlined, DeleteOutlined, PlusOutlined, CheckOutlined,
} from '@ant-design/icons'
import { get, post } from '@/app/admin/lib/request'
import type { ChunkItem, ChunksResponse } from '@/app/admin/types'
import type { CartItem } from './types'
import { SplitModal } from './SplitModal'

const { Text } = Typography

interface TopicChunksTabProps {
  kbId: string | null
  topicId: string | null
  onMerge: (rows: ChunkItem[]) => void
  onReassign: (rows: ChunkItem[]) => void
  onViewContent: (content: string) => void
  onAddToCart: (item: CartItem) => void
  isInCart: (id: string) => boolean
  refreshKey: number
}

export function TopicChunksTab({ kbId, topicId, onMerge, onReassign, onViewContent, onAddToCart, isInCart, refreshKey }: TopicChunksTabProps) {
  const [msg, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [results, setResults] = useState<ChunksResponse | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [selectedRows, setSelectedRows] = useState<ChunkItem[]>([])

  const [splitOpen, setSplitOpen] = useState(false)
  const [splitMemory, setSplitMemory] = useState<ChunkItem | null>(null)

  useEffect(() => {
    setSelectedRowKeys([])
    setSelectedRows([])
    setPage(1)
    if (kbId !== null && topicId !== null) {
      doFetch(1)
    } else {
      setResults(null)
    }
  }, [kbId, topicId, refreshKey])

  const doFetch = async (fetchPage: number) => {
    if (kbId === null || topicId === null) return
    setLoading(true)
    try {
      const queryParts: string[] = [
        `threshold=1`,
        `topicIds=${encodeURIComponent(topicId)}`,
        `kbId=${encodeURIComponent(kbId)}`,
        `page=${fetchPage}`,
        `limit=${limit}`,
      ]
      const data = await get<ChunksResponse>(`/api/kb/chunks?${queryParts.join('&')}`)
      setResults(data)
    } catch {
      msg.error('加载片段列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    doFetch(newPage)
  }

  const refreshCurrentPage = () => {
    setSelectedRowKeys([])
    setSelectedRows([])
    doFetch(page)
  }

  const handleDelete = (record: ChunkItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除片段「${record.title}」吗？（${record.charLength.toLocaleString()} 字符）此操作不可撤销。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await post('/api/kb/chunk/delete', { memoryId: record.id })
          msg.success('已删除')
          refreshCurrentPage()
        } catch {
          msg.error('删除失败')
        }
      },
    })
  }

  const handleBatchDelete = () => {
    const count = selectedRows.length
    if (count === 0) return
    Modal.confirm({
      title: '批量删除确认',
      content: `确定要删除选中的 ${count} 个片段吗？此操作不可撤销。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await post('/api/kb/chunk/batch-delete', { memoryIds: selectedRows.map(r => r.id) })
          msg.success(`已删除 ${count} 个片段`)
          refreshCurrentPage()
        } catch {
          msg.error('批量删除失败')
        }
      },
    })
  }

  const openSplitModal = (record: ChunkItem) => {
    setSplitMemory(record)
    setSplitOpen(true)
  }

  const columns = [
    {
      title: '片段标题',
      dataIndex: 'title',
      key: 'title',
      width: 180,
      ellipsis: true,
    },
    {
      title: '字符数',
      dataIndex: 'charLength',
      key: 'charLength',
      width: 100,
      sorter: (a: ChunkItem, b: ChunkItem) => a.charLength - b.charLength,
      defaultSortOrder: 'descend' as const,
      render: (len: number) => (
        <Tag>{len.toLocaleString()}</Tag>
      ),
    },
    {
      title: '内容预览',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      width: 400,
      render: (content: string) => (
        <Text ellipsis={{ tooltip: false }} style={{ maxWidth: 380, display: 'block' }}>
          {content}
        </Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: ChunkItem) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<SearchOutlined />}
            onClick={() => onViewContent(record.content)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ScissorOutlined />}
            onClick={() => openSplitModal(record)}
          >
            拆分
          </Button>
          <Button
            type="link"
            size="small"
            icon={isInCart(record.id) ? <CheckOutlined /> : <PlusOutlined />}
            disabled={isInCart(record.id)}
            onClick={() => onAddToCart(record)}
          >
            {isInCart(record.id) ? '已加入' : '待合并'}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      <Card title="按主题浏览">
        {topicId !== null ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {results !== undefined && results !== null && results.data !== undefined ? (
              <>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <Text type="secondary">
                      共 {results.data.total} 条片段
                    </Text>
                    {selectedRowKeys.length > 0 && (
                      <Text strong>已选 {selectedRowKeys.length} 项</Text>
                    )}
                  </Space>
                  <Space>
                    {selectedRowKeys.length > 0 && (
                      <Button
                        icon={<TagOutlined />}
                        onClick={() => onReassign(selectedRows)}
                      >
                        批量移分类
                      </Button>
                    )}
                    {selectedRowKeys.length >= 2 && (
                      <Button
                        type="primary"
                        icon={<MergeCellsOutlined />}
                        onClick={() => onMerge(selectedRows)}
                      >
                        合并所选（{selectedRowKeys.length}）
                      </Button>
                    )}
                    {selectedRowKeys.length > 0 && (
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleBatchDelete}
                      >
                        批量删除（{selectedRowKeys.length}）
                      </Button>
                    )}
                    {selectedRowKeys.length > 0 && (
                      <Button
                        onClick={() => {
                          setSelectedRowKeys([])
                          setSelectedRows([])
                        }}
                      >
                        取消选择
                      </Button>
                    )}
                    <Text type="secondary">
                      当前第 {results.data.page} 页
                    </Text>
                  </Space>
                </Space>

                <Table<ChunkItem>
                  rowSelection={{
                    selectedRowKeys,
                    onChange: (keys, rows) => {
                      setSelectedRowKeys(keys as string[])
                      setSelectedRows(rows)
                    },
                  }}
                  columns={columns}
                  dataSource={results.data.items}
                  rowKey="id"
                  loading={loading}
                  pagination={{
                    current: results.data.page,
                    pageSize: results.data.limit,
                    total: results.data.total,
                    onChange: handlePageChange,
                    showSizeChanger: false,
                  }}
                  locale={{
                    emptyText: (
                      <Empty
                        description={
                          <Text type="secondary">
                            该主题下没有片段
                          </Text>
                        }
                      />
                    ),
                  }}
                />
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Text type="secondary">加载中...</Text>
              </div>
            )}
          </Space>
        ) : (
          <Empty
            description={
              <Text type="secondary">
                请点击左侧主题旁的 <TagOutlined /> 按钮查看该主题的片段列表
              </Text>
            }
          />
        )}
      </Card>

      {splitMemory !== null && (
        <SplitModal
          open={splitOpen}
          memory={splitMemory}
          onClose={() => {
            setSplitOpen(false)
            setSplitMemory(null)
          }}
          onSuccess={refreshCurrentPage}
        />
      )}
    </>
  )
}
