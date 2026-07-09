'use client'

import { useState } from 'react'
import { message, Modal, Card, Button, InputNumber, Space, Typography, Empty, Checkbox, Tag } from 'antd'
import { SearchOutlined, MergeCellsOutlined, TagOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, CheckOutlined } from '@ant-design/icons'
import { post } from '@/app/admin/lib/request'
import type { ChunkItem, DuplicateDetectResponse, DuplicateGroup } from '@/app/admin/types'
import type { CartItem } from './types'

const { Text } = Typography

interface DuplicateDetectProps {
  kbId: string | null
  onMerge: (rows: ChunkItem[]) => void
  onReassign: (rows: ChunkItem[]) => void
  onViewContent: (content: string) => void
  onAddToCart: (item: CartItem) => void
  isInCart: (id: string) => boolean
}

export function DuplicateDetect({ kbId, onMerge, onReassign, onViewContent, onAddToCart, isInCart }: DuplicateDetectProps) {
  const [msg, contextHolder] = message.useMessage()
  const [threshold, setThreshold] = useState<number>(0.95)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DuplicateDetectResponse['data'] | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleDetect = async () => {
    if (kbId === null) {
      msg.warning('请先选择知识库')
      return
    }
    setLoading(true)
    setResults(null)
    try {
      const res = await post<DuplicateDetectResponse>('/api/kb/chunk/duplicate-detect', {
        kbId,
        threshold,
        limit: 100,
      })
      if (res.success && res.data !== undefined) {
        setResults(res.data)
        const allIds = new Set<string>()
        for (const g of res.data.groups) {
          for (const item of g.items) {
            allIds.add(item.id)
          }
        }
        setSelectedIds(allIds)
        if (res.data.groups.length === 0) {
          msg.info('未发现重复片段')
        }
      }
    } catch {
      msg.error('重复检测失败')
    } finally {
      setLoading(false)
    }
  }

  const groupToRows = (group: DuplicateGroup): ChunkItem[] => {
    return group.items
      .filter((item) => selectedIds.has(item.id))
      .map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        charLength: item.charLength,
        topicId: item.topicId,
        topicName: item.topicName,
        kbId: item.kbId,
        kbName: item.kbName,
        createdAt: '',
      }))
  }

  const getSelectedCountInGroup = (group: DuplicateGroup): number => {
    return group.items.filter((item) => selectedIds.has(item.id)).length
  }

  const getTargetIds = (group: DuplicateGroup): string[] => {
    return group.items.filter((item) => selectedIds.has(item.id)).map((r) => r.id)
  }

  const handleGroupMerge = (group: DuplicateGroup) => {
    const rows = groupToRows(group)
    if (rows.length < 2) {
      msg.info('请至少选择 2 个片段才能合并')
      return
    }
    onMerge(rows)
  }

  const handleGroupReassign = (group: DuplicateGroup) => {
    const rows = groupToRows(group)
    onReassign(rows)
  }

  const handleGroupDelete = (group: DuplicateGroup) => {
    const targetIds = getTargetIds(group)
    const count = targetIds.length
    if (count === 0) return
    Modal.confirm({
      title: '批量删除确认',
      content: `确定要删除选中的 ${count} 个片段吗？此操作不可撤销。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await post('/api/kb/chunk/batch-delete', { memoryIds: targetIds })
          msg.success(`已删除 ${count} 个片段`)
          setResults((prev) => {
            if (prev === null || prev === undefined) return prev
            const next = { ...prev }
            next.groups = next.groups.filter((g) => g !== group)
            return next
          })
        } catch {
          msg.error('批量删除失败')
        }
      },
    })
  }

  return (
    <Card title="重复检测">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap>
          <Text strong>相似度阈值：</Text>
          <InputNumber
            value={threshold}
            onChange={(val) => setThreshold(val ?? 0.95)}
            step={0.01}
            style={{ width: 160 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            值越高要求越严格，0.95 表示 95% 相似
          </Text>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleDetect}
            loading={loading}
          >
            检测重复
          </Button>
        </Space>

        <Text type="secondary" style={{ fontSize: 12 }}>
          每次最多检测 100 条（按字符数降序），对它们做两两语义相似度计算
        </Text>

        {results !== null && results !== undefined && (
          <>
            <Text type="secondary">
              检测 {results.detectedCount} 条，发现 {results.groups.length} 组重复
              {results.groups.length > 0 && `（共 ${results.groups.reduce((s, g) => s + g.items.length, 0)} 条）`}
            </Text>

            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {results.groups.map((group, gi) => (
                <Card
                  key={gi}
                  size="small"
                  title={
                    <Space>
                      <Checkbox
                        checked={group.items.every((item) => selectedIds.has(item.id))}
                        indeterminate={
                          group.items.some((item) => selectedIds.has(item.id)) &&
                          !group.items.every((item) => selectedIds.has(item.id))
                        }
                        onChange={(e) => {
                          const next = new Set(selectedIds)
                          for (const item of group.items) {
                            if (e.target.checked) {
                              next.add(item.id)
                            } else {
                              next.delete(item.id)
                            }
                          }
                          setSelectedIds(next)
                        }}
                      />
                      <Tag color="volcano">重复组 #{gi + 1}</Tag>
                      <Text style={{ fontWeight: 400 }}>
                        {group.items.length} 条 · 相似度 {group.minSimilarity.toFixed(4)} ~ {group.maxSimilarity.toFixed(4)}
                      </Text>
                    </Space>
                  }
                  extra={
                    <Space size={4}>
                      <Button
                        size="small"
                        icon={<MergeCellsOutlined />}
                        onClick={() => handleGroupMerge(group)}
                      >
                        合并
                      </Button>
                      <Button
                        size="small"
                        icon={<TagOutlined />}
                        onClick={() => handleGroupReassign(group)}
                      >
                        移分类
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleGroupDelete(group)}
                      >
                        删除
                      </Button>
                    </Space>
                  }
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: selectedIds.has(item.id) ? '#fafafa' : '#f0f0f0',
                          opacity: selectedIds.has(item.id) ? 1 : 0.6,
                        }}
                      >
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds)
                            if (e.target.checked) {
                              next.add(item.id)
                            } else {
                              next.delete(item.id)
                            }
                            setSelectedIds(next)
                          }}
                        />
                        <Text strong ellipsis style={{ width: 150, flexShrink: 0 }}>
                          {item.title}
                        </Text>
                        <Tag>{item.charLength.toLocaleString()} 字符</Tag>
                        {item.topicName !== null ? (
                          <Tag color="blue">{item.topicName}</Tag>
                        ) : (
                          <Text type="secondary" style={{ fontSize: 12 }}>无主题</Text>
                        )}
                        <Text type="secondary" style={{ fontSize: 12 }}>{item.kbName}</Text>
                        <Button
                          type="link"
                          size="small"
                          icon={isInCart(item.id) ? <CheckOutlined /> : <PlusOutlined />}
                          disabled={isInCart(item.id)}
                          onClick={() => onAddToCart(item)}
                        >
                          {isInCart(item.id) ? '已加入' : '待合并'}
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => onViewContent(item.content)}
                        >
                          查看
                        </Button>
                      </div>
                    ))}
                  </Space>
                </Card>
              ))}
            </Space>
          </>
        )}

        {results !== null && results !== undefined && results.groups.length === 0 && (
          <Empty
            description={
              <Text type="secondary">
                未发现相似度超过 {threshold} 的重复片段
              </Text>
            }
          />
        )}
      </Space>
    </Card>
  )
}
