import type { PrismaClient } from '@prisma/client'
import { Errors } from '@/src/lib/errors'
import type {
  SearchResult,
  ListItem,
  Stats,
  KnowledgeBaseInfo,
  IngestMessage,
  IngestTextResponse,
  IngestMessagesResponse,
  MessageGroup,
} from '@/src/types'
import { EmbeddingService } from '@/src/services/embedding.service'
import { SettingService } from '@/src/services/setting.service'
import { CutModelService } from '@/src/services/cut-model.service'

/**
 * 知识库核心服务
 */
export class KBService {
  private prisma: PrismaClient
  private embeddingService: EmbeddingService
  private cutModelService: CutModelService
  private settingService: SettingService

  constructor({
    prisma,
    embeddingService,
    cutModelService,
    settingService,
  }: {
    prisma: PrismaClient
    embeddingService: EmbeddingService
    cutModelService: CutModelService
    settingService: SettingService
  }) {
    this.prisma = prisma
    this.embeddingService = embeddingService
    this.cutModelService = cutModelService
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
   * 知识入库 - 纯文本方式（用于测试）
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

    const kb = await this.getKnowledgeBaseById(kbId)
    
    let groups: MessageGroup[]
    try {
      groups = await this.cutModelService.analyzeTextGroups(content, kb.id)
    } catch (error) {
      throw error
    }

    const memoryIds: number[] = []

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]

      const groupContent = group.summary 
        ? `【话题摘要】${group.summary}\n【内容】${content.slice(0, 500)}`
        : content

      await this.prisma.$executeRaw`
        INSERT INTO memories (kb_id, content, chunk_index, metadata, created_at)
        VALUES (
          ${kbId},
          ${groupContent},
          ${i},
          ${JSON.stringify({
            cutModel: 'llm',
            summary: group.summary,
            isComplete: group.isComplete,
          })}::json,
          NOW()
        )
        RETURNING id
      `

      const memory = await this.prisma.memory.findFirst({
        where: {
          kbId: kbId,
          chunkIndex: i,
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
   * 知识入库 - 消息列表方式（智能切割）
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

    const kb = await this.getKnowledgeBaseById(kbId)
    
    let groups: MessageGroup[]
    try {
      groups = await this.cutModelService.analyzeMessageGroups(messages, kb.id)
    } catch (error) {
      throw error
    }

    const messageMap = new Map(messages.map(m => [m.id, m]))
    const memoryIds: number[] = []
    const memorizedMessageIds: string[] = []

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]

      if (!group.isComplete) {
        continue
      }

      const groupMessages = group.messageIds
        .map(id => messageMap.get(id))
        .filter((m): m is IngestMessage => m !== undefined)

      if (groupMessages.length === 0) {
        continue
      }

      const content = this.formatGroupContent(groupMessages, group.summary)

      await this.prisma.$executeRaw`
        INSERT INTO memories (kb_id, content, chunk_index, metadata, created_at)
        VALUES (
          ${kbId},
          ${content},
          ${i},
          ${JSON.stringify({
            cutModel: 'llm',
            messageIds: group.messageIds,
            summary: group.summary,
            messageCount: groupMessages.length,
          })}::json,
          NOW()
        )
        RETURNING id
      `

      const memory = await this.prisma.memory.findFirst({
        where: {
          kbId: kbId,
          chunkIndex: i,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      if (memory) {
        memoryIds.push(memory.id)
        memorizedMessageIds.push(...group.messageIds)
      }
    }

    return {
      count: memoryIds.length,
      memoryIds,
      memorizedMessageIds,
    }
  }

  /**
   * 格式化消息组内容为记忆文本
   */
  private formatGroupContent(messages: IngestMessage[], summary?: string): string {
    const parts: string[] = []
    
    if (summary) {
      parts.push(`【话题摘要】${summary}`)
    }
    
    parts.push('【对话内容】')
    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统'
      parts.push(`${roleLabel}: ${msg.content}`)
    }
    
    return parts.join('\n')
  }

  /**
   * 语义检索
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
    const queryEmbedding = await this.embeddingService.generateEmbedding(query, kbId)

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
      WHERE kb_id = ${kbId}
      ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
      LIMIT ${topK}
    `

    const searchResults: SearchResult[] = []
    for (const result of results) {
      const context = contextWindow > 0 
        ? await this.getContext(result.id, kbId, contextWindow)
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
    kbId: number,
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
          kbId,
          chunkIndex: current.chunkIndex - 1,
        },
        select: { content: true },
      })
      if (prev) context.prev = prev.content
    }

    const next = await this.prisma.memory.findFirst({
      where: {
        kbId,
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
