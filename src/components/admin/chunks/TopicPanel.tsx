'use client'

import { useState } from 'react'
import { message, Card, Button, Space, Typography, Tag, Input, Modal, Select } from 'antd'
import { TagOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import { post } from '@/app/admin/lib/request'
import type { TopicInfo } from '@/app/admin/types'
import type { MergeConfirmSnapshot } from './types'
import { SNAPSHOT_EMPTY } from './types'
import { KBSelector } from '@/src/components/admin/KBSelector'

const { Text } = Typography

interface TopicPanelProps {
  kbId: string | null
  setKbId: (id: string | null) => void
  topicStats: Array<{ id: string; name: string; description: string; memoryCount: number }>
  existingTopics: TopicInfo[]
  onTopicChange: () => void
  onRefresh: () => void
  onBrowseTopic?: (topicId: string) => void
}

export function TopicPanel({ kbId, setKbId, topicStats, existingTopics, onTopicChange, onRefresh, onBrowseTopic }: TopicPanelProps) {
  const [msg, contextHolder] = message.useMessage()

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')

  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const [selectedMergeTopicIds, setSelectedMergeTopicIds] = useState<string[]>([])
  const [mergeTargetTopicId, setMergeTargetTopicId] = useState<string | null>(null)
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false)
  const [mergeConfirmSnapshot, setMergeConfirmSnapshot] = useState<MergeConfirmSnapshot>(SNAPSHOT_EMPTY)

  const handleCreateTopic = async () => {
    if (!createName.trim()) {
      throw new Error('请输入主题名称')
    }
    try {
      const body: Record<string, unknown> = { kbId, name: createName.trim() }
      const desc = createDesc.trim()
      if (desc.length > 0) {
        body.description = desc
      }
      await post('/api/kb/topic/create', body)
      msg.success('主题创建成功')
      setCreateOpen(false)
      setCreateName('')
      setCreateDesc('')
      onTopicChange()
    } catch {
      msg.error('创建主题失败')
    }
  }

  const handleRenameTopic = async (topicId: string) => {
    if (!editName.trim()) {
      throw new Error('主题名称不能为空')
    }
    try {
      const body: Record<string, unknown> = { topicId, name: editName.trim() }
      const desc = editDesc.trim()
      if (desc.length > 0) {
        body.description = desc
      }
      await post('/api/kb/topic/rename', body)
      msg.success('主题已重命名')
      setEditingTopicId(null)
      onTopicChange()
    } catch {
      msg.error('重命名失败')
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    try {
      await post('/api/kb/topic/delete', { topicId })
      msg.success('主题已删除')
      onTopicChange()
    } catch {
      msg.error('删除失败')
    }
  }

  const handleMergeTopics = async () => {
    if (selectedMergeTopicIds.length < 2) {
      throw new Error('请至少选择 2 个主题')
    }
    if (mergeTargetTopicId === null) {
      throw new Error('请选择目标主题')
    }
    try {
      const sourceIds = selectedMergeTopicIds.filter(id => id !== mergeTargetTopicId)
      const res = await post<{ success: boolean; data?: { movedCount: number; deletedCount: number } }>('/api/kb/topic/merge', {
        sourceTopicIds: sourceIds,
        targetTopicId: mergeTargetTopicId,
      })
      if (res.success && res.data !== undefined) {
        msg.success(`已移动 ${res.data.movedCount} 条记忆，删除 ${res.data.deletedCount} 个主题`)
      }
      setMergeConfirmOpen(false)
      setMergeConfirmSnapshot(SNAPSHOT_EMPTY)
      setSelectedMergeTopicIds([])
      setMergeTargetTopicId(null)
      onTopicChange()
      onRefresh()
    } catch {
      msg.error('合并失败')
    }
  }

  const startEditTopic = (t: { id: string; name: string; description: string }) => {
    setEditingTopicId(t.id)
    setEditName(t.name)
    setEditDesc(t.description)
  }

  const topicPanelWidth = 300

  return (
    <div style={{ width: topicPanelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
      {contextHolder}

      <KBSelector kbId={kbId} setKbId={setKbId} />

      {kbId !== null ? (
        <>
          <Card
            size="small"
            title={
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text strong>主题管理</Text>
                <Button size="small" type="primary" icon={<TagOutlined />} onClick={() => setCreateOpen(true)}>
                  新建
                </Button>
              </Space>
            }
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              {topicStats.map((t) => (
                <div key={t.id} style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: editingTopicId === t.id ? '#f6f8fa' : 'transparent',
                  border: editingTopicId === t.id ? '1px solid #d9d9d9' : '1px solid transparent',
                }}>
                  {editingTopicId === t.id ? (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Input
                        size="small"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={10}
                        placeholder="主题名称"
                      />
                      <Input
                        size="small"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="描述（可选）"
                      />
                      <Space size={4}>
                        <Button size="small" type="primary" onClick={() => handleRenameTopic(t.id)}>
                          保存
                        </Button>
                        <Button size="small" onClick={() => setEditingTopicId(null)}>
                          取消
                        </Button>
                      </Space>
                    </Space>
                  ) : (
                    <div
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      onClick={() => startEditTopic(t)}
                    >
                      <Space size={6}>
                        <Text style={{ fontSize: 13 }}>{t.name}</Text>
                        <Tag style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{t.memoryCount}</Tag>
                      </Space>
                      <Space size={0}>
                        <Button
                          type="link"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (onBrowseTopic !== undefined) {
                              onBrowseTopic(t.id)
                            }
                          }}
                        />
                        <Button
                          type="link"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTopic(t.id)
                          }}
                        />
                      </Space>
                    </div>
                  )}
                </div>
              ))}
              {topicStats.length === 0 && (
                <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block', padding: '16px 0' }}>
                  暂无主题
                </Text>
              )}
            </Space>
          </Card>

          <Card size="small" title="合并主题">
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Select
                mode="multiple"
                value={selectedMergeTopicIds}
                onChange={setSelectedMergeTopicIds}
                placeholder="选择源主题"
                style={{ width: '100%' }}
                size="small"
                options={topicStats.map(t => ({ value: t.id, label: `${t.name} (${t.memoryCount})` }))}
              />
              <Select
                value={mergeTargetTopicId}
                onChange={setMergeTargetTopicId}
                placeholder="选择目标主题"
                style={{ width: '100%' }}
                size="small"
                options={topicStats.map(t => ({ value: t.id, label: t.name }))}
              />
              <Button
                size="small"
                block
                onClick={() => {
                  if (mergeTargetTopicId === null) throw new Error('请先选择目标主题')
                  const targetTopic = topicStats.find(s => s.id === mergeTargetTopicId)
                  if (targetTopic === undefined) throw new Error(`目标主题 ${mergeTargetTopicId} 不存在`)
                  const sourceTopics = selectedMergeTopicIds
                    .filter(id => id !== mergeTargetTopicId)
                    .map(id => {
                      const t = topicStats.find(s => s.id === id)
                      if (t === undefined) throw new Error(`主题 ${id} 不存在`)
                      return { id: t.id, name: t.name, memoryCount: t.memoryCount }
                    })
                  setMergeConfirmSnapshot({ sourceTopics, targetTopic })
                  setMergeConfirmOpen(true)
                }}
                disabled={selectedMergeTopicIds.length < 2 || mergeTargetTopicId === null}
              >
                执行合并
              </Button>
            </Space>
          </Card>
        </>
      ) : (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 14 }}>
            请先选择知识库以管理主题
          </Text>
        </div>
      )}

      <Modal
        title="新建主题"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          setCreateName('')
          setCreateDesc('')
        }}
        onOk={handleCreateTopic}
        okText="创建"
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong>主题名称：</Text>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="请输入主题名称（必填，5字以内）"
              maxLength={10}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>主题描述：</Text>
            <Input
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="请输入主题描述（可选）"
              style={{ marginTop: 4 }}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="确认合并主题"
        open={mergeConfirmOpen}
        onCancel={() => {
          setMergeConfirmOpen(false)
          setMergeConfirmSnapshot(SNAPSHOT_EMPTY)
          setSelectedMergeTopicIds([])
          setMergeTargetTopicId(null)
        }}
        onOk={handleMergeTopics}
        okText="确认合并"
        okButtonProps={{ disabled: mergeConfirmSnapshot.sourceTopics.length === 0 }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong>源主题（将被合并掉）：</Text>
            <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
              {mergeConfirmSnapshot.sourceTopics.map(t => (
                <Tag key={t.id} color="orange" style={{ fontSize: 13, padding: '2px 8px' }}>
                  {t.name}（{t.memoryCount} 条）
                </Tag>
              ))}
            </Space>
          </div>
          <div>
            <Text strong>目标主题（合并到）：</Text>
            <div style={{ marginTop: 4 }}>
              <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>
                {mergeConfirmSnapshot.targetTopic.name}（{mergeConfirmSnapshot.targetTopic.memoryCount} 条）
              </Tag>
            </div>
          </div>
        </Space>
      </Modal>
    </div>
  )
}
