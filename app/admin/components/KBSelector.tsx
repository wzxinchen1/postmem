'use client'

import { useState, useEffect } from 'react'
import { Card, Select, Typography } from 'antd'
import { post } from '@/app/admin/lib/request'

const { Text } = Typography

interface KBSelectorProps {
  kbName: string
  setKbName: (name: string) => void
}

interface KBInfo {
  kbName: string
  total: number
  lastUpdated?: string
}

export function KBSelector({ kbName, setKbName }: KBSelectorProps) {
  const [kbList, setKbList] = useState<KBInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchKBList = async () => {
      try {
        const data = await post<{ success: boolean; data?: { kbNames: KBInfo[] } }>('/api/kb/stats', {})
        if (data.success && data.data?.kbNames) {
          setKbList(data.data.kbNames)
        }
      } catch (error) {
      } finally {
        setLoading(false)
      }
    }
    fetchKBList()
  }, [])

  return (
    <Card style={{ marginBottom: 24 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>知识库名称</Text>
      <Select
        value={kbName || undefined}
        onChange={setKbName}
        loading={loading}
        placeholder={loading ? '加载中...' : '请选择知识库'}
        style={{ width: '100%' }}
        options={kbList.map(kb => ({
          value: kb.kbName,
          label: `${kb.kbName} (${kb.total} 条记录)`
        }))}
      />
    </Card>
  )
}
