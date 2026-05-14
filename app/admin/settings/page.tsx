'use client'

import { useState, useEffect } from 'react'
import { message, Card, InputNumber, Button, Space, Typography, Alert } from 'antd'
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface AppSettings {
  maxContentLength: number
  defaultTopK: number
  defaultContextWindow: number
  defaultPageSize: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    maxContentLength: 20000,
    defaultTopK: 5,
    defaultContextWindow: 1,
    defaultPageSize: 20,
  })
  const [loading, setLoading] = useState(false)
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('加载设置失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        setSettings(data.data.settings)
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('保存失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        msg.success('设置已保存')
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {contextHolder}

      <Alert
        message="💡 提示"
        description="应用设置会影响系统的默认行为。修改后立即生效，无需重启服务。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title={<Title level={4} style={{ margin: 0 }}>应用设置</Title>} style={{ maxWidth: 800 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>最大内容长度</Text>
            <InputNumber
              value={settings.maxContentLength}
              onChange={(value) => setSettings({ ...settings, maxContentLength: value || 20000 })}
              min={1000}
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              入库内容的最大字符数限制（最小 1000）
            </Text>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>默认检索数量 (Top K)</Text>
            <InputNumber
              value={settings.defaultTopK}
              onChange={(value) => setSettings({ ...settings, defaultTopK: value || 5 })}
              min={1}
              max={100}
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              语义检索时返回的最相关结果数量（1-100）
            </Text>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>默认上下文窗口</Text>
            <InputNumber
              value={settings.defaultContextWindow}
              onChange={(value) => setSettings({ ...settings, defaultContextWindow: value || 1 })}
              min={0}
              max={5}
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              检索结果包含的相邻片段数量（0-5）
            </Text>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>默认分页大小</Text>
            <InputNumber
              value={settings.defaultPageSize}
              onChange={(value) => setSettings({ ...settings, defaultPageSize: value || 20 })}
              min={10}
              max={100}
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              列表浏览时每页显示的数量（10-100）
            </Text>
          </div>

          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={loading}
            >
              保存设置
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadSettings}
              disabled={loading}
            >
              重置
            </Button>
          </Space>
        </Space>
      </Card>
    </>
  )
}