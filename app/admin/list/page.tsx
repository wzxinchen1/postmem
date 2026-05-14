'use client'

import { useState } from 'react'
import { COLORS } from '@/app/admin/constants'
import { ListResponse } from '@/app/admin/types'
import { useMessage } from '@/app/admin/hooks/useMessage'
import { KBSelector } from '@/app/admin/components/KBSelector'

export default function ListPage() {
  const [kbName, setKbName] = useState('')
  const [loading, setLoading] = useState(false)
  const [listPage, setListPage] = useState(1)
  const [listLimit, setListLimit] = useState(10)
  const [listResults, setListResults] = useState<ListResponse | null>(null)
  
  const { contextHolder, showMessage } = useMessage()

  const handleList = async () => {
    if (!kbName) {
      showMessage('error', '请填写知识库名')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/kb/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kbName, page: listPage, limit: listLimit })
      })
      const data: ListResponse = await res.json()
      setListResults(data)
      if (data.success) {
        showMessage('success', `获取到 ${data.data?.items.length || 0} 条记录`)
      } else {
        showMessage('error', data.error?.message || '列表获取失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条记录吗？')) return

    setLoading(true)
    try {
      const res = await fetch('/api/kb/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '删除成功')
        handleList()
      } else {
        showMessage('error', data.error?.message || '删除失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
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
            列表管理
          </h2>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.5rem',
            alignItems: 'flex-end'
          }}>
            <div style={{ flex: '0 0 120px' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: COLORS.text
              }}>
                页码
              </label>
              <input
                type="number"
                value={listPage}
                onChange={(e) => setListPage(Number(e.target.value))}
                min={1}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: COLORS.bg
                }}
              />
            </div>
            <div style={{ flex: '0 0 120px' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: COLORS.text
              }}>
                每页数量
              </label>
              <input
                type="number"
                value={listLimit}
                onChange={(e) => setListLimit(Number(e.target.value))}
                min={1}
                max={100}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: COLORS.bg
                }}
              />
            </div>
            <button
              onClick={handleList}
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
              {loading ? '获取中...' : '获取列表'}
            </button>
          </div>

          {listResults && listResults.data && (
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
                <span>当前第 {listResults.data.page} 页</span>
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
                    onClick={() => { setListPage(p => Math.max(1, p - 1)); handleList(); }}
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
                    onClick={() => { setListPage(p => p + 1); handleList(); }}
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
          )}
        </div>
      </div>
    </>
  )
}
