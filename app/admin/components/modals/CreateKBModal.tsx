'use client'

import { message, Modal, Input, Button, Form, Typography } from 'antd'

const { Text } = Typography

interface CreateKBModalProps {
  show: boolean
  onClose: () => void
  newKbName: string
  setNewKbName: (name: string) => void
  loading: boolean
  onCreated: () => void
}

export function CreateKBModal({
  show,
  onClose,
  newKbName,
  setNewKbName,
  loading,
  onCreated
}: CreateKBModalProps) {
  const [msg, contextHolder] = message.useMessage()
  const [form] = Form.useForm()

  const handleCreate = async () => {
    if (!newKbName.trim()) {
      msg.info('请输入知识库名称')
      return
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(newKbName)) {
      msg.info('名称只能包含字母、数字、中划线和下划线')
      return
    }
    
    try {
      const res = await fetch('/api/kb/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKbName })
      })
      
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('创建失败')
        }
        return
      }
      
      const data = await res.json()
      if (data.success) {
        msg.success(`知识库 "${newKbName}" 创建成功`)
        onCreated()
      }
    } catch (err) {
      msg.error('网络请求失败')
    }
  }

  return (
    <>
      {contextHolder}
      <Modal
        title="新增知识库"
        open={show}
        onCancel={onClose}
        footer={null}
        width={480}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="知识库名称"
            required
          >
            <Input
              value={newKbName}
              onChange={(e) => setNewKbName(e.target.value)}
              placeholder="输入知识库名称（如：my-knowledge-base）"
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              名称只能包含字母、数字、中划线和下划线
            </Text>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              onClick={handleCreate}
              disabled={!newKbName.trim() || loading}
              loading={loading}
              block
            >
              创建知识库
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}