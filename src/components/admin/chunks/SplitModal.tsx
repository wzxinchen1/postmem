'use client'

import { useState } from 'react'
import { message, Modal, Button, Space, Typography, Input, Spin, Alert, Card, Tag } from 'antd'
import { ScissorOutlined, SearchOutlined, ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons'
import { post } from '@/app/admin/lib/request'
import type { ChunkItem, SplitChunkItem, TopicInfo } from '@/app/admin/types'
import { ChunkTopicSelect } from './ChunkTopicSelect'
import type { EditableChunk } from './types'
import { buildEditableChunk } from './types'

const { Text } = Typography
const { TextArea } = Input

interface SplitModalProps {
  open: boolean
  memory: ChunkItem
  onClose: () => void
  onSuccess: () => void
}

export function SplitModal({ open, memory, onClose, onSuccess }: SplitModalProps) {
  const [msg, contextHolder] = message.useMessage()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [existingTopics, setExistingTopics] = useState<TopicInfo[]>([])
  const [chunks, setChunks] = useState<EditableChunk[]>([])
  const [instruction, setInstruction] = useState('')

  const doPreview = async () => {
    setPreviewLoading(true)
    setChunks([])
    setExistingTopics([])

    try {
      const previewParams: Record<string, unknown> = { memoryId: memory.id }
      const trimmedInstruction = instruction.trim()
      if (trimmedInstruction.length > 0) {
        previewParams.instruction = trimmedInstruction
      }
      const res = await post<{
        success: boolean
        data?: { chunks: SplitChunkItem[]; topicSuggestions: { plans: Array<{ index: number; action: string; topicName?: string; newTopicName?: string }> }; existingTopics: TopicInfo[] }
      }>('/api/kb/chunk/split-preview', previewParams)

      if (res.success && res.data !== undefined) {
        const { chunks: chunksData, topicSuggestions, existingTopics: existingTopicsData } = res.data
        setExistingTopics(existingTopicsData)
        setChunks(
          chunksData.map((chunk) => {
            const plan = topicSuggestions.plans.find((p) => p.index === chunk.index)
            if (plan === undefined) {
              throw new Error(`AI 未为片段 #${chunk.index} 生成主题规划`)
            }
            return buildEditableChunk(chunk, plan, existingTopicsData)
          }),
        )
      } else {
        msg.error('获取拆分建议失败')
      }
    } catch {
      msg.error('获取拆分建议失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const updateChunk = (key: string, updates: Partial<EditableChunk>) => {
    setChunks((prev) => prev.map((c) => (c.key === key ? { ...c, ...updates } : c)))
  }

  const handleConfirm = async () => {
    const activeChunks = chunks.filter((c) => !c.deleted)
    if (activeChunks.length === 0) {
      msg.warning('至少保留一个片段')
      return
    }
    const hasEmptyFields = activeChunks.some((c) => {
      const emptyTitle = !c.title.trim()
      const emptyContent = !c.content.trim()
      if (emptyTitle) return true
      if (emptyContent) return true
      return false
    })
    if (hasEmptyFields) {
      msg.warning('每个片段必须包含标题和内容')
      return
    }

    setConfirmLoading(true)
    try {
      const topicIdMap = new Map<string, string>()

      for (const t of existingTopics) {
        topicIdMap.set(t.id, t.id)
      }

      for (const chunk of activeChunks) {
        if (chunk.topicAction !== 'create' || !chunk.newTopicName.trim()) {
          continue
        }
        if (topicIdMap.has(chunk.newTopicName.trim())) {
          continue
        }
        const createBody: Record<string, unknown> = {
          kbId: memory.kbId,
          name: chunk.newTopicName.trim(),
        }
        const desc = chunk.newTopicDescription.trim()
        if (desc.length > 0) {
          createBody.description = desc
        }
        const createRes = await post<{ success: boolean; data?: { id: string } }>(
          '/api/kb/topic/create',
          createBody,
        )
        if (createRes.success && createRes.data !== undefined) {
          topicIdMap.set(chunk.newTopicName.trim(), createRes.data.id)
        }
      }

      const chunksPayload = activeChunks.map((c) => {
        if (c.topicAction === 'create' && c.newTopicName.trim()) {
          const mappedId = topicIdMap.get(c.newTopicName.trim())
          if (mappedId === undefined) {
            throw new Error(`主题 "${c.newTopicName.trim()}" 创建失败，无法关联`)
          }
          return { title: c.title.trim(), content: c.content.trim(), topicId: mappedId }
        }
        return { title: c.title.trim(), content: c.content.trim(), topicId: c.topicId }
      })

      await post('/api/kb/chunk/split-confirm', {
        memoryId: memory.id,
        chunks: chunksPayload,
      })

      msg.success(`已拆分为 ${chunksPayload.length} 个片段`)
      onClose()
      onSuccess()
    } catch {
      msg.error('拆分失败')
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <ScissorOutlined />
          拆分片段
          <Text type="secondary" style={{ fontWeight: 400, fontSize: 14 }}>
            （{memory.title} · {memory.charLength.toLocaleString()} 字符）
          </Text>
        </Space>
      }
      open={open}
      onCancel={() => !confirmLoading && onClose()}
      width={900}
      confirmLoading={confirmLoading}
      onOk={handleConfirm}
      okText="确认拆分"
      okButtonProps={{ disabled: previewLoading || chunks.length === 0 }}
    >
      {contextHolder}
      <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 12 }}>拆分要求（可选）：</Text>
            <Space.Compact style={{ width: '100%', marginTop: 4 }}>
              <TextArea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="用自然语言指定拆分方式，如：按段落拆分 / 将对话按轮次拆分 / 按主题拆分..."
                rows={2}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={chunks.length > 0 ? <ThunderboltOutlined /> : <SearchOutlined />}
                onClick={doPreview}
                loading={previewLoading}
                style={{ height: 'auto', minHeight: 44 }}
              >
                {chunks.length > 0 ? '重新拆分' : '获取拆分建议'}
              </Button>
            </Space.Compact>
          </div>

          {previewLoading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: '#999' }}>
                AI 正在分析文本并生成拆分建议...
              </div>
            </div>
          )}

          {!previewLoading && chunks.length > 0 && (
            <>
              <Alert
                type="info"
                showIcon
                message={
                  <Space>
                    <Text strong>原文长度：</Text>
                    <Text>{memory.charLength.toLocaleString()} 字符</Text>
                    <Text strong style={{ marginLeft: 16 }}>建议拆分为：</Text>
                    <Text>{chunks.length} 个片段</Text>
                  </Space>
                }
                style={{ marginBottom: 0 }}
              />
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {chunks.map((chunk, idx) => (
                  <Card
                    key={chunk.key}
                    size="small"
                    style={chunk.deleted ? { background: '#f5f5f5', borderColor: '#e8e8e8' } : undefined}
                    title={
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space>
                          <Tag color={chunk.deleted ? 'default' : 'blue'}>片段 {idx + 1}</Tag>
                          <Text style={{ fontWeight: 400 }}>
                            ~{chunk.content.length.toLocaleString()} 字符
                          </Text>
                        </Space>
                        <Button
                          size="small"
                          type={chunk.deleted ? 'primary' : 'default'}
                          danger={!chunk.deleted}
                          icon={chunk.deleted ? undefined : <DeleteOutlined />}
                          onClick={() => updateChunk(chunk.key, { deleted: !chunk.deleted })}
                        >
                          {chunk.deleted ? '撤销删除' : '删除'}
                        </Button>
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
                          disabled={chunk.deleted}
                        />
                      </div>
                      <div>
                        <Text strong style={{ fontSize: 12 }}>内容：</Text>
                        <TextArea
                          size="small"
                          rows={4}
                          value={chunk.content}
                          onChange={(e) => updateChunk(chunk.key, { content: e.target.value })}
                          disabled={chunk.deleted}
                        />
                      </div>
                      <div>
                        <Text strong style={{ fontSize: 12 }}>归属主题：</Text>
                        <ChunkTopicSelect
                          chunk={chunk}
                          existingTopics={existingTopics}
                          onChange={(updates) => updateChunk(chunk.key, updates)}
                        />
                      </div>
                    </Space>
                  </Card>
                ))}
              </Space>
            </>
          )}
        </Space>
      </div>
    </Modal>
  )
}
