'use client'

import { useState } from 'react'
import { Badge, Button, Space, Typography, Drawer, Tag, Empty } from 'antd'
import { MergeCellsOutlined, DeleteOutlined, ClearOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import type { CartItem } from './types'

const { Text } = Typography

interface MergeCartBarProps {
  items: CartItem[]
  onRemove: (id: string) => void
  onClear: () => void
  onMerge: (rows: CartItem[]) => void
}

export function MergeCartBar({ items, onRemove, onClear, onMerge }: MergeCartBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        borderTop: '2px solid #1677ff',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 1000,
        boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
      }}>
        <Space>
          <ShoppingCartOutlined style={{ fontSize: 18, color: '#1677ff' }} />
          <Badge count={items.length} showZero={false} style={{ backgroundColor: '#1677ff' }}>
            <Text strong style={{ fontSize: 15, marginLeft: 8 }}>
              待合并
            </Text>
          </Badge>
          <Text type="secondary" style={{ fontSize: 13 }}>
            共 {items.reduce((s, i) => s + i.charLength, 0).toLocaleString()} 字符
          </Text>
        </Space>

        <Space>
          <Button size="small" onClick={() => setDrawerOpen(true)}>
            查看详情（{items.length}）
          </Button>
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={onClear}
          >
            清空
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<MergeCellsOutlined />}
            disabled={items.length < 2}
            onClick={() => onMerge(items)}
          >
            合并（{items.length}）
          </Button>
        </Space>
      </div>

      <Drawer
        title={
          <Space>
            <ShoppingCartOutlined />
            待合并列表
            <Tag>{items.length} 个片段</Tag>
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={500}
        footer={
          <Space style={{ float: 'right' }}>
            <Button icon={<ClearOutlined />} onClick={onClear}>清空</Button>
            <Button
              type="primary"
              icon={<MergeCellsOutlined />}
              disabled={items.length < 2}
              onClick={() => {
                setDrawerOpen(false)
                onMerge(items)
              }}
            >
              合并（{items.length}）
            </Button>
          </Space>
        }
      >
        {items.length === 0 ? (
          <Empty description="待合并列表为空" />
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: '#fafafa',
                  border: '1px solid #f0f0f0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space style={{ marginBottom: 4 }}>
                    <Text strong ellipsis style={{ maxWidth: 200 }}>
                      {item.title}
                    </Text>
                    <Tag style={{ flexShrink: 0 }}>{item.charLength.toLocaleString()} 字符</Tag>
                    {item.topicName !== null && <Tag color="blue" style={{ flexShrink: 0 }}>{item.topicName}</Tag>}
                  </Space>
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}
                  >
                    {item.content.slice(0, 200)}
                  </Typography.Paragraph>
                </div>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => onRemove(item.id)}
                />
              </div>
            ))}
          </Space>
        )}
      </Drawer>
    </>
  )
}
