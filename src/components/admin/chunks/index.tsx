'use client'

import { useState, useCallback, useEffect } from 'react'
import { message, Modal, Button, Tabs, Typography } from 'antd'
import { get } from '@/app/admin/lib/request'
import type { ChunkItem, TopicInfo } from '@/app/admin/types'
import type { CartItem } from './types'
import { KBSelector } from '@/src/components/admin/KBSelector'
import { TopicPanel } from './TopicPanel'
import { ChunksQuery } from './ChunksQuery'
import { DuplicateDetect } from './DuplicateDetect'
import { SearchTab } from './SearchTab'
import { MergeCartBar } from './MergeCartBar'
import { MergeModal } from './MergeModal'
import { BatchReassignModal } from './BatchReassignModal'

const { Text } = Typography

export default function ChunksPage() {
  const [msg, contextHolder] = message.useMessage()

  /* ---- shared state ---- */
  const [kbId, setKbId] = useState<string | null>(null)
  const [topicList, setTopicList] = useState<TopicInfo[]>([])
  const [topicStats, setTopicStats] = useState<Array<{ id: string; name: string; description: string; memoryCount: number }>>([])
  const [refreshKey, setRefreshKey] = useState(0)

  /* ---- modals ---- */
  const [viewContent, setViewContent] = useState<string | null>(null)
  const [mergeTargetRows, setMergeTargetRows] = useState<ChunkItem[] | null>(null)
  const [reassignTargetRows, setReassignTargetRows] = useState<ChunkItem[] | null>(null)

  /* ---- merge cart ---- */
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  const addToCart = useCallback((item: CartItem) => {
    setCartItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev
      return [...prev, item]
    })
  }, [])

  const removeFromCart = useCallback((id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const isInCart = useCallback((id: string): boolean => {
    return cartItems.some((i) => i.id === id)
  }, [cartItems])

  const clearCart = useCallback(() => {
    setCartItems([])
  }, [])

  /* ---- load topics ---- */
  const loadTopics = useCallback(async () => {
    if (kbId === null) {
      setTopicList([])
      setTopicStats([])
    } else {
      try {
        const [listRes, statsRes] = await Promise.all([
          get<{ success: boolean; data?: TopicInfo[] }>(`/api/kb/list-topics?kbId=${encodeURIComponent(kbId)}`),
          get<{ success: boolean; data?: Array<{ id: string; name: string; description: string; memoryCount: number }> }>(`/api/kb/topic/stats?kbId=${encodeURIComponent(kbId)}`),
        ])
        if (listRes.success && listRes.data !== undefined) {
          setTopicList(listRes.data)
        }
        if (statsRes.success && statsRes.data !== undefined) {
          setTopicStats(statsRes.data)
        }
      } catch {
        msg.error('加载分类列表失败')
      }
    }
  }, [kbId, msg])

  useEffect(() => {
    loadTopics()
  }, [loadTopics])

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  /* ---- merge & reassign handlers ---- */
  const handleMerge = useCallback((rows: ChunkItem[]) => {
    setMergeTargetRows(rows)
  }, [])

  const handleMergeFromCart = useCallback((cartItems: CartItem[]) => {
    const rows: ChunkItem[] = cartItems.map(item => ({
      ...item,
      createdAt: '',
    }))
    setMergeTargetRows(rows)
  }, [])

  const handleReassign = useCallback((rows: ChunkItem[]) => {
    setReassignTargetRows(rows)
  }, [])

  const handleMergeModalClose = useCallback(() => {
    setMergeTargetRows(null)
  }, [])

  const handleMergeSuccess = useCallback(() => {
    setMergeTargetRows(null)
    clearCart()
    handleRefresh()
  }, [clearCart, handleRefresh])

  /* ---- cart callbacks object for passing to children ---- */
  const cartCallbacks = { onAddToCart: addToCart, isInCart }

  return (
    <div style={{ display: 'flex', flex: 1, gap: 16, height: '100%', minHeight: 0 }}>
      {contextHolder}

      {kbId !== null && (
        <TopicPanel
          kbId={kbId}
          topicStats={topicStats}
          existingTopics={topicList}
          onTopicChange={loadTopics}
          onRefresh={handleRefresh}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16, minWidth: 0 }}>
        <KBSelector kbId={kbId} setKbId={setKbId} />

        <Tabs
          items={[
            {
              key: 'chunks',
              label: '超长片段查询',
              children: (
                <ChunksQuery
                  kbId={kbId}
                  setKbId={setKbId}
                  topicList={topicList}
                  onMerge={handleMerge}
                  onReassign={handleReassign}
                  onViewContent={setViewContent}
                  refreshKey={refreshKey}
                  {...cartCallbacks}
                />
              ),
            },
            {
              key: 'duplicate',
              label: '重复检测',
              children: (
                <DuplicateDetect
                  kbId={kbId}
                  onMerge={handleMerge}
                  onReassign={handleReassign}
                  onViewContent={setViewContent}
                  {...cartCallbacks}
                />
              ),
            },
            {
              key: 'search',
              label: '语义搜索',
              children: (
                <SearchTab
                  kbId={kbId}
                  topicList={topicList}
                  {...cartCallbacks}
                />
              ),
            },
          ]}
        />
      </div>

      {/* Content viewer */}
      <Modal
        title="内容详情"
        open={viewContent !== null}
        onCancel={() => setViewContent(null)}
        footer={[
          <Button key="close" onClick={() => setViewContent(null)}>
            关闭
          </Button>,
        ]}
        width={800}
        styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
      >
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {viewContent}
        </div>
      </Modal>

      {/* Merge modal */}
      {mergeTargetRows !== null && (
        <MergeModal
          open={true}
          rows={mergeTargetRows}
          onClose={handleMergeModalClose}
          onSuccess={handleMergeSuccess}
        />
      )}

      {/* Batch reassign modal */}
      {reassignTargetRows !== null && (
        <BatchReassignModal
          open={true}
          rows={reassignTargetRows}
          topicList={topicList}
          onClose={() => setReassignTargetRows(null)}
          onSuccess={handleRefresh}
        />
      )}

      {/* Merge cart floating bar */}
      <MergeCartBar
        items={cartItems}
        onRemove={removeFromCart}
        onClear={clearCart}
        onMerge={handleMergeFromCart}
      />
    </div>
  )
}
