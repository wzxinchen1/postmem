/**
 * 真实 LLM 集成测试（无 mock 响应）。
 *
 * 与 mock 版测试不同，这些测试不依赖可预测的 LLM 回复，
 * 而是验证：
 *   - 基础聊天流程是否正常（创建对话、复用、SSE 事件序列）
 *   - 消息持久化是否正确
 *   - 重发逻辑是否正常
 *   - 参数校验是否生效
 *   - 并发控制是否工作
 *   - 记忆触发和事件
 *   - 搜索/链接/图片功能的事件是否正常发射
 *
 * 注意：记忆阈值（setMockChatSetting）和模型能力（setModelHasVision）
 * 在两种模式下都是 mock 的。搜索服务在 real-LLM 模式下走真实实现
 * （调用真实 Tavily API + LLM 摘要），搜索结果不可预测。
 * 与 mock 版的区别：LLM 回复和搜索结果均不可预测。
 *
 * 运行方式：pnpm tsx tests/integration/chat-completions-real-llm.ts
 * 或：pnpm tsx tests/integration/chat-completions-real-llm.ts --real-llm
 */
import { test, run } from './runner'
import { ChatTestFixture } from './test-base'
import { getBaseUrl, setModelHasVision } from './helpers'

const CHAT_TIMEOUT = 20_000

class RealLLMChatTest extends ChatTestFixture {
  protected async doSetup(): Promise<void> {
    // 真实 LLM 模式不需要 mock 响应规则
    // 但记忆阈值、搜索等基础设施仍为 mock，通过 setMockChatSetting 控制
    this.setMockChatSetting({
      memoryContextThreshold: 9999,
      chunkCharRange: '200-500',
    })
  }

  runTests(): void {
    this.registerHooks()

    test('空库时聊天 — 自动创建新对话并返回有效 conversationId', async () => {
      const result = await this.chat({
        messages: [{ id: '1', content: '你好' }],
        modelId: this.modelId,
        kbId: this.kbId,
      })

      this.assertTruthy(result.conversationId, 'conversationId')
      this.assertTruthy(result.fullContent, 'fullContent')

      const conversations = await this.client.listConversations()
      this.assertEqual(conversations.total, 1, 'conversations.total')
      this.assertEqual(conversations.conversations[0].id, result.conversationId, 'conversationId match')

      this.convId1 = result.conversationId
    }, CHAT_TIMEOUT)

    test('有对话时复用最新对话', async () => {
      const result = await this.chat({
        messages: [{ id: '2', content: '继续对话' }],
        modelId: this.modelId,
        kbId: this.kbId,
      })

      this.assertEqual(result.conversationId, this.convId1, 'conversationId')
      this.assertTruthy(result.fullContent, 'fullContent')
    }, CHAT_TIMEOUT)

    test('缺少 modelId — 返回 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '3', content: '测试' }],
          modelId: '',
          kbId: this.kbId,
        }),
      })

      const text = await res.text()
      if (res.status !== 400) throw new Error(`缺少 modelId: 期望 400，实际 ${res.status}，响应体: ${text}`)
    })

    test('缺少 kbId — 返回 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '4', content: '测试' }],
          modelId: this.modelId,
          kbId: '',
        }),
      })

      const text = await res.text()
      if (res.status !== 400) throw new Error(`缺少 kbId: 期望 400，实际 ${res.status}，响应体: ${text}`)
    })

    test('缺少 messages — 返回 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: this.modelId, kbId: this.kbId }),
      })

      const text = await res.text()
      if (res.status !== 400) throw new Error(`缺少 messages: 期望 400，实际 ${res.status}，响应体: ${text}`)
    })

    test('同一对话正在处理时再次请求 → 400', async () => {
      await this.waitForProcessingCleared(this.convId1)

      // 用真实 LLM 流触发 processing 锁定，然后立即发第二次请求
      const firstChat = this.chat({
        messages: [{ id: '5', content: '请用三句话解释量子力学' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      // 等待很短时间，确保 processing 已锁定
      await new Promise((resolve) => setTimeout(resolve, 200))

      const secondRes = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '5b', content: '再问一个问题' }],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
        }),
      })

      this.assertEqual(secondRes.status, 400, 'secondRes.status')
      const text = await secondRes.text()
      this.assertContains(text, '尚未处理完成', 'response body')

      // 等待第一个请求完成
      await firstChat
    }, 60_000)

    test('重发消息 — 删除后续消息并重新生成', async () => {
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      const userMsgs = msgResult.messages.filter((m) => m.role === 'user')
      const lastUserMsg = userMsgs[userMsgs.length - 1]
      const previousTotal = msgResult.total

      await this.chat({
        messages: [],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        regenerateMessageId: lastUserMsg.id,
      })

      const msgResultAfter = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      const newAssistantMsgs = msgResultAfter.messages.filter((m) => m.role === 'assistant')
      const newLastAssistant = newAssistantMsgs[newAssistantMsgs.length - 1]

      this.assertTruthy(newLastAssistant.content, 'newLastAssistant.content')
      this.assertNotEqual(newLastAssistant.id, lastUserMsg.id, 'assistant message id changed')
      this.assertLessThanOrEqual(msgResultAfter.total, previousTotal, 'messages deleted after regenerate')
    }, CHAT_TIMEOUT)

    test('重发后继续聊天 — 新消息追加在重发内容之后', async () => {
      const msgResultBefore = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })

      const result = await this.chat({
        messages: [{ id: '9', content: '重发后继续聊天' }],
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

    test('链接: 发送链接 — 触发 fetchingUrl 状态事件', async () => {
      const result = await this.chat({
        messages: [{ id: '10', content: '请查看这个链接内容', urls: ['https://example.com'] }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      // 验证: fetchingUrl 状态事件出现
      const fetchingUrlEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'fetchingUrl',
      )
      this.assertGreaterThan(fetchingUrlEvents.length, 0, '没有收到 fetchingUrl 状态消息')

      // 验证: 保存的消息包含 urls 字段
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
      const lastUserMsg = msgResult.messages
        .filter((m) => m.role === 'user')
        .slice(-1)[0]
      this.assertTruthy(lastUserMsg.urls, 'message has urls field')
      this.assertEqual(lastUserMsg.urls!.length, 1, 'urls count')
      this.assertEqual(lastUserMsg.urls![0], 'https://example.com', 'url value')
    }, 60_000)

    const TEST_IMAGE_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    // 注意：不测试"模型有 vision — 多模态输入"场景。
    // 当前真实 LLM 使用 DeepSeek，其 API 不支持 OpenAI 的 image_url 多模态格式。
    // 该场景由 mock 测试覆盖，逻辑简单无需真实 LLM 验证。

    test('图片: 模型无 vision — recognizing 事件正常发射', async () => {
      setModelHasVision(false)

      const result = await this.chat({
        messages: [{
          id: '12',
          content: '描述这张图片的内容',
          images: [{ url: TEST_IMAGE_DATA_URI, mimeType: 'image/png' }],
        }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      try {
        // 验证: recognizing 状态事件出现
        const recognizingEvents = result.events.filter(
          (e) => (e as Record<string, unknown>).status === 'recognizing',
        )
        this.assertGreaterThan(recognizingEvents.length, 0, '没有收到 recognizing 状态消息')

        // 验证: 识图描述被注入到用户消息
        const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 50 })
        const lastUserMsg = msgResult.messages
          .filter((m) => m.role === 'user')
          .slice(-1)[0]
        this.assertContains(lastUserMsg.content, '图片描述如下', 'recognized text injected into user message')

        // 验证: 消息中 images 字段保存正确
        this.assertTruthy(lastUserMsg.images, 'message has images field')
        this.assertGreaterThan(lastUserMsg.images!.length, 0, 'images count > 0')
      } finally {
        setModelHasVision(true)
      }
    }, 60_000)

    test('图片: 单条消息最多 5 张图片 — 超过返回 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            id: '13',
            content: '测试多张图片',
            images: Array.from({ length: 6 }, () => ({ url: TEST_IMAGE_DATA_URI, mimeType: 'image/png' })),
          }],
          modelId: this.modelId,
          kbId: this.kbId,
        }),
      })

      const text = await res.text()
      if (res.status !== 400) throw new Error(`图片超过5张: 期望 400，实际 ${res.status}，响应体: ${text}`)
    }, CHAT_TIMEOUT)

    test('链接: URLs 超过 5 个 — 返回 400', async () => {
      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            id: '14',
            content: '测试多个链接',
            urls: Array.from({ length: 6 }, (_, i) => `https://example.com/${i + 1}`),
          }],
          modelId: this.modelId,
          kbId: this.kbId,
        }),
      })

      const text2 = await res.text()
      if (res.status !== 400) throw new Error(`URLs超过5个: 期望 400，实际 ${res.status}，响应体: ${text2}`)
    }, CHAT_TIMEOUT)

    // ════════════════════════════════════════════
    // 记忆测试
    // ════════════════════════════════════════════

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

      // 验证3: 之前所有未记忆消息 + 本轮用户消息都被标记为 memoried
      this.assertGreaterThan(memoriedMsgs.length, unmemoriedBefore.length, 'all previously unmemoried + current user message are memoried')

      // 验证4: 流事件中包含 summarizing 状态
      const summarizingEvents = triggerResult.events.filter(
        (e) => (e as Record<string, unknown>).status === 'summarizing',
      )
      this.assertGreaterThan(summarizingEvents.length, 0, 'summarizing status events during memory save')
    }, 3_600_000)

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
    }, 3_600_000)

    test('记忆: memoried 消息不可重发 — 返回 400', async () => {
      const msgResult = await this.client.getMessages(this.convId1, { page: 1, limit: 100 })
      const memoriedMsg = msgResult.messages.find((m) => m.memoried && m.role === 'user')

      if (!memoriedMsg) {
        throw new Error('没有找到已记忆的消息，前置用例可能未触发记忆')
      }

      const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          modelId: this.modelId,
          kbId: this.kbId,
          conversationId: this.convId1,
          regenerateMessageId: memoriedMsg.id,
        }),
      })

      const text = await res.text()
      if (res.status !== 400) {
        throw new Error(`status for memoried regenerate: 期望 400，实际 ${res.status}，响应体: ${text}`)
      }
      this.assertContains(text, '已记忆', 'error message contains 已记忆')

      // 恢复阈值设置，避免后续测试意外触发记忆
      this.setMockChatSetting({
        memoryContextThreshold: 9999,
        chunkCharRange: '200-500',
      })
    })

    // ════════════════════════════════════════════
    // 搜索测试
    // ════════════════════════════════════════════

    test('搜索: 聊天流程触发搜索事件', async () => {
      const result = await this.chat({
        messages: [{ id: 'search-mem-1', content: '我之前让你解释过什么？帮我回忆一下。' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
        searchMemory: true,
      })

      // 真实 LLM 判断搜索需求，"之前"类消息应触发记忆搜索
      const searchingMemoryEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'searchingMemory',
      )
      this.assertGreaterThan(searchingMemoryEvents.length, 0, '没有收到 searchingMemory 状态消息')
    }, { memorySearch: true, timeoutMs: 3_600_000 })

    test('互联网搜索: 搜索事件 + web_pages 表写入', async () => {
      await this.cleanupWebpages()
      const result = await this.chat({
        messages: [{ id: 'search-web-1', content: '帮我搜索一下人工智能的最新发展动态' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      // 验证1: searchingWeb 状态事件出现
      const searchingWebEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'searchingWeb',
      )
      this.assertGreaterThan(searchingWebEvents.length, 0, '没有收到 searchingWeb 状态消息')

      // 验证2: searchingWeb 事件中包含 url 字段（真实搜索 URL）
      const webEventsWithUrl = searchingWebEvents.filter(
        (e) => !!(e as Record<string, unknown>).url,
      )
      this.assertGreaterThan(webEventsWithUrl.length, 0, 'searchingWeb events with url')

      // 验证3: web_pages 表有数据写入
      const countAfter = await this.getWebpageCount()
      this.assertGreaterThan(countAfter, 0, 'web_pages count after first search')
    }, { memorySearch: true, webSearch: true, timeoutMs: 3_600_000 })

    test('互联网搜索: 相同消息命中缓存，web_pages 表数据不增加', async () => {
      const countBefore = await this.getWebpageCount()

      const result = await this.chat({
        messages: [{ id: 'search-web-2', content: '帮我搜索一下人工智能的最新发展动态' }],
        modelId: this.modelId,
        kbId: this.kbId,
        conversationId: this.convId1,
      })

      // 验证1: searchingWeb 状态事件出现
      const searchingWebEvents = result.events.filter(
        (e) => (e as Record<string, unknown>).status === 'searchingWeb',
      )
      this.assertGreaterThan(searchingWebEvents.length, 0, '没有收到 searchingWeb 状态消息')

      // 验证2: web_pages 表数据不增加
      const countAfter = await this.getWebpageCount()
      this.assertEqual(countAfter, countBefore, 'web_pages count unchanged after cached search')
    }, { memorySearch: false, webSearch: true, timeoutMs: 3_600_000 })
  }
}

const fixture = new RealLLMChatTest()
fixture.runTests()

run()
