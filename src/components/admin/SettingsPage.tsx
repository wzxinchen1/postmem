'use client'

import { useState, useEffect } from 'react'
import { message, Card, Input, InputNumber, Button, Space, Typography, Alert, Divider } from 'antd'
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface AppSettings {
  maxContentLength: number
  defaultTopK: number
  defaultContextWindow: number
  defaultPageSize: number
}

interface ChatSettings {
  memoryContextThreshold: number
  maxOutputTokens?: number | null
  searchLinkCount: number
  chunkCharRange: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    maxContentLength: 20000,
    defaultTopK: 5,
    defaultContextWindow: 1,
    defaultPageSize: 20,
  })
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    memoryContextThreshold: 50,
    maxOutputTokens: null,
    searchLinkCount: 10,
    chunkCharRange: '200-500',
  })
  const [loading, setLoading] = useState(false)
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    loadSettings()
    loadChatSettings()
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

  const loadChatSettings = async () => {
    try {
      const res = await fetch('/api/chat-settings')
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('加载聊天设置失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        setChatSettings({
          memoryContextThreshold: data.data.setting.memoryContextThreshold,
          maxOutputTokens: data.data.setting.maxOutputTokens ?? null,
          searchLinkCount: data.data.setting.searchLinkCount ?? 10,
          chunkCharRange: data.data.setting.chunkCharRange ?? '200-500',
        })
      }
    } catch (err) {
      msg.error('网络请求失败')
    }
  }

  const handleSaveAppSettings = async () => {
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
        msg.success('应用设置已保存')
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveChatSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/chat-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatSettings),
      })
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('保存聊天设置失败')
        }
        return
      }
      const data = await res.json()
      if (data.success) {
        msg.success('聊天设置已保存')
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 24 }}>
      {contextHolder}

      <Alert
        message="💡 提示"
        description="应用设置会影响系统的默认行为。修改后立即生效，无需重启服务。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title={<Title level={4} style={{ margin: 0 }}>聊天设置</Title>} style={{ maxWidth: 800 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>记忆上下文阈值 (K)</Text>
            <InputNumber
              value={chatSettings.memoryContextThreshold}
              onChange={(value) => setChatSettings({ ...chatSettings, memoryContextThreshold: value || 50 })}
              min={1}
              max={1000}
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              未记忆消息累计 token 数超过此阈值（×1000）时触发自动记忆。例如设为 50 表示 50,000 tokens 时触发（范围 1-1000）
            </Text>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>最大输出 Token 数</Text>
            <InputNumber
              value={chatSettings.maxOutputTokens}
              onChange={(value) => setChatSettings({ ...chatSettings, maxOutputTokens: value })}
              min={1}
              max={100000}
              placeholder="留空表示不限制（由模型决定）"
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              单次聊天回复的最大输出 token 数。留空或清空表示不限制，由模型 API 自行决定（范围 1-100000）。建议根据模型能力设置，如 GPT-4o 可设 16384
            </Text>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>搜索链接数量</Text>
            <InputNumber
              value={chatSettings.searchLinkCount}
              onChange={(value) => setChatSettings({ ...chatSettings, searchLinkCount: value || 10 })}
              min={1}
              max={50}
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              网络搜索时每次抓取多少个链接进行摘要（范围 1-50）。数量越多，搜索结果越全面，但消耗更多 token 和时间
            </Text>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>记忆片段字符数范围</Text>
            <Input
              value={chatSettings.chunkCharRange}
              onChange={(e) => setChatSettings({ ...chatSettings, chunkCharRange: e.target.value })}
              placeholder="200-500"
              style={{ width: '100%' }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
              记忆入库时每个切片的建议字符数范围，格式为「最小-最大」，如「200-500」。最小 {'>='} 50，最大 {'<='} 5000
            </Text>
          </div>

          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveChatSettings}
              loading={loading}
            >
              保存聊天设置
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadChatSettings}
              disabled={loading}
            >
              重置
            </Button>
          </Space>
        </Space>
      </Card>

      <Divider />

      <Card title={<Title level={4} style={{ margin: 0 }}>应用设置</Title>} style={{ maxWidth: 800 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>最大内容长度</Text>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>默认检索数量 (Top K)</Text>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>默认上下文窗口</Text>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>默认分页大小</Text>
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
              onClick={handleSaveAppSettings}
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
    </div>
  )
}
