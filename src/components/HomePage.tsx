'use client'

import { Layout, Typography, Row, Col, Card, Button, Space } from 'antd'
import { LockOutlined, ThunderboltOutlined, BulbOutlined, SettingOutlined, BookOutlined, GithubOutlined } from '@ant-design/icons'
import Link from 'next/link'

const { Content } = Layout
const { Title, Paragraph, Text } = Typography

export default function HomePage() {
  return (
    <Layout style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Content style={{ 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px'
      }}>
        <div style={{ maxWidth: '1000px', textAlign: 'center' }}>
          <Title level={1} style={{ color: '#fff', fontSize: '4rem', marginBottom: 8 }}>
            PostMem
          </Title>
          <Title level={2} style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 400, marginTop: 0 }}>
            个人知识库系统
          </Title>
          <Paragraph style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '1.1rem', marginBottom: 48 }}>
            基于本地嵌入向量和智能文本切割的知识管理系统<br />
            支持高精度语义检索，保障数据主权
          </Paragraph>

          <Space size="middle" wrap style={{ marginBottom: 64 }}>
            <Link href="/admin">
              <Button type="primary" size="large" icon={<SettingOutlined />}>
                管理中心
              </Button>
            </Link>
            <Link href="/api-docs">
              <Button size="large" icon={<BookOutlined />} style={{ background: 'rgba(255, 255, 255, 0.95)', borderColor: 'transparent' }}>
                API 文档
              </Button>
            </Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <Button 
                size="large" 
                icon={<GithubOutlined />}
                style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.3)' }}
              >
                GitHub
              </Button>
            </a>
          </Space>

          <Row gutter={[24, 24]} justify="center">
            <Col xs={24} sm={8}>
              <Card style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none' }}>
                <LockOutlined style={{ fontSize: '2rem', color: '#fff', marginBottom: 16 }} />
                <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>数据隐私</Title>
                <Text style={{ color: 'rgba(255, 255, 255, 0.8)' }}>嵌入向量完全本地生成</Text>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none' }}>
                <ThunderboltOutlined style={{ fontSize: '2rem', color: '#fff', marginBottom: 16 }} />
                <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>高性能</Title>
                <Text style={{ color: 'rgba(255, 255, 255, 0.8)' }}>百万级向量毫秒级检索</Text>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none' }}>
                <BulbOutlined style={{ fontSize: '2rem', color: '#fff', marginBottom: 16 }} />
                <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>智能切割</Title>
                <Text style={{ color: 'rgba(255, 255, 255, 0.8)' }}>大模型驱动的语义切割</Text>
              </Card>
            </Col>
          </Row>
        </div>
      </Content>
    </Layout>
  )
}