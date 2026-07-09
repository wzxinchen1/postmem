import { PrismaClient, Prisma } from '@/src/generated/prisma/client/client'
import { AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'
import { createId } from '@paralleldrive/cuid2'
import type {
  SearchResult,
  SearchSource,
  ListItem,
  ChunkItem,
  DuplicateGroupItem,
  DuplicateGroup,
  TitledChunk,
  BatchTopicPlan,
  Stats,
  KnowledgeBaseInfo,
  IngestMessage,
  IngestTextResponse,
  IngestMessagesResponse,
} from '@/src/types'
import { StreamStatus } from '@/src/types'
import { EmbeddingService } from '@/src/services/embedding.service'
import { SettingService } from '@/src/services/setting.service'
import { CutModelService } from '@/src/services/cut-model.service'
import { SSEService } from '@/src/services/sse.service'

/**
 * 知识库核心服务
 *
 * 设计原则：
 * - 写入零 LLM 调用，不提取不总结
 * - 只存完整原文（Verbatim-First）
 * - 向量仅作为检索原文的索引
 */
export class KBService {
  private prisma: PrismaClient
  private embeddingService: EmbeddingService
  private settingService: SettingService
  private cutModelService: CutModelService
  private sseService: SSEService

  constructor({
    prisma,
    embeddingService,
    settingService,
    cutModelService,
    sseService,
  }: {
    prisma: PrismaClient
    embeddingService: EmbeddingService
    settingService: SettingService
    cutModelService: CutModelService
    sseService: SSEService
  }) {
    this.prisma = prisma
    this.embeddingService = embeddingService
    this.settingService = settingService
    this.cutModelService = cutModelService
    this.sseService = sseService
  }

  /**
   * 创建知识库
   */
  async createKnowledgeBase(name: string, description?: string): Promise<KnowledgeBaseInfo> {
    if (!name || name.trim().length === 0) {
      throw new AppError('KB_CREATE_NAME_REQUIRED')
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new AppError('KB_CREATE_NAME_INVALID_FORMAT')
    }

    const existing = await this.prisma.knowledgeBase.findUnique({
      where: { name: name.trim() },
    })

    if (existing) {
      throw new AppError('KB_CREATE_NAME_DUPLICATE', { name })
    }

    const kb = await this.prisma.knowledgeBase.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
      },
    })

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description ?? undefined,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    }
  }

  /**
   * 根据名称获取知识库
   */
  async getKnowledgeBaseByName(name: string): Promise<KnowledgeBaseInfo> {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { name: name.trim() },
    })

    if (!kb) {
      throw new AppError('KB_NOT_FOUND', { name })
    }

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description ?? undefined,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    }
  }

  /**
   * 根据ID获取知识库
   */
  async getKnowledgeBaseById(id: string): Promise<KnowledgeBaseInfo> {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id },
    })

    if (!kb) {
      throw new AppError('KB_NOT_FOUND')
    }

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description ?? undefined,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    }
  }

/**
 * 知识入库 - 纯文本方式（带进度回调的流式版本）
 */
  async ingestTextStream(
    kbId: string,
    content: string,
    onProgress: (event: { type: string; message?: string; data?: Record<string, unknown> }) => void
  ): Promise<IngestTextResponse> {
    const settings = await this.settingService.getAppSettings()
    const maxLength = settings.maxContentLength

    if (!content || content.trim().length === 0) {
      throw new AppError('KB_INGEST_TEXT_STREAM_CONTENT_REQUIRED')
    }

    if (content.length > maxLength) {
      throw new AppError('KB_INGEST_TEXT_STREAM_CONTENT_TOO_LONG', { maxLength })
    }

    await this.getKnowledgeBaseById(kbId)

    onProgress({ type: 'status', message: '正在切分文本...' })
    const cutStart = Date.now()
    const chunks = await this.cutModelService.cutAndRewrite(content, kbId, onProgress)
    const cutElapsed = Date.now() - cutStart
    logger.info('[KBService] ingestTextStream 切分完成', { chunksCount: chunks.length, cutElapsedMs: cutElapsed })
    onProgress({ type: 'status', message: `文本已切分为 ${chunks.length} 个片段（${cutElapsed}ms），正在规划主题...` })

    const memoryIds: string[] = []
    const topicsInvolvedSet = new Set<string>()

    const existingTopics = await this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })

    const chunkInputs = chunks

    onProgress({ type: 'status', message: '正在规划主题归属...' })
    const topicStart = Date.now()
    const plan = await this.cutModelService.batchResolveTopics(chunkInputs, existingTopics, kbId)
    const topicElapsed = Date.now() - topicStart
    logger.info('[KBService] ingestTextStream 主题规划完成', { topicElapsedMs: topicElapsed })

    const topicNameMap = new Map<string, string>()
    for (const t of existingTopics) {
      topicNameMap.set(t.name, t.id)
    }

    const embedStart = Date.now()
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      onProgress({
        type: 'progress',
        message: `处理片段 ${i + 1}/${chunks.length}：${chunk.title}`,
        data: { current: i + 1, total: chunks.length, title: chunk.title },
      })

      const planItem = plan.plans.find((p) => p.index === chunk.index)

      if (!planItem) {
        throw new AppError('KB_CHUNK_MISSING_TOPIC_PLAN', { index: chunk.index })
      }

      let topicId: string | null = null
      if (planItem.action === 'select' && planItem.topicName) {
        const tid = topicNameMap.get(planItem.topicName)
        if (!tid) {
          throw new AppError('KB_TOPIC_NOT_FOUND', { topicName: planItem.topicName })
        }
        topicId = tid
      }

      if (topicId !== null && !topicsInvolvedSet.has(topicId)) {
        const topic = await this.prisma.topic.findUnique({
          where: { id: topicId },
          select: { name: true },
        })
        if (topic) {
          topicsInvolvedSet.add(topic.name)
        }
      }

      logger.info('[KBService] ingestTextStream 生成 embedding', { chunkIndex: i, chunkTotal: chunks.length, chunkTitle: chunk.title, chunkContentLength: chunk.content.length, chunkContentPreview: chunk.content.slice(0, 200) })

      const chunkEmbedStart = Date.now()
      const embedding = await this.embeddingService.generateEmbedding(chunk.content)
      logger.info('[KBService] ingestTextStream embedding 生成完成', { chunkIndex: i, elapsedMs: Date.now() - chunkEmbedStart })

      const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO memories (id, kb_id, topic_id, title, content, embedding, metadata)
        VALUES (${createId()}, ${kbId}, ${topicId}, ${chunk.title}, ${chunk.content}, ${`[${embedding.join(',')}]`}::vector,
                ${JSON.stringify({ cutModel: 'cut-and-rewrite' })}::jsonb)
        RETURNING id
      `
      memoryIds.push(inserted[0].id)
    }
    logger.info('[KBService] ingestTextStream 全部完成', { totalChunks: chunks.length, totalEmbedElapsedMs: Date.now() - embedStart })

    return {
      count: memoryIds.length,
      memoryIds,
      topicsInvolved: [...topicsInvolvedSet],
    }
  }

/**
 * 知识入库 - 纯文本方式
 *
 * 切分策略：LLM 切分+重写一步到位，每个片段语义完整连贯，完整存储
 */
  async ingestText(kbId: string, content: string): Promise<IngestTextResponse> {
    const settings = await this.settingService.getAppSettings()
    const maxLength = settings.maxContentLength

    if (!content || content.trim().length === 0) {
      throw new AppError('KB_INGEST_TEXT_CONTENT_REQUIRED')
    }

    if (content.length > maxLength) {
      throw new AppError('KB_INGEST_TEXT_CONTENT_TOO_LONG', { maxLength })
    }

    await this.getKnowledgeBaseById(kbId)

    const cutStart = Date.now()
    const chunks = await this.cutModelService.cutAndRewrite(content, kbId)
    logger.info('[KBService] ingestText 切分完成', { chunksCount: chunks.length, cutElapsedMs: Date.now() - cutStart })
    const memoryIds: string[] = []
    const topicsInvolvedSet = new Set<string>()

    const existingTopics = await this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })

    const chunkInputs = chunks

    const topicStart = Date.now()
    const plan = await this.cutModelService.batchResolveTopics(chunkInputs, existingTopics, kbId)
    logger.info('[KBService] ingestText 主题规划完成', { topicElapsedMs: Date.now() - topicStart })

    const topicNameMap = new Map<string, string>()
    for (const t of existingTopics) {
      topicNameMap.set(t.name, t.id)
    }

    const embedStart = Date.now()
    for (const chunk of chunks) {
      const planItem = plan.plans.find((p) => p.index === chunk.index)

      if (!planItem) {
        throw new AppError('KB_CHUNK_MISSING_TOPIC_PLAN', { index: chunk.index })
      }

      let topicId: string | null = null
      if (planItem.action === 'select' && planItem.topicName) {
        const tid = topicNameMap.get(planItem.topicName)
        if (!tid) {
          throw new AppError('KB_TOPIC_NOT_FOUND', { topicName: planItem.topicName })
        }
        topicId = tid
      }

      if (topicId !== null && !topicsInvolvedSet.has(topicId)) {
        const topic = await this.prisma.topic.findUnique({
          where: { id: topicId },
          select: { name: true },
        })
        if (topic) {
          topicsInvolvedSet.add(topic.name)
        }
      }

      logger.info('[KBService] ingestText 生成 embedding', { chunkTitle: chunk.title, chunkContentLength: chunk.content.length, chunkContentPreview: chunk.content.slice(0, 200) })
      const chunkEmbedStart = Date.now()
      const embedding = await this.embeddingService.generateEmbedding(chunk.content)
      logger.info('[KBService] ingestText embedding 生成完成', { chunkTitle: chunk.title, elapsedMs: Date.now() - chunkEmbedStart })

      const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO memories (id, kb_id, topic_id, title, content, embedding, metadata)
        VALUES (${createId()}, ${kbId}, ${topicId}, ${chunk.title}, ${chunk.content}, ${`[${embedding.join(',')}]`}::vector,
                ${JSON.stringify({ cutModel: 'cut-and-rewrite' })}::jsonb)
        RETURNING id
      `
      memoryIds.push(inserted[0].id)
    }
    logger.info('[KBService] ingestText 全部完成', { totalChunks: chunks.length, totalEmbedElapsedMs: Date.now() - embedStart })

    return {
      count: memoryIds.length,
      memoryIds,
      topicsInvolved: [...topicsInvolvedSet],
    }
  }

/**
 * 知识入库 - 消息列表方式
 *
 * 存储方式：将全部消息组合为完整对话文本，LLM切分+重写一步到位
 *           每个片段语义完整连贯，标题由LLM生成
 */
  async ingestMessages(kbId: string, messages: IngestMessage[], conversationId: string, isTest = false): Promise<IngestMessagesResponse> {
    const settings = await this.settingService.getAppSettings()
    const maxLength = settings.maxContentLength

    if (!messages || messages.length === 0) {
      throw new AppError('KB_INGEST_MESSAGES_EMPTY')
    }

    for (const msg of messages) {
      if (msg.content.length > maxLength) {
        throw new AppError('KB_INGEST_MESSAGE_CONTENT_TOO_LONG', { msgId: msg.id, maxLength })
      }
    }

    await this.getKnowledgeBaseById(kbId)

    const conversationText = messages
      .map((msg) => {
        const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统'
        return `${roleLabel}: ${msg.content}`
      })
      .join('\n\n')

    if (!isTest) {
      await this.sseService.emit({ type: 'status', status: StreamStatus.Summarizing, message: '正在切分文本...', conversationId })
    }

    const cutStart = Date.now()
    logger.info('[KBService] ingestMessages 开始切分', { conversationId, textLength: conversationText.length, messageCount: messages.length })
    const chunks = await this.cutModelService.cutAndRewrite(conversationText, kbId, (event) => {
      if (!isTest && event.message) {
        this.sseService.emit({ type: 'status', status: StreamStatus.Summarizing, message: event.message, conversationId })
      }
    })
    const cutElapsed = Date.now() - cutStart
    logger.info('[KBService] ingestMessages 切分完成', { chunksCount: chunks.length, cutElapsedMs: cutElapsed, conversationId })

    if (!isTest) {
      await this.sseService.emit({ type: 'status', status: StreamStatus.Summarizing, message: `已切分为 ${chunks.length} 个片段（${cutElapsed}ms）`, conversationId })
    }

    const existingTopics = await this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })

    const topicStart = Date.now()
    const plan = await this.cutModelService.batchResolveTopics(chunks, existingTopics, kbId)
    logger.info('[KBService] ingestMessages 主题规划完成', { topicElapsedMs: Date.now() - topicStart, conversationId })

    const topicNameMap = new Map<string, string>()
    for (const t of existingTopics) {
      topicNameMap.set(t.name, t.id)
    }
    const memoryIds: string[] = []
    const memorizedMessageIds = messages.map((m) => m.id)

    const embedStart = Date.now()
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      if (!isTest) {
        await this.sseService.emit({ type: 'status', status: StreamStatus.Summarizing, message: `处理片段 ${i + 1}/${chunks.length}：${chunk.title}`, conversationId })
      }

      const planItem = plan.plans.find((p) => p.index === chunk.index)
      if (!planItem) {
        throw new AppError('KB_CHUNK_MISSING_TOPIC_PLAN', { index: chunk.index })
      }

      let topicId: string | null = null
      if (planItem.action === 'select' && planItem.topicName) {
        const tid = topicNameMap.get(planItem.topicName)
        if (!tid) {
          throw new AppError('KB_TOPIC_NOT_FOUND', { topicName: planItem.topicName })
        }
        topicId = tid
      }

      if (!isTest) {
        await this.sseService.emit({ type: 'status', status: StreamStatus.Summarizing, message: `入库`, conversationId })
      }

      logger.info('[KBService] ingestMessages 生成 embedding', { chunkIndex: i, chunkTotal: chunks.length, chunkTitle: chunk.title, chunkContentLength: chunk.content.length, chunkContentPreview: chunk.content.slice(0, 200) })

      const chunkEmbedStart = Date.now()
      const embedding = await this.embeddingService.generateEmbedding(chunk.content)
      logger.info('[KBService] ingestMessages embedding 生成完成', { chunkIndex: i, elapsedMs: Date.now() - chunkEmbedStart })

      const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO memories (id, kb_id, topic_id, title, content, embedding, metadata)
        VALUES (${createId()}, ${kbId}, ${topicId}, ${chunk.title}, ${chunk.content}, ${`[${embedding.join(',')}]`}::vector,
                ${JSON.stringify({ cutModel: 'cut-and-rewrite', source: 'chat-memory' })}::jsonb)
        RETURNING id
      `
      memoryIds.push(inserted[0].id)
    }
    logger.info('[KBService] ingestMessages 全部完成', { totalChunks: chunks.length, totalEmbedElapsedMs: Date.now() - embedStart, conversationId })

    return {
      count: memoryIds.length,
      memoryIds,
      memorizedMessageIds,
    }
  }

  /**
   * 混合检索：Dense + Sparse + RRF 融合
   */
  async search(
    kbId: string,
    topicIds: string[],
    query: string,
    topK: number = 5,
    keywordQuery?: string
  ): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new AppError('KB_SEARCH_QUERY_REQUIRED')
    }

    if (!topicIds || topicIds.length === 0) {
      throw new AppError('KB_SEARCH_TOPIC_IDS_REQUIRED')
    }

    await this.getKnowledgeBaseById(kbId)
    const queryEmbedding = await this.embeddingService.generateEmbedding(query)

    const sparseQuery = keywordQuery ?? query

    const denseLimit = topK * 3
    const topicFilter = Prisma.sql`AND topic_id = ANY(ARRAY[${Prisma.join(topicIds)}]::text[])`

    const [denseResults, sparseResults] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string
          title: string
          content: string
          topic_id: string | null
          metadata: any
          cosine_distance: number
        }>
      >`
        SELECT
          id, title, content,
          topic_id,
          metadata,
          (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) as cosine_distance
        FROM memories
        WHERE kb_id = ${kbId}
          ${topicFilter}
        ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
        LIMIT ${denseLimit}
      `,
      this.prisma.$queryRaw<
        Array<{
          id: string
          title: string
          content: string
          topic_id: string | null
          metadata: any
          ts_rank: number
        }>
      >`
        SELECT
          id, title, content,
          topic_id,
          metadata,
          pgroonga_score(memories.tableoid, memories.ctid) as ts_rank
        FROM memories
        WHERE kb_id = ${kbId}
          ${topicFilter}
          AND content &@ ${sparseQuery}
        ORDER BY pgroonga_score(memories.tableoid, memories.ctid) DESC
        LIMIT ${denseLimit}
      `
    ])

    logger.debug('[Search] Dense results', { count: denseResults.length, results: denseResults.map((r, i) => ({ index: i, id: r.id, title: r.title, distance: r.cosine_distance })) })
    logger.debug('[Search] Sparse results', { count: sparseResults.length, results: sparseResults.map((r, i) => ({ index: i, id: r.id, title: r.title, tsRank: r.ts_rank })) })

    const rrfK = 60
    interface RrfItem {
      id: string
      title: string
      content: string
      topic_id: string | null
      metadata: any
      ts_rank?: number
    }
    const rrfScores = new Map<string, { rrfScore: number; source: SearchSource; data: RrfItem; cosineSim: number; tsRank?: number }>()

    for (let i = 0; i < denseResults.length; i++) {
      const item = denseResults[i]
      const existing = rrfScores.get(item.id)
      const rrfContribution = 1 / (rrfK + i + 1)
      if (existing) {
        existing.rrfScore += rrfContribution
        existing.source = 'hybrid'
      } else {
        rrfScores.set(item.id, { rrfScore: rrfContribution, source: 'dense', data: item, cosineSim: 1 - item.cosine_distance })
      }
    }

    for (let i = 0; i < sparseResults.length; i++) {
      const item = sparseResults[i]
      const existing = rrfScores.get(item.id)
      const rrfContribution = 1 / (rrfK + i + 1)
      if (existing) {
        existing.rrfScore += rrfContribution
        existing.source = 'hybrid'
        existing.tsRank = item.ts_rank
      } else {
        rrfScores.set(item.id, { rrfScore: rrfContribution, source: 'sparse', data: item, cosineSim: 0, tsRank: item.ts_rank })
      }
    }

    const merged = [...rrfScores.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK)

    logger.debug('[Search] RRF merged', { count: merged.length, results: merged.map((m, i) => ({ index: i, id: m.data.id, source: m.source, rrfScore: m.rrfScore, cosSim: m.cosineSim, tsRank: m.tsRank })) })

    const searchResults: SearchResult[] = []
    for (const item of merged) {
      let score: number
      if (item.cosineSim > 0) {
        score = item.cosineSim
      } else if (item.tsRank !== undefined && item.tsRank > 0) {
        score = Math.min(1, item.tsRank)
      } else {
        score = 0
      }
      searchResults.push({
        id: item.data.id,
        title: item.data.title,
        content: item.data.content,
        score,
        topicId: item.data.topic_id,
        metadata: item.data.metadata,
        source: item.source,
      })
    }

    return searchResults
  }

  /**
   * 创建主题
   */
  async createTopic(kbId: string, name: string, description?: string): Promise<{ id: string; name: string; description: string }> {
    if (!name || name.trim().length === 0) {
      throw new AppError('KB_CREATE_NAME_REQUIRED')
    }
    const desc = description?.trim()
    const data: Record<string, unknown> = { kbId, name: name.trim() }
    if (desc) {
      data.description = desc
    }
    const topic = await this.prisma.topic.create({
      data: data as any,
      select: { id: true, name: true, description: true },
    })
    return topic
  }

  /**
   * AI 辅助生成主题信息
   */
  async listTopics(kbId: string): Promise<Array<{ id: string; name: string; description: string }>> {
    return this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })
  }

  async listTopicsWithStats(kbId: string): Promise<Array<{ id: string; name: string; description: string; memoryCount: number }>> {
    const topics = await this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })
    const rows = await this.prisma.$queryRaw<Array<{ topic_id: string; count: bigint }>>`
      SELECT topic_id, COUNT(*)::bigint as count
      FROM memories
      WHERE kb_id = ${kbId} AND topic_id IS NOT NULL
      GROUP BY topic_id
    `
    const countMap = new Map<string, number>()
    for (const s of rows) {
      countMap.set(s.topic_id, Number(s.count))
    }
    const result: Array<{ id: string; name: string; description: string; memoryCount: number }> = []
    for (const t of topics) {
      const count = countMap.get(t.id)
      if (count === undefined) {
        result.push({
          id: t.id,
          name: t.name,
          description: t.description,
          memoryCount: 0,
        })
      } else {
        result.push({
          id: t.id,
          name: t.name,
          description: t.description,
          memoryCount: count,
        })
      }
    }
    return result
  }

  async deleteTopic(topicId: string): Promise<void> {
    const memoriesCount = await this.prisma.memory.count({
      where: { topicId },
    })
    if (memoriesCount > 0) {
      throw new AppError('KB_TOPIC_DELETE_HAS_MEMORIES', { count: memoriesCount })
    }
    await this.prisma.topic.delete({
      where: { id: topicId },
    })
  }

  async suggestTopic(kbId: string | undefined, content: string): Promise<{ name: string; description: string }> {
    return this.cutModelService.createTopicInfo(content, kbId)
  }

  /**
   * 列表浏览
   */
  async list(
    kbId: string,
    page: number = 1,
    limit: number = 20,
    topicIds?: string[]
  ): Promise<{ items: ListItem[]; total: number; page: number; limit: number }> {
    await this.getKnowledgeBaseById(kbId)

    const skip = (page - 1) * limit
    const whereTopic = topicIds && topicIds.length > 0
      ? { kbId, topicId: { in: topicIds } }
      : { kbId }

    const [items, total] = await Promise.all([
      this.prisma.memory.findMany({
        where: whereTopic,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          content: true,
          topicId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.memory.count({
        where: whereTopic,
      }),
    ])

    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        topicId: item.topicId,
        metadata: item.metadata as any,
        createdAt: item.createdAt,
      })),
      total,
      page,
      limit,
    }
  }

  /**
   * 单条删除
   */
  async delete(id: string): Promise<void> {
    const memory = await this.prisma.memory.findUnique({
      where: { id },
    })

    if (!memory) {
      throw new AppError('KB_CHUNK_NOT_FOUND', { id })
    }

    await this.prisma.memory.delete({
      where: { id },
    })
  }

  /**
   * 批量删除
   */
  async batchDelete(memoryIds: string[]): Promise<{ count: number }> {
    if (memoryIds.length === 0) {
      throw new AppError('KB_CHUNK_BATCH_DELETE_MEMORY_IDS_REQUIRED')
    }
    const result = await this.prisma.memory.deleteMany({
      where: { id: { in: memoryIds } },
    })
    return { count: result.count }
  }

  /**
   * 统计概览
   */
  async stats(kbId?: string): Promise<Stats | { kbNames: Stats[] }> {
    if (kbId) {
      const kb = await this.getKnowledgeBaseById(kbId)
      const result = await this.prisma.memory.aggregate({
        where: { kbId },
        _count: { id: true },
        _max: { createdAt: true },
      })

      return {
        kbId,
        kbName: kb.name,
        total: result._count.id,
        lastUpdated: result._max.createdAt ?? undefined,
      }
    } else {
      const knowledgeBases = await this.prisma.knowledgeBase.findMany({
        orderBy: { createdAt: 'desc' },
      })

      const memoryStats = await this.prisma.memory.groupBy({
        by: ['kbId'],
        _count: { id: true },
        _max: { createdAt: true },
      })

      const memoryStatsMap = new Map(
        memoryStats.map(stat => [stat.kbId, stat])
      )

      const kbNames: Stats[] = knowledgeBases.map(kb => {
        const memStat = memoryStatsMap.get(kb.id)
        if (!memStat) {
          return {
            kbId: kb.id,
            kbName: kb.name,
            total: 0,
            lastUpdated: kb.createdAt,
          }
        }
        if (memStat._count.id === null || memStat._count.id === undefined) {
          throw new AppError('KB_STATS_COUNT_EMPTY', { name: kb.name })
        }
        if (!memStat._max.createdAt) {
          throw new AppError('KB_STATS_LAST_UPDATED_EMPTY', { name: kb.name })
        }
        return {
          kbId: kb.id,
          kbName: kb.name,
          total: memStat._count.id,
          lastUpdated: memStat._max.createdAt,
        }
      })

      return { kbNames }
    }
  }

  /**
   * 拆分预览：AI 切分建议 + 主题归属建议
   */
  async splitPreview(memoryId: string, instruction?: string): Promise<{
    chunks: TitledChunk[]
    topicSuggestions: BatchTopicPlan
    existingTopics: Array<{ id: string; name: string; description: string }>
  }> {
    const memory = await this.prisma.memory.findUnique({
      where: { id: memoryId },
      select: { id: true, content: true, kbId: true },
    })

    if (!memory) {
      throw new AppError('KB_CHUNK_NOT_FOUND', { id: memoryId })
    }

    const chunks = await this.cutModelService.cutAndRewrite(memory.content, memory.kbId, undefined, instruction)

    const existingTopics = await this.prisma.topic.findMany({
      where: { kbId: memory.kbId },
      select: { id: true, name: true, description: true },
    })

    const plan = existingTopics.length > 0
      ? await this.cutModelService.batchResolveTopics(chunks, existingTopics, memory.kbId)
      : { plans: chunks.map((_, i) => ({
          index: i,
          action: 'none' as const,
          reason: '知识库暂无主题，待人工归类',
        })) }

    return { chunks, topicSuggestions: plan, existingTopics }
  }

  /**
   * 确认拆分：删除原片段，插入拆分后的新片段
   */
  async splitConfirm(
    memoryId: string,
    chunks: Array<{ title: string; content: string; topicId: string | null }>
  ): Promise<{ memoryIds: string[] }> {
    const memory = await this.prisma.memory.findUnique({
      where: { id: memoryId },
      select: { id: true, kbId: true },
    })

    if (!memory) {
      throw new AppError('KB_CHUNK_NOT_FOUND', { id: memoryId })
    }

    const embeddings = await this.embeddingService.generateEmbeddings(chunks.map((c) => c.content))

    const newIds = chunks.map(() => createId())

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO memories (id, kb_id, topic_id, title, content, embedding, metadata)
        VALUES (${newIds[i]}, ${memory.kbId}, ${chunk.topicId}, ${chunk.title}, ${chunk.content},
                ${`[${embeddings[i].join(',')}]`}::vector,
                ${JSON.stringify({ cutModel: 'manual-split' })}::jsonb)
        RETURNING id
      `
    }

    await this.prisma.memory.delete({ where: { id: memoryId } })

    return { memoryIds: newIds }
  }

  /**
   * 合并预览：AI 合并建议
   */
  async mergePreview(memoryIds: string[]): Promise<{
    mergedTitle: string
    mergedContent: string
  }> {
    const memories = await this.prisma.memory.findMany({
      where: { id: { in: memoryIds } },
      select: { id: true, title: true, content: true, kbId: true },
    })

    if (memories.length === 0) {
      throw new AppError('KB_CHUNK_NOT_FOUND', { id: memoryIds.join(',') })
    }

    const kbId = memories[0].kbId
    const result = await this.cutModelService.mergeTexts(
      memories.map((m) => ({ title: m.title, content: m.content })),
      kbId,
    )

    return { mergedTitle: result.title, mergedContent: result.content }
  }

  /**
   * 确认合并：删除原片段，插入合并后的新片段
   */
  async mergeConfirm(
    memoryIds: string[],
    merged: { title: string; content: string; topicId: string | null }
  ): Promise<{ memoryId: string }> {
    const memories = await this.prisma.memory.findMany({
      where: { id: { in: memoryIds } },
      select: { id: true, kbId: true },
    })

    if (memories.length === 0) {
      throw new AppError('KB_CHUNK_NOT_FOUND', { id: memoryIds.join(',') })
    }

    const kbId = memories[0].kbId
    const embedding = await this.embeddingService.generateEmbedding(merged.content)
    const newId = createId()

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO memories (id, kb_id, topic_id, title, content, embedding, metadata)
      VALUES (${newId}, ${kbId}, ${merged.topicId}, ${merged.title}, ${merged.content},
              ${`[${embedding.join(',')}]`}::vector,
              ${JSON.stringify({ cutModel: 'manual-merge' })}::jsonb)
      RETURNING id
    `

    await this.prisma.memory.deleteMany({
      where: { id: { in: memoryIds } },
    })

    return { memoryId: inserted[0].id }
  }

  async findChunks(params: {
    threshold: number
    page: number
    limit: number
    kbId?: string
    topicIds?: string[]
  }): Promise<{ items: ChunkItem[]; total: number; page: number; limit: number }> {
    const skip = (params.page - 1) * params.limit

    let whereClause = params.kbId
      ? Prisma.sql`AND m.kb_id = ${params.kbId}`
      : Prisma.empty

    if (params.topicIds && params.topicIds.length > 0) {
      whereClause = Prisma.sql`${whereClause} AND m.topic_id = ANY(ARRAY[${Prisma.join(params.topicIds)}]::text[])`
    }

    const [items, totalResult] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        id: string
        title: string
        content: string
        char_length: bigint
        topic_id: string | null
        topic_name: string | null
        kb_id: string
        kb_name: string
        created_at: Date
      }>>`
        SELECT
          m.id, m.title, m.content,
          LENGTH(m.content) as char_length,
          m.topic_id, t.name as topic_name,
          m.kb_id, kb.name as kb_name,
          m.created_at
        FROM memories m
        LEFT JOIN topics t ON t.id = m.topic_id
        LEFT JOIN knowledge_bases kb ON kb.id = m.kb_id
        WHERE LENGTH(m.content) > ${params.threshold}
          ${whereClause}
        ORDER BY char_length DESC
        LIMIT ${params.limit}
        OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) as total
        FROM memories m
        WHERE LENGTH(m.content) > ${params.threshold}
          ${whereClause}
      `,
    ])

    const total = Number(totalResult[0].total)

    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        charLength: Number(item.char_length),
        topicId: item.topic_id,
        topicName: item.topic_name,
        kbId: item.kb_id,
        kbName: item.kb_name,
        createdAt: item.created_at,
      })),
      total,
      page: params.page,
      limit: params.limit,
    }
  }

  /**
   * 批量改分类：将一批 memory 片段移动到指定 topic
   */
  async reassignTopic(memoryIds: string[], topicId: string): Promise<{ count: number }> {
    if (!memoryIds || memoryIds.length === 0) {
      throw new AppError('KB_CHUNK_REASSIGN_MEMORY_IDS_REQUIRED')
    }

    const result = await this.prisma.memory.updateMany({
      where: { id: { in: memoryIds } },
      data: { topicId },
    })

    return { count: result.count }
  }

  /**
   * 重命名分类
   */
  async renameTopic(topicId: string, name: string, description?: string): Promise<void> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true },
    })

    if (!topic) {
      throw new AppError('KB_TOPIC_NOT_FOUND_BY_ID')
    }

    const data: Record<string, unknown> = { name: name.trim() }
    if (description !== undefined) {
      data.description = description.trim()
    }

    await this.prisma.topic.update({
      where: { id: topicId },
      data: data as any,
    })
  }

  /**
   * 合并分类：将 sourceTopicIds 下的所有 memory 移到 targetTopicId，然后删除 source topics
   */
  async mergeTopics(sourceTopicIds: string[], targetTopicId: string): Promise<{ movedCount: number; deletedCount: number }> {
    if (!sourceTopicIds || sourceTopicIds.length === 0) {
      throw new AppError('KB_TOPIC_MERGE_SOURCE_IDS_REQUIRED')
    }

    const moveResult = await this.prisma.memory.updateMany({
      where: { topicId: { in: sourceTopicIds } },
      data: { topicId: targetTopicId },
    })

    const deleteResult = await this.prisma.topic.deleteMany({
      where: { id: { in: sourceTopicIds } },
    })

    return { movedCount: moveResult.count, deletedCount: deleteResult.count }
  }

  async duplicateDetect(kbId: string, threshold: number, limit = 100): Promise<{ groups: DuplicateGroup[]; detectedCount: number }> {
    const similarityThreshold = Math.max(0, Math.min(1, threshold))

    interface SimilarPair {
      id1: string
      title1: string
      content1: string
      char_length1: bigint
      topic_id1: string | null
      topic_name1: string | null
      kb_id1: string
      kb_name1: string
      id2: string
      title2: string
      content2: string
      char_length2: bigint
      topic_id2: string | null
      topic_name2: string | null
      kb_id2: string
      kb_name2: string
      similarity: number
    }

    const rows = await this.prisma.$queryRaw<SimilarPair[]>`
      WITH top AS (
        SELECT m.id, m.title, m.content, m.topic_id, m.kb_id, m.embedding,
               t.name AS topic_name, kb.name AS kb_name
        FROM memories m
        LEFT JOIN topics t ON t.id = m.topic_id
        LEFT JOIN knowledge_bases kb ON kb.id = m.kb_id
        WHERE m.kb_id = ${kbId}
          AND m.embedding IS NOT NULL
        ORDER BY LENGTH(m.content) DESC
        LIMIT ${limit}
      )
      SELECT
        t1.id AS id1, t1.title AS title1, t1.content AS content1,
        LENGTH(t1.content) AS char_length1,
        t1.topic_id AS topic_id1, t1.topic_name AS topic_name1,
        t1.kb_id AS kb_id1, t1.kb_name AS kb_name1,
        t2.id AS id2, t2.title AS title2, t2.content AS content2,
        LENGTH(t2.content) AS char_length2,
        t2.topic_id AS topic_id2, t2.topic_name AS topic_name2,
        t2.kb_id AS kb_id2, t2.kb_name AS kb_name2,
        1 - (t1.embedding <=> t2.embedding) AS similarity
      FROM top t1
      JOIN top t2 ON t1.id < t2.id
      WHERE 1 - (t1.embedding <=> t2.embedding) > ${similarityThreshold}
      ORDER BY similarity DESC
    `

    const pairCount = rows.length

    function buildItem(row: SimilarPair, which: 1 | 2): DuplicateGroupItem {
      const id = which === 1 ? row.id1 : row.id2
      const title = which === 1 ? row.title1 : row.title2
      const content = which === 1 ? row.content1 : row.content2
      const charLength = Number(which === 1 ? row.char_length1 : row.char_length2)
      const topicId = which === 1 ? row.topic_id1 : row.topic_id2
      const topicName = which === 1 ? row.topic_name1 : row.topic_name2
      const kbIdField = which === 1 ? row.kb_id1 : row.kb_id2
      const kbName = which === 1 ? row.kb_name1 : row.kb_name2
      return { id, title, content, charLength, topicId, topicName, kbId: kbIdField, kbName }
    }

    if (pairCount === 0) {
      return { groups: [], detectedCount: 0 }
    }

    const nodeIds = new Set<string>()
    for (const r of rows) {
      nodeIds.add(r.id1)
      nodeIds.add(r.id2)
    }
    const allIds = Array.from(nodeIds)
    const parent = new Map<string, string>()
    for (const id of allIds) {
      parent.set(id, id)
    }
    function find(x: string): string {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!)
        x = parent.get(x)!
      }
      return x
    }
    function union(a: string, b: string): void {
      parent.set(find(a), find(b))
    }
    for (const r of rows) {
      union(r.id1, r.id2)
    }

    const componentMap = new Map<string, { ids: Set<string>; similarities: number[]; rows: SimilarPair[] }>()
    for (const id of allIds) {
      const root = find(id)
      if (!componentMap.has(root)) {
        componentMap.set(root, { ids: new Set(), similarities: [], rows: [] })
      }
      componentMap.get(root)!.ids.add(id)
    }
    for (const r of rows) {
      const root = find(r.id1)
      const comp = componentMap.get(root)!
      comp.similarities.push(r.similarity)
      comp.rows.push(r)
    }

    const groups: DuplicateGroup[] = []
    for (const [, comp] of componentMap) {
      if (comp.ids.size < 2) continue
      const idList = Array.from(comp.ids)
      const itemMap = new Map<string, DuplicateGroupItem>()
      for (const r of comp.rows) {
        if (!itemMap.has(r.id1)) {
          itemMap.set(r.id1, buildItem(r, 1))
        }
        if (!itemMap.has(r.id2)) {
          itemMap.set(r.id2, buildItem(r, 2))
        }
      }
      const items = idList.map((id) => itemMap.get(id)!).sort((a, b) => b.charLength - a.charLength)
      const maxSimilarity = Math.max(...comp.similarities)
      const minSimilarity = Math.min(...comp.similarities)
      groups.push({ items, maxSimilarity: Math.round(maxSimilarity * 10000) / 10000, minSimilarity: Math.round(minSimilarity * 10000) / 10000 })
    }

    groups.sort((a, b) => b.items.length - a.items.length || b.maxSimilarity - a.maxSimilarity)

    return { groups, detectedCount: allIds.length }
  }
}