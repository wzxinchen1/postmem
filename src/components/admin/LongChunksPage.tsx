'use client'

import { useState, useCallback } from 'react'
import { message, Card, Table, Button, InputNumber, Space, Typography, Empty, Tag, Modal } from 'antd'
import { SearchOutlined, EyeOutlined, ColumnHeightOutlined } from '@ant-design/icons'
import type { LongChunkItem, LongChunksResponse } from '@/app/admin/types'
import { post } from '@/app/admin/lib/request'
import { KBSelector } from '@/src/components/admin/KBSelector'

const { Title, Text } = Typography

function charLengthColor(len: number, threshold: number): string {
  const ratio = len / threshold
  if (ratio < 2) return 'orange'
  if (ratio < 5) return 'volcano'
  return 'red'
}

export default function LongChunksPage() {
  const [kbId, setKbId] = useState<string | null>(null)
  const [threshold, setThreshold] = useState<number>(1000)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [results, setResults] = useState<LongChunksResponse | null>(null)
  const [viewContent, setViewContent] = useState<string | null>(null)

  const [msg, contextHolder] = message.useMessage()

  const doFetch = useCallback(async (fetchPage: number) => {
    if (!threshold || threshold < 1) {
      msg.info('请输入有效的字符数阈值')
      return
    }

    setLoading(true)
    try {
      const data = await post<LongChunksResponse>('/api/kb/long-chunks', {
        threshold,
        page: fetchPage,
        limit,
        kbId: kbId || undefined,
      })
      setResults(data)
    } catch (err) {
      msg.error('查询失败')
    } finally {
      setLoading(false)
    }
  }, [threshold, limit, kbId, msg])

  const handleSearch = () => {
    setPage(1)
    doFetch(1)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    doFetch(newPage)
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
      sorter: (a: LongChunkItem, b: LongChunkItem) => a.charLength - b.charLength,
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
      render: (name: string | null) => name ? (
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
      width: 80,
      render: (_: unknown, record: LongChunkItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setViewContent(record.content)}
        >
          查看
        </Button>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
      {contextHolder}

      <KBSelector kbId={kbId} setKbId={setKbId} />

      <Card title={<Title level={4} style={{ margin: 0 }}>超长片段查询</Title>}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Text strong>字符数阈值：</Text>
            <InputNumber
              value={threshold}
              onChange={(val) => setThreshold(val ?? 1000)}
              min={1}
              max={100000}
              style={{ width: 160 }}
              addonAfter="字符"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              查询 content 长度超过此值的 memory 片段
            </Text>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
            >
              查询
            </Button>
          </Space>

          {results?.data ? (
            <>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text type="secondary">
                  共 {results.data.total} 条片段超过 {threshold.toLocaleString()} 字符
                </Text>
                <Text type="secondary">
                  当前第 {results.data.page} 页
                </Text>
              </Space>

              <Table<LongChunkItem>
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

      <Modal
        title="内容详情"
        open={!!viewContent}
        onCancel={() => setViewContent(null)}
        footer={[
          <Button key="close" onClick={() => setViewContent(null)}>
            关闭
          </Button>,
        ]}
        width={800}
        styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
      >
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {viewContent}
        </div>
      </Modal>
    </div>
  )
}
