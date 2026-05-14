'use client'

import { useState, useEffect } from 'react'
import { StatsResponse } from './types'
import { useMessage } from './hooks/useMessage'
import { Message } from './components/Message'
import { TabSelector } from './components/TabSelector'
import { KBSelector } from './components/KBSelector'
import { IngestTab } from './components/tabs/IngestTab'
import { SearchTab } from './components/tabs/SearchTab'
import { ListTab } from './components/tabs/ListTab'
import { StatsTab } from './components/tabs/StatsTab'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'ingest' | 'search' | 'list' | 'stats'>('ingest')
  const [kbName, setKbName] = useState('')
  const [loading, setLoading] = useState(false)
  const [statsResults, setStatsResults] = useState<StatsResponse | null>(null)
  
  const { message, showMessage } = useMessage()

  // 初始化加载知识库列表
  useEffect(() => {
    handleStats()
  }, [])

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
    } catch (err) {
      showMessage('error', '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* 消息提示 */}
      <Message message={message} />

      {/* Tab 选择器 */}
      <TabSelector activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* 知识库选择器 - 仅在非入库和统计页面显示 */}
      {activeTab !== 'ingest' && activeTab !== 'stats' && (
        <KBSelector kbName={kbName} setKbName={setKbName} />
      )}

      {/* Ingest Tab - 知识库管理 */}
      {activeTab === 'ingest' && (
        <IngestTab 
          statsResults={statsResults}
          loading={loading}
          showMessage={showMessage}
          onRefresh={() => handleStats()}
        />
      )}

      {/* Search Tab - 语义检索 */}
      {activeTab === 'search' && (
        <SearchTab 
          kbName={kbName}
          showMessage={showMessage}
        />
      )}

      {/* List Tab - 列表管理 */}
      {activeTab === 'list' && (
        <ListTab 
          kbName={kbName}
          showMessage={showMessage}
        />
      )}

      {/* Stats Tab - 统计概览 */}
      {activeTab === 'stats' && (
        <StatsTab 
          statsResults={statsResults}
          loading={loading}
          showMessage={showMessage}
          onRefresh={() => handleStats()}
        />
      )}
    </>
  )
}