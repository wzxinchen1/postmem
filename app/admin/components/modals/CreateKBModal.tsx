'use client'

import { message } from 'antd'
import { COLORS } from '@/app/admin/constants'

interface CreateKBModalProps {
  show: boolean
  onClose: () => void
  newKbName: string
  setNewKbName: (name: string) => void
  loading: boolean
  onCreated: () => void
}

export function CreateKBModal({
  show,
  onClose,
  newKbName,
  setNewKbName,
  loading,
  onCreated
}: CreateKBModalProps) {
  const [msg, contextHolder] = message.useMessage()
  if (!show) return null

  const handleCreate = async () => {
    if (!newKbName.trim()) {
      msg.error('请输入知识库名称')
      return
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(newKbName)) {
      msg.error('名称只能包含字母、数字、中划线和下划线')
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
        msg.success(`知识库 "${newKbName}" 创建成功`)
        onCreated()
      } else {
        msg.error(data.error?.message || '创建失败')
      }
    } catch (err) {
      msg.error('网络请求失败')
    }
  }

  return (
    <>
    {contextHolder}
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem'
    }}>
      <div style={{
        background: COLORS.cardBg,
        borderRadius: '12px',
        width: '100%',
        maxWidth: '480px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '1.125rem',
            fontWeight: '600',
            color: COLORS.text
          }}>
            新增知识库
          </h3>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              color: COLORS.textMuted
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: COLORS.text
            }}>
              知识库名称
            </label>
            <input
              type="text"
              value={newKbName}
              onChange={(e) => setNewKbName(e.target.value)}
              placeholder="输入知识库名称（如：my-knowledge-base）"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${COLORS.border}`,
                borderRadius: '6px',
                fontSize: '0.875rem',
                outline: 'none',
                background: COLORS.bg
              }}
            />
            <div style={{
              marginTop: '0.5rem',
              fontSize: '0.75rem',
              color: COLORS.textMuted
            }}>
              名称只能包含字母、数字、中划线和下划线
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleCreate}
              disabled={!newKbName.trim() || loading}
              style={{
                flex: 1,
                padding: '0.75rem 1.5rem',
                background: !newKbName.trim() || loading ? COLORS.border : COLORS.success,
                color: !newKbName.trim() || loading ? COLORS.textMuted : 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: !newKbName.trim() || loading ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}
            >
              {loading ? '创建中...' : '创建知识库'}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'transparent',
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}