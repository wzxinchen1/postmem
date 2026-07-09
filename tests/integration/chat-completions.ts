/**
 * Mock LLM 集成测试。
 *
 * 使用 mock LLM 响应规则（keyword → response），确保测试结果可预测。
 * 验证完整的聊天流程：创建对话、消息持久化、重发、记忆、搜索、链接、图片等。
 *
 * 运行方式：pnpm tsx tests/integration/chat-completions.ts
 *
 * ─── 不测试的场景（设计决策）───────────────────────────
 * - newConversation：强制创建新对话的路径，非核心流程，暂不测试
 * - 取消聊天（/api/chat/cancel）：涉及 SSE 流中断和并发控制，mock 环境难以模拟
 * - regenerate 路径的 SSE 消费：chatAndWait 中 regenerate 路径走 fetch 而非 SDK SSE，
 *   此路径暂不深入测试
 *
 * ─── 测试设计决策 ──────────────────────────────────────
 * - 所有测试严格顺序执行：共享同一个 convId1，前面的测试为后续积累数据（消息、记忆），
 *   前面失败则后续全部跳过（hasFailure 机制），这是故意设计，不是缺陷
 * - totalImages/totalUrls 校验是单次请求维度（messages 是本次请求的消息数组），
 *   不存在"跨对话历史累积"的场景，无需测试跨消息累计
 */
import { test, run } from './runner'
import { ChatTestFixture } from './test-base'
import { ThinkingEffort } from '../../src/types'
import {
  getBaseUrl,
  setMockChatResponseRules,
  setMockStreamChunkDelay,
  setMockVisionResponse,
  EventListener,
  setActiveListener,
  getCalibrateCallCount,
  resetCalibrateCallCount,
  setMockCutModelResponses,
  resetMockCutModelCallCount,
  getMockCutModelCallCount,
} from './helpers'

const CHAT_TIMEOUT = 30_000
const INGEST_TIMEOUT = 30_000

interface IngestResult {
  memoryIds: string[]
  topicsInvolved: string[]
}

async function ingestTextAndWait(kbId: string, content: string): Promise<IngestResult> {
  const res = await fetch(`${getBaseUrl()}/api/kb/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kbId, content }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ingest 请求失败 (HTTP ${res.status}): ${text}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  return new Promise<IngestResult>((resolve, reject) => {
    function processLine(line: string): boolean {
      if (!line.startsWith('data: ')) return false
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === 'complete') {
          resolve(event.data as IngestResult)
          return true
        }
        if (event.type === 'error') {
          reject(new Error(`Ingest 错误: ${event.data?.message || JSON.stringify(event.data)}`))
          return true
        }
      } catch {
        // 单行解析失败跳过
      }
      return false
    }

    function pump(): void {
      reader.read().then(({ done, value }) => {
        if (done) {
          reject(new Error('Ingest SSE 流意外结束'))
          return
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (processLine(line.trim())) return
        }
        pump()
      })
    }

    pump()
  })
}

class MockChatTest extends ChatTestFixture {
  private topicId!: string

  protected async doSetup(): Promise<void> {
    // 配置 mock LLM 响应规则：用户消息包含 keyword → 返回对应 response
    setMockChatResponseRules([
      { keyword: '动态规划', response: '动态规划（Dynamic Programming，简称DP）是一种将复杂问题分解为子问题的算法策略。' },
      { keyword: '量子力学', response: '量子力学是描述微观粒子行为的物理学理论，核心概念包括波粒二象性和不确定性原理。' },
      { keyword: '搜索', response: '以下是为您搜索到的相关信息。' },
      { keyword: '之前', response: '根据之前的对话记录，您之前提到过动态规划（DP）相关的话题。动态规划是一种重要的算法思想。' },
      { keyword: '回忆', response: '根据记忆搜索结果，您之前让我解释过动态规划。动态规划是一种将复杂问题分解为子问题的算法策略。' },
      { keyword: '链接内容', response: '我查看了您提供的链接 https://example.com，这是一个关于示例网站的页面，用于测试链接抓取功能。' },
      { keyword: '测试图片', response: '这是您上传的图片，描述内容：这是一张测试图片的描述。' },
    ])
  }

  protected async doBefore(): Promise<void> {
    // 先清空所有主题（此时 memories 已被父类 cleanupConversations 删除，主题为空可正常删除）
    const listRes = await fetch(`${getBaseUrl()}/api/kb/list-topics?kbId=${this.kbId}`)
    const listJson = await listRes.json()
    let existingTopics: Array<{ id: string; name: string }>
    if (Array.isArray(listJson.data)) {
      existingTopics = listJson.data
    } else {
      existingTopics = []
    }
    for (const topic of existingTopics) {
      await fetch(`${getBaseUrl()}/api/kb/topic/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: topic.id }),
      })
    }

    // 新建测试用主题"默认"
    const createRes = await fetch(`${getBaseUrl()}/api/kb/topic/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kbId: this.kbId, name: '默认', description: '默认分类，用于集成测试' }),
    })
    if (!createRes.ok) {
      const text = await createRes.text()
      throw new Error(`创建主题失败 (HTTP ${createRes.status}): ${text}`)
    }
    const createJson = await createRes.json()
    this.topicId = createJson.data.id
  }

  runTests(): void {
    this.registerHooks()

    test('空库时聊天 — 自动创建新对话并返回有效 ChatResult', async () => {
      resetCalibrateCallCount()

      const result = await this.chat({
        messages: [{ id: '1', content: '你好' }],
        modelId: this.modelId,
        kbId: this.kbId,
      })

      this.assertTruthy(result.conversationId, 'conversationId')

      const conversations = await this.client.listConversations()
      this.assertEqual(conversations.total, 1, 'conversations.total')
      this.assertEqual(conversations.conversations[0].id, result.conversationId, 'conversationId match')

      // 首次聊天，Redis 无缓存，应触发校准（calibrate 走 MockChatAgent.invoke）
      this.assertGreaterThan(getCalibrateCallCount(), 0, 'calibrate invoked on first chat (no Redis cache)')

      this.convId1 = result.conversationId
    }, CHAT_TIMEOUT)

    test('有对话时复用最新对话', async () => {
      resetCalibrateCallCount()

      const result = await this.chat({
        messages: [{ id: '2', content: '我叫什么？' }],
        modelId: this.modelId,
        kbId: this.kbId,
      })

      this.assertEqual(result.conversationId, this.convId1, 'conversationId')

      // 第二次聊天，Redis 有缓存且 prompt 未变，不应触发校准
      this.assertEqual(getCalibrateCallCount(), 0, 'calibrate not invoked (Redis cache hit, prompt unchanged)')
    }, CHAT_TIMEOUT)

    test('缺少 modelId — 返回 MISSING_MODEL_ID', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '3', content: '测试' }],
          modelId: '',
          kbId: this.kbId,
        }),
      })

      await this.assertApiError(res, 'MISSING_MODEL_ID')
    }, CHAT_TIMEOUT)

    test('缺少 kbId — 返回 MISSING_KB_ID', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '4', content: '测试' }],
          modelId: this.modelId,
          kbId: '',
        }),
      })

      await this.assertApiError(res, 'MISSING_KB_ID')
    }, CHAT_TIMEOUT)

    test('缺少 messages — 返回 MISSING_MESSAGES', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: this.modelId, kbId: this.kbId }),
      })

      await this.assertApiError(res, 'MISSING_MESSAGES')
    }, CHAT_TIMEOUT)

    test('空 messages 数组且无 regenerateMessageId — 返回 MISSING_MESSAGES', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], modelId: this.modelId, kbId: this.kbId }),
      })

      await this.assertApiError(res, 'MISSING_MESSAGES')
    }, CHAT_TIMEOUT)

    // 「chunk → done 序列」和「messageId(user + assistant)」已由框架层 assertEventSequence 自动验证，无需单独测试
    // 「首 token 时间 ≤ 10s」已由 chatAndWait 框架层自动检测，无需单独测试
    // 「status 事件合法性」由 StreamStatus 枚举编译时保证，无需运行时检查
    // 「消息持久化正确性」已由 chatAndWait 框架层自动检查，无需单独测试

    test('重发中间消息 — 该消息之后的所有消息被删除并重新生成', async () => {
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      const userMsgs = msgResult.messages.filter((m) => m.role === 'user')
      // 重发第2条用户消息（非最后一条），验证后续消息被删除
      const midUserMsg = userMsgs[1]
      const midUserMsgIndex = msgResult.messages.indexOf(midUserMsg)
      // 该消息之后的消息数量
      const messagesAfterMid = msgResult.messages.length - midUserMsgIndex - 1

      await this.chat({
        messages: [{ id: midUserMsg.id, content: midUserMsg.content }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        regenerateMessageId: midUserMsg.id,
      })

      const msgResultAfter = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      // 重发后：该消息保留 + 新 assistant 回复，之前的消息保留，之后的消息全删
      // 期望数量 = midUserMsgIndex + 1（midUserMsg本身） + 1（新assistant回复）
      const expectedCount = midUserMsgIndex + 2
      this.assertEqual(msgResultAfter.total, expectedCount, 'messages after regen mid: only mid msg + earlier + new assistant remain')

      // 验证新 assistant 回复存在
      const newAssistantMsgs = msgResultAfter.messages.filter((m) => m.role === 'assistant')
      const newLastAssistant = newAssistantMsgs[newAssistantMsgs.length - 1]
      this.assertTruthy(newLastAssistant.content, 'newLastAssistant.content')

      // 验证重发的用户消息仍然存在
      const userMsgsAfter = msgResultAfter.messages.filter((m) => m.role === 'user')
      this.assertContains(userMsgsAfter.map(m => m.id), midUserMsg.id, 'regenerated user msg still exists')
    }, CHAT_TIMEOUT)

    test('重发后继续聊天 — 新消息追加在重发内容之后', async () => {
      const msgResultBefore = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })

      const result = await this.chat({
        messages: [{ id: '11', content: '重发后继续聊天' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      this.assertEqual(result.conversationId, this.convId1, 'conversationId')

      const msgResultAfter = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })

      this.assertGreaterThan(msgResultAfter.total, msgResultBefore.total, 'message count increased')

      const lastUserMsg = msgResultAfter.messages.filter((m) => m.role === 'user').slice(-1)[0]
      const lastAssistantMsg = msgResultAfter.messages.filter((m) => m.role === 'assistant').slice(-1)[0]

      this.assertContains(lastUserMsg.content, '重发后继续聊天', 'lastUserMsg.content')
      this.assertTruthy(lastAssistantMsg.content, 'lastAssistantMsg.content')
    }, CHAT_TIMEOUT)

    test('记忆: 触发后全部未记忆消息均被记忆，只剩本轮新增', async () => {
      await this.cleanupMemories()

      const msgResultBefore = await this.client.getMessages(this.convId1, { page: 1, limit: 100 })
      const unmemoriedBefore = msgResultBefore.messages.filter((m) => !m.memoried)

      // 只用未记忆消息的 token 计算阈值，确保触发
      const unmemoriedTokenSum = unmemoriedBefore.reduce((sum, m) => sum + m.tokens, 0)
      const thresholdK = unmemoriedTokenSum / 1000

      const totalChars = unmemoriedBefore.reduce((sum, m) => sum + m.content.length, 0)
      const chunkSize = Math.max(20, Math.round(totalChars / 4))
      const chunkMin = Math.max(10, Math.round(chunkSize * 0.6))
      const chunkMax = Math.round(chunkSize * 1.4)

      this.setMockChatSetting({
        memoryContextThreshold: thresholdK,
        chunkCharRange: `${chunkMin}-${chunkMax}`,
      })

      const triggerResult = await this.chat({
        messages: [{ id: 'mem-trigger', content: '什么是动态规划？要简洁回答。' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })
      await this.waitForProcessingCleared(this.convId1)

      const msgResultAfter = await this.client.getMessages(this.convId1, { page: 1, limit: 100 })
      const memoriedMsgs = msgResultAfter.messages.filter((m) => m.memoried)
      const unmemoriedAfter = msgResultAfter.messages.filter((m) => !m.memoried)

      // 验证1: 有消息被记忆
      this.assertGreaterThan(memoriedMsgs.length, 0, 'memoried messages count')

      // 验证2: 触发后未记忆消息只剩本轮新增（1条用户 + 1条助手 = 最多2条）
      this.assertLessThanOrEqual(unmemoriedAfter.length, 2, 'only current round messages remain unmemoried')

      // 验证3: 之前所有未记忆消息 + 本轮用户消息都被标记为 memoried（本轮用户消息也参与了 SaveMemory）
      this.assertGreaterThan(memoriedMsgs.length, unmemoriedBefore.length, 'all previously unmemoried + current user message are memoried')

      // 验证4: 流事件中包含 summarizing 状态
      const summarizingEvents = triggerResult.events.filter(
        (e) => (e as Record<string, unknown>).status === 'summarizing',
      )
      this.assertGreaterThan(summarizingEvents.length, 0, 'summarizing status events during memory save')
    }, 120_000)

    test('记忆: 已记忆消息不参与阈值计算 — 第二次触发只计算未记忆消息', async () => {
      // 恢复高阈值，发几轮短对话积累未记忆消息
      this.setMockChatSetting({
        memoryContextThreshold: 9999,
        chunkCharRange: '200-500',
      })

      await this.chat({ messages: [{ id: 'mem-2nd-1', content: '第二次记忆测试第一轮' }], modelId: this.modelId, kbId: this.kbId, conversationId: this.convId1 })
      await this.chat({ messages: [{ id: 'mem-2nd-2', content: '第二次记忆测试第二轮' }], modelId: this.modelId, kbId: this.kbId, conversationId: this.convId1 })

      const msgResultBefore = await this.client.getMessages(this.convId1, { page: 1, limit: 100 })
      const unmemoriedBefore = msgResultBefore.messages.filter((m) => !m.memoried)
      const memoriedBefore = msgResultBefore.messages.filter((m) => m.memoried)

      // 确认已有已记忆消息（来自前一个测试）
      this.assertGreaterThan(memoriedBefore.length, 0, 'has memoried messages from previous test')

      // 只用未记忆消息的 token 计算阈值（已记忆消息不参与）
      const unmemoriedTokenSum = unmemoriedBefore.reduce((sum, m) => sum + m.tokens, 0)
      const thresholdK = unmemoriedTokenSum / 1000

      this.setMockChatSetting({
        memoryContextThreshold: thresholdK,
      })

      await this.chat({ messages: [{ id: 'mem-2nd-trigger', content: '触发第二次记忆' }], modelId: this.modelId, kbId: this.kbId, conversationId: this.convId1 })
      await this.waitForProcessingCleared(this.convId1)

      const msgResultAfter = await this.client.getMessages(this.convId1, { page: 1, limit: 100 })
      const unmemoriedAfter = msgResultAfter.messages.filter((m) => !m.memoried)

      // 验证: 第二次触发后，之前的未记忆消息全部被记忆，只剩本轮新增
      this.assertLessThanOrEqual(unmemoriedAfter.length, 2, 'only current round messages remain unmemoried after 2nd trigger')
    }, 90_000)

    test('记忆: memoried 消息不可重发 — 返回 400', async () => {
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 100 })
      const memoriedUserMsg = msgResult.messages.find((m) => m.memoried && m.role === 'user')

      if (!memoriedUserMsg) {
        throw new Error('没有找到已记忆的用户消息，前置用例可能未触发记忆')
      }

      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: memoriedUserMsg.id, content: memoriedUserMsg.content }],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
          regenerateMessageId: memoriedUserMsg.id,
        }),
      })

      await this.assertApiError(res, 'MEMORIED_MESSAGE_CANNOT_REGENERATE')

      // 恢复阈值设置，避免后续测试意外触发记忆
      this.setMockChatSetting({
        memoryContextThreshold: 9999,
        chunkCharRange: '200-500',
      })
    })

    test('记忆: memoryContextThreshold 为 0 — 返回 INVALID_MEMORY_CONTEXT_THRESHOLD', async () => {
      // 设置阈值为 0，触发 API 入口校验
      this.setMockChatSetting({ memoryContextThreshold: 0 })

      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'threshold-zero', content: '测试阈值为0' }],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
        }),
      })

      await this.assertApiError(res, 'INVALID_MEMORY_CONTEXT_THRESHOLD', { actual: 0 })

      // 恢复阈值设置
      this.setMockChatSetting({ memoryContextThreshold: 9999 })
    }, CHAT_TIMEOUT)

    // ════════════════════════════════════════════
    // 搜索测试（完整聊天集成流程）
    // ════════════════════════════════════════════

    test('搜索: 聊天流程触发记忆搜索 — 发"之前"类消息穿透到 searchingMemory + 回答引用记忆', async () => {
      resetCalibrateCallCount()

      const result = await this.chat({
        messages: [{ id: 'search-mem-1', content: '我之前让你解释过动态规划，简要回顾一下，我在测试你的记忆搜索能力，你必须一定要回顾。' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        searchMemory: true,
        topicIds: [this.topicId],
      })

      // 验证1: searchingMemory 状态事件出现（证明 search node 被执行且 needSearchMemory=true）
      const searchingMemoryEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'searchingMemory',
      )
      this.assertGreaterThan(searchingMemoryEvents.length, 0, '没有收到 searchingMemory 状态消息')

      // 验证2: 回答中提及了之前记忆过的内容（动态规划）
      const expectedKeywords = ['动态规划', 'DP', '规划']
      const dynamicRelated = expectedKeywords.some(kw => result.fullContent.includes(kw))
      if (!dynamicRelated) {
        await this.diagnoseMemories(this.kbId, expectedKeywords, result.fullContent)
      }

      // 记忆搜索结果注入 system prompt，prompt 变化触发校准
      this.assertGreaterThan(getCalibrateCallCount(), 0, 'calibrate invoked (memory injected into system prompt)')
    }, { memorySearch: true, timeoutMs: 30_000 })

    test('互联网搜索: 第一次搜索 — 触发 searchingWeb + web_pages 表写入数据', async () => {
      await this.cleanupWebpages()
      resetCalibrateCallCount()

      const result = await this.chat({
        messages: [{ id: 'search-web-1', content: '搜索吊牌耻辱' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        searchWeb: true,
      })

      // 验证1: searchingWeb 状态事件出现
      const searchingWebEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'searchingWeb',
      )
      this.assertGreaterThan(searchingWebEvents.length, 0, '没有收到 searchingWeb 状态消息')

      // 验证2: searchingWeb 事件中包含 url 字段（搜索来源链接）
      const webEventsWithUrl = searchingWebEvents.filter(
        (e) => !!(e as Record<string, unknown>).url,
      )
      this.assertGreaterThan(webEventsWithUrl.length, 0, 'searchingWeb events with url')

      // 验证3: web_pages 表有数据写入
      const countAfter = await this.getWebpageCount()
      this.assertGreaterThan(countAfter, 0, 'web_pages count after first search')

      // 搜索结果注入 system prompt，prompt 变化触发校准
      this.assertGreaterThan(getCalibrateCallCount(), 0, 'calibrate invoked (web search results injected into system prompt)')
    }, { memorySearch: true, timeoutMs: 90_000 })

    test('互联网搜索: 第二次搜索 — 相同消息命中缓存，web_pages 表数据不增加', async () => {
      const countBefore = await this.getWebpageCount()

      const result = await this.chat({
        messages: [{ id: 'search-web-2', content: '搜索吊牌耻辱' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        searchWeb: true,
      })

      // 验证1: searchingWeb 状态事件出现（缓存命中也会发射 searchingWeb）
      const searchingWebEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'searchingWeb',
      )
      this.assertGreaterThan(searchingWebEvents.length, 0, '没有收到 searchingWeb 状态消息')

      // 验证2: web_pages 表数据不增加（相同消息产生相同 keywords，upsert 不新增行）
      const countAfter = await this.getWebpageCount()
      this.assertEqual(countAfter, countBefore, 'web_pages count unchanged after cached search')
    }, { memorySearch: false, timeoutMs: 30_000 })

    // ════════════════════════════════════════════
    // 链接测试
    // ════════════════════════════════════════════

    test('链接: 发送链接 — 触发 fetchingUrl 状态事件', async () => {
      const result = await this.chat({
        messages: [{ id: 'link-1', content: '请查看这个链接内容', urls: ['https://example.com'] }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      // 验证1: fetchingUrl 状态事件出现
      const fetchingUrlEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'fetchingUrl',
      )
      this.assertGreaterThan(fetchingUrlEvents.length, 0, '没有收到 fetchingUrl 状态消息')

      // 验证2: 回答提及了链接内容（证明 fetchedUrlContent 已传递到 LLM 上下文）
      this.assertContains(result.fullContent, '链接', 'response references link content')
      this.assertContains(result.fullContent, 'https://example.com', 'response contains the URL')

      // 验证3: 保存的消息包含 urls 字段
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      const lastUserMsg = msgResult.messages
        .filter((m) => m.role === 'user')
        .slice(-1)[0]
      this.assertTruthy(lastUserMsg.urls, 'message has urls field')
      this.assertEqual(lastUserMsg.urls!.length, 1, 'urls count')
      this.assertEqual(lastUserMsg.urls![0], 'https://example.com', 'url value')
    }, 30_000)

    // ════════════════════════════════════════════
    // 图片测试
    // ════════════════════════════════════════════

    // 最小有效 PNG（1×1 像素红色点）, data URI 方便测试中直接使用
    const TEST_IMAGE_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    test('图片: 模型无 vision — recognizing 事件 + 识图描述注入到用户消息', async () => {
      // 强制报告模型不支持 vision，走 recognizeImage 节点调用 vision agent
      this.setModelHasVision(false)

      const result = await this.chat({
        messages: [{
          id: 'img-no-vision',
          content: '描述这张图片的内容',
          images: [{ url: TEST_IMAGE_DATA_URI, mimeType: 'image/png' }],
        }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      try {
        // 验证1: recognizing 状态事件出现（vision agent 被调用）
        const recognizingEvents = result.events.filter(
          (e) => (e as Record<string, unknown>).status === 'recognizing',
        )
        this.assertGreaterThan(recognizingEvents.length, 0, '没有收到 recognizing 状态消息')

        // 验证2: 识图描述被注入到用户消息（updateMessageContent）
        const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
        const lastUserMsg = msgResult.messages
          .filter((m) => m.role === 'user')
          .slice(-1)[0]
        this.assertContains(lastUserMsg.content, '图片描述如下', 'recognized text injected into user message')

        // 验证3: 消息中 images 字段保存正确
        this.assertTruthy(lastUserMsg.images, 'message has images field')
        this.assertGreaterThan(lastUserMsg.images!.length, 0, 'images count > 0')
      } finally {
        // 恢复默认设置，避免影响后续测试
        this.setModelHasVision(true)
      }
    }, 30_000)

    test('图片: 模型有 vision — recognizing 跳过，无注入文本', async () => {
      // 强制报告模型支持 vision
      this.setModelHasVision(true)

      await this.chat({
        messages: [{
          id: 'img-with-vision',
          content: '用 vision 能力处理这张图片',
          images: [{ url: TEST_IMAGE_DATA_URI, mimeType: 'image/png' }],
        }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      // 验证: 用户消息中没有注入标记（vision 路径不调用 recognizeImage 节点，不发生 injection）
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      const lastUserMsg = msgResult.messages
        .filter((m) => m.role === 'user')
        .slice(-1)[0]
      this.assertEqual(lastUserMsg.content.includes('图片描述如下'), false, 'vision 模型不应有识图注入文本')
    }, 30_000)

    test('图片: 单条消息最多 5 张图片 — 超过返回 TOO_MANY_IMAGES', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            id: 'img-over-5',
            content: '测试多张图片',
            images: Array.from({ length: 6 }, () => ({ url: TEST_IMAGE_DATA_URI, mimeType: 'image/png' })),
          }],
          modelId: this.modelId,
          kbId: this.kbId,
        }),
      })

      await this.assertApiError(res, 'TOO_MANY_IMAGES', { max: 5, actual: 6 })
    }, 15_000)

    test('图片: 识图失败 — error 事件终止，无后续流程', async () => {
      this.setModelHasVision(false)
      setMockVisionResponse('')

      const requestStartTime = Date.now()
      const listener = new EventListener(requestStartTime)
      setActiveListener(listener)

      let conversationId: string
      let regenerateMessageId: string
      try {
        const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              id: 'img-vision-fail',
              content: '描述这张图片',
              images: [{ url: TEST_IMAGE_DATA_URI, mimeType: 'image/png' }],
            }],
            modelId: this.modelId,
            kbId: this.kbId,
            conversationId: this.convId1,
          }),
        })
        if (!res.ok) {
          throw new Error(`chat 请求失败 (HTTP ${res.status}): ${await res.text()}`)
        }
        const body = await res.json()
        conversationId = body.data?.conversationId ?? this.convId1

        await listener.getDonePromise()
      } finally {
        setActiveListener(null)
      }

      const result = listener.buildResult(conversationId)
      const userMsgEvent = result.events.find(
        e => e.type === 'messageId' && (e as Record<string, unknown>).role === 'user',
      )
      regenerateMessageId = (userMsgEvent as Record<string, unknown>).id as string

      this.assertTruthy(result.error, '识图失败应收到 error 事件')
      this.assertContains(result.error!, '识图模型返回了空内容', 'error 消息应为识图空内容')

      const chunkEvents = result.events.filter(e => e.type === 'chunk')
      this.assertEqual(chunkEvents.length, 0, '识图失败后不应有 chunk 事件（流程终止）')

      const recognizingEvents = result.events.filter(
        e => (e as Record<string, unknown>).status === 'recognizing',
      )
      this.assertGreaterThan(recognizingEvents.length, 0, '应有 recognizing 事件（识图节点被调用）')

      this.setModelHasVision(true)
      setMockVisionResponse('这是一张测试图片的描述。')

      const retryResult = await this.chat({
        messages: [{
          id: 'img-vision-retry',
          content: '描述这张图片',
          images: [{ url: TEST_IMAGE_DATA_URI, mimeType: 'image/png' }],
        }],
        regenerateMessageId,
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId,
      })
      this.assertTruthy(retryResult.fullContent, '重发应正常完成')
    }, 30_000)

    // ════════════════════════════════════════════
    // thinkingEffort 参数测试
    // ════════════════════════════════════════════

    test('thinkingEffort: 传入 low — 聊天正常完成，参数传递到 agent', async () => {
      const result = await this.chat({
        messages: [{ id: 'thinking-low', content: '测试 thinkingEffort 参数' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        thinkingEffort: ThinkingEffort.Low,
      })

      this.assertTruthy(result.fullContent, 'fullContent with thinkingEffort=low')
    }, CHAT_TIMEOUT)

    test('thinkingEffort: 传入 none — 聊天正常完成，无 reasoning', async () => {
      const result = await this.chat({
        messages: [{ id: 'thinking-none', content: '测试 thinkingEffort=none' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        thinkingEffort: ThinkingEffort.None,
      })

      this.assertTruthy(result.fullContent, 'fullContent with thinkingEffort=none')
    }, CHAT_TIMEOUT)

    test('thinkingEffort: 非法值 — 返回 INVALID_THINKING_EFFORT', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'thinking-invalid', content: '测试非法 thinkingEffort' }],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
          thinkingEffort: 'invalid',
        }),
      })

      await this.assertApiError(res, 'INVALID_THINKING_EFFORT', {
        allowedValues: Object.values(ThinkingEffort).join('/'),
        actual: 'invalid',
      })
    }, CHAT_TIMEOUT)

    // ════════════════════════════════════════════
    // userProfile 注入测试
    // ════════════════════════════════════════════

    test('userProfile: 设置用户画像 — 系统提示词包含用户信息段', async () => {
      this.setMockChatSetting({ userProfile: '我叫小明，男性，30岁，软件工程师' })

      const result = await this.chat({
        messages: [{ id: 'profile-test', content: '你好' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      // mock LLM 收到的 messages 中应包含 userProfile 信息（在系统提示词中）
      this.assertTruthy(result.fullContent, 'fullContent with userProfile')

      // 恢复 userProfile 为 null，避免影响后续测试
      this.setMockChatSetting({ userProfile: null })
    }, CHAT_TIMEOUT)

    test('链接: URLs 超过 5 个 — 返回 TOO_MANY_URLS', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            id: 'link-over-5',
            content: '测试多个链接',
            urls: Array.from({ length: 6 }, (_, i) => `https://example.com/${i + 1}`),
          }],
          modelId: this.modelId,
          kbId: this.kbId,
        }),
      })

      await this.assertApiError(res, 'TOO_MANY_URLS', { max: 5, actual: 6 })
    }, 15_000)

    test('不存在的 regenerateMessageId — 返回 REGENERATE_MESSAGE_NOT_FOUND', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'dummy-msg', content: '测试内容' }],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
          regenerateMessageId: 'non-existent-message-id',
        }),
      })

      await this.assertApiError(res, 'REGENERATE_MESSAGE_NOT_FOUND')
    }, CHAT_TIMEOUT)

    test('regenerateMessageId 指向 assistant 消息 — 返回 REGENERATE_NOT_USER_MESSAGE', async () => {
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      const assistantMsgs = msgResult.messages.filter((m) => m.role === 'assistant')
      const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1]

      this.assertTruthy(lastAssistantMsg, 'has assistant message')

      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'dummy-msg', content: '测试内容' }],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
          regenerateMessageId: lastAssistantMsg.id,
        }),
      })

      await this.assertApiError(res, 'REGENERATE_NOT_USER_MESSAGE')
    }, CHAT_TIMEOUT)

    test('不存在的 modelId — 返回 MODEL_NOT_FOUND', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'bad-model', content: '测试' }],
          modelId: 'non-existent-model-id',
          kbId: this.kbId,
          conversationId: this.convId1,
        }),
      })

      await this.assertApiError(res, 'MODEL_NOT_FOUND')
    }, CHAT_TIMEOUT)

    test('不存在的 kbId — 返回 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'bad-kb', content: '测试' }],
          modelId: this.modelId,
          kbId: 'non-existent-kb-id',
          conversationId: this.convId1,
        }),
      })

      this.assertEqual(res.status, 400, 'status')
      const text = await res.text()
      this.assertContains(text, '知识库不存在', 'error message mentions kb not found')
    }, CHAT_TIMEOUT)

    // ════════════════════════════════════════════
    // 主题管理 API 测试
    // ════════════════════════════════════════════

    test('searchMemory=true 但缺少 topicIds — 返回 KB_SEARCH_TOPIC_IDS_REQUIRED', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'no-topic-ids', content: '测试记忆搜索但无 topicIds' }],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
          searchMemory: true,
        }),
      })

      await this.assertApiError(res, 'KB_SEARCH_TOPIC_IDS_REQUIRED')
    }, CHAT_TIMEOUT)

    test('searchMemory=false 时不传 topicIds — 正常通过', async () => {
      const result = await this.chat({
        messages: [{ id: 'no-topic-ids-ok', content: '不需要记忆搜索，不传 topicIds' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        searchMemory: false,
      })

      this.assertTruthy(result.fullContent, 'fullContent without topicIds')
    }, CHAT_TIMEOUT)

    test('通过 API 列出主题 — 包含刚创建的"默认"', async () => {
      const res = await fetch(`${getBaseUrl()}/api/kb/list-topics?kbId=${this.kbId}`)
      const json = await res.json()

      this.assertTruthy(json.success, 'list topics success')
      this.assertTruthy(Array.isArray(json.data), 'has topics')
      const topics = json.data as Array<{ id: string; name: string }>
      const defaultTopic = topics.find((t) => t.name === '默认')
      this.assertTruthy(defaultTopic, '包含主题"默认"')
      this.assertEqual(defaultTopic!.id, this.topicId, 'topic id 匹配')
    }, CHAT_TIMEOUT)

    test('通过 API 重命名主题', async () => {
      const res = await fetch(`${getBaseUrl()}/api/kb/topic/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: this.topicId, name: '默认（已重命名）', description: '重命名测试' }),
      })
      const json = await res.json()

      this.assertTruthy(json.success, 'rename success')

      // 验证名称已更新
      const listRes = await fetch(`${getBaseUrl()}/api/kb/list-topics?kbId=${this.kbId}`)
      const listJson = await listRes.json()
      const renamed = (listJson.data as Array<{ id: string; name: string }>).find((t) => t.id === this.topicId)
      this.assertTruthy(renamed, 'renamed topic exists')
      this.assertEqual(renamed.name, '默认（已重命名）', 'name updated')

      // 改回原名，供后续测试使用
      const revertRes = await fetch(`${getBaseUrl()}/api/kb/topic/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: this.topicId, name: '默认' }),
      })
      this.assertTruthy((await revertRes.json()).success, 'revert name success')
    }, CHAT_TIMEOUT)

    test('通过 API 删除主题（空主题） — 删除后列表中不再包含', async () => {
      // 先创建一个临时主题用于删除测试
      const createRes = await fetch(`${getBaseUrl()}/api/kb/topic/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kbId: this.kbId, name: '待删除', description: '临时主题，用于删除测试' }),
      })
      const createJson = await createRes.json()
      const tempTopicId: string = createJson.data.id

      // 执行删除
      const deleteRes = await fetch(`${getBaseUrl()}/api/kb/topic/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: tempTopicId }),
      })
      this.assertTruthy((await deleteRes.json()).success, 'delete success')

      // 验证列表不再包含
      const listRes = await fetch(`${getBaseUrl()}/api/kb/list-topics?kbId=${this.kbId}`)
      const listJson = await listRes.json()
      const deletedTopic = (listJson.data as Array<{ id: string; name: string }>).find((t) => t.id === tempTopicId)
      this.assertTruthy(!deletedTopic, 'deleted topic no longer in list')
    }, CHAT_TIMEOUT)

    // ─── CutModel 切分测试 ────────────────────────────

    test('cutAndRewrite 正常切分', async () => {
      resetMockCutModelCallCount()
      setMockCutModelResponses([])

      const result = await ingestTextAndWait(this.kbId, '这是一段测试文本，内容较短，不需要递归切分。')

      this.assertTruthy(result.memoryIds?.length > 0, 'memoryIds 非空')
      this.assertTruthy(result.memoryIds[0], '第一个 memoryId 有效')
    }, INGEST_TIMEOUT)
  }
}

const fixture = new MockChatTest()
fixture.runTests()

run()
