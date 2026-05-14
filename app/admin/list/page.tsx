'use client'

import { useState, useEffect } from 'react'
import { message } from 'antd'
import { COLORS } from '@/app/admin/constants'
import { ListResponse } from '@/app/admin/types'
import { post } from '@/app/admin/lib/request'
import { KBSelector } from '@/app/admin/components/KBSelector'

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
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条记录吗？')) return

    setLoading(true)
    try {
      const data = await post<{ success: boolean }>('/api/kb/delete', { id })
      if (data.success) {
        msg.success('删除成功')
        fetchList()
      }
    } catch (err) {
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {contextHolder}
      
      <KBSelector kbName={kbName} setKbName={setKbName} />

      <div style={{
        background: COLORS.cardBg,
        borderRadius: '10px',
        border: `1px solid ${COLORS.border}`,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        overflow: 'hidden'
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
            片段列表
          </h2>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {!kbName ? (
            <div style={{
              padding: '3rem',
              textAlign: 'center',
              color: COLORS.textSecondary
            }}>
              请先选择知识库
            </div>
          ) : loading ? (
            <div style={{
              padding: '3rem',
              textAlign: 'center',
              color: COLORS.textSecondary
            }}>
              加载中...
            </div>
          ) : listResults && listResults.data ? (
            <div>
              <div style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                background: COLORS.bg,
                borderRadius: '6px',
                fontSize: '0.875rem',
                color: COLORS.textSecondary,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>共 {listResults.data.total} 条记录</span>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span>当前第 {listResults.data.page} 页</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.875rem' }}>每页显示:</label>
                    <select
                      value={listLimit}
                      onChange={(e) => { setListLimit(Number(e.target.value)); setListPage(1); }}
                      style={{
                        padding: '0.25rem 0.5rem',
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        background: COLORS.cardBg
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              </div>
              <div style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.875rem'
                  }}>
                    <thead>
                      <tr style={{ background: COLORS.bg }}>
                        <th style={{
                          padding: '0.75rem',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: COLORS.text,
                          borderBottom: `1px solid ${COLORS.border}`
                        }}>
                          ID
                        </th>
                        <th style={{
                          padding: '0.75rem',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: COLORS.text,
                          borderBottom: `1px solid ${COLORS.border}`
                        }}>
                          内容摘要
                        </th>
                        <th style={{
                          padding: '0.75rem',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: COLORS.text,
                          borderBottom: `1px solid ${COLORS.border}`
                        }}>
                          片段索引
                        </th>
                        <th style={{
                          padding: '0.75rem',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: COLORS.text,
                          borderBottom: `1px solid ${COLORS.border}`
                        }}>
                          创建时间
                        </th>
                        <th style={{
                          padding: '0.75rem',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: COLORS.text,
                          borderBottom: `1px solid ${COLORS.border}`
                        }}>
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {listResults.data.items.map((item) => (
                        <tr key={item.id} style={{
                          borderBottom: `1px solid ${COLORS.border}`,
                          transition: 'background 0.2s'
                        }}>
                          <td style={{
                            padding: '0.75rem',
                            fontWeight: '600',
                            color: COLORS.text
                          }}>
                            {item.id}
                          </td>
                          <td style={{
                            padding: '0.75rem',
                            maxWidth: '400px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: COLORS.textSecondary
                          }}>
                            {item.content}
                          </td>
                          <td style={{ padding: '0.75rem', color: COLORS.textSecondary }}>
                            {item.chunkIndex}
                          </td>
                          <td style={{
                            padding: '0.75rem',
                            fontSize: '0.8125rem',
                            color: COLORS.textMuted
                          }}>
                            {new Date(item.createdAt).toLocaleString('zh-CN')}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={loading}
                              style={{
                                padding: '0.375rem 0.75rem',
                                background: loading ? COLORS.border : COLORS.error,
                                color: loading ? COLORS.textMuted : 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontSize: '0.8125rem',
                                fontWeight: '500'
                              }}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {listResults.data.total > listResults.data.limit && (
                <div style={{
                  marginTop: '1rem',
                  display: 'flex',
                  gap: '0.5rem',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}>
                  <button
                    onClick={() => setListPage(p => Math.max(1, p - 1))}
                    disabled={listPage === 1}
                    style={{
                      padding: '0.5rem 1rem',
                      background: listPage === 1 ? COLORS.border : COLORS.cardBg,
                      color: listPage === 1 ? COLORS.textMuted : COLORS.text,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px',
                      cursor: listPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}
                  >
                    上一页
                  </button>
                  <span style={{
                    padding: '0 0.5rem',
                    fontSize: '0.875rem',
                    color: COLORS.textSecondary
                  }}>
                    {listPage}
                  </span>
                  <button
                    onClick={() => setListPage(p => p + 1)}
                    disabled={listResults.data.items.length < listResults.data.limit}
                    style={{
                      padding: '0.5rem 1rem',
                      background: listResults.data.items.length < listResults.data.limit ? COLORS.border : COLORS.cardBg,
                      color: listResults.data.items.length < listResults.data.limit ? COLORS.textMuted : COLORS.text,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px',
                      cursor: listResults.data.items.length < listResults.data.limit ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: '3rem',
              textAlign: 'center',
              color: COLORS.textSecondary
            }}>
              暂无数据
            </div>
          )}
        </div>
      </div>
    </>
  )
}
