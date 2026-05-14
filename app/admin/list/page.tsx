'use client'

import { useState, useEffect } from 'react'
import { message, Card, Table, Button, Select, Space, Typography, Empty, Popconfirm } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { ListResponse } from '@/app/admin/types'
import { post } from '@/app/admin/lib/request'
import { KBSelector } from '@/app/admin/components/KBSelector'

const { Title, Text } = Typography

export default function ListPage() {
  const [kbName, setKbName] = useState('')
  const [loading, setLoading] = useState(false)
  const [listPage, setListPage] = useState(1)
  const [listLimit, setListLimit] = useState(10)
  const [listResults, setListResults] = useState<ListResponse | null>(null)
  
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    if (kbName) {
      fetchList()
    }
  }, [kbName, listPage, listLimit])

  const fetchList = async () => {
    setLoading(true)
    try {
      const data = await post<ListResponse>('/api/kb/list', { kbName, page: listPage, limit: listLimit })
      setListResults(data)
    } catch (err) {
      msg.error('加载片段列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
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
      title: '片段索引',
      dataIndex: 'chunkIndex',
      key: 'chunkIndex',
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
      width: 100,
      render: (_: unknown, record: { id: number }) => (
        <Popconfirm
          title="确定要删除这条记录吗？"
          onConfirm={() => handleDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button 
            type="primary" 
            danger 
            icon={<DeleteOutlined />}
            loading={loading}
          >
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      {contextHolder}
      
      <KBSelector kbName={kbName} setKbName={setKbName} />

      <Card title={<Title level={4} style={{ margin: 0 }}>片段列表</Title>}>
        {!kbName ? (
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
            
            <Table
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
    </>
  )
}
