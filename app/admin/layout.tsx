'use client'

import { ReactNode } from 'react'
import { Layout, Menu, Typography, Space, Button } from 'antd'
import { HomeOutlined, BookOutlined, SearchOutlined, UnorderedListOutlined, ApiOutlined, RobotOutlined, SettingOutlined, MessageOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { usePathname, useRouter } from 'next/navigation'

const { Header, Content } = Layout
const { Title } = Typography

const menuItems = [
  { key: '/admin', label: '概览', icon: <HomeOutlined /> },
  { key: '/admin/kb', label: '知识列表', icon: <BookOutlined /> },
  { key: '/admin/search', label: '语义检索', icon: <SearchOutlined /> },
  { key: '/admin/list', label: '片段列表', icon: <UnorderedListOutlined /> },
  { key: '/admin/sessions', label: '会话记录', icon: <MessageOutlined /> },
  { key: '/admin/providers', label: '提供商管理', icon: <ApiOutlined /> },
  { key: '/admin/models', label: '模型管理', icon: <RobotOutlined /> },
  { key: '/admin/settings', label: '应用设置', icon: <SettingOutlined /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const activeKey = menuItems.find(item => 
    item.key === pathname || (item.key !== '/admin' && pathname.startsWith(item.key))
  )?.key || '/admin'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        display: 'flex', 
        alignItems: 'center',
        padding: '0 24px',
        background: '#001529'
      }}>
        <Space size="middle">
          <Title level={4} style={{ margin: 0, color: '#fff', fontWeight: 600 }}>
            PostMem Dashboard
          </Title>
        </Space>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{ flex: 1, minWidth: 0, marginLeft: 24 }}
        />
        <Button 
          type="link" 
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/')}
          style={{ color: 'rgba(255, 255, 255, 0.85)' }}
        >
          返回首页
        </Button>
      </Header>
      <Content style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        {children}
      </Content>
    </Layout>
  )
}