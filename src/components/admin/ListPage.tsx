'use client'

import { useState, useEffect } from 'react'
import { message, Card, Table, Button, Select, Space, Typography, Empty, Popconfirm, Modal } from 'antd'
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import { ListResponse, ListItem } from '@/app/admin/types'
import { get, post } from '@/app/admin/lib/request'
import { KBSelector } from '@/src/components/admin/KBSelector'

const { Title, Text } = Typography

export default function ListPage() {
  const [kbId, setKbId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [listPage, setListPage] = useState(1)
  const [listLimit, setListLimit] = useState(10)
  const [listResults, setListResults] = useState<ListResponse | null>(null)
  
  const [msg, contextHolder] = message.useMessage()
  const [viewContent, setViewContent] = useState<string | null>(null)

  useEffect(() => {
    if (kbId) {
      fetchList()
    }
  }, [kbId, listPage, listLimit])

  const fetchList = async () => {
    if (!kbId) return
    setLoading(true)
    try {
      const data = await get<ListResponse>('/api/kb/list', { kbId, page: listPage, limit: listLimit })
      setListResults(data)
    } catch (err) {
      msg.error('加载片段列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setLoading(true)
    try {
      const data = await post<{ success: boolean }>('/api/kb/delete', { id })
      if (data.success) {
        msg.success('删除成功')
        fetchList()
      }
    } catch (err) {
      msg.error('删除失败')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '内容摘要',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      width: 400,
    },
    {
      title: '所属主题',
      dataIndex: 'topicId',
      key: 'topicId',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: ListItem) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewContent(record.content)}
          >
            查看
          </Button>
          <Popconfirm
            title="确定要删除这条记录吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              type="primary" 
              danger 
              size="small"
              icon={<DeleteOutlined />}
              loading={loading}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
      {contextHolder}
      
      <KBSelector kbId={kbId} setKbId={setKbId} />

      <Card title={<Title level={4} style={{ margin: 0 }}>片段列表</Title>}>
        {!kbId ? (
          <Empty description={<Text type="secondary">请先选择知识库</Text>} />
        ) : (
          <>
            <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">共 {listResults?.data?.total || 0} 条记录</Text>
              <Space>
                <Text>当前第 {listPage} 页</Text>
                <Text>每页显示:</Text>
                <Select
                  value={listLimit}
                  onChange={(value) => { setListLimit(value); setListPage(1); }}
                  options={[
                    { value: 10, label: '10' },
                    { value: 20, label: '20' },
                    { value: 50, label: '50' },
                    { value: 100, label: '100' },
                  ]}
                  style={{ width: 80 }}
                />
              </Space>
            </Space>
            
            <Table<ListItem>
              columns={columns}
              dataSource={listResults?.data?.items || []}
              rowKey="id"
              loading={loading}
              pagination={{
                current: listPage,
                pageSize: listLimit,
                total: listResults?.data?.total || 0,
                onChange: (page) => setListPage(page),
                showSizeChanger: false,
              }}
            />
          </>
        )}
      </Card>
      
      <Modal
        title="内容详情"
        open={!!viewContent}
        onCancel={() => setViewContent(null)}
        footer={[
          <Button key="close" onClick={() => setViewContent(null)}>
            关闭
          </Button>
        ]}
        width={700}
        styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
      >
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {viewContent}
        </div>
      </Modal>
    </div>
  )
}
