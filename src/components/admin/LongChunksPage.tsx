'use client'

import { useState, useCallback } from 'react'
import {
  message as antMessage, Card, Table, Button, InputNumber, Space, Typography,
  Empty, Tag, Modal, Input, Select, Divider, Spin, Alert,
} from 'antd'
import {
  SearchOutlined, EyeOutlined, ColumnHeightOutlined,
  ScissorOutlined, MergeCellsOutlined, ThunderboltOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import type { LongChunkItem, LongChunksResponse, TopicInfo, SplitChunkItem } from '@/app/admin/types'
import { post } from '@/app/admin/lib/request'
import { KBSelector } from '@/src/components/admin/KBSelector'

const { Title, Text } = Typography
const { TextArea } = Input

function charLengthColor(len: number, threshold: number): string {
  const ratio = len / threshold
  if (ratio < 2) return 'orange'
  if (ratio < 5) return 'volcano'
  return 'red'
}

interface EditableChunk {
  key: string
  index: number
  title: string
  content: string
  topicId: string | null
  topicAction: 'existing' | 'create'
  newTopicName: string
  newTopicDescription: string
  suggestLoading: boolean
}

function buildEditableChunk(
  chunk: SplitChunkItem,
  plan: { action: string; topicName?: string; newTopicName?: string },
  existingTopics: TopicInfo[],
): EditableChunk {
  const topicId =
    plan.action === 'select' && plan.topicName
      ? existingTopics.find((t) => t.name === plan.topicName)?.id ?? null
      : null
  return {
    key: `chunk-${chunk.index}`,
    index: chunk.index,
    title: chunk.title,
    content: chunk.content,
    topicId,
    topicAction: plan.action === 'create' ? 'create' : 'existing',
    newTopicName: plan.action === 'create' ? (plan.newTopicName ?? '') : '',
    newTopicDescription: '',
    suggestLoading: false,
  }
}

function ChunkTopicSelect({
  chunk,
  existingTopics,
  onChange,
}: {
  chunk: EditableChunk
  existingTopics: TopicInfo[]
  onChange: (updates: Partial<EditableChunk>) => void
}) {
  const selectOptions = [
    ...existingTopics.map((t) => ({ value: t.id, label: t.name })),
    { value: '__create__', label: '— 新建主题 —' },
  ]

  const selectedValue = chunk.topicAction === 'create' ? '__create__' : chunk.topicId ?? undefined

  return (
    <div>
      <Select
        value={selectedValue}
        onChange={(val) => {
          if (val === '__create__') {
            onChange({ topicAction: 'create', topicId: null })
          } else {
            onChange({ topicAction: 'existing', topicId: val, newTopicName: '', newTopicDescription: '' })
          }
        }}
        style={{ width: '100%' }}
        options={selectOptions}
        placeholder="选择主题"
      />
      {chunk.topicAction === 'create' && (
        <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
          <Input
            size="small"
            placeholder="主题名称（必填，5字以内）"
            value={chunk.newTopicName}
            onChange={(e) => onChange({ newTopicName: e.target.value })}
            maxLength={10}
          />
          <Space size={4}>
            <Input
              size="small"
              placeholder="主题描述（可选）"
              value={chunk.newTopicDescription}
              onChange={(e) => onChange({ newTopicDescription: e.target.value })}
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={chunk.suggestLoading}
              onClick={async () => {
                onChange({ suggestLoading: true })
                try {
                  const res = await post<{ success: boolean; data?: { name: string; description: string } }>(
                    '/api/kb/topic/suggest',
                    { kbId: null, content: chunk.content.slice(0, 2000) },
                  )
                  if (res.success && res.data) {
                    onChange({
                      newTopicName: res.data.name,
                      newTopicDescription: res.data.description,
                      suggestLoading: false,
                    })
                  }
                } catch {
                  antMessage.error('AI 主题建议获取失败')
                } finally {
                  onChange({ suggestLoading: false })
                }
              }}
            >
              AI 辅助
            </Button>
          </Space>
        </Space>
      )}
    </div>
  )
}

export default function LongChunksPage() {
  const [kbId, setKbId] = useState<string | null>(null)
  const [threshold, setThreshold] = useState<number>(1000)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [results, setResults] = useState<LongChunksResponse | null>(null)
  const [viewContent, setViewContent] = useState<string | null>(null)

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [selectedRows, setSelectedRows] = useState<LongChunkItem[]>([])

  const [msg, contextHolder] = antMessage.useMessage()

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
    } catch {
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

  const refreshCurrentPage = () => {
    setSelectedRowKeys([])
    setSelectedRows([])
    doFetch(page)
  }

  /* ---- Split state ---- */
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitMemory, setSplitMemory] = useState<LongChunkItem | null>(null)
  const [splitPreviewLoading, setSplitPreviewLoading] = useState(false)
  const [splitConfirmLoading, setSplitConfirmLoading] = useState(false)
  const [splitExistingTopics, setSplitExistingTopics] = useState<TopicInfo[]>([])
  const [splitChunks, setSplitChunks] = useState<EditableChunk[]>([])

  const openSplitModal = async (record: LongChunkItem) => {
    setSplitMemory(record)
    setSplitOpen(true)
    setSplitPreviewLoading(true)
    setSplitChunks([])
    setSplitExistingTopics([])

    try {
      const res = await post<{
        success: boolean
        data?: { chunks: SplitChunkItem[]; topicSuggestions: { plans: Array<{ index: number; action: string; topicName?: string; newTopicName?: string }> }; existingTopics: TopicInfo[] }
      }>('/api/kb/chunk/split-preview', { memoryId: record.id })

      if (res.success && res.data) {
        const { chunks, topicSuggestions, existingTopics } = res.data
        setSplitExistingTopics(existingTopics)
        setSplitChunks(
          chunks.map((chunk) => {
            const plan = topicSuggestions.plans.find((p) => p.index === chunk.index)
            if (!plan) {
              throw new Error(`AI 未为片段 #${chunk.index} 生成主题规划`)
            }
            return buildEditableChunk(chunk, plan, existingTopics)
          }),
        )
      } else {
        msg.error('获取拆分建议失败')
        setSplitOpen(false)
      }
    } catch {
      msg.error('获取拆分建议失败')
      setSplitOpen(false)
    } finally {
      setSplitPreviewLoading(false)
    }
  }

  const updateChunk = (key: string, updates: Partial<EditableChunk>) => {
    setSplitChunks((prev) => prev.map((c) => (c.key === key ? { ...c, ...updates } : c)))
  }

  const handleSplitConfirm = async () => {
    if (!splitMemory) return

    if (splitChunks.some((c) => !c.title.trim() || !c.content.trim())) {
      msg.warning('每个片段必须包含标题和内容')
      return
    }

    setSplitConfirmLoading(true)
    try {
      const topicIdMap = new Map<string, string>()

      for (const t of splitExistingTopics) {
        topicIdMap.set(t.id, t.id)
      }

      for (const chunk of splitChunks) {
        if (chunk.topicAction === 'create' && chunk.newTopicName.trim()) {
          if (!topicIdMap.has(chunk.newTopicName.trim())) {
            const createRes = await post<{ success: boolean; data?: { id: string } }>(
              '/api/kb/topic/create',
              {
                kbId: splitMemory.kbId,
                name: chunk.newTopicName.trim(),
                description: chunk.newTopicDescription.trim() || undefined,
              },
            )
            if (createRes.success && createRes.data) {
              topicIdMap.set(chunk.newTopicName.trim(), createRes.data.id)
            }
          }
        }
      }

      const chunksPayload = splitChunks.map((c) => ({
        title: c.title.trim(),
        content: c.content.trim(),
        topicId:
          c.topicAction === 'create' && c.newTopicName.trim()
            ? (topicIdMap.get(c.newTopicName.trim()) ?? null)
            : c.topicId,
      }))

      await post('/api/kb/chunk/split-confirm', {
        memoryId: splitMemory.id,
        chunks: chunksPayload,
      })

      msg.success(`已拆分为 ${chunksPayload.length} 个片段`)
      setSplitOpen(false)
      refreshCurrentPage()
    } catch {
      msg.error('拆分失败')
    } finally {
      setSplitConfirmLoading(false)
    }
  }

  /* ---- Merge state ---- */
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergePreviewLoading, setMergePreviewLoading] = useState(false)
  const [mergeConfirmLoading, setMergeConfirmLoading] = useState(false)
  const [mergeTitle, setMergeTitle] = useState('')
  const [mergeContent, setMergeContent] = useState('')
  const [mergeTopicId, setMergeTopicId] = useState<string | null>(null)
  const [mergeTopicAction, setMergeTopicAction] = useState<'existing' | 'create'>('existing')
  const [mergeNewTopicName, setMergeNewTopicName] = useState('')
  const [mergeNewTopicDesc, setMergeNewTopicDesc] = useState('')
  const [mergeSuggestLoading, setMergeSuggestLoading] = useState(false)
  const [mergeExistingTopics, setMergeExistingTopics] = useState<TopicInfo[]>([])

  const openMergeModal = async () => {
    if (selectedRows.length < 2) {
      msg.info('请至少选择 2 个片段来合并')
      return
    }
    setMergeTitle('')
    setMergeContent('')
    setMergeTopicId(null)
    setMergeTopicAction('existing')
    setMergeNewTopicName('')
    setMergeNewTopicDesc('')
    setMergeOpen(true)

    const kbIdVal = selectedRows[0]?.kbId
    if (kbIdVal) {
      try {
        const res = await post<{ success: boolean; data?: { items: Array<{ id: string; name: string; description: string }> } }>(
          '/api/kb/list-topics',
          { kbId: kbIdVal },
        )
        if (res.success && res.data) {
          setMergeExistingTopics(res.data.items)
        }
      } catch {
        msg.error('获取主题列表失败')
      }
    }
  }

  const handleMergePreview = async () => {
    if (selectedRows.length < 2) return
    setMergePreviewLoading(true)
    try {
      const res = await post<{ success: boolean; data?: { mergedTitle: string; mergedContent: string } }>(
        '/api/kb/chunk/merge-preview',
        { memoryIds: selectedRows.map((r) => r.id) },
      )
      if (res.success && res.data) {
        setMergeTitle(res.data.mergedTitle)
        setMergeContent(res.data.mergedContent)
      } else {
        msg.error('获取合并建议失败')
      }
    } catch {
      msg.error('获取合并建议失败')
    } finally {
      setMergePreviewLoading(false)
    }
  }

  const handleMergeConfirm = async () => {
    if (!mergeTitle.trim() || !mergeContent.trim()) {
      msg.warning('合并后的标题和内容不能为空')
      return
    }

    setMergeConfirmLoading(true)
    try {
      let finalTopicId = mergeTopicId

      if (mergeTopicAction === 'create' && mergeNewTopicName.trim()) {
        const kbIdVal = selectedRows[0]?.kbId
        if (kbIdVal) {
          const createRes = await post<{ success: boolean; data?: { id: string } }>(
            '/api/kb/topic/create',
            { kbId: kbIdVal, name: mergeNewTopicName.trim(), description: mergeNewTopicDesc.trim() || undefined },
          )
          if (createRes.success && createRes.data) {
            finalTopicId = createRes.data.id
          }
        }
      }

      await post('/api/kb/chunk/merge-confirm', {
        memoryIds: selectedRows.map((r) => r.id),
        merged: {
          title: mergeTitle.trim(),
          content: mergeContent.trim(),
          topicId: finalTopicId,
        },
      })

      msg.success('合并成功')
      setMergeOpen(false)
      refreshCurrentPage()
    } catch {
      msg.error('合并失败')
    } finally {
      setMergeConfirmLoading(false)
    }
  }

  /* ---- Columns ---- */
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
      width: 130,
      render: (_: unknown, record: LongChunkItem) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewContent(record.content)}
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
        </Space>
      ),
    },
  ]

  /* ---- Merge topic selector ---- */
  const mergeTopicOptions = [
    ...(mergeExistingTopics.length > 0
      ? mergeExistingTopics.map((t) => ({ value: t.id, label: t.name }))
      : []),
    { value: '__create__', label: '— 新建主题 —' },
  ]

  const renderMergeTopicSelect = () => (
    <div>
      <Select
        value={mergeTopicAction === 'create' ? '__create__' : mergeTopicId ?? undefined}
        onChange={(val) => {
          if (val === '__create__') {
            setMergeTopicAction('create')
            setMergeTopicId(null)
          } else {
            setMergeTopicAction('existing')
            setMergeTopicId(val)
            setMergeNewTopicName('')
            setMergeNewTopicDesc('')
          }
        }}
        style={{ width: '100%' }}
        options={mergeTopicOptions}
        placeholder="选择主题（可选）"
        allowClear
      />
      {mergeTopicAction === 'create' && (
        <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
          <Input
            size="small"
            placeholder="主题名称（必填，5字以内）"
            value={mergeNewTopicName}
            onChange={(e) => setMergeNewTopicName(e.target.value)}
            maxLength={10}
          />
          <Space size={4}>
            <Input
              size="small"
              placeholder="主题描述（可选）"
              value={mergeNewTopicDesc}
              onChange={(e) => setMergeNewTopicDesc(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={mergeSuggestLoading}
              onClick={async () => {
                setMergeSuggestLoading(true)
                try {
                  const sampleContent = mergeContent.slice(0, 2000)
                  const res = await post<{ success: boolean; data?: { name: string; description: string } }>(
                    '/api/kb/topic/suggest',
                    { kbId: null, content: sampleContent },
                  )
                  if (res.success && res.data) {
                    setMergeNewTopicName(res.data.name)
                    setMergeNewTopicDesc(res.data.description)
                  }
                } catch {
                  msg.error('AI 主题建议获取失败')
                } finally {
                  setMergeSuggestLoading(false)
                }
              }}
            >
              AI 辅助
            </Button>
          </Space>
        </Space>
      )}
    </div>
  )

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
              onChange={(val) => setThreshold(val ?? 0)}
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
                  {selectedRowKeys.length >= 2 && (
                    <Button
                      type="primary"
                      icon={<MergeCellsOutlined />}
                      onClick={openMergeModal}
                    >
                      合并所选（{selectedRowKeys.length}）
                    </Button>
                  )}
                  {selectedRowKeys.length > 0 && (
                    <Button
                      icon={<DeleteOutlined />}
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

              <Table<LongChunkItem>
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

      {/* 内容详情弹窗 */}
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

      {/* 拆分弹窗 */}
      <Modal
        title={
          <Space>
            <ScissorOutlined />
            拆分片段
            {splitMemory && (
              <Text type="secondary" style={{ fontWeight: 400, fontSize: 14 }}>
                （{splitMemory.title} · {splitMemory.charLength.toLocaleString()} 字符）
              </Text>
            )}
          </Space>
        }
        open={splitOpen}
        onCancel={() => !splitConfirmLoading && setSplitOpen(false)}
        width={900}
        confirmLoading={splitConfirmLoading}
        onOk={handleSplitConfirm}
        okText="确认拆分"
        okButtonProps={{ disabled: splitPreviewLoading }}
      >
        {splitPreviewLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#999' }}>
              AI 正在分析文本并生成拆分建议...
            </div>
          </div>
        ) : (
          <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {splitMemory && (
              <Alert
                type="info"
                showIcon
                message={
                  <Space>
                    <Text strong>原文长度：</Text>
                    <Text>{splitMemory.charLength.toLocaleString()} 字符</Text>
                    <Text strong style={{ marginLeft: 16 }}>建议拆分为：</Text>
                    <Text>{splitChunks.length} 个片段</Text>
                  </Space>
                }
                style={{ marginBottom: 16 }}
              />
            )}
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {splitChunks.map((chunk, idx) => (
                <Card
                  key={chunk.key}
                  size="small"
                  title={
                    <Space>
                      <Tag color="blue">片段 {idx + 1}</Tag>
                      <Text style={{ fontWeight: 400 }}>
                        ~{chunk.content.length.toLocaleString()} 字符
                      </Text>
                    </Space>
                  }
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <div>
                      <Text strong style={{ fontSize: 12 }}>标题：</Text>
                      <Input
                        size="small"
                        value={chunk.title}
                        onChange={(e) => updateChunk(chunk.key, { title: e.target.value })}
                        maxLength={20}
                      />
                    </div>
                    <div>
                      <Text strong style={{ fontSize: 12 }}>内容：</Text>
                      <TextArea
                        size="small"
                        rows={4}
                        value={chunk.content}
                        onChange={(e) => updateChunk(chunk.key, { content: e.target.value })}
                      />
                    </div>
                    <div>
                      <Text strong style={{ fontSize: 12 }}>归属主题：</Text>
                      <ChunkTopicSelect
                        chunk={chunk}
                        existingTopics={splitExistingTopics}
                        onChange={(updates) => updateChunk(chunk.key, updates)}
                      />
                    </div>
                  </Space>
                </Card>
              ))}
            </Space>
          </div>
        )}
      </Modal>

      {/* 合并弹窗 */}
      <Modal
        title={
          <Space>
            <MergeCellsOutlined />
            合并片段
            <Text type="secondary" style={{ fontWeight: 400, fontSize: 14 }}>
              （已选 {selectedRows.length} 个片段）
            </Text>
          </Space>
        }
        open={mergeOpen}
        onCancel={() => !mergeConfirmLoading && setMergeOpen(false)}
        width={900}
        footer={
          <Space>
            <Button onClick={() => setMergeOpen(false)}>取消</Button>
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleMergePreview}
              loading={mergePreviewLoading}
            >
              AI 合并建议
            </Button>
            <Button
              type="primary"
              onClick={handleMergeConfirm}
              loading={mergeConfirmLoading}
              disabled={!mergeTitle.trim() || !mergeContent.trim()}
            >
              确认合并
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* 已选片段列表 */}
          <Card size="small" title="待合并的片段">
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {selectedRows.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag>{i + 1}</Tag>
                  <Text ellipsis style={{ maxWidth: 200 }}>{r.title}</Text>
                  <Tag color="default" style={{ flexShrink: 0 }}>{r.charLength.toLocaleString()} 字符</Tag>
                </div>
              ))}
            </Space>
          </Card>

          {/* 合并结果 */}
          <div>
            <Text strong>合并后标题：</Text>
            <Input
              value={mergeTitle}
              onChange={(e) => setMergeTitle(e.target.value)}
              placeholder="点击「AI 合并建议」生成或手动输入"
              maxLength={20}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>合并后内容：</Text>
            <TextArea
              rows={8}
              value={mergeContent}
              onChange={(e) => setMergeContent(e.target.value)}
              placeholder="点击「AI 合并建议」生成或手动输入"
              style={{ marginTop: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前 {mergeContent.length.toLocaleString()} 字符
            </Text>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          <div>
            <Text strong>归属主题：</Text>
            {renderMergeTopicSelect()}
          </div>
        </Space>
      </Modal>
    </div>
  )
}
