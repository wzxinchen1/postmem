'use client'

import { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Typography, Button, Empty, Space, message } from 'antd'
import { BookOutlined, FileTextOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { StatsResponse } from '@/app/admin/types'
import { get, post } from '@/app/admin/lib/request'

const { Title, Text } = Typography

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [statsResults, setStatsResults] = useState<StatsResponse | null>(null)
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    handleStats()
  }, [])

  const handleStats = async () => {
    setLoading(true)
    try {
      const data = await get<StatsResponse>('/api/kb/stats')
      setStatsResults(data)
    } catch (err) {
      msg.error('加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }

  const totalFragments = statsResults?.data?.kbNames?.reduce((sum, kb) => sum + kb.total, 0) || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {contextHolder}
      
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="知识库总数"
              value={statsResults?.data?.kbNames?.length || 0}
              prefix={<BookOutlined style={{ color: '#1677ff' }} />}
              style={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="片段总数"
              value={totalFragments}
              prefix={<FileTextOutlined style={{ color: '#52c41a' }} />}
              style={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="系统状态"
              value="运行正常"
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              style={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>知识库概览</Title>
          </Space>
        }
        extra={
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={handleStats}
            loading={loading}
          >
            刷新数据
          </Button>
        }
      >
        {statsResults?.data?.kbNames && statsResults.data.kbNames.length > 0 ? (
          <Row gutter={[16, 16]}>
            {statsResults.data.kbNames.map((proj) => (
              <Col xs={24} sm={12} md={8} lg={6} key={proj.kbId}>
                <Card 
                  size="small"
                  style={{ background: '#fafafa' }}
                >
                  <Space vertical style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text strong>{proj.kbName}</Text>
                      <Text type="success" strong>{proj.total} 条</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      最后更新: {new Date(proj.lastUpdated).toLocaleString('zh-CN')}
                    </Text>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Empty
            description={
              <Space vertical>
                <Text>暂无知识库</Text>
                <Text type="secondary">请前往「知识列表」创建知识库</Text>
              </Space>
            }
          />
        )}
      </Card>
    </div>
  )
}
