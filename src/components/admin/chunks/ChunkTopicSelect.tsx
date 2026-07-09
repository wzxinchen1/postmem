'use client'

import { Input, Select, Button, Space, Typography } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { post } from '@/app/admin/lib/request'
import type { TopicInfo } from '@/app/admin/types'
import type { EditableChunk } from './types'

const { Text } = Typography

interface ChunkTopicSelectProps {
  chunk: EditableChunk
  existingTopics: TopicInfo[]
  onChange: (updates: Partial<EditableChunk>) => void
}

export function ChunkTopicSelect({ chunk, existingTopics, onChange }: ChunkTopicSelectProps) {
  const selectOptions = [
    ...existingTopics.map((t) => ({ value: t.id, label: t.name })),
    { value: '__create__', label: '— 新建主题 —' },
  ]

  const selectedValue = chunk.topicAction === 'create' ? '__create__' : chunk.topicId

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
                  if (res.success && res.data !== undefined) {
                    onChange({
                      newTopicName: res.data.name,
                      newTopicDescription: res.data.description,
                      suggestLoading: false,
                    })
                  }
                } catch {
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
