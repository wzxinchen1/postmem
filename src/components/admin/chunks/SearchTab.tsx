'use client'

import { useState, useEffect } from 'react'
import {
  Card, Input, InputNumber, Button, Space, Typography, Tag, Empty, message, Select, Alert,
} from 'antd'
import { SearchOutlined, PlusOutlined, CheckOutlined } from '@ant-design/icons'
import type { SearchResponse, SearchResult, TopicInfo } from '@/app/admin/types'
import type { CartItem } from './types'
import { get } from '@/app/admin/lib/request'

const { Text } = Typography

interface SearchTabProps {
  kbId: string | null
  topicList: TopicInfo[]
  isInCart: (id: string) => boolean
  onAddToCart: (item: CartItem) => void
}

export function SearchTab({ kbId, topicList, isInCart, onAddToCart }: SearchTabProps) {
  const [msg, contextHolder] = message.useMessage()
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(10)
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResponse | null>(null)

  useEffect(() => {
    if (topicList.length > 0 && selectedTopicIds.length === 0) {
      setSelectedTopicIds(topicList.map(t => t.id))
    }
  }, [topicList])

  const handleSearch = async () => {
    if (kbId === null) {
      msg.warning('请先选择知识库')
      return
    }
    if (!query.trim()) {
      msg.warning('请输入搜索词')
      return
    }
    if (selectedTopicIds.length === 0) {
      msg.warning('请至少选择一个分类')
      return
    }

    setLoading(true)
    setResults(null)
    try {
      const queryParts: string[] = [
        `kbId=${encodeURIComponent(kbId)}`,
        `topicIds=${encodeURIComponent(selectedTopicIds.join(','))}`,
        `query=${encodeURIComponent(query.trim())}`,
        `top_k=${topK}`,
      ]
      const data = await get<SearchResponse>(`/api/kb/search?${queryParts.join('&')}`)
      setResults(data)
      if (data.success && data.data !== undefined) {
        msg.success(`找到 ${data.data.results.length} 个相关结果`)
      }
    } catch {
      msg.error('搜索请求失败')
    } finally {
      setLoading(false)
    }
  }

  const resultToCartItem = (result: SearchResult): CartItem => ({
    id: result.id,
    title: result.title,
    content: result.content,
    charLength: result.content.length,
    topicId: result.topicId,
    topicName: null,
    kbId: kbId ?? '',
    kbName: '',
  })

  const sourceLabel: Record<string, string> = {
    hybrid: '混合',
    dense: '语义',
    sparse: '关键词',
  }
  const sourceColor: Record<string, string> = {
    hybrid: 'purple',
    dense: 'blue',
    sparse: 'green',
  }

  return (
    <Card title="语义搜索">
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>搜索词</Text>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入搜索词，查找相关片段..."
            size="large"
            onPressEnter={handleSearch}
          />
        </Space>

        <Space wrap style={{ width: '100%' }}>
          <div style={{ minWidth: 250, flex: 1 }}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>分类筛选</Text>
            <Select
              mode="multiple"
              value={selectedTopicIds}
              onChange={setSelectedTopicIds}
              placeholder="选择分类（默认全选）"
              style={{ width: '100%' }}
              options={topicList.map(t => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div style={{ minWidth: 120 }}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>返回数量</Text>
            <InputNumber
              value={topK}
              onChange={(val) => setTopK(val ?? 10)}
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
            style={{ marginTop: 22 }}
          >
            搜索
          </Button>
        </Space>

        {loading && (
          <Alert
            type="info"
            showIcon
            message="搜索中，数据量较大时可能需要几秒钟..."
            style={{ marginBottom: 0 }}
          />
        )}

        {results !== null && results.data !== undefined && (
          <>
            <Text type="secondary">
              共 {results.data.results.length} 条结果
              {results.data.results.length > 0 && `（已加入 ${results.data.results.filter(r => isInCart(r.id)).length} 条）`}
            </Text>

            {results.data.results.length === 0 ? (
              <Empty description="未找到匹配结果，请尝试修改搜索词或分类" />
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {results.data.results.map((result) => {
                  const title = result.title
                  const inCart = isInCart(result.id)
                  return (
                    <div
                      key={result.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 6,
                        background: '#fafafa',
                        border: '1px solid #f0f0f0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space style={{ marginBottom: 6, flexWrap: 'wrap' }}>
                            <Text strong style={{ fontSize: 14 }}>{title}</Text>
                            <Tag color={sourceColor[result.source]} style={{ flexShrink: 0 }}>
                              {sourceLabel[result.source] ?? result.source}
                            </Tag>
                            <Tag color="success" style={{ flexShrink: 0 }}>
                              {(result.score * 100).toFixed(1)}%
                            </Tag>
                          </Space>
                          <Text
                            style={{ display: 'block', fontSize: 13, lineHeight: 1.6, color: '#595959' }}
                          >
                            {result.content}
                          </Text>
                        </div>
                        <Button
                          size="small"
                          icon={inCart ? <CheckOutlined /> : <PlusOutlined />}
                          disabled={inCart}
                          onClick={() => onAddToCart(resultToCartItem(result))}
                        >
                          {inCart ? '已加入' : '待合并'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </Space>
            )}
          </>
        )}

        {results !== null && results.data === undefined && (
          <Empty description="搜索返回异常" />
        )}
      </Space>
    </Card>
  )
}
