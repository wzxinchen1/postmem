'use client'

import { useEffect } from 'react'
import { message, Modal, Input, Button, Form, Typography, Space } from 'antd'
import { IngestResponse } from '@/app/admin/types'

const { Text } = Typography
const { TextArea } = Input

interface IngestModalProps {
  show: boolean
  onClose: () => void
  selectedKb: string
  content: string
  setContent: (content: string) => void
  loading: boolean
  result: IngestResponse | null
  onIngest: () => void
}

export function IngestModal({
  show,
  onClose,
  selectedKb,
  content,
  setContent,
  loading,
  result,
  onIngest
}: IngestModalProps) {
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    if (result) {
      if (result.success) {
        msg.success(`入库成功！创建了 ${result.data?.count} 个片段`)
      } else if (result.error) {
        msg.error(result.error.message || '入库失败')
      }
    }
  }, [result, msg])

  return (
    <>
      {contextHolder}
      <Modal
        title={
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 16 }}>知识入库</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>目标知识库: {selectedKb}</Text>
          </Space>
        }
        open={show}
        onCancel={onClose}
        footer={null}
        width={600}
      >
        <Form
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label={
              <Space>
                <Text>文本内容</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>(最大 20000 字符)</Text>
              </Space>
            }
            required
          >
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入要入库的文本内容..."
              rows={12}
              maxLength={20000}
              showCount
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              支持长文本,系统会自动进行分块处理
            </Text>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={onClose}>稍后添加</Button>
              <Button
                type="primary"
                onClick={onIngest}
                disabled={loading || !content}
                loading={loading}
              >
                开始入库
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}