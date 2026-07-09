'use client'

import { useState } from 'react'
import { message, Modal, Select, Space, Typography } from 'antd'
import { TagOutlined } from '@ant-design/icons'
import { post } from '@/app/admin/lib/request'
import type { ChunkItem, TopicInfo } from '@/app/admin/types'

const { Text } = Typography

interface BatchReassignModalProps {
  open: boolean
  rows: ChunkItem[]
  topicList: TopicInfo[]
  onClose: () => void
  onSuccess: () => void
}

export function BatchReassignModal({ open, rows, topicList, onClose, onSuccess }: BatchReassignModalProps) {
  const [msg, contextHolder] = message.useMessage()
  const [topicId, setTopicId] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (topicId === null) {
      msg.warning('请选择目标分类')
      return
    }
    try {
      await post('/api/kb/chunk/reassign-topic', {
        memoryIds: rows.map(r => r.id),
        topicId,
      })
      msg.success(`已移动 ${rows.length} 个片段`)
      setTopicId(null)
      onClose()
      onSuccess()
    } catch {
      msg.error('批量移分类失败')
    }
  }

  return (
    <Modal
      title={
        <Space>
          <TagOutlined />
          批量移分类
          <Text type="secondary" style={{ fontWeight: 400, fontSize: 14 }}>
            （已选 {rows.length} 个片段）
          </Text>
        </Space>
      }
      open={open}
      onCancel={() => {
        setTopicId(null)
        onClose()
      }}
      onOk={handleConfirm}
      okText="确认移动"
    >
      {contextHolder}
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong>目标分类：</Text>
          <Select
            value={topicId}
            onChange={setTopicId}
            placeholder="请选择目标分类"
            style={{ width: '100%', marginTop: 4 }}
            options={topicList.map(t => ({ value: t.id, label: t.name }))}
          />
        </div>
      </Space>
    </Modal>
  )
}
