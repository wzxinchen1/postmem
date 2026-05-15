import { PrismaClient, Prisma } from '@/src/generated/prisma/client/client'
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
 * 知识入库 - 纯文本方式（带进度回调的流式版本）
 */
  async ingestTextStream(
    kbId: number,
    content: string,
    onProgress: (event: { type: string; message?: string; data?: Record<string, unknown> }) => void
  ): Promise<IngestTextResponse> {
    const settings = await this.settingService.getAppSettings()
    const maxLength = settings.maxContentLength

    if (!content || content.trim().length === 0) {
      throw Errors.badRequest('内容不能为空')
    }

    if (content.length > maxLength) {
      throw Errors.badRequest(`内容长度超过限制 (${maxLength} 字符)`)
    }

    await this.getKnowledgeBaseById(kbId)

    onProgress({ type: 'status', message: '正在切分文本...' })
    const chunks = await this.cutModelService.cutAndRewrite(content, kbId)
    onProgress({ type: 'status', message: `文本已切分为 ${chunks.length} 个片段，正在规划主题...` })

    const memoryIds: number[] = []
    const topicsInvolvedSet = new Set<string>()
    const thisBatchIds = new Set<number>()

    const existingTopics = await this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })

    const chunkInputs = chunks

    onProgress({ type: 'status', message: '正在规划主题归属...' })
    const plan = await this.cutModelService.batchResolveTopics(chunkInputs, existingTopics, kbId)

    const topicNameMap = new Map<string, number>()
    for (const t of existingTopics) {
      topicNameMap.set(t.name, t.id)
    }

    const createPlans = plan.plans.filter(
      (p) => p.action === 'create' && p.newTopicName && !topicNameMap.has(p.newTopicName)
    )

    if (createPlans.length > 0) {
      onProgress({ type: 'status', message: `拟创建 ${createPlans.length} 个主题，正在合并去重...` })

      const proposedTopics = createPlans.map((p) => ({
        name: p.newTopicName!,
        sampleContent: chunks[p.index]?.content || '',
      }))

      const mergedTopics = await this.cutModelService.batchCreateTopics(proposedTopics, kbId)

      let createIndex = 0
      for (const p of createPlans) {
        const mergedTopic = mergedTopics[Math.min(createIndex, mergedTopics.length - 1)]

        if (topicNameMap.has(mergedTopic.name)) {
          topicNameMap.set(p.newTopicName!, topicNameMap.get(mergedTopic.name)!)
        } else {
          onProgress({ type: 'status', message: `创建主题：${mergedTopic.name}` })
          const newTopic = await this.prisma.topic.create({
            data: {
              kbId,
              name: mergedTopic.name,
              description: mergedTopic.description,
            },
          })
          topicNameMap.set(mergedTopic.name, newTopic.id)
        }

        topicNameMap.set(p.newTopicName!, topicNameMap.get(mergedTopic.name)!)
        createIndex++
      }

      onProgress({ type: 'status', message: `已合并为 ${mergedTopics.length} 个主题` })
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      onProgress({
        type: 'progress',
        message: `处理片段 ${i + 1}/${chunks.length}：${chunk.title}`,
        data: { current: i + 1, total: chunks.length, title: chunk.title },
      })

      const planItem = plan.plans.find((p) => p.index === chunk.index)

      if (!planItem) {
        throw Errors.internalError(`片段 ${chunk.index} 缺少主题规划`)
      }

      let topicId: number
      if (planItem.action === 'select' && planItem.topicName) {
        const tid = topicNameMap.get(planItem.topicName)
        if (!tid) {
          throw Errors.internalError(`主题 "${planItem.topicName}" 未找到`)
        }
        topicId = tid
      } else {
        const tid = planItem.newTopicName ? topicNameMap.get(planItem.newTopicName) : undefined
        if (!tid) {
          throw Errors.internalError(`片段 ${chunk.index} 的主题创建失败`)
        }
        topicId = tid
      }

      if (!topicsInvolvedSet.has(String(topicId))) {
        const topic = await this.prisma.topic.findUnique({
          where: { id: topicId },
          select: { name: true },
        })
        if (topic) {
          topicsInvolvedSet.add(topic.name)
        }
      }

      onProgress({ type: 'chunk_detail', message: '检测相似内容...', data: { title: chunk.title } })
      let similarMemories = await this.searchInTopic(kbId, chunk.content, 3)
      similarMemories = similarMemories.filter((m) => !thisBatchIds.has(m.id))

      if (similarMemories.length === 0) {
        onProgress({ type: 'chunk_detail', message: '无相似记录，直接入库', data: { title: chunk.title, action: 'insert' } })
        const embedding = await this.embeddingService.generateEmbedding(chunk.content)

        const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
          INSERT INTO memories (kb_id, topic_id, title, content, embedding, metadata, "contentTsvector")
          VALUES (${kbId}, ${topicId}, ${chunk.title}, ${chunk.content}, ${`[${embedding.join(',')}]`}::vector,
                  ${JSON.stringify({ cutModel: 'cut-and-rewrite' })}::jsonb,
                  to_tsvector('simple', ${chunk.content}))
          RETURNING id
        `
        memoryIds.push(inserted[0].id)
        thisBatchIds.add(inserted[0].id)
        continue
      }

      onProgress({ type: 'chunk_detail', message: `发现 ${similarMemories.length} 条相似记录，进行去重判断...`, data: { title: chunk.title } })
      const result = await this.cutModelService.shouldIngestChunk(
        chunk.content,
        similarMemories.map((m) => ({ id: m.id, content: m.content, score: m.score })),
        kbId
      )

      if (result.action === 'skip') {
        onProgress({ type: 'chunk_detail', message: '跳过（与已有记录重复）', data: { title: chunk.title, action: 'skip' } })
        continue
      }

      if (result.action === 'merge' && result.targetMemoryId && result.mergedContent) {
        onProgress({ type: 'chunk_detail', message: '合并到已有记录', data: { title: chunk.title, action: 'merge' } })
        const mergeEmbedding = await this.embeddingService.generateEmbedding(result.mergedContent)

        await this.prisma.$executeRaw`
          UPDATE memories SET
            content = ${result.mergedContent},
            embedding = ${`[${mergeEmbedding.join(',')}]`}::vector,
            "contentTsvector" = to_tsvector('simple', ${result.mergedContent})
          WHERE id = ${result.targetMemoryId}
        `

        memoryIds.push(result.targetMemoryId)
        thisBatchIds.add(result.targetMemoryId)
        continue
      }

      onProgress({ type: 'chunk_detail', message: '作为新记录入库', data: { title: chunk.title, action: 'new' } })
      const embedding = await this.embeddingService.generateEmbedding(chunk.content)

      const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO memories (kb_id, topic_id, title, content, embedding, metadata, "contentTsvector")
        VALUES (${kbId}, ${topicId}, ${chunk.title}, ${chunk.content}, ${`[${embedding.join(',')}]`}::vector,
                ${JSON.stringify({ cutModel: 'cut-and-rewrite' })}::jsonb,
                to_tsvector('simple', ${chunk.content}))
        RETURNING id
      `
      memoryIds.push(inserted[0].id)
      thisBatchIds.add(inserted[0].id)
    }

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
 * 去重策略：每个分块先搜索相似记忆，LLM 判断是否有增量价值
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

    const chunks = await this.cutModelService.cutAndRewrite(content, kbId)
    const memoryIds: number[] = []
    const topicsInvolvedSet = new Set<string>()

    // 批量主题规划：一次 LLM 调用决定所有切片的主题归属
    const existingTopics = await this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })

    const chunkInputs = chunks
    const plan = await this.cutModelService.batchResolveTopics(chunkInputs, existingTopics, kbId)

    // 先处理所有需要创建的新主题，建立 name → id 映射
    const topicNameMap = new Map<string, number>()
    for (const t of existingTopics) {
      topicNameMap.set(t.name, t.id)
    }
    for (const p of plan.plans) {
      if (p.action === 'create' && p.newTopicName && !topicNameMap.has(p.newTopicName)) {
        // 用第一个属于该新主题的切片内容来生成描述
        const sampleChunk = chunks[p.index]?.content || ''
        const createInfo = await this.cutModelService.createTopicInfo(sampleChunk, kbId)
        const newTopic = await this.prisma.topic.create({
          data: {
            kbId,
            name: p.newTopicName,
            description: createInfo.description,
          },
        })
        topicNameMap.set(p.newTopicName, newTopic.id)
      }
    }

    // 按计划逐个入库
    for (const chunk of chunks) {
      const planItem = plan.plans.find((p) => p.index === chunk.index)

      if (!planItem) {
        throw Errors.internalError(`片段 ${chunk.index} 缺少主题规划`)
      }

      let topicId: number
      if (planItem.action === 'select' && planItem.topicName) {
        const tid = topicNameMap.get(planItem.topicName)
        if (!tid) {
          throw Errors.internalError(`主题 "${planItem.topicName}" 未找到`)
        }
        topicId = tid
      } else {
        const tid = planItem.newTopicName ? topicNameMap.get(planItem.newTopicName) : undefined
        if (!tid) {
          throw Errors.internalError(`片段 ${chunk.index} 的主题创建失败`)
        }
        topicId = tid
      }

      if (!topicsInvolvedSet.has(String(topicId))) {
        const topic = await this.prisma.topic.findUnique({
          where: { id: topicId },
          select: { name: true },
        })
        if (topic) {
          topicsInvolvedSet.add(topic.name)
        }
      }

      const similarMemories = await this.searchInTopic(kbId, chunk.content, 3)

      if (similarMemories.length === 0) {
        const embedding = await this.embeddingService.generateEmbedding(chunk.content)

        const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
          INSERT INTO memories (kb_id, topic_id, title, content, embedding, metadata, "contentTsvector")
          VALUES (${kbId}, ${topicId}, ${chunk.title}, ${chunk.content}, ${`[${embedding.join(',')}]`}::vector,
                  ${JSON.stringify({ cutModel: 'cut-and-rewrite' })}::jsonb,
                  to_tsvector('simple', ${chunk.content}))
          RETURNING id
        `
        memoryIds.push(inserted[0].id)
        continue
      }

      const result = await this.cutModelService.shouldIngestChunk(
        chunk.content,
        similarMemories.map((m) => ({ id: m.id, content: m.content, score: m.score })),
        kbId
      )

      if (result.action === 'skip') {
        continue
      }

      if (result.action === 'merge' && result.targetMemoryId && result.mergedContent) {
        const mergeEmbedding = await this.embeddingService.generateEmbedding(result.mergedContent)

        await this.prisma.$executeRaw`
          UPDATE memories SET
            content = ${result.mergedContent},
            embedding = ${`[${mergeEmbedding.join(',')}]`}::vector,
            "contentTsvector" = to_tsvector('simple', ${result.mergedContent})
          WHERE id = ${result.targetMemoryId}
        `

        memoryIds.push(result.targetMemoryId)
        continue
      }

      const embedding = await this.embeddingService.generateEmbedding(chunk.content)

      const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO memories (kb_id, topic_id, title, content, embedding, metadata, "contentTsvector")
        VALUES (${kbId}, ${topicId}, ${chunk.title}, ${chunk.content}, ${`[${embedding.join(',')}]`}::vector,
                ${JSON.stringify({ cutModel: 'cut-and-rewrite' })}::jsonb,
                to_tsvector('simple', ${chunk.content}))
        RETURNING id
      `
      memoryIds.push(inserted[0].id)
    }

    return {
      count: memoryIds.length,
      memoryIds,
      topicsInvolved: [...topicsInvolvedSet],
    }
  }

/**
 * 知识入库 - 消息列表方式
 *
 * 存储方式：零 LLM 调用，每条消息原文完整存储
 * 去重策略：每条消息先搜索相似记忆，LLM 判断是否有增量价值
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

    const memoryIds: number[] = []
    const memorizedMessageIds: string[] = []

    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统'
      const content = `${roleLabel}: ${msg.content}`

      const topicId = await this.resolveTopic(kbId, content)

      const similarMemories = await this.searchInTopic(kbId, content, 3)

      if (similarMemories.length === 0) {
        const embedding = await this.embeddingService.generateEmbedding(content)

        const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
          INSERT INTO memories (kb_id, topic_id, content, embedding, metadata, "contentTsvector")
          VALUES (${kbId}, ${topicId}, ${content}, ${`[${embedding.join(',')}]`}::vector,
                  ${JSON.stringify({ cutModel: 'verbatim', messageId: msg.id, role: msg.role })}::jsonb,
                  to_tsvector('simple', ${content}))
          RETURNING id
        `
        memoryIds.push(inserted[0].id)
        memorizedMessageIds.push(msg.id)
        continue
      }

      const result = await this.cutModelService.shouldIngestChunk(
        content,
        similarMemories.map((m) => ({ id: m.id, content: m.content, score: m.score })),
        kbId
      )

      if (result.action === 'skip') {
        continue
      }

      if (result.action === 'merge' && result.targetMemoryId && result.mergedContent) {
        const mergeEmbedding = await this.embeddingService.generateEmbedding(result.mergedContent)

        await this.prisma.$executeRaw`
          UPDATE memories SET
            content = ${result.mergedContent},
            embedding = ${`[${mergeEmbedding.join(',')}]`}::vector,
            "contentTsvector" = to_tsvector('simple', ${result.mergedContent})
          WHERE id = ${result.targetMemoryId}
        `

        memoryIds.push(result.targetMemoryId)
        memorizedMessageIds.push(msg.id)
        continue
      }

      const embedding = await this.embeddingService.generateEmbedding(content)

      const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO memories (kb_id, topic_id, content, embedding, metadata, "contentTsvector")
        VALUES (${kbId}, ${topicId}, ${content}, ${`[${embedding.join(',')}]`}::vector,
                ${JSON.stringify({ cutModel: 'verbatim', messageId: msg.id, role: msg.role })}::jsonb,
                to_tsvector('simple', ${content}))
        RETURNING id
      `
      memoryIds.push(inserted[0].id)
      memorizedMessageIds.push(msg.id)
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
          title: string
          content: string
          topic_id: number | null
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
          AND (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) < 0.3
        ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
        LIMIT ${denseLimit}
      `,
      this.prisma.$queryRaw<
        Array<{
          id: number
          title: string
          content: string
          topic_id: number | null
          metadata: any
          ts_rank: number
        }>
      >`
        SELECT
          id, title, content,
          topic_id,
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
      title: string
      content: string
      topic_id: number | null
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
        ? await this.getContextByTopic(item.data.id, kbId, item.data.topic_id, contextWindow)
        : undefined

      searchResults.push({
        id: item.data.id,
        title: item.data.title,
        content: item.data.content,
        score,
        topicId: item.data.topic_id,
        metadata: item.data.metadata,
        source: item.source,
        context,
      })
    }

    return searchResults
  }

  private async getContextByTopic(
    memoryId: number,
    kbId: number,
    topicId: number | null,
    windowSize: number
  ): Promise<{ prev: string[]; next: string[] }> {
    if (topicId === null) {
      return { prev: [], next: [] }
    }

    const current = await this.prisma.memory.findUnique({
      where: { id: memoryId },
      select: { createdAt: true },
    })

    if (!current) return { prev: [], next: [] }

    const [prevMemories, nextMemories] = await Promise.all([
      this.prisma.memory.findMany({
        where: {
          kbId,
          topicId,
          createdAt: { lt: current.createdAt },
        },
        orderBy: { createdAt: 'desc' },
        take: windowSize,
        select: { content: true },
      }),
      this.prisma.memory.findMany({
        where: {
          kbId,
          topicId,
          createdAt: { gt: current.createdAt },
        },
        orderBy: { createdAt: 'asc' },
        take: windowSize,
        select: { content: true },
      }),
    ])

    return {
      prev: prevMemories.map((m) => m.content).reverse(),
      next: nextMemories.map((m) => m.content),
    }
  }

  async searchInTopic(
    kbId: number,
    query: string,
    topK: number = 5,
    topicId?: number
  ): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw Errors.badRequest('查询语句不能为空')
    }

    const queryEmbedding = await this.embeddingService.generateEmbedding(query)
    const denseLimit = topK * 3

    const topicClause = topicId ? Prisma.sql`AND topic_id = ${topicId}` : Prisma.empty

    const [denseResults, sparseResults] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: number
          title: string
          content: string
          metadata: any
          cosine_distance: number
        }>
      >`
        SELECT
          id, title, content,
          metadata,
          (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) as cosine_distance
        FROM memories
        WHERE kb_id = ${kbId}
          ${topicClause}
          AND (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) < 0.3
        ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
        LIMIT ${denseLimit}
      `,
      this.prisma.$queryRaw<
        Array<{
          id: number
          title: string
          content: string
          metadata: any
          ts_rank: number
        }>
      >`
        SELECT
          id, title, content,
          metadata,
          ts_rank("contentTsvector", plainto_tsquery('simple', ${query})) as ts_rank
        FROM memories
        WHERE kb_id = ${kbId}
          ${topicClause}
          AND "contentTsvector" @@ plainto_tsquery('simple', ${query})
        ORDER BY ts_rank("contentTsvector", plainto_tsquery('simple', ${query})) DESC
        LIMIT ${denseLimit}
      `
    ])

    const rrfK = 60

    interface RrfItem {
      id: number
      title: string
      content: string
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

    return merged.map((item) => ({
      id: item.data.id,
      title: item.data.title,
      content: item.data.content,
      score: item.cosineSim > 0 ? item.cosineSim : Math.min(1, item.tsRank || 0),
      topicId,
      metadata: item.data.metadata,
      source: item.source,
    }))
  }

  private async resolveTopic(kbId: number, content: string): Promise<number> {
    const topics = await this.prisma.topic.findMany({
      where: { kbId },
      select: { id: true, name: true, description: true },
    })

    const matchResult = await this.cutModelService.matchTopic(
      content,
      topics.map((t) => ({ name: t.name, description: t.description })),
      kbId
    )

    if (matchResult.action === 'select' && matchResult.topicName) {
      const existing = topics.find((t) => t.name === matchResult.topicName)
      if (existing) {
        return existing.id
      }
    }

    const createInfo = await this.cutModelService.createTopicInfo(content, kbId)

    const newTopic = await this.prisma.topic.create({
      data: {
        kbId,
        name: createInfo.name,
        description: createInfo.description,
      },
    })

    return newTopic.id
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
        where: { kbId },
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
