'use client'

import { useState, useEffect } from 'react'
import { COLORS } from './constants'
import { StatsResponse } from './types'
import { useMessage } from './hooks/useMessage'
import { Message } from './components/Message'

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [statsResults, setStatsResults] = useState<StatsResponse | null>(null)
  
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
      showMessage('error', '获取统计数据失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Message message={message} />

      {/* 统计卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          background: COLORS.cardBg,
          padding: '1.5rem',
          borderRadius: '10px',
          border: `1px solid ${COLORS.border}`,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem'
          }}>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: COLORS.textSecondary
            }}>
              知识库总数
            </span>
            <span style={{
              width: '32px',
              height: '32px',
              background: COLORS.primaryLight,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem'
            }}>
              📚
            </span>
          </div>
          <div style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: COLORS.text
          }}>
            {statsResults?.data?.kbNames?.length || 0}
          </div>
        </div>

        <div style={{
          background: COLORS.cardBg,
          padding: '1.5rem',
          borderRadius: '10px',
          border: `1px solid ${COLORS.border}`,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem'
          }}>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: COLORS.textSecondary
            }}>
              片段总数
            </span>
            <span style={{
              width: '32px',
              height: '32px',
              background: '#d1fae5',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem'
            }}>
              📝
            </span>
          </div>
          <div style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: COLORS.text
          }}>
            {statsResults?.data?.kbNames?.reduce((sum, kb) => sum + kb.total, 0) || 0}
          </div>
        </div>

        <div style={{
          background: COLORS.cardBg,
          padding: '1.5rem',
          borderRadius: '10px',
          border: `1px solid ${COLORS.border}`,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem'
          }}>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: COLORS.textSecondary
            }}>
              系统状态
            </span>
            <span style={{
              width: '32px',
              height: '32px',
              background: '#d1fae5',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem'
            }}>
              ✓
            </span>
          </div>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: COLORS.success
          }}>
            运行正常
          </div>
        </div>
      </div>

      {/* 知识库列表 */}
      <div style={{
        background: COLORS.cardBg,
        borderRadius: '10px',
        border: `1px solid ${COLORS.border}`,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.bg,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: '600',
            color: COLORS.text
          }}>
            知识库概览
          </h2>
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
            {loading ? '刷新中...' : '刷新数据'}
          </button>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {statsResults?.data?.kbNames && statsResults.data.kbNames.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem'
            }}>
              {statsResults.data.kbNames.map((proj) => (
                <div
                  key={proj.kbName}
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '8px',
                    padding: '1.25rem',
                    background: COLORS.bg,
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem'
                  }}>
                    <h4 style={{
                      margin: 0,
                      fontSize: '0.9375rem',
                      fontWeight: '600',
                      color: COLORS.text
                    }}>
                      {proj.kbName}
                    </h4>
                    <span style={{
                      background: COLORS.primaryLight,
                      color: COLORS.primary,
                      padding: '0.25rem 0.625rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      {proj.total} 条
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.8125rem',
                    color: COLORS.textMuted
                  }}>
                    最后更新: {new Date(proj.lastUpdated).toLocaleString('zh-CN')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              padding: '2rem',
              background: COLORS.bg,
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '0.5rem',
                color: COLORS.text
              }}>
                暂无知识库
              </div>
              <div style={{
                fontSize: '0.875rem',
                color: COLORS.textSecondary
              }}>
                请前往"知识库管理"创建知识库
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
