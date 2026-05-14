import type { PrismaClient } from '@prisma/client'
import { Errors } from '@/src/lib/errors'
import type {
  SearchResult,
  ListItem,
  Stats,
  KnowledgeBaseInfo,
} from '@/src/types'
import { EmbeddingService } from '@/src/services/embedding.service'
import { ChunkService } from '@/src/services/chunk.service'
import { SettingService } from '@/src/services/setting.service'

/**
 * 知识库核心服务
 */
export class KBService {
  private prisma: PrismaClient
  private embeddingService: EmbeddingService
  private chunkService: ChunkService
  private settingService: SettingService

  constructor({
    prisma,
    embeddingService,
    chunkService,
    settingService,
  }: {
    prisma: PrismaClient
    embeddingService: EmbeddingService
    chunkService: ChunkService
    settingService: SettingService
  }) {
    this.prisma = prisma
    this.embeddingService = embeddingService
    this.chunkService = chunkService
    this.settingService = settingService
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
   * 知识入库
   */
  async ingest(kbName: string, content: string): Promise<{ count: number; ids: number[] }> {
    const settings = await this.settingService.getAppSettings()
    const maxLength = settings.maxContentLength
    
    if (content.length > maxLength) {
      throw Errors.badRequest(`内容长度超过限制 (${maxLength} 字符)`)
    }

    if (!kbName || kbName.trim().length === 0) {
      throw Errors.badRequest('知识库名不能为空')
    }

    const chunks = await this.chunkService.chunkText(content)

    const ids: number[] = []
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      await this.prisma.$executeRaw`
        INSERT INTO memories (kb_name, content, chunk_index, metadata, created_at)
        VALUES (
          ${kbName.trim()},
          ${chunk.content},
          ${chunk.index},
          ${JSON.stringify(chunk.metadata)}::json,
          NOW()
        )
        RETURNING id
      `
      
      const memory = await this.prisma.memory.findFirst({
        where: {
          kbName: kbName.trim(),
          chunkIndex: chunk.index,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      
      if (memory) {
        ids.push(memory.id)
      }
    }

    return { count: chunks.length, ids }
  }

  /**
   * 语义检索
   */
  async search(
    kbName: string,
    query: string,
    topK: number = 5,
    contextWindow: number = 1
  ): Promise<SearchResult[]> {
    if (!kbName || kbName.trim().length === 0) {
      throw Errors.badRequest('知识库名不能为空')
    }

    if (!query || query.trim().length === 0) {
      throw Errors.badRequest('查询语句不能为空')
    }

    const queryEmbedding = await this.embeddingService.generateEmbedding(query, kbName.trim())

    const results = await this.prisma.$queryRaw<
      Array<{
        id: number
        content: string
        chunk_index: number
        metadata: any
        score: number
      }>
    >`
      SELECT 
        id, 
        content, 
        chunk_index, 
        metadata,
        1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) as score
      FROM memories
      WHERE kb_name = ${kbName.trim()}
      ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
      LIMIT ${topK}
    `

    const searchResults: SearchResult[] = []
    for (const result of results) {
      const context = contextWindow > 0 
        ? await this.getContext(result.id, kbName, contextWindow)
        : undefined

      searchResults.push({
        id: result.id,
        content: result.content,
        score: result.score,
        chunkIndex: result.chunk_index,
        metadata: result.metadata,
        context,
      })
    }

    return searchResults
  }

  private async getContext(
    memoryId: number,
    kbName: string,
    windowSize: number
  ): Promise<{ prev?: string; next?: string }> {
    const context: { prev?: string; next?: string } = {}

    const current = await this.prisma.memory.findUnique({
      where: { id: memoryId },
      select: { chunkIndex: true },
    })

    if (!current) return context

    if (current.chunkIndex > 0) {
      const prev = await this.prisma.memory.findFirst({
        where: {
          kbName,
          chunkIndex: current.chunkIndex - 1,
        },
        select: { content: true },
      })
      if (prev) context.prev = prev.content
    }

    const next = await this.prisma.memory.findFirst({
      where: {
        kbName,
        chunkIndex: current.chunkIndex + 1,
      },
      select: { content: true },
    })
    if (next) context.next = next.content

    return context
  }

  /**
   * 列表浏览
   */
  async list(
    kbName: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ items: ListItem[]; total: number; page: number; limit: number }> {
    if (!kbName || kbName.trim().length === 0) {
      throw Errors.badRequest('知识库名不能为空')
    }

    const skip = (page - 1) * limit

    const [items, total] = await Promise.all([
      this.prisma.memory.findMany({
        where: { kbName: kbName.trim() },
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
        where: { kbName: kbName.trim() },
      }),
    ])

    return {
      items: items.map(item => ({
        id: item.id,
        content: item.content.length > 200 
          ? item.content.slice(0, 200) + '...' 
          : item.content,
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
  async stats(kbName?: string): Promise<Stats | { kbNames: Stats[] }> {
    if (kbName) {
      const result = await this.prisma.memory.aggregate({
        where: { kbName: kbName.trim() },
        _count: { id: true },
        _max: { createdAt: true },
      })

      if (result._count.id === 0) {
        throw Errors.projectNotFound(kbName)
      }

      return {
        kbName: kbName.trim(),
        total: result._count.id,
        lastUpdated: result._max.createdAt || undefined,
      }
    } else {
      const knowledgeBases = await this.prisma.knowledgeBase.findMany({
        orderBy: { createdAt: 'desc' },
      })

      const memoryStats = await this.prisma.memory.groupBy({
        by: ['kbName'],
        _count: { id: true },
        _max: { createdAt: true },
      })

      const memoryStatsMap = new Map(
        memoryStats.map(stat => [stat.kbName, stat])
      )

      const kbNames: Stats[] = knowledgeBases.map(kb => {
        const memStat = memoryStatsMap.get(kb.name)
        return {
          kbName: kb.name,
          total: memStat?._count.id || 0,
          lastUpdated: memStat?._max.createdAt || kb.createdAt,
        }
      })

      return { kbNames }
    }
  }
}
