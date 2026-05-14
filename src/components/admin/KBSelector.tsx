'use client'

import { useState, useEffect } from 'react'
import { Card, Select, Typography } from 'antd'
import { post } from '@/app/admin/lib/request'

const { Text } = Typography

interface KBSelectorProps {
  kbId: number | null
  setKbId: (id: number) => void
}

interface KBInfo {
  kbId: number
  kbName: string
  total: number
  lastUpdated?: string
}

export function KBSelector({ kbId, setKbId }: KBSelectorProps) {
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
      <Text strong style={{ display: 'block', marginBottom: 8 }}>知识库</Text>
      <Select
        value={kbId || undefined}
        onChange={setKbId}
        loading={loading}
        placeholder={loading ? '加载中...' : '请选择知识库'}
        style={{ width: '100%' }}
        options={kbList.map(kb => ({
          value: kb.kbId,
          label: `${kb.kbName} (${kb.total} 条记录)`
        }))}
      />
    </Card>
  )
}
