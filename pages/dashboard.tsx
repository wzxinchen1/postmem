import Head from 'next/head'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// API 响应类型定义
interface IngestResponse {
  success: boolean
  data?: {
    count: number
    ids: number[]
  }
  error?: {
    code: string
    message: string
  }
}

interface SearchResult {
  id: number
  content: string
  score: number
  chunkIndex: number
  metadata?: {
    cutModel?: string
    chunkSize?: number
    originalLength?: number
  }
  context?: {
    prev?: string
    next?: string
  }
}

interface SearchResponse {
  success: boolean
  data?: {
    results: SearchResult[]
  }
  error?: {
    code: string
    message: string
  }
}

interface ListItem {
  id: number
  content: string
  chunkIndex: number
  metadata: Record<string, unknown>
  createdAt: string
}

interface ListResponse {
  success: boolean
  data?: {
    items: ListItem[]
    total: number
    page: number
    limit: number
  }
  error?: {
    code: string
    message: string
  }
}

interface DeleteResponse {
  success: boolean
  data?: {
    deleted: boolean
    id: number
  }
  error?: {
    code: string
    message: string
  }
}

interface StatsData {
  kbName?: string
  total?: number
  lastUpdated?: string
  kbNames?: Array<{
    kbName: string
    total: number
    lastUpdated: string
  }>
}

interface StatsResponse {
  success: boolean
  data?: StatsData
  error?: {
    code: string
    message: string
  }
}

// 样式常量
const COLORS = {
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryLight: '#eff6ff',
  secondary: '#64748b',
  success: '#10b981',
  successLight: '#d1fae5',
  error: '#ef4444',
  errorLight: '#fee2e2',
  warning: '#f59e0b',
  border: '#e2e8f0',
  bg: '#f8fafc',
  cardBg: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'ingest' | 'search' | 'list' | 'stats'>('ingest')
  const [kbName, setProject] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Ingest state
  const [ingestContent, setIngestContent] = useState('')
  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null)
  const [showIngestModal, setShowIngestModal] = useState(false)
  const [selectedKbForIngest, setSelectedKbForIngest] = useState<string>('')

  // Create KB state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKbName, setNewKbName] = useState('')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTopK, setSearchTopK] = useState(5)
  const [searchContextWindow, setSearchContextWindow] = useState(1)
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)

  // List state
  const [listPage, setListPage] = useState(1)
  const [listLimit, setListLimit] = useState(10)
  const [listResults, setListResults] = useState<ListResponse | null>(null)

  // Stats state
  const [statsResults, setStatsResults] = useState<StatsResponse | null>(null)

  // Delete state
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  // 菜单项配置
  const menuItems = [
    { id: 'ingest', label: '知识库管理', icon: '📚' },
    { id: 'search', label: '语义检索', icon: '🔍' },
    { id: 'list', label: '列表管理', icon: '📋' },
    { id: 'stats', label: '统计概览', icon: '📊' },
  ] as const

  // 初始化加载知识库列表
  useEffect(() => {
    handleStats()
  }, [])

  // API 调用函数
  const handleIngest = async () => {
    if (!selectedKbForIngest || !ingestContent) {
      showMessage('error', '请填写知识库名和内容')
      return
    }

    setLoading(true)
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
        // 刷新统计信息
        handleStats()
        // 2秒后关闭模态窗口
        setTimeout(() => {
          setShowIngestModal(false)
          setIngestResult(null)
        }, 2000)
      } else {
        showMessage('error', data.error?.message || '入库失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

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
      const data: DeleteResponse = await res.json()
      if (data.success) {
        showMessage('success', '删除成功')
        // 刷新列表
        if (activeTab === 'list') {
          handleList()
        }
      } else {
        showMessage('error', data.error?.message || '删除失败')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleStats = async (specificProject?: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/kb/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(specificProject ? { kbName: specificProject } : {})
      })
      const data: StatsResponse = await res.json()
      setStatsResults(data)
      if (!specificProject) {
        // showMessage('success', '统计信息获取成功')
      }
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>PostMem Dashboard - 知识库管理</title>
        <meta name="description" content="PostMem 知识库管理界面" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{
        minHeight: '100vh',
        background: COLORS.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        {/* 顶部导航栏 */}
        <header style={{
          background: COLORS.cardBg,
          borderBottom: `1px solid ${COLORS.border}`,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}>
          <div style={{
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 2rem'
          }}>
            {/* Logo 和标题 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '64px',
              borderBottom: `1px solid ${COLORS.border}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: `linear-gradient(135deg, ${COLORS.primary} 0%, #8b5cf6 100%)`,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '18px',
                  fontWeight: 'bold'
                }}>
                  P
                </div>
                <h1 style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  margin: 0,
                  color: COLORS.text
                }}>
                  PostMem Dashboard
                </h1>
              </div>
              <Link
                href="/"
                style={{
                  padding: '0.5rem 1rem',
                  color: COLORS.textSecondary,
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  borderRadius: '6px',
                  transition: 'all 0.2s'
                }}
              >
                ← 返回首页
              </Link>
            </div>

            {/* 顶部菜单 */}
            <nav style={{
              display: 'flex',
              gap: '0',
              height: '48px'
            }}>
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    padding: '0 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === item.id ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                    color: activeTab === item.id ? COLORS.primary : COLORS.textSecondary,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: activeTab === item.id ? '600' : '500',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {/* 消息提示 */}
        {message && (
          <div style={{
            maxWidth: '1400px',
            margin: '1rem auto',
            padding: '0 2rem'
          }}>
            <div style={{
              padding: '0.875rem 1rem',
              borderRadius: '8px',
              background: message.type === 'success' ? COLORS.successLight : COLORS.errorLight,
              color: message.type === 'success' ? '#065f46' : '#991b1b',
              border: `1px solid ${message.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>{message.type === 'success' ? '✓' : '✕'}</span>
              {message.text}
            </div>
          </div>
        )}

        {/* 主内容区 */}
        <main style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '2rem'
        }}>
          {/* 知识库选择器 - 仅在非入库和统计页面显示 */}
          {activeTab !== 'ingest' && activeTab !== 'stats' && (
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
              <input
                type="text"
                value={kbName}
                onChange={(e) => setProject(e.target.value)}
                placeholder="输入知识库名称（如：my-knowledge-base）"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  background: COLORS.bg
                }}
              />
            </div>
          )}

          {/* Ingest Tab - 知识库列表 */}
          {activeTab === 'ingest' && (
            <div>
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
                    onClick={() => handleStats()}
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
                      点击上方"刷新列表"按钮获取知识库信息
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Tab */}
          {activeTab === 'search' && (
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
          )}

          {/* List Tab */}
          {activeTab === 'list' && (
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
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
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
                      onClick={() => handleStats()}
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
          )}
        </main>

        {/* Footer */}
        <footer style={{
          textAlign: 'center',
          padding: '2rem',
          color: COLORS.textMuted,
          fontSize: '0.8125rem',
          borderTop: `1px solid ${COLORS.border}`,
          background: COLORS.cardBg
        }}>
          <p style={{ margin: 0 }}>
            PostMem - 个人知识库管理系统 | 基于 Next.js 和 PostgreSQL 构建
          </p>
        </footer>
      </div>

      {/* 新建知识库模态窗口 */}
      {showCreateModal && (
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
            {/* 模态窗口头部 */}
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
                onClick={() => {
                  setShowCreateModal(false)
                  setNewKbName('')
                }}
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

            {/* 模态窗口内容 */}
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

              {/* 按钮组 */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={async () => {
                    if (!newKbName.trim()) {
                      showMessage('error', '请输入知识库名称')
                      return
                    }
                    // 验证名称格式
                    if (!/^[a-zA-Z0-9_-]+$/.test(newKbName)) {
                      showMessage('error', '名称只能包含字母、数字、中划线和下划线')
                      return
                    }
                    
                    // 创建一个空的知识库（通过插入一条占位记录）
                    setLoading(true)
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
                        // 刷新知识库列表
                        await handleStats()
                      } else {
                        showMessage('error', data.error?.message || '创建失败')
                      }
                    } catch (err) {
                      showMessage('error', '网络请求失败')
                    } finally {
                      setLoading(false)
                    }
                  }}
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
                  onClick={() => {
                    setShowCreateModal(false)
                    setNewKbName('')
                  }}
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
      )}

      {/* 入库模态窗口 */}
      {showIngestModal && (
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
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* 模态窗口头部 */}
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
                  目标知识库: {selectedKbForIngest}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowIngestModal(false)
                  setIngestContent('')
                  setIngestResult(null)
                }}
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

            {/* 模态窗口内容 */}
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
                  value={ingestContent}
                  onChange={(e) => setIngestContent(e.target.value)}
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
                  <span>支持长文本，系统会自动进行分块处理</span>
                  <span style={{ fontWeight: '500' }}>
                    {ingestContent.length} / 20000
                  </span>
                </div>
              </div>

              {/* 按钮组 */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleIngest}
                  disabled={loading || !ingestContent}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: loading || !ingestContent ? COLORS.border : COLORS.primary,
                    color: loading || !ingestContent ? COLORS.textMuted : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loading || !ingestContent ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    fontSize: '0.875rem'
                  }}
                >
                  {loading ? '处理中...' : '开始入库'}
                </button>
                <button
                  onClick={() => {
                    setShowIngestModal(false)
                    setIngestContent('')
                    setIngestResult(null)
                    handleStats() // 刷新统计信息以显示新创建的知识库
                  }}
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

              {/* 入库结果 */}
              {ingestResult && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: ingestResult.success ? COLORS.successLight : COLORS.errorLight,
                  borderRadius: '6px',
                  border: `1px solid ${ingestResult.success ? '#6ee7b7' : '#fca5a5'}`
                }}>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    marginBottom: '0.5rem',
                    color: ingestResult.success ? '#065f46' : '#991b1b'
                  }}>
                    {ingestResult.success ? '✓ 入库成功' : '✕ 入库失败'}
                  </div>
                  {ingestResult.success && ingestResult.data && (
                    <div style={{
                      fontSize: '0.8125rem',
                      color: '#065f46'
                    }}>
                      创建了 {ingestResult.data.count} 个片段
                    </div>
                  )}
                  {ingestResult.error && (
                    <div style={{
                      fontSize: '0.8125rem',
                      color: '#991b1b'
                    }}>
                      {ingestResult.error.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        input:focus, textarea:focus {
          border-color: ${COLORS.primary} !important;
          box-shadow: 0 0 0 3px ${COLORS.primaryLight};
        }
        button:hover:not(:disabled) {
          opacity: 0.85;
        }
        button:active:not(:disabled) {
          transform: scale(0.98);
        }
        table tbody tr:hover {
          background-color: ${COLORS.bg};
        }
      `}</style>
    </>
  )
}
