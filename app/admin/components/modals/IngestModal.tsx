'use client'

import { useEffect } from 'react'
import { message } from 'antd'
import { COLORS } from '@/app/admin/constants'
import { IngestResponse } from '@/app/admin/types'

interface IngestModalProps {
  show: boolean
  onClose: () => void
  selectedKb: string
  content: string
  setContent: (content: string) => void
  loading: boolean
  result: IngestResponse | null
  onIngest: () => void
}

export function IngestModal({
  show,
  onClose,
  selectedKb,
  content,
  setContent,
  loading,
  result,
  onIngest
}: IngestModalProps) {
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    if (result) {
      if (result.success) {
        msg.success(`入库成功！创建了 ${result.data?.count} 个片段`)
      } else if (result.error) {
        msg.error(result.error.message || '入库失败')
      }
    }
  }, [result, msg])

  if (!show) return null

  return (
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
      {contextHolder}
      <div style={{
        background: COLORS.cardBg,
        borderRadius: '12px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: '1.125rem',
              fontWeight: '600',
              color: COLORS.text
            }}>
              知识入库
            </h3>
            <div style={{
              fontSize: '0.875rem',
              color: COLORS.textSecondary,
              marginTop: '0.25rem'
            }}>
              目标知识库: {selectedKb}
            </div>
          </div>
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
              color: COLORS.textMuted,
              transition: 'all 0.2s'
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          padding: '1.5rem',
          overflowY: 'auto',
          maxHeight: 'calc(90vh - 140px)'
        }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: COLORS.text
            }}>
              文本内容
              <span style={{
                color: COLORS.textMuted,
                fontWeight: '400',
                marginLeft: '0.5rem'
              }}>
                （最大 20000 字符）
              </span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入要入库的文本内容..."
              rows={12}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${COLORS.border}`,
                borderRadius: '6px',
                fontSize: '0.875rem',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                background: COLORS.bg,
                lineHeight: '1.6'
              }}
            />
            <div style={{
              marginTop: '0.5rem',
              fontSize: '0.75rem',
              color: COLORS.textMuted,
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>支持长文本,系统会自动进行分块处理</span>
              <span style={{ fontWeight: '500' }}>
                {content.length} / 20000
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={onIngest}
              disabled={loading || !content}
              style={{
                flex: 1,
                padding: '0.75rem 1.5rem',
                background: loading || !content ? COLORS.border : COLORS.primary,
                color: loading || !content ? COLORS.textMuted : 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading || !content ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}
            >
              {loading ? '处理中...' : '开始入库'}
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
              稍后添加
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}