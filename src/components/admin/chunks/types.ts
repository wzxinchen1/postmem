import type { SplitChunkItem, TopicInfo } from '@/app/admin/types'

/** 待合并列表中的条目 */
export interface CartItem {
  id: string
  title: string
  content: string
  charLength: number
  topicId: string | null
  topicName: string | null
  kbId: string
  kbName: string
}

export interface EditableChunk {
  key: string
  index: number
  title: string
  content: string
  topicId: string | null
  topicAction: 'existing' | 'create'
  newTopicName: string
  newTopicDescription: string
  suggestLoading: boolean
  deleted: boolean
}

export interface MergeConfirmSnapshot {
  sourceTopics: Array<{ id: string; name: string; memoryCount: number }>
  targetTopic: { id: string; name: string; memoryCount: number }
}

export const SNAPSHOT_EMPTY: MergeConfirmSnapshot = {
  sourceTopics: [],
  targetTopic: { id: '', name: '', memoryCount: 0 },
}

export function buildEditableChunk(
  chunk: SplitChunkItem,
  plan: { action: string; topicName?: string },
  existingTopics: TopicInfo[],
): EditableChunk {
  let topicId: string | null = null
  if (plan.action === 'select' && plan.topicName !== undefined) {
    const found = existingTopics.find((t) => t.name === plan.topicName)
    if (found !== undefined) {
      topicId = found.id
    }
  }
  return {
    key: `chunk-${chunk.index}`,
    index: chunk.index,
    title: chunk.title,
    content: chunk.content,
    topicId,
    topicAction: 'existing',
    newTopicName: '',
    newTopicDescription: '',
    suggestLoading: false,
    deleted: false,
  }
}
