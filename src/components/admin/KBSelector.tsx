'use client'

import { useState, useEffect } from 'react'
import { Select } from 'antd'
import { get } from '@/app/admin/lib/request'

interface KBSelectorProps {
  kbId: string | null
  setKbId: (id: string | null) => void
}

interface KBInfo {
  kbId: string
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
        const data = await get<{ success: boolean; data?: { kbNames: KBInfo[] } }>('/api/kb/stats')
        if (data.success && data.data !== undefined && data.data.kbNames !== undefined) {
          setKbList(data.data.kbNames)
        }
      } catch {
      } finally {
        setLoading(false)
      }
    }
    fetchKBList()
  }, [])

  return (
    <Select
      value={kbId || undefined}
      onChange={setKbId}
      loading={loading}
      placeholder={loading ? '加载中...' : '请选择知识库'}
      style={{ width: '100%' }}
      options={kbList.map(kb => ({
        value: kb.kbId,
        label: `${kb.kbName} (${kb.total} 条记录)`,
      }))}
    />
  )
}
