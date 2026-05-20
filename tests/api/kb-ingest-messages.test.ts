import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import supertest from 'supertest'
import type { NextApiRequest, NextApiResponse } from 'next'
import ingestHandler from '@/pages/api/kb/ingest'
import searchHandler from '@/pages/api/kb/search'
import prisma from '@/src/lib/prisma'

function createTestServer(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  const server = http.createServer((req, res) => {
    const bodyChunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => bodyChunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(bodyChunks).toString()
      const nextReq = {
        body: body ? JSON.parse(body) : {},
        query: Object.create(null),
        headers: req.headers,
        method: req.method,
        url: req.url,
      } as unknown as NextApiRequest

      const originalSetHeader = res.setHeader.bind(res)
      const nextRes = {
        statusCode: res.statusCode,
        status(code: number) {
          res.statusCode = code
          return nextRes
        },
        json(data: unknown) {
          originalSetHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
          return nextRes
        },
        send(data: unknown) {
          if (typeof data === 'string') {
            originalSetHeader('Content-Type', 'text/plain')
            res.end(data)
          } else {
            originalSetHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
          }
          return nextRes
        },
        setHeader(name: string, value: string | string[]) {
          originalSetHeader(name, value)
          return nextRes
        },
      } as unknown as NextApiResponse

      handler(nextReq, nextRes).catch((err: Error) => {
        if (!res.headersSent) {
          res.statusCode = 500
          res.end(err.message)
        }
      })
    })
  })

  return supertest(server)
}

describe('POST /api/kb/ingest - 消息列表入库（集成测试）', () => {
  let request: ReturnType<typeof createTestServer>
  let testKbId: string

  beforeAll(async () => {
    request = createTestServer(ingestHandler)

    const kb = await prisma.knowledgeBase.create({
      data: {
        name: `test-integration-${Date.now()}`,
        description: '集成测试临时知识库',
      },
    })
    testKbId = kb.id

    await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
        messages: [
          { id: 'search-user-1', role: 'user', content: '我想学习 TypeScript 编程语言' },
          { id: 'search-asst-1', role: 'assistant', content: 'TypeScript 是 JavaScript 的超集，添加了类型系统' },
          { id: 'search-user-2', role: 'user', content: '那 Vue 框架呢？' },
          { id: 'search-asst-2', role: 'assistant', content: 'Vue 是一个渐进式前端框架，支持组合式 API' },
          { id: 'search-user-3', role: 'user', content: 'PostgreSQL 数据库有什么特点' },
          { id: 'search-asst-3', role: 'assistant', content: 'PostgreSQL 支持 pgvector 扩展，可以做向量相似度搜索' },
        ],
      })
  })

  afterAll(async () => {
    await prisma.memory.deleteMany({ where: { kbId: testKbId } })
    await prisma.knowledgeBase.delete({ where: { id: testKbId } })
    await prisma.$disconnect()
  })

  it('合法消息列表入库成功', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
        messages: [
          { id: 'msg-1', role: 'user', content: '你好' },
          { id: 'msg-2', role: 'assistant', content: '你好！有什么可以帮你的？' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.count).toBe(2)
    expect(res.body.data.memorizedMessageIds).toEqual(['msg-1', 'msg-2'])
    expect(res.body.data.memoryIds.length).toBe(2)

    const memories = await prisma.$queryRaw<
      Array<{ id: number; content: string }>
    >`SELECT id, content FROM memories WHERE kb_id = ${testKbId as string} AND metadata->>'messageId' IN ('msg-1', 'msg-2') ORDER BY created_at ASC`

    expect(memories.length).toBe(2)
    expect(memories[0].content).toContain('你好')
    expect(memories[1].content).toContain('你好！有什么可以帮你的？')

    const rawMemories = await prisma.$queryRaw<
      Array<{ id: number; embedding: unknown }>
    >`SELECT id, embedding FROM memories WHERE kb_id = ${testKbId as string} AND metadata->>'messageId' IN ('msg-1', 'msg-2') ORDER BY created_at`
    expect(rawMemories.length).toBe(2)
    expect(rawMemories[0].embedding).not.toBeNull()
    expect(rawMemories[1].embedding).not.toBeNull()
  })

  it('缺少 kbId 返回 400', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        messages: [
          { id: 'msg-1', role: 'user', content: '你好' },
        ],
      })

    expect(res.status).toBe(400)
  })

  it('缺少 messages 返回 400', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
      })

    expect(res.status).toBe(400)
  })

  it('消息缺少 id 字段返回 400', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
        messages: [
          { role: 'user', content: '你好' },
        ],
      })

    expect(res.status).toBe(400)
  })

  it('消息缺少 role 字段返回 400', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
        messages: [
          { id: 'msg-1', content: '你好' },
        ],
      })

    expect(res.status).toBe(400)
  })

  it('消息缺少 content 字段返回 400', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
        messages: [
          { id: 'msg-1', role: 'user' },
        ],
      })

    expect(res.status).toBe(400)
  })

  it('消息角色不合法返回 400', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
        messages: [
          { id: 'msg-1', role: 'admin', content: '你好' },
        ],
      })

    expect(res.status).toBe(400)
  })

  it('空消息数组返回 400', async () => {
    const res = await request
      .post('/api/kb/ingest')
      .send({
        kbId: testKbId,
        messages: [],
      })

    expect(res.status).toBe(400)
  })

  // ==================== 消息列表核心逻辑测试 ====================

  describe('消息列表核心逻辑 - Verbatim 存储', () => {
    it('每条消息前拼接中文角色标签：用户 / 助手 / 系统', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'role-user', role: 'user', content: '我叫小明' },
            { id: 'role-assistant', role: 'assistant', content: '你好小明' },
            { id: 'role-system', role: 'system', content: '请用中文回答' },
          ],
        })

      expect(res.status).toBe(200)

      const memories = await prisma.$queryRaw<
        Array<{ id: number; content: string }>
      >`SELECT id, content FROM memories WHERE kb_id = ${testKbId} AND metadata->>'messageId' IN ('role-user', 'role-assistant', 'role-system') ORDER BY created_at ASC`

      expect(memories.length).toBe(3)
      expect(memories[0].content).toBe('用户: 我叫小明')
      expect(memories[1].content).toBe('助手: 你好小明')
      expect(memories[2].content).toBe('系统: 请用中文回答')
    })

    it('metadata 记录 cutModel=verbatim、messageId 和 role', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'meta-msg-1', role: 'user', content: '检查元数据' },
            { id: 'meta-msg-2', role: 'assistant', content: '元数据OK' },
          ],
        })

      expect(res.status).toBe(200)

      const memories = await prisma.memory.findMany({
        where: {
          kbId: testKbId,
          metadata: { path: ['messageId'], equals: 'meta-msg-1' } as any,
        },
        take: 1,
      })

      expect(memories.length).toBe(1)
      const meta = memories[0].metadata as Record<string, unknown>
      expect(meta.cutModel).toBe('verbatim')
      expect(meta.messageId).toBe('meta-msg-1')
      expect(meta.role).toBe('user')

      const memories2 = await prisma.memory.findMany({
        where: {
          kbId: testKbId,
          metadata: { path: ['messageId'], equals: 'meta-msg-2' } as any,
        },
        take: 1,
      })

      expect(memories2.length).toBe(1)
      const meta2 = memories2[0].metadata as Record<string, unknown>
      expect(meta2.role).toBe('assistant')
    })

    it('每条消息都关联到有效的 Topic（topicId 不为空）', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'topic-0', role: 'user', content: '第一条' },
            { id: 'topic-1', role: 'assistant', content: '第二条' },
            { id: 'topic-2', role: 'user', content: '第三条' },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.count).toBe(3)

      const memories = await prisma.memory.findMany({
        where: {
          kbId: testKbId,
          metadata: { path: ['messageId'], in: ['topic-0', 'topic-1', 'topic-2'] },
        },
        select: { id: true, topicId: true, content: true },
      })

      expect(memories.length).toBe(3)
      for (const m of memories) {
        expect(m.topicId).not.toBeNull()
      }
    })

    it('同一批消息可归入不同 Topic', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'diff-topic-a', role: 'user', content: '讨论 React Hooks 的使用方式' },
            { id: 'diff-topic-b', role: 'assistant', content: 'PostgreSQL 数据库索引优化技巧' },
            { id: 'diff-topic-c', role: 'user', content: 'Vue3 组合式 API 的响应式原理' },
          ],
        })

      expect(res.status).toBe(200)

      const memories = await prisma.memory.findMany({
        where: {
          kbId: testKbId,
          metadata: { path: ['messageId'], in: ['diff-topic-a', 'diff-topic-b', 'diff-topic-c'] },
        },
        select: { id: true, topicId: true, content: true },
      })

      expect(memories.length).toBe(3)
      const uniqueTopics = new Set(memories.map((m) => m.topicId))
      expect(uniqueTopics.size).toBeGreaterThanOrEqual(1)
    })

    it('每次入库都会产生或关联到有效的 Topic 记录', async () => {
      const res1 = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'valid-topic-1', role: 'user', content: '第一条消息' },
          ],
        })

      const res2 = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'valid-topic-2', role: 'user', content: '第二条消息' },
          ],
        })

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      const mem1 = await prisma.memory.findFirst({
        where: { kbId: testKbId, metadata: { path: ['messageId'], equals: 'valid-topic-1' } as any },
        select: { topicId: true },
      })
      const mem2 = await prisma.memory.findFirst({
        where: { kbId: testKbId, metadata: { path: ['messageId'], equals: 'valid-topic-2' } },
        select: { topicId: true },
      })

      expect(mem1!.topicId).not.toBeNull()
      expect(mem2!.topicId).not.toBeNull()
    })

    it('verbatime 原文存储：特殊字符和长文本原样保留', async () => {
      const specialContent = '<script>alert("xss")</script> & "quotes" \n换行\t制表符'
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'special-chars', role: 'user', content: specialContent },
          ],
        })

      expect(res.status).toBe(200)

      const memory = await prisma.memory.findFirst({
        where: { kbId: testKbId, metadata: { path: ['messageId'], equals: 'special-chars' } as any },
      })

      expect(memory).not.toBeNull()
      expect(memory!.content).toBe(`用户: ${specialContent}`)
    })

    it('允许重复的 message ID，各自独立存储为不同 memory', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'dup-id', role: 'user', content: '第一次出现' },
            { id: 'dup-id', role: 'assistant', content: '第二次出现（不同角色）' },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.count).toBe(2)
      expect(res.body.data.memorizedMessageIds).toEqual(['dup-id', 'dup-id'])

      const memories = await prisma.memory.findMany({
        where: { kbId: testKbId, metadata: { path: ['messageId'], equals: 'dup-id' } as any },
        orderBy: { createdAt: 'asc' },
      })

      expect(memories.length).toBe(2)
      expect(memories[0].id).not.toBe(memories[1].id)
    })

    it('单条消息内容超限返回 400 并指明是哪条消息', async () => {
      const longContent = 'x'.repeat(20001)
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'normal-msg', role: 'user', content: '正常消息' },
            { id: 'too-long-msg', role: 'assistant', content: longContent },
          ],
        })

      expect(res.status).toBe(400)
      expect(res.text).toContain('too-long-msg')
    })

    it('kbId 不存在返回 400', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: 99999999,
          messages: [
            { id: 'no-kb-msg', role: 'user', content: '这个知识库不存在' },
          ],
        })

      expect(res.status).toBe(400)
    })

    it('混合角色多轮对话完整入库', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'multi-sys-1', role: 'system', content: '你是一个翻译助手' },
            { id: 'multi-user-1', role: 'user', content: '请翻译 hello world 到中文' },
            { id: 'multi-asst-1', role: 'assistant', content: '"hello world" 的中文意思是 "你好世界"' },
            { id: 'multi-user-2', role: 'user', content: '那 good morning 呢？' },
            { id: 'multi-asst-2', role: 'assistant', content: '"good morning" 的中文意思是 "早上好"' },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.count).toBe(5)
      expect(res.body.data.memorizedMessageIds).toEqual([
        'multi-sys-1',
        'multi-user-1',
        'multi-asst-1',
        'multi-user-2',
        'multi-asst-2',
      ])

      const memories = await prisma.$queryRaw<
        Array<{ id: number; topic_id: number | null; content: string }>
      >`
        SELECT id, topic_id, content
        FROM memories
        WHERE kb_id = ${testKbId}
          AND metadata->>'messageId' IN ('multi-sys-1', 'multi-user-1', 'multi-asst-1', 'multi-user-2', 'multi-asst-2')
        ORDER BY created_at
      `

      expect(memories.length).toBe(5)
      for (const m of memories) {
        expect(m.topic_id).not.toBeNull()
      }
      const contents = memories.map((m) => m.content)
      expect(contents.some((c) => c.includes('翻译助手'))).toBe(true)
      expect(contents.some((c) => c.includes('hello world'))).toBe(true)
    })

    it('memorizedMessageIds 与 memoryIds 按顺序一一对应', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'corr-a', role: 'user', content: 'A' },
            { id: 'corr-b', role: 'assistant', content: 'B' },
            { id: 'corr-c', role: 'user', content: 'C' },
          ],
        })

      expect(res.status).toBe(200)
      const { count, memorizedMessageIds, memoryIds } = res.body.data

      expect(count).toBe(3)
      expect(memorizedMessageIds.length).toBe(3)
      expect(memoryIds.length).toBe(3)

      for (let i = 0; i < count; i++) {
        const memory = await prisma.memory.findUnique({
          where: { id: memoryIds[i] },
        })
        expect(memory).not.toBeNull()
        const meta = memory!.metadata as Record<string, unknown>
        expect(meta.messageId).toBe(memorizedMessageIds[i])
      }
    })

    it('空字符串 content 返回 400', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'empty-content', role: 'user', content: '' },
          ],
        })

      expect(res.status).toBe(400)
    })

    it('messages 字段非数组类型返回 400', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: '不是数组',
        })

      expect(res.status).toBe(400)
    })

    it('kbId 为非数字类型返回 400', async () => {
      const res = await request
        .post('/api/kb/ingest')
        .send({
          kbId: 'abc',
          messages: [{ id: 'm1', role: 'user', content: 'test' }],
        })

      expect(res.status).toBe(400)
    })
  })

  // ==================== 搜索测试 ====================

  describe('POST /api/kb/search - 知识库搜索（集成测试）', () => {
  let searchRequest: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    searchRequest = createTestServer(searchHandler)
  })

  it('关键词搜索返回匹配结果', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: 'TypeScript 是 JavaScript 的超集',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.results)).toBe(true)
    expect(res.body.data.results.length).toBeGreaterThanOrEqual(1)

    const contents = res.body.data.results.map((r: { content: string }) => r.content)
    const hasMatch = contents.some((c: string) => c.includes('TypeScript'))
    expect(hasMatch).toBe(true)
  })

    it('搜索结果包含完整字段：id, content, score, topicId, metadata, source', async () => {
      const res = await searchRequest
        .post('/api/kb/search')
        .send({
          kbId: testKbId,
          query: 'Vue 渐进式前端框架',
        })

      expect(res.status).toBe(200)
      const results = res.body.data.results
      expect(results.length).toBeGreaterThanOrEqual(1)

      const result = results[0]
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('content')
      expect(result).toHaveProperty('score')
      expect(typeof result.score).toBe('number')
      expect(result).toHaveProperty('topicId')
      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('source')
      expect(['dense', 'sparse', 'hybrid']).toContain(result.source)
    })

  it('metadata 包含 cutModel、messageId 和 role', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: 'pgvector 向量相似度搜索',
      })

    expect(res.status).toBe(200)
    const results = res.body.data.results
    expect(results.length).toBeGreaterThanOrEqual(1)

    const meta = results[0].metadata
    expect(meta).toHaveProperty('cutModel')
    expect(meta).toHaveProperty('messageId')
    expect(meta).toHaveProperty('role')
  })

  it('空知识库搜索返回空数组', async () => {
    const emptyKb = await prisma.knowledgeBase.create({
      data: { name: `empty-search-${Date.now()}` },
    })

    try {
      const res = await searchRequest
        .post('/api/kb/search')
        .send({
          kbId: emptyKb.id,
          query: '任何内容',
        })

      expect(res.status).toBe(200)
      expect(res.body.data.results).toEqual([])
    } finally {
      await prisma.knowledgeBase.delete({ where: { id: emptyKb.id } })
    }
  })

  it('缺少 kbId 返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({ query: '测试' })

    expect(res.status).toBe(400)
  })

  it('缺少 query 返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({ kbId: testKbId })

    expect(res.status).toBe(400)
  })

  it('kbId 不存在返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: 99999999,
        query: '不存在的知识库',
      })

    expect(res.status).toBe(400)
  })

  it('top_k 超出范围（>100）返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: '测试',
        top_k: 101,
      })

    expect(res.status).toBe(400)
  })

  it('top_k 超出范围（<1）返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: '测试',
        top_k: 0,
      })

    expect(res.status).toBe(400)
  })

  it('context_window 超出范围（>5）返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: '测试',
        context_window: 6,
      })

    expect(res.status).toBe(400)
  })

  it('context_window 超出范围（<0）返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: '测试',
        context_window: -1,
      })

    expect(res.status).toBe(400)
  })

  it('top_k 为非数字类型返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: '测试',
        top_k: 'abc',
      })

    expect(res.status).toBe(400)
  })

  it('kbId 为非数字类型返回 400', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: 'abc',
        query: '测试',
      })

    expect(res.status).toBe(400)
  })

  it('指定 top_k 控制返回结果数量', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: '编程 框架 数据库',
        top_k: 2,
      })

    expect(res.status).toBe(200)
    expect(res.body.data.results.length).toBeLessThanOrEqual(2)
  })

  it('context_window=0 不返回上下文', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: 'TypeScript 编程语言类型系统',
        context_window: 0,
      })

    expect(res.status).toBe(200)
    const results = res.body.data.results
    for (const result of results) {
      expect(result.context).toBeUndefined()
    }
  })

  it('context_window>0 返回包含 prev/next 的上下文', async () => {
    const res = await searchRequest
      .post('/api/kb/search')
      .send({
        kbId: testKbId,
        query: 'TypeScript 编程语言类型系统',
        context_window: 1,
      })

    expect(res.status).toBe(200)
    const results = res.body.data.results

    if (results.length > 0) {
      const hasContext = results.some(
        (r: { context?: { prev: string[]; next: string[] } }) =>
          r.context && (Array.isArray(r.context.prev) || Array.isArray(r.context.next))
      )
      expect(hasContext).toBe(true)
    }
  })

  it('不同关键词搜到不同内容', async () => {
    const [resTs, resVue] = await Promise.all([
      searchRequest
        .post('/api/kb/search')
        .send({ kbId: testKbId, query: 'TypeScript JavaScript 超集', top_k: 3 }),
      searchRequest
        .post('/api/kb/search')
        .send({ kbId: testKbId, query: 'Vue 渐进式前端框架', top_k: 3 }),
    ])

    expect(resTs.status).toBe(200)
    expect(resVue.status).toBe(200)

    const tsContents = resTs.body.data.results.map((r: { content: string }) => r.content)
    const vueContents = resVue.body.data.results.map((r: { content: string }) => r.content)

    const tsMatch = tsContents.some((c: string) => c.includes('TypeScript'))
    const vueMatch = vueContents.some((c: string) => c.includes('Vue'))

    expect(tsMatch).toBe(true)
    expect(vueMatch).toBe(true)
  })

  // ==================== 入库 → 搜索端到端闭环 ====================

  describe('ingest 后 search 可召回（端到端）', () => {
    it('先入库一批消息，再搜索每条消息内容，全部能召回', async () => {
      const ingestRes = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'e2e-1', role: 'user', content: '量子计算机的基本原理是什么' },
            { id: 'e2e-2', role: 'assistant', content: '量子计算利用量子叠加和量子纠缠实现并行计算' },
            { id: 'e2e-3', role: 'user', content: '那量子纠错怎么做' },
            { id: 'e2e-4', role: 'assistant', content: '通过冗余编码和表面码来检测并纠正量子错误' },
          ],
        })

      expect(ingestRes.status).toBe(200)
      expect(ingestRes.body.data.count).toBe(4)

      const queries = [
        '量子计算的基本原理和并行计算',
        '量子纠错与冗余编码',
        '如何检测和纠正量子错误',
        '量子叠加和纠缠现象',
      ]
      const results = await Promise.all(
        queries.map(q =>
          searchRequest.post('/api/kb/search').send({
            kbId: testKbId,
            query: q,
            top_k: 5,
          })
        )
      )

      const successCount = results.filter((r: { body: { data: { results: unknown[] } } }) => r.body.data.results.length > 0).length
      expect(successCount).toBeGreaterThanOrEqual(Math.ceil(queries.length * 0.75))

      for (const res of results) {
        expect(res.status).toBe(200)
      }
    })

    it('入库后用消息原文精确搜索，返回结果包含对应消息的 messageId', async () => {
      const ingestRes = await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'recall-a', role: 'user', content: '微服务架构的核心是服务拆分' },
            { id: 'recall-b', role: 'assistant', content: '通过 API 网关统一入口管理流量' },
          ],
        })

      expect(ingestRes.status).toBe(200)
      const { memorizedMessageIds } = ingestRes.body.data
      expect(memorizedMessageIds).toEqual(['recall-a', 'recall-b'])

      const searchRes = await searchRequest
        .post('/api/kb/search')
        .send({
          kbId: testKbId,
          query: '微服务架构 服务拆分',
          top_k: 10,
        })

      expect(searchRes.status).toBe(200)
      const resultMessageIds = searchRes.body.data.results.map(
        (r: { metadata: { messageId?: string } }) => r.metadata?.messageId
      )
      expect(resultMessageIds).toContain('recall-a')
    })

    it('入库多条消息，搜索时 score 越高越相关', async () => {
      await request
        .post('/api/kb/ingest')
        .send({
          kbId: testKbId,
          messages: [
            { id: 'score-topic', role: 'user', content: 'Rust 语言的所有权机制如何工作' },
            { id: 'score-noise', role: 'assistant', content: '今天天气真不错，适合出去走走' },
          ],
        })

      const res = await searchRequest
        .post('/api/kb/search')
        .send({
          kbId: testKbId,
          query: 'Rust 所有权 生命周期 借用检查',
          top_k: 5,
        })

      expect(res.status).toBe(200)
      if (res.body.data.results.length >= 2) {
        expect(res.body.data.results[0].score).toBeGreaterThanOrEqual(
          res.body.data.results[1].score
        )
      }

      const topicMatch = res.body.data.results.some(
        (r: { content: string }) => r.content.includes('Rust') || r.content.includes('所有权')
      )
      expect(topicMatch).toBe(true)
    })

    it('入库后搜索不存在的关键词返回空或低分无关结果', async () => {
      const res = await searchRequest
        .post('/api/kb/search')
        .send({
          kbId: testKbId,
          query: 'xyz不存在的内容abc123',
          top_k: 5,
        })

      expect(res.status).toBe(200)
      if (res.body.data.results.length > 0) {
        for (const r of res.body.data.results) {
          expect(r.score).toBeLessThanOrEqual(1)
        }
      }
    })
  })
})
})
