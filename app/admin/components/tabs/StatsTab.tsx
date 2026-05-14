'use client'

import { COLORS } from '@/app/admin/constants'
import { StatsResponse } from '@/app/admin/types'

interface StatsTabProps {
  statsResults: StatsResponse | null
  loading: boolean
  showMessage: (type: 'success' | 'error', text: string) => void
  onRefresh: () => void
}

export function StatsTab({ statsResults, loading, showMessage, onRefresh }: StatsTabProps) {
  return (
    <div>
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

      {/* 操作按钮 */}
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
          background: COLORS.bg
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: '600',
            color: COLORS.text
          }}>
            统计信息
          </h2>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={onRefresh}
              disabled={loading}
              style={{
                padding: '0.625rem 1.5rem',
                background: loading ? COLORS.border : COLORS.primary,
                color: loading ? COLORS.textMuted : 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}
            >
              {loading ? '获取中...' : '查看所有知识库'}
            </button>
          </div>

          {statsResults && statsResults.data && (
            <div style={{ marginTop: '1.5rem' }}>
              {statsResults.data.kbNames ? (
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
                    {statsResults.data.kbName}
                  </div>
                  <div style={{
                    fontSize: '2.5rem',
                    fontWeight: '700',
                    marginBottom: '0.5rem',
                    color: COLORS.primary
                  }}>
                    {statsResults.data.total}
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: COLORS.textSecondary
                  }}>
                    片段总数
                  </div>
                  {statsResults.data.lastUpdated && (
                    <div style={{
                      marginTop: '1rem',
                      fontSize: '0.8125rem',
                      color: COLORS.textMuted
                    }}>
                      最后更新: {new Date(statsResults.data.lastUpdated).toLocaleString('zh-CN')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}