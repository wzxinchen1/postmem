'use client'

import { useEffect } from 'react'
import { message, Modal, Input, Button, Form, Typography, Space, Steps, Spin } from 'antd'
import type { IngestProgressEvent } from '@/app/admin/types'

const { Text } = Typography
const { TextArea } = Input

interface IngestModalProps {
  show: boolean
  onClose: () => void
  selectedKb: string
  content: string
  setContent: (content: string) => void
  loading: boolean
  result: IngestProgressEvent | null
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
    if (!result) return

    if (result.type === 'error') {
      msg.error(result.data?.message || '入库失败')
    }
    if (result.type === 'complete') {
      const count = result.data?.count ?? 0
      msg.success(`入库成功！创建了 ${count} 个片段`)
    }
  }, [result, msg])

  const isProcessing = Boolean(loading || result && result.type !== 'complete' && result.type !== 'error')

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
        onCancel={isProcessing ? undefined : onClose}
        footer={null}
        width={600}
        closable={!isProcessing}
        maskClosable={!isProcessing}
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
              disabled={isProcessing}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              支持长文本,系统会自动进行分块处理
            </Text>
          </Form.Item>

          {isProcessing && (
            <div style={{
              padding: '12px 16px',
              background: '#fafafa',
              borderRadius: 8,
              border: '1px solid #f0f0f0',
            }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space>
                  <Spin size="small" />
                  <Text strong style={{ fontSize: 13 }}>{result?.message || '准备中...'}</Text>
                </Space>

                {result?.type === 'progress' && result.data && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    ({result.data.current}/{result.data.total}) {result.data.title}
                  </Text>
                )}

                {result?.type === 'chunk_detail' && (
                  <div style={{
                    paddingLeft: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {renderActionIcon(result.data?.action)}
                    </Text>
                    <Text style={{ fontSize: 12 }}>{result.message}</Text>
                  </div>
                )}
              </Space>
            </div>
          )}

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              {!isProcessing ? (
                <>
                  <Button onClick={onClose}>稍后添加</Button>
                  <Button
                    type="primary"
                    onClick={onIngest}
                    disabled={!content}
                    loading={loading}
                  >
                    开始入库
                  </Button>
                </>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>正在处理中，请勿关闭...</Text>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function renderActionIcon(action?: string): string {
  switch (action) {
    case 'insert': return '+'
    case 'skip': return 'x'
    case 'merge': return '~'
    case 'new': return '*'
    default: return '-'
  }
}
