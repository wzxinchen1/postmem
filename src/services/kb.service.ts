import type { PrismaClient } from '@prisma/client'
import { Errors } from '@/src/lib/errors'
import type {
  SearchResult,
  ListItem,
  Stats,
} from '@/src/types'
import { EmbeddingService } from '@/src/services/embedding.service'
import { ChunkService } from '@/src/services/chunk.service'

/**
 * 知识库核心服务
 */
export class KBService {
  private prisma: PrismaClient
  private embeddingService: EmbeddingService
  private chunkService: ChunkService

  constructor({
    prisma,
    embeddingService,
    chunkService,
  }: {
    prisma: PrismaClient
    embeddingService: EmbeddingService
    chunkService: ChunkService
  }) {
    this.prisma = prisma
    this.embeddingService = embeddingService
    this.chunkService = chunkService
  }

  /**
   * 知识入库
   */
  async ingest(kbName: string, content: string): Promise<{ count: number; ids: number[] }> {
    // 验证输入
    const maxLength = parseInt(process.env.MAX_CONTENT_LENGTH || '20000')
    if (content.length > maxLength) {
      throw Errors.badRequest(`内容长度超过限制 (${maxLength} 字符)`)
    }

    if (!kbName || kbName.trim().length === 0) {
      throw Errors.badRequest('知识库名不能为空')
    }

    try {
      // 切割文本
      const chunks = await this.chunkService.chunkText(content)
      
      // 生成嵌入向量
      const embeddings = await this.embeddingService.generateEmbeddings(
        chunks.map(c => c.content)
      )

      // 存入数据库
      const ids: number[] = []
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const embedding = embeddings[i]

        // 使用原生 SQL 插入，因为 Prisma 不支持 Unsupported 类型
        const result = await this.prisma.$executeRaw`
          INSERT INTO memories (kb_name, content, embedding, chunk_index, metadata, created_at)
          VALUES (
            ${kbName.trim()},
            ${chunk.content},
            ${`[${embedding.join(',')}]`}::vector,
            ${chunk.index},
            ${JSON.stringify(chunk.metadata)}::json,
            NOW()
          )
          RETURNING id
        `
        
        // 获取插入的 ID
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
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw Errors.databaseError(message)
    }
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
    // 验证输入
    if (!kbName || kbName.trim().length === 0) {
      throw Errors.badRequest('知识库名不能为空')
    }

    if (!query || query.trim().length === 0) {
      throw Errors.badRequest('查询语句不能为空')
    }

    try {
      // 生成查询向量
      const queryEmbedding = await this.embeddingService.generateEmbedding(query)

      // 执行向量检索
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

      // 获取上下文
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
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw Errors.databaseError(message)
    }
  }

  /**
   * 获取上下文片段
   */
  private async getContext(
    memoryId: number,
    kbName: string,
    windowSize: number
  ): Promise<{ prev?: string; next?: string }> {
    const context: { prev?: string; next?: string } = {}

    // 获取当前片段的 chunkIndex
    const current = await this.prisma.memory.findUnique({
      where: { id: memoryId },
      select: { chunkIndex: true },
    })

    if (!current) return context

    // 获取前一个片段
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

    // 获取后一个片段
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
    // 验证输入
    if (!kbName || kbName.trim().length === 0) {
      throw Errors.badRequest('知识库名不能为空')
    }

    const skip = (page - 1) * limit

    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw Errors.databaseError(message)
    }
  }

  /**
   * 单条删除
   */
  async delete(id: number): Promise<void> {
    try {
      const memory = await this.prisma.memory.findUnique({
        where: { id },
      })

      if (!memory) {
        throw Errors.memoryNotFound(id)
      }

      await this.prisma.memory.delete({
        where: { id },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw Errors.databaseError(message)
    }
  }

  /**
   * 统计概览
   */
  async stats(kbName?: string): Promise<Stats | { kbNames: Stats[] }> {
    try {
      if (kbName) {
        // 单个知识库统计
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
        // 所有知识库统计
        const kbNames = await this.prisma.memory.groupBy({
          by: ['kbName'],
          _count: { id: true },
          _max: { createdAt: true },
        })

        return {
          kbNames: kbNames.map(p => ({
            kbName: p.kbName,
            total: p._count.id,
            lastUpdated: p._max.createdAt || undefined,
          })),
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw Errors.databaseError(message)
    }
  }
}
