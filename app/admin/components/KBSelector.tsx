'use client'

import { useState, useEffect } from 'react'
import { COLORS } from '@/app/admin/constants'
import { post } from '@/app/admin/lib/request'

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
    <div style={{
      background: COLORS.cardBg,
      padding: '1.25rem 1.5rem',
      borderRadius: '10px',
      marginBottom: '1.5rem',
      border: `1px solid ${COLORS.border}`,
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
    }}>
      <label style={{
        display: 'block',
        marginBottom: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '600',
        color: COLORS.text
      }}>
        知识库名称
      </label>
      <select
        value={kbName}
        onChange={(e) => setKbName(e.target.value)}
        disabled={loading}
        style={{
          width: '100%',
          padding: '0.625rem 0.875rem',
          border: `1px solid ${COLORS.border}`,
          borderRadius: '6px',
          fontSize: '0.875rem',
          outline: 'none',
          background: COLORS.bg,
          cursor: loading ? 'not-allowed' : 'pointer',
          color: loading ? COLORS.textMuted : COLORS.text
        }}
      >
        <option value="">
          {loading ? '加载中...' : '请选择知识库'}
        </option>
        {kbList.map((kb) => (
          <option key={kb.kbName} value={kb.kbName}>
            {kb.kbName} ({kb.total} 条记录)
          </option>
        ))}
      </select>
    </div>
  )
}
