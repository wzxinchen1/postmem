'use client'

import { useState } from 'react'
import { COLORS } from '@/app/admin/constants'
import { SearchResponse } from '@/app/admin/types'

interface SearchTabProps {
  kbName: string
  showMessage: (type: 'success' | 'error', text: string) => void
}

export function SearchTab({ kbName, showMessage }: SearchTabProps) {
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTopK, setSearchTopK] = useState(5)
  const [searchContextWindow, setSearchContextWindow] = useState(1)
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)

  const handleSearch = async () => {
    if (!kbName || !searchQuery) {
      showMessage('error', '请填写知识库名和查询内容')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kbName,
          query: searchQuery,
          top_k: searchTopK,
          context_window: searchContextWindow
        })
      })
      const data: SearchResponse = await res.json()
      setSearchResults(data)
      if (data.success) {
        showMessage('success', `找到 ${data.data?.results.length || 0} 个相关结果`)
      } else {
        showMessage('error', data.error?.message || '检索失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
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
          语义检索
        </h2>
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
            查询语句
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="输入查询内容..."
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: COLORS.text
            }}>
              返回结果数量 (top_k)
            </label>
            <input
              type="number"
              value={searchTopK}
              onChange={(e) => setSearchTopK(Number(e.target.value))}
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
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: COLORS.text
            }}>
              上下文窗口大小
            </label>
            <input
              type="number"
              value={searchContextWindow}
              onChange={(e) => setSearchContextWindow(Number(e.target.value))}
              min={0}
              max={5}
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
        </div>
        <button
          onClick={handleSearch}
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
          {loading ? '检索中...' : '开始检索'}
        </button>

        {searchResults && searchResults.data && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              marginBottom: '1rem',
              color: COLORS.text,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              检索结果
              <span style={{
                background: COLORS.primaryLight,
                color: COLORS.primary,
                padding: '0.125rem 0.625rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '500'
              }}>
                {searchResults.data.results.length} 条
              </span>
            </div>
            {searchResults.data.results.map((result, index) => (
              <div
                key={result.id}
                style={{
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '0.75rem',
                  background: COLORS.bg,
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem'
                }}>
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: COLORS.text
                  }}>
                    #{index + 1} · ID: {result.id}
                  </span>
                  <span style={{
                    background: COLORS.successLight,
                    color: '#065f46',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {(result.score * 100).toFixed(1)}% 相似度
                  </span>
                </div>
                {result.context?.prev && (
                  <div style={{
                    marginBottom: '0.5rem',
                    padding: '0.625rem',
                    background: '#eff6ff',
                    borderRadius: '4px',
                    fontSize: '0.8125rem',
                    color: '#1e40af',
                    borderLeft: '3px solid #3b82f6'
                  }}>
                    <strong style={{ fontSize: '0.75rem' }}>上文：</strong>
                    {result.context.prev}
                  </div>
                )}
                <div style={{
                  padding: '0.875rem',
                  background: COLORS.cardBg,
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  color: COLORS.text,
                  lineHeight: '1.6',
                  border: `1px solid ${COLORS.border}`
                }}>
                  {result.content}
                </div>
                {result.context?.next && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.625rem',
                    background: '#eff6ff',
                    borderRadius: '4px',
                    fontSize: '0.8125rem',
                    color: '#1e40af',
                    borderLeft: '3px solid #3b82f6'
                  }}>
                    <strong style={{ fontSize: '0.75rem' }}>下文：</strong>
                    {result.context.next}
                  </div>
                )}
                {result.metadata && (
                  <div style={{
                    marginTop: '0.75rem',
                    fontSize: '0.75rem',
                    color: COLORS.textMuted,
                    display: 'flex',
                    gap: '1rem'
                  }}>
                    <span>片段索引: {result.chunkIndex}</span>
                    <span>切割模型: {result.metadata.cutModel || 'N/A'}</span>
                    <span>片段大小: {result.metadata.chunkSize || 'N/A'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}