'use client'

import { useState, useEffect } from 'react'
import { COLORS } from '@/app/admin/constants'
import { StatsResponse, IngestResponse } from '@/app/admin/types'
import { useMessage } from '@/app/admin/hooks/useMessage'
import { Message } from '@/app/admin/components/Message'
import { CreateKBModal } from '@/app/admin/components/modals/CreateKBModal'
import { IngestModal } from '@/app/admin/components/modals/IngestModal'

export default function KBManagePage() {
  const [statsResults, setStatsResults] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [showIngestModal, setShowIngestModal] = useState(false)
  const [selectedKbForIngest, setSelectedKbForIngest] = useState<string>('')
  const [ingestContent, setIngestContent] = useState('')
  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null)
  
  const { message, showMessage } = useMessage()

  useEffect(() => {
    handleStats()
  }, [])

  const handleStats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/kb/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data: StatsResponse = await res.json()
      setStatsResults(data)
    } catch (err) {
      showMessage('error', '获取知识库列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleIngest = async () => {
    if (!selectedKbForIngest || !ingestContent) {
      showMessage('error', '请填写知识库名和内容')
      return
    }

    try {
      const res = await fetch('/api/kb/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kbName: selectedKbForIngest, content: ingestContent })
      })
      const data: IngestResponse = await res.json()
      setIngestResult(data)
      if (data.success) {
        showMessage('success', `入库成功！创建了 ${data.data?.count} 个片段`)
        setIngestContent('')
        handleStats()
        setTimeout(() => {
          setShowIngestModal(false)
          setIngestResult(null)
        }, 2000)
      } else {
        showMessage('error', data.error?.message || '入库失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    }
  }

  const handleCreateKB = async () => {
    if (!newKbName.trim()) {
      showMessage('error', '请输入知识库名称')
      return
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(newKbName)) {
      showMessage('error', '名称只能包含字母、数字、中划线和下划线')
      return
    }
    
    try {
      const res = await fetch('/api/kb/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          kbName: newKbName, 
          content: `[知识库占位符] ${newKbName} - 创建于 ${new Date().toLocaleString('zh-CN')}` 
        })
      })
      const data = await res.json()
      
      if (data.success) {
        showMessage('success', `知识库 "${newKbName}" 创建成功`)
        setShowCreateModal(false)
        setNewKbName('')
        handleStats()
      } else {
        showMessage('error', data.error?.message || '创建失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    }
  }

  return (
    <>
      <Message message={message} />

      {/* 操作栏 */}
      <div style={{
        background: COLORS.cardBg,
        borderRadius: '10px',
        border: `1px solid ${COLORS.border}`,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        padding: '1rem 1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '0.875rem',
          color: COLORS.textSecondary
        }}>
          点击知识库卡片进行入库操作
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => {
              setNewKbName('')
              setShowCreateModal(true)
            }}
            style={{
              padding: '0.5rem 1rem',
              background: COLORS.success,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem'
            }}
          >
            <span>+</span> 新增知识库
          </button>
          <button
            onClick={handleStats}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              background: loading ? COLORS.border : COLORS.primary,
              color: loading ? COLORS.textMuted : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              fontSize: '0.8125rem'
            }}
          >
            {loading ? '刷新中...' : '刷新列表'}
          </button>
        </div>
      </div>

      {/* 知识库卡片列表 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '1rem'
      }}>
        {statsResults?.data?.kbNames?.map((kb) => (
          <div
            key={kb.kbName}
            onClick={() => {
              setSelectedKbForIngest(kb.kbName)
              setShowIngestModal(true)
            }}
            style={{
              background: COLORS.cardBg,
              borderRadius: '10px',
              border: `1px solid ${COLORS.border}`,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              padding: '1.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = COLORS.primary
              e.currentTarget.style.boxShadow = '0 4px 12px 0 rgba(59, 130, 246, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.border
              e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '1rem'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: `linear-gradient(135deg, ${COLORS.primary} 0%, #8b5cf6 100%)`,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '1.25rem'
              }}>
                📚
              </div>
              <span style={{
                background: COLORS.successLight,
                color: '#065f46',
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                {kb.total} 条
              </span>
            </div>
            <h3 style={{
              margin: '0 0 0.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: COLORS.text
            }}>
              {kb.kbName}
            </h3>
            <div style={{
              fontSize: '0.8125rem',
              color: COLORS.textMuted
            }}>
              最后更新: {new Date(kb.lastUpdated).toLocaleString('zh-CN')}
            </div>
          </div>
        ))}

        {/* 空状态 */}
        {(!statsResults?.data?.kbNames || statsResults.data.kbNames.length === 0) && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '4rem 2rem',
            background: COLORS.cardBg,
            borderRadius: '10px',
            border: `1px solid ${COLORS.border}`
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem',
              opacity: 0.5
            }}>
              📚
            </div>
            <div style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: COLORS.text,
              marginBottom: '0.5rem'
            }}>
              暂无知识库
            </div>
            <div style={{
              fontSize: '0.875rem',
              color: COLORS.textSecondary
            }}>
              点击上方"新增知识库"按钮创建第一个知识库
            </div>
          </div>
        )}
      </div>

      {/* 新建知识库模态窗口 */}
      <CreateKBModal
        show={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setNewKbName('')
        }}
        newKbName={newKbName}
        setNewKbName={setNewKbName}
        loading={loading}
        showMessage={showMessage}
        onCreated={() => {
          setShowCreateModal(false)
          setNewKbName('')
          handleStats()
        }}
      />

      {/* 入库模态窗口 */}
      <IngestModal
        show={showIngestModal}
        onClose={() => {
          setShowIngestModal(false)
          setIngestContent('')
          setIngestResult(null)
          handleStats()
        }}
        selectedKb={selectedKbForIngest}
        content={ingestContent}
        setContent={setIngestContent}
        loading={loading}
        result={ingestResult}
        onIngest={handleIngest}
      />
    </>
  )
}
