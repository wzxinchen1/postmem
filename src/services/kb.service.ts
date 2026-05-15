import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { Errors } from '@/src/lib/errors'
import type {
  SearchResult,
  SearchSource,
  ListItem,
  Stats,
  KnowledgeBaseInfo,
  IngestMessage,
  IngestTextResponse,
  IngestMessagesResponse,
} from '@/src/types'
import { EmbeddingService } from '@/src/services/embedding.service'
import { SettingService } from '@/src/services/setting.service'
import { CutModelService } from '@/src/services/cut-model.service'
import { randomUUID } from 'crypto'

/**
 * 知识库核心服务
 *
 * 设计原则（MemPalace 原理）：
 * - 写入零 LLM 调用，不提取不总结
 * - 只存完整原文（Verbatim-First）
 * - 向量仅作为检索原文的索引
 */
export class KBService {
  private prisma: PrismaClient
  private embeddingService: EmbeddingService
  private settingService: SettingService
  private cutModelService: CutModelService

  constructor({
    prisma,
    embeddingService,
    settingService,
    cutModelService,
  }: {
    prisma: PrismaClient
    embeddingService: EmbeddingService
    settingService: SettingService
    cutModelService: CutModelService
  }) {
    this.prisma = prisma
    this.embeddingService = embeddingService
    this.settingService = settingService
    this.cutModelService = cutModelService
  }

  /**
   * 创建知识库
   */
  async createKnowledgeBase(name: string, description?: string): Promise<KnowledgeBaseInfo> {
    if (!name || name.trim().length === 0) {
      throw Errors.badRequest('知识库名不能为空')
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw Errors.badRequest('名称只能包含字母、数字、中划线和下划线')
    }

    const existing = await this.prisma.knowledgeBase.findUnique({
      where: { name: name.trim() },
    })

    if (existing) {
      throw Errors.badRequest(`知识库 "${name}" 已存在`)
    }

    const kb = await this.prisma.knowledgeBase.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
      },
    })

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description || undefined,
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
      throw Errors.projectNotFound(name)
    }

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description || undefined,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    }
  }

  /**
   * 根据ID获取知识库
   */
  async getKnowledgeBaseById(id: number): Promise<KnowledgeBaseInfo> {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id },
    })

    if (!kb) {
      throw Errors.badRequest(`知识库 ID ${id} 不存在`)
    }

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description || undefined,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    }
  }

  /**
   * 知识入库 - 纯文本方式
   *
   * MemPalace 原理：LLM 切分+重写一步到位，每个片段语义完整连贯，完整存储
   */
  async ingestText(kbId: number, content: string): Promise<IngestTextResponse> {
    const settings = await this.settingService.getAppSettings()
    const maxLength = settings.maxContentLength

    if (!content || content.trim().length === 0) {
      throw Errors.badRequest('内容不能为空')
    }

    if (content.length > maxLength) {
      throw Errors.badRequest(`内容长度超过限制 (${maxLength} 字符)`)
    }

    await this.getKnowledgeBaseById(kbId)

    const batchId = randomUUID()
    const chunks = await this.cutModelService.cutAndRewrite(content, kbId)
    const memoryIds: number[] = []

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.embeddingService.generateEmbedding(chunks[i])

      await this.prisma.$executeRaw`
        INSERT INTO memories (kb_id, content, embedding, chunk_index, ingest_batch, metadata, "contentTsvector", created_at)
        VALUES (
          ${kbId},
          ${chunks[i]},
          ${`[${embedding.join(',')}]`}::vector,
          ${i},
          ${batchId},
          ${JSON.stringify({ cutModel: 'cut-and-rewrite' })}::json,
          to_tsvector('simple', ${chunks[i]}),
          NOW()
        )
        RETURNING id
      `

      const memory = await this.prisma.memory.findFirst({
        where: {
          kbId: kbId,
          chunkIndex: i,
          ingestBatch: batchId,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      if (memory) {
        memoryIds.push(memory.id)
      }
    }

    return {
      count: memoryIds.length,
      memoryIds,
    }
  }

  /**
   * 知识入库 - 消息列表方式
   *
   * MemPalace 原理：零 LLM 调用，每条消息原文完整存储
   */
  async ingestMessages(kbId: number, messages: IngestMessage[]): Promise<IngestMessagesResponse> {
    const settings = await this.settingService.getAppSettings()
    const maxLength = settings.maxContentLength

    if (!messages || messages.length === 0) {
      throw Errors.badRequest('消息列表不能为空')
    }

    for (const msg of messages) {
      if (msg.content.length > maxLength) {
        throw Errors.badRequest(`消息 ${msg.id} 内容长度超过限制 (${maxLength} 字符)`)
      }
    }

    await this.getKnowledgeBaseById(kbId)

    const batchId = randomUUID()
    const memoryIds: number[] = []
    const memorizedMessageIds: string[] = []

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统'
      const content = `${roleLabel}: ${msg.content}`
      const embedding = await this.embeddingService.generateEmbedding(content)

      await this.prisma.$executeRaw`
        INSERT INTO memories (kb_id, content, embedding, chunk_index, ingest_batch, metadata, "contentTsvector", created_at)
        VALUES (
          ${kbId},
          ${content},
          ${`[${embedding.join(',')}]`}::vector,
          ${i},
          ${batchId},
          ${JSON.stringify({
            cutModel: 'verbatim',
            messageId: msg.id,
            role: msg.role,
          })}::json,
          to_tsvector('simple', ${content}),
          NOW()
        )
        RETURNING id
      `

      const memory = await this.prisma.memory.findFirst({
        where: {
          kbId: kbId,
          chunkIndex: i,
          ingestBatch: batchId,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      if (memory) {
        memoryIds.push(memory.id)
        memorizedMessageIds.push(msg.id)
      }
    }

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
    kbId: number,
    query: string,
    topK: number = 5,
    contextWindow: number = 1
  ): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw Errors.badRequest('查询语句不能为空')
    }

    await this.getKnowledgeBaseById(kbId)
    const queryEmbedding = await this.embeddingService.generateEmbedding(query)

    const denseLimit = topK * 3

    const [denseResults, sparseResults] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: number
          content: string
          chunk_index: number
          ingest_batch: string
          metadata: any
          cosine_distance: number
        }>
      >`
        SELECT 
          id, 
          content, 
          chunk_index,
          ingest_batch,
          metadata,
          (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) as cosine_distance
        FROM memories
        WHERE kb_id = ${kbId}
          AND (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) < 0.3
        ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
        LIMIT ${denseLimit}
      `,
      this.prisma.$queryRaw<
        Array<{
          id: number
          content: string
          chunk_index: number
          ingest_batch: string
          metadata: any
          ts_rank: number
        }>
      >`
        SELECT 
          id, 
          content, 
          chunk_index,
          ingest_batch,
          metadata,
          ts_rank("contentTsvector", plainto_tsquery('simple', ${query})) as ts_rank
        FROM memories
        WHERE kb_id = ${kbId} AND "contentTsvector" @@ plainto_tsquery('simple', ${query})
        ORDER BY ts_rank("contentTsvector", plainto_tsquery('simple', ${query})) DESC
        LIMIT ${denseLimit}
      `
    ])

    const rrfK = 60
    interface RrfItem {
      id: number
      content: string
      chunk_index: number
      ingest_batch: string
      metadata: any
      ts_rank?: number
    }
    const rrfScores = new Map<number, { rrfScore: number; source: SearchSource; data: RrfItem; cosineSim: number; tsRank?: number }>()

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
      const context = contextWindow > 0
        ? await this.getContext(item.data.id, kbId, item.data.ingest_batch, contextWindow)
        : undefined

      searchResults.push({
        id: item.data.id,
        content: item.data.content,
        score,
        chunkIndex: item.data.chunk_index,
        metadata: item.data.metadata,
        source: item.source,
        context,
      })
    }

    return searchResults
  }

  private async getContext(
    memoryId: number,
    kbId: number,
    ingestBatch: string,
    windowSize: number
  ): Promise<{ prev: string[]; next: string[] }> {
    const current = await this.prisma.memory.findUnique({
      where: { id: memoryId },
      select: { chunkIndex: true },
    })

    if (!current) return { prev: [], next: [] }

    const prevChunkIndexes: number[] = []
    for (let i = 1; i <= windowSize; i++) {
      const idx = current.chunkIndex - i
      if (idx >= 0) prevChunkIndexes.push(idx)
    }

    const nextChunkIndexes: number[] = []
    for (let i = 1; i <= windowSize; i++) {
      nextChunkIndexes.push(current.chunkIndex + i)
    }

    const [prevMemories, nextMemories] = await Promise.all([
      prevChunkIndexes.length > 0
        ? this.prisma.memory.findMany({
            where: {
              kbId,
              ingestBatch,
              chunkIndex: { in: prevChunkIndexes },
            },
            orderBy: { chunkIndex: 'desc' },
            select: { content: true },
          })
        : [],
      nextChunkIndexes.length > 0
        ? this.prisma.memory.findMany({
            where: {
              kbId,
              ingestBatch,
              chunkIndex: { in: nextChunkIndexes },
            },
            orderBy: { chunkIndex: 'asc' },
            select: { content: true },
          })
        : [],
    ])

    return {
      prev: prevMemories.map(m => m.content),
      next: nextMemories.map(m => m.content),
    }
  }

  /**
   * 列表浏览
   */
  async list(
    kbId: number,
    page: number = 1,
    limit: number = 20
  ): Promise<{ items: ListItem[]; total: number; page: number; limit: number }> {
    await this.getKnowledgeBaseById(kbId)

    const skip = (page - 1) * limit

    const [items, total] = await Promise.all([
      this.prisma.memory.findMany({
        where: { kbId },
        orderBy: [{ chunkIndex: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          content: true,
          chunkIndex: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.memory.count({
        where: { kbId },
      }),
    ])

    return {
      items: items.map(item => ({
        id: item.id,
        content: item.content,
        chunkIndex: item.chunkIndex,
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
  async delete(id: number): Promise<void> {
    const memory = await this.prisma.memory.findUnique({
      where: { id },
    })

    if (!memory) {
      throw Errors.memoryNotFound(id)
    }

    await this.prisma.memory.delete({
      where: { id },
    })
  }

  /**
   * 统计概览
   */
  async stats(kbId?: number): Promise<Stats | { kbNames: Stats[] }> {
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
        lastUpdated: result._max.createdAt || undefined,
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
        return {
          kbId: kb.id,
          kbName: kb.name,
          total: memStat?._count.id || 0,
          lastUpdated: memStat?._max.createdAt || kb.createdAt,
        }
      })

      return { kbNames }
    }
  }
}
