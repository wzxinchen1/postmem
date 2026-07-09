'use client'

import { useState, useEffect } from 'react'
import { message, Modal, Button, Space, Typography, Input, Card, Tag, Divider, Select } from 'antd'
import { MergeCellsOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { get, post } from '@/app/admin/lib/request'
import type { ChunkItem, TopicInfo } from '@/app/admin/types'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface MergeModalProps {
  open: boolean
  rows: ChunkItem[]
  onClose: () => void
  onSuccess: () => void
}

export function MergeModal({ open, rows, onClose, onSuccess }: MergeModalProps) {
  const [msg, contextHolder] = message.useMessage()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [mergeTitle, setMergeTitle] = useState('')
  const [mergeContent, setMergeContent] = useState('')
  const [topicId, setTopicId] = useState<string | null>(null)
  const [topicAction, setTopicAction] = useState<'existing' | 'create'>('existing')
  const [newTopicName, setNewTopicName] = useState('')
  const [newTopicDesc, setNewTopicDesc] = useState('')
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [existingTopics, setExistingTopics] = useState<TopicInfo[]>([])

  const kbIdForTopics = rows.length > 0 ? rows[0].kbId : null
  useEffect(() => {
    if (kbIdForTopics !== null) {
      const loadExistingTopics = async () => {
        try {
          const res = await get<{ success: boolean; data?: TopicInfo[] }>(
            `/api/kb/list-topics?kbId=${encodeURIComponent(kbIdForTopics)}`,
          )
          if (res.success && res.data !== undefined) {
            setExistingTopics(res.data)
          }
        } catch {
          msg.error('获取主题列表失败')
        }
      }
      loadExistingTopics()
    }
  }, [kbIdForTopics, msg])

  const handlePreview = async () => {
    if (rows.length < 2) return
    setPreviewLoading(true)
    try {
      const res = await post<{ success: boolean; data?: { mergedTitle: string; mergedContent: string } }>(
        '/api/kb/chunk/merge-preview',
        { memoryIds: rows.map((r) => r.id) },
      )
      if (res.success && res.data !== undefined) {
        setMergeTitle(res.data.mergedTitle)
        setMergeContent(res.data.mergedContent)
      } else {
        msg.error('获取合并建议失败')
      }
    } catch {
      msg.error('获取合并建议失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!mergeTitle.trim() || !mergeContent.trim()) {
      msg.warning('合并后的标题和内容不能为空')
      return
    }

    setConfirmLoading(true)
    try {
      let finalTopicId = topicId

      if (topicAction === 'create' && newTopicName.trim()) {
        const kbIdVal = rows.length > 0 ? rows[0].kbId : null
        if (kbIdVal !== null) {
          const createParams: Record<string, unknown> = { kbId: kbIdVal, name: newTopicName.trim() }
          const desc = newTopicDesc.trim()
          if (desc.length > 0) {
            createParams.description = desc
          }
          const createRes = await post<{ success: boolean; data?: { id: string } }>(
            '/api/kb/topic/create',
            createParams,
          )
          if (createRes.success && createRes.data !== undefined) {
            finalTopicId = createRes.data.id
          }
        }
      }

      await post('/api/kb/chunk/merge-confirm', {
        memoryIds: rows.map((r) => r.id),
        merged: {
          title: mergeTitle.trim(),
          content: mergeContent.trim(),
          topicId: finalTopicId,
        },
      })

      msg.success('合并成功')
      onClose()
      onSuccess()
    } catch {
      msg.error('合并失败')
    } finally {
      setConfirmLoading(false)
    }
  }

  const topicOptions = [
    ...existingTopics.map((t) => ({ value: t.id, label: t.name })),
    { value: '__create__', label: '— 新建主题 —' },
  ]

  return (
    <Modal
      title={
        <Space>
          <MergeCellsOutlined />
          合并片段
          <Text type="secondary" style={{ fontWeight: 400, fontSize: 14 }}>
            （已选 {rows.length} 个片段）
          </Text>
        </Space>
      }
      open={open}
      onCancel={() => !confirmLoading && onClose()}
      width={900}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={handlePreview}
            loading={previewLoading}
          >
            AI 合并建议
          </Button>
          <Button
            type="primary"
            onClick={handleConfirm}
            loading={confirmLoading}
            disabled={!mergeTitle.trim() || !mergeContent.trim()}
          >
            确认合并
          </Button>
        </Space>
      }
    >
      {contextHolder}
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Card size="small" title="待合并的片段">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {rows.map((r, i) => (
              <div key={r.id} style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: '#fafafa',
                border: '1px solid #f0f0f0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Tag>{i + 1}</Tag>
                  <Text strong ellipsis style={{ maxWidth: 180 }}>{r.title}</Text>
                  <Tag color="default" style={{ flexShrink: 0 }}>{r.charLength.toLocaleString()} 字符</Tag>
                  {r.topicName !== null && <Tag color="blue" style={{ flexShrink: 0 }}>{r.topicName}</Tag>}
                </div>
                <Paragraph
                  ellipsis={{ rows: 2, expandable: 'collapsible', symbol: (expanded: boolean) => expanded ? '收起' : '展开全文' }}
                  style={{ margin: 0, fontSize: 13, color: '#595959', lineHeight: 1.6 }}
                  copyable={false}
                >
                  {r.content}
                </Paragraph>
              </div>
            ))}
          </Space>
        </Card>

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
          <div style={{ marginTop: 4 }}>
            <Select
              value={topicAction === 'create' ? '__create__' : topicId}
              onChange={(val) => {
                if (val === '__create__') {
                  setTopicAction('create')
                  setTopicId(null)
                } else {
                  setTopicAction('existing')
                  setTopicId(val)
                  setNewTopicName('')
                  setNewTopicDesc('')
                }
              }}
              style={{ width: '100%' }}
              options={topicOptions}
              placeholder="选择主题（可选）"
              allowClear
            />
            {topicAction === 'create' && (
              <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                <Input
                  size="small"
                  placeholder="主题名称（必填，5字以内）"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  maxLength={10}
                />
                <Space size={4}>
                  <Input
                    size="small"
                    placeholder="主题描述（可选）"
                    value={newTopicDesc}
                    onChange={(e) => setNewTopicDesc(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={suggestLoading}
                    onClick={async () => {
                      setSuggestLoading(true)
                      try {
                        const sampleContent = mergeContent.slice(0, 2000)
                        const res = await post<{ success: boolean; data?: { name: string; description: string } }>(
                          '/api/kb/topic/suggest',
                          { kbId: null, content: sampleContent },
                        )
                        if (res.success && res.data !== undefined) {
                          setNewTopicName(res.data.name)
                          setNewTopicDesc(res.data.description)
                        }
                      } catch {
                        msg.error('AI 主题建议获取失败')
                      } finally {
                        setSuggestLoading(false)
                      }
                    }}
                  >
                    AI 辅助
                  </Button>
                </Space>
              </Space>
            )}
          </div>
        </div>
      </Space>
    </Modal>
  )
}
