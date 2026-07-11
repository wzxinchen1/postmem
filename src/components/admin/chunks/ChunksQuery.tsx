'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { message, Card, Table, Button, InputNumber, Select, Space, Typography, Empty, Tag, Modal } from 'antd'
import {
  SearchOutlined, ColumnHeightOutlined, ScissorOutlined,
  MergeCellsOutlined, TagOutlined, DeleteOutlined, PlusOutlined, CheckOutlined,
} from '@ant-design/icons'
import { get, post } from '@/app/admin/lib/request'
import type { ChunkItem, ChunksResponse, TopicInfo } from '@/app/admin/types'
import type { CartItem } from './types'
import { SplitModal } from './SplitModal'

const { Text } = Typography

function charLengthColor(len: number, threshold: number): string {
  const ratio = len / threshold
  if (ratio < 2) return 'orange'
  if (ratio < 5) return 'volcano'
  return 'red'
}

interface ChunksQueryProps {
  kbId: string | null
  topicList: TopicInfo[]
  onMerge: (rows: ChunkItem[]) => void
  onReassign: (rows: ChunkItem[]) => void
  onViewContent: (content: string) => void
  onAddToCart: (item: CartItem) => void
  isInCart: (id: string) => boolean
  refreshKey: number
}

export function ChunksQuery({ kbId, topicList, onMerge, onReassign, onViewContent, onAddToCart, isInCart, refreshKey }: ChunksQueryProps) {
  const [msg, contextHolder] = message.useMessage()
  const [threshold, setThreshold] = useState<number>(1000)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [results, setResults] = useState<ChunksResponse | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [selectedRows, setSelectedRows] = useState<ChunkItem[]>([])
  const [filterTopicIds, setFilterTopicIds] = useState<string[]>([])

  /* ---- split modal state ---- */
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitMemory, setSplitMemory] = useState<ChunkItem | null>(null)

  /* ---- refresh tracking ---- */
  const hasSearched = useRef(false)
  const prevRefreshKey = useRef(refreshKey)

  useEffect(() => {
    if (hasSearched.current && refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey
      doFetch(page)
    }
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const doFetch = useCallback(async (fetchPage: number) => {
    if (!threshold || threshold < 1) {
      msg.info('请输入有效的字符数阈值')
      return
    }

    setLoading(true)
    try {
      const lcQueryParts: string[] = [
        `threshold=${threshold}`,
        `page=${fetchPage}`,
        `limit=${limit}`,
      ]
      if (kbId !== null) {
        lcQueryParts.push(`kbId=${encodeURIComponent(kbId)}`)
      }
      if (filterTopicIds && filterTopicIds.length > 0) {
        lcQueryParts.push(`topicIds=${encodeURIComponent(filterTopicIds.join(','))}`)
      }
      const data = await get<ChunksResponse>(`/api/kb/chunks?${lcQueryParts.join('&')}`)
      setResults(data)
    } catch {
      msg.error('查询失败')
    } finally {
      setLoading(false)
    }
  }, [threshold, limit, kbId, filterTopicIds, msg])

  const handleSearch = () => {
    hasSearched.current = true
    setPage(1)
    doFetch(1)
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
        <Tag color={charLengthColor(len, threshold)}>
          <Space size={4}>
            <ColumnHeightOutlined />
            {len.toLocaleString()}
          </Space>
        </Tag>
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
      title: '所属主题',
      dataIndex: 'topicName',
      key: 'topicName',
      width: 120,
      render: (name: string | null) => name !== null ? (
        <Tag>{name}</Tag>
      ) : (
        <Text type="secondary">无主题</Text>
      ),
    },
    {
      title: '知识库',
      dataIndex: 'kbName',
      key: 'kbName',
      width: 120,
      ellipsis: true,
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
      width: 200,
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
      <Card title="超长片段查询">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Text strong>字符数阈值：</Text>
            <InputNumber
              value={threshold}
              onChange={(val) => setThreshold(val ?? 0)}
              min={1}
              max={100000}
              style={{ width: 160 }}
              addonAfter="字符"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              查询 content 长度超过此值的 memory 片段
            </Text>
            <Select
              mode="multiple"
              value={filterTopicIds}
              onChange={setFilterTopicIds}
              placeholder="筛选分类（可选）"
              style={{ minWidth: 200 }}
              options={topicList.map(t => ({ value: t.id, label: t.name }))}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
            >
              查询
            </Button>
          </Space>

          {results?.data !== undefined ? (
            <>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Text type="secondary">
                    共 {results.data.total} 条片段超过 {threshold.toLocaleString()} 字符
                  </Text>
                  {selectedRowKeys.length > 0 && (
                    <Text strong>
                      已选 {selectedRowKeys.length} 项
                    </Text>
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
                    setSelectedRowKeys(keys)
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
                          没有找到超过 {threshold.toLocaleString()} 字符的片段
                        </Text>
                      }
                    />
                  ),
                }}
              />
            </>
          ) : (
            <Empty
              description={
                <Text type="secondary">
                  设置字符数阈值后点击「查询」按钮
                </Text>
              }
            />
          )}
        </Space>
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
