'use client'

import { useState, useEffect } from 'react'
import { Card, Input, InputNumber, Button, Space, Typography, Tag, Empty, message, Select } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { SearchResponse } from '@/app/admin/types'
import { KBSelector } from '@/src/components/admin/KBSelector'

const { Title, Text } = Typography
const { TextArea } = Input

export default function SearchPage() {
  const [kbId, setKbId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTopK, setSearchTopK] = useState(5)
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  
  const [msg, contextHolder] = message.useMessage()
  const [topicList, setTopicList] = useState<Array<{ id: string; name: string }>>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [topicLoading, setTopicLoading] = useState(false)

  useEffect(() => {
    if (kbId === null) {
      setTopicList([])
      setSelectedTopicIds([])
    } else {
      setTopicLoading(true)
      const doFetch = async () => {
        try {
          const res = await fetch(`/api/kb/list-topics?kbId=${encodeURIComponent(kbId)}`)
          if (res.ok) {
            const data = await res.json()
            if (data.success && Array.isArray(data.data)) {
              setTopicList(data.data)
            }
          }
        } catch {
          msg.error('加载分类列表失败')
        } finally {
          setTopicLoading(false)
        }
      }
      doFetch()
    }
  }, [kbId])

  const handleSearch = async () => {
    if (!kbId || !searchQuery) {
      msg.info('请选择知识库并填写查询内容')
      return
    }

    if (selectedTopicIds.length === 0) {
      msg.info('请至少选择一个分类')
      return
    }

    setLoading(true)
    try {
      const queryParts: string[] = [
        `kbId=${encodeURIComponent(kbId)}`,
        `topicIds=${encodeURIComponent(selectedTopicIds.join(','))}`,
        `query=${encodeURIComponent(searchQuery)}`,
        `top_k=${searchTopK}`,
      ]
      const res = await fetch(`/api/kb/search?${queryParts.join('&')}`)
      
      if (!res.ok) {
        const errorMessage = await res.text()
        if (res.status >= 400 && res.status < 500) {
          msg.info(errorMessage)
        } else {
          msg.error('检索失败')
        }
        return
      }
      
      const data: SearchResponse = await res.json()
      setSearchResults(data)
      if (data.success) {
        msg.success(`找到 ${data.data?.results.length || 0} 个相关结果`)
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
      {contextHolder}
      
      <KBSelector kbId={kbId} setKbId={setKbId} />

      <Card title={<Title level={4} style={{ margin: 0 }}>语义检索</Title>}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>查询语句</Text>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入查询内容..."
              size="large"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>分类筛选（必选）</Text>
            <Select
              mode="multiple"
              value={selectedTopicIds}
              onChange={setSelectedTopicIds}
              loading={topicLoading}
              placeholder="请选择分类"
              style={{ width: '100%' }}
              options={topicList.map(t => ({ value: t.id, label: t.name }))}
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 150 }}>
            <Text strong style={{ display: 'block', marginBottom: 0 }}>返回结果数量 (top_k)</Text>
            <InputNumber
              value={searchTopK}
              onChange={(value) => setSearchTopK(value || 5)}
              min={1}
              max={100}
              style={{ width: '100%' }}
            />
          </div>
          
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={loading}
            size="large"
          >
            开始检索
          </Button>
        </Space>

        {searchResults && searchResults.data && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24, gap: 16 }}>
            <Space style={{ marginBottom: 16 }}>
              <Text strong>检索结果</Text>
              <Tag color="blue">{searchResults.data.results.length} 条</Tag>
            </Space>
            
            {searchResults.data.results.length === 0 ? (
              <Empty description="未找到相关结果" />
            ) : (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {searchResults.data.results.map((result, index) => (
                  <Card
                    key={result.id}
                    size="small"
                    style={{ background: '#fafafa' }}
                  >
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text strong>#{index + 1} · ID: {result.id}</Text>
                        <Space>
                          <Tag color={result.source === 'hybrid' ? 'purple' : result.source === 'dense' ? 'blue' : 'green'}>
                            {result.source === 'hybrid' ? '混合' : result.source === 'dense' ? '语义' : '关键词'}
                          </Tag>
                          <Tag color="success">{(result.score * 100).toFixed(1)}% 相似度</Tag>
                        </Space>
                      </Space>
                      
                      <Card size="small">
                        <Text>{result.content}</Text>
                      </Card>
                      
                      {result.metadata && (
                        <Space size="large">
                          <Text type="secondary" style={{ fontSize: 12 }}>主题ID: {result.topicId === null ? 'N/A' : result.topicId}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>切割模型: {result.metadata.cutModel || 'N/A'}</Text>
                        </Space>
                      )}
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
