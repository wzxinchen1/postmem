import { test, run, setup, before } from './runner'
import type { TestContext } from './runner'
import {
  createClient,
  getTestKbId,
  getTestModelId,
  cleanupConversations,
  cleanupMemories,
  cleanupWebpages,
  getWebpageCount,
  waitForProcessingCleared,
  startConsume,
  chatAndWait,
  getBaseUrl,
  assertTruthy,
  assertEqual,
  assertGreaterThan,
  assertLessThanOrEqual,
  assertContains,
  assertNotEqual,
  setMockChatSetting,
  diagnoseMemories,
} from './helpers'
import type { PostMemClient } from '../../packages/postmem-sdk/dist/index.mjs'

const CHAT_TIMEOUT = 15_000

let client: PostMemClient
let kbId: string
let modelId: string
let convId1: string

setup(async () => {
  client = createClient()
  kbId = await getTestKbId()
  modelId = await getTestModelId()
  await startConsume(client)
})

before(async () => {
  await cleanupConversations()
})

test('空库时聊天 — 自动创建新对话并返回有效 ChatResult', async (ctx: TestContext) => {
  const result = await chatAndWait(client, {
    messages: [{ id: '1', content: '你好' }],
    modelId,
    kbId,
  })

  assertTruthy(result.conversationId, 'conversationId')

  const conversations = await client.listConversations()
  assertEqual(conversations.total, 1, 'conversations.total')
  assertEqual(conversations.conversations[0].id, result.conversationId, 'conversationId match')

  convId1 = result.conversationId
}, CHAT_TIMEOUT)

test('有对话时复用最新对话', async () => {
  const result = await chatAndWait(client, {
    messages: [{ id: '2', content: '我叫什么？' }],
    modelId,
    kbId,
  })

  assertEqual(result.conversationId, convId1, 'conversationId')
}, CHAT_TIMEOUT)

test('缺少 modelId — 返回 400', async () => {
  const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: '3', content: '测试' }],
      modelId: '',
      kbId,
    }),
  })

  assertEqual(res.status, 400, 'status')
}, CHAT_TIMEOUT)

test('缺少 kbId — 返回 400', async () => {
  const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: '4', content: '测试' }],
      modelId,
      kbId: '',
    }),
  })

  assertEqual(res.status, 400, 'status')
}, CHAT_TIMEOUT)

test('缺少 messages — 返回 400', async () => {
  const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId, kbId }),
  })

  assertEqual(res.status, 400, 'status')
}, CHAT_TIMEOUT)

test('同一对话正在处理时再次请求 → 400', async () => {
  await waitForProcessingCleared(convId1)

  const firstChat = chatAndWait(client, {
    messages: [{ id: '5', content: '请简单解释量子力学的原理' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  await new Promise((resolve) => setTimeout(resolve, 500))

  const secondRes = await fetch(`${getBaseUrl()}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: '5b', content: '再问一个问题' }],
      modelId,
      kbId,
      conversationId: convId1,
    }),
  })

  assertEqual(secondRes.status, 400, 'secondRes.status')
  const text = await secondRes.text()
  assertContains(text, '尚未处理完成', 'response body')

  await firstChat
}, CHAT_TIMEOUT)

test('首 token 时间 ≤ 10s', async () => {
  const result = await chatAndWait(client, {
    messages: [{ id: '6', content: '你好' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  const firstChunk = result.events.find((e) => e.type === 'chunk')
  assertTruthy(firstChunk, 'firstChunk event')
  const timestamp = (firstChunk as Record<string, unknown>)?._timestamp as number | undefined
  const ttfb = (timestamp ?? 0) - result.requestStartTime
  assertGreaterThan(ttfb, 0, 'ttfb > 0')
  assertLessThanOrEqual(ttfb, 10_000, 'ttfb <= 10s')
}, CHAT_TIMEOUT)

// 「chunk → done 序列」和「messageId(user + assistant)」已由框架层 assertEventSequence 自动验证，无需单独测试

test('流事件包含 status 事件', async () => {
  const result = await chatAndWait(client, {
    messages: [{ id: '9', content: '我之前提过什么话题？帮我回忆一下。' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  const statusEvents = result.events.filter((e) => e.type === 'status')
  assertGreaterThan(statusEvents.length, 0, 'statusEvents count >= 1')

  const validStatuses: string[] = [
    'searchingWeb',
    'searchingMemory',
    'summarizing',
    'memoryProgress',
    'thinking',
    'recognizing',
    'fetchingUrl',
  ]
  for (const se of statusEvents) {
    const status = (se as Record<string, unknown>).status as string
    assertTruthy(
      validStatuses.includes(status),
      `status "${status}" is valid`,
    )
  }
}, { memorySearch: true, timeoutMs: CHAT_TIMEOUT })

test('聊天完成后消息正确保存', async () => {
  await chatAndWait(client, {
    messages: [{ id: '10', content: '测试消息持久化' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  const msgResult = await client.getMessages(convId1, { page: 1, limit: 50 })

  const userMsgs = msgResult.messages.filter((m) => m.role === 'user')
  const assistantMsgs = msgResult.messages.filter((m) => m.role === 'assistant')

  assertGreaterThan(assistantMsgs.length, 0, 'assistantMsgs count')
  assertTruthy(assistantMsgs[assistantMsgs.length - 1].content, 'last assistant content')
  assertGreaterThan(userMsgs[userMsgs.length - 1].tokens, 0, 'last user tokens')
}, CHAT_TIMEOUT)

test('重发消息 — 删除后续消息并重新生成', async () => {
  const msgResult = await client.getMessages(convId1, { page: 1, limit: 50 })
  const userMsgs = msgResult.messages.filter((m) => m.role === 'user')
  const lastUserMsg = userMsgs[userMsgs.length - 1]
  const previousTotal = msgResult.total

  await chatAndWait(client, {
    messages: [],
    modelId,
    kbId,
    conversationId: convId1,
    regenerateMessageId: lastUserMsg.id,
  })

  const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 50 })
  const newAssistantMsgs = msgResultAfter.messages.filter((m) => m.role === 'assistant')
  const newLastAssistant = newAssistantMsgs[newAssistantMsgs.length - 1]

  assertTruthy(newLastAssistant.content, 'newLastAssistant.content')
  assertNotEqual(newLastAssistant.id, lastUserMsg.id, 'assistant message id changed')
  assertLessThanOrEqual(msgResultAfter.total, previousTotal, 'messages deleted after regenerate')
}, CHAT_TIMEOUT)

test('重发后继续聊天 — 新消息追加在重发内容之后', async () => {
  const msgResultBefore = await client.getMessages(convId1, { page: 1, limit: 50 })

  const result = await chatAndWait(client, {
    messages: [{ id: '11', content: '重发后继续聊天' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  assertEqual(result.conversationId, convId1, 'conversationId')

  const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 50 })

  assertGreaterThan(msgResultAfter.total, msgResultBefore.total, 'message count increased')

  const lastUserMsg = msgResultAfter.messages.filter((m) => m.role === 'user').slice(-1)[0]
  const lastAssistantMsg = msgResultAfter.messages.filter((m) => m.role === 'assistant').slice(-1)[0]

  assertContains(lastUserMsg.content, '重发后继续聊天', 'lastUserMsg.content')
  assertTruthy(lastAssistantMsg.content, 'lastAssistantMsg.content')
}, CHAT_TIMEOUT)

test('记忆: 触发后全部未记忆消息均被记忆，只剩本轮新增', async () => {
  await cleanupMemories()

  const msgResultBefore = await client.getMessages(convId1, { page: 1, limit: 100 })
  const unmemoriedBefore = msgResultBefore.messages.filter((m) => !m.memoried)

  // 只用未记忆消息的 token 计算阈值，确保触发
  const unmemoriedTokenSum = unmemoriedBefore.reduce((sum, m) => sum + m.tokens, 0)
  const thresholdK = unmemoriedTokenSum / 1000

  const totalChars = unmemoriedBefore.reduce((sum, m) => sum + m.content.length, 0)
  const chunkSize = Math.max(20, Math.round(totalChars / 4))
  const chunkMin = Math.max(10, Math.round(chunkSize * 0.6))
  const chunkMax = Math.round(chunkSize * 1.4)

  setMockChatSetting({
    memoryContextThreshold: thresholdK,
    chunkCharRange: `${chunkMin}-${chunkMax}`,
  })

  const triggerResult = await chatAndWait(client, {
    messages: [{ id: 'mem-trigger', content: '什么是动态规划？要简洁回答。' }],
    modelId,
    kbId,
    conversationId: convId1,
  })
  await waitForProcessingCleared(convId1)

  const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 100 })
  const memoriedMsgs = msgResultAfter.messages.filter((m) => m.memoried)
  const unmemoriedAfter = msgResultAfter.messages.filter((m) => !m.memoried)

  // 验证1: 有消息被记忆
  assertGreaterThan(memoriedMsgs.length, 0, 'memoried messages count')

  // 验证2: 触发后未记忆消息只剩本轮新增（1条用户 + 1条助手 = 最多2条）
  assertLessThanOrEqual(unmemoriedAfter.length, 2, 'only current round messages remain unmemoried')

  // 验证3: 之前所有未记忆消息 + 本轮用户消息都被标记为 memoried（本轮用户消息也参与了 SaveMemory）
  assertGreaterThan(memoriedMsgs.length, unmemoriedBefore.length, 'all previously unmemoried + current user message are memoried')

  // 验证4: 流事件中包含 summarizing 状态
  const summarizingEvents = triggerResult.events.filter(
    (e) => (e as Record<string, unknown>).status === 'summarizing',
  )
  assertGreaterThan(summarizingEvents.length, 0, 'summarizing status events during memory save')
}, 120_000)

test('记忆: 已记忆消息不参与阈值计算 — 第二次触发只计算未记忆消息', async () => {
  // 恢复高阈值，发几轮短对话积累未记忆消息
  setMockChatSetting({
    memoryContextThreshold: 9999,
    chunkCharRange: '200-500',
  })

  await chatAndWait(client, { messages: [{ id: 'mem-2nd-1', content: '第二次记忆测试第一轮' }], modelId, kbId, conversationId: convId1 })
  await chatAndWait(client, { messages: [{ id: 'mem-2nd-2', content: '第二次记忆测试第二轮' }], modelId, kbId, conversationId: convId1 })

  const msgResultBefore = await client.getMessages(convId1, { page: 1, limit: 100 })
  const unmemoriedBefore = msgResultBefore.messages.filter((m) => !m.memoried)
  const memoriedBefore = msgResultBefore.messages.filter((m) => m.memoried)

  // 确认已有已记忆消息（来自前一个测试）
  assertGreaterThan(memoriedBefore.length, 0, 'has memoried messages from previous test')

  // 只用未记忆消息的 token 计算阈值（已记忆消息不参与）
  const unmemoriedTokenSum = unmemoriedBefore.reduce((sum, m) => sum + m.tokens, 0)
  const thresholdK = unmemoriedTokenSum / 1000

  setMockChatSetting({
    memoryContextThreshold: thresholdK,
  })

  await chatAndWait(client, { messages: [{ id: 'mem-2nd-trigger', content: '触发第二次记忆' }], modelId, kbId, conversationId: convId1 })
  await waitForProcessingCleared(convId1)

  const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 100 })
  const unmemoriedAfter = msgResultAfter.messages.filter((m) => !m.memoried)

  // 验证: 第二次触发后，之前的未记忆消息全部被记忆，只剩本轮新增
  assertLessThanOrEqual(unmemoriedAfter.length, 2, 'only current round messages remain unmemoried after 2nd trigger')
}, 90_000)

test('记忆: memoried 消息不可重发 — 返回 400', async () => {
  const msgResult = await client.getMessages(convId1, { page: 1, limit: 100 })
  const memoriedMsg = msgResult.messages.find((m) => m.memoried)

  if (!memoriedMsg) {
    throw new Error('没有找到已记忆的消息，前置用例可能未触发记忆')
  }

  const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [],
      modelId,
      kbId,
      conversationId: convId1,
      regenerateMessageId: memoriedMsg.id,
    }),
  })

  assertEqual(res.status, 400, 'status for memoried regenerate')
  const text = await res.text()
  assertContains(text, '已记忆', 'error message contains 已记忆')
})

test('记忆: 恢复阈值设置', async () => {
  setMockChatSetting({
    memoryContextThreshold: 9999,
    chunkCharRange: '200-500',
  })
})

// ════════════════════════════════════════════
// 搜索测试（完整聊天集成流程）
// ════════════════════════════════════════════

test('搜索: 聊天流程触发记忆搜索 — 发"之前"类消息穿透到 searchingMemory + 回答引用记忆', async () => {
  const result = await chatAndWait(client, {
    messages: [{ id: 'search-mem-1', content: '我之前让你解释过动态规划，简要回顾一下，我在测试你的记忆搜索能力，你必须一定要回顾。' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  // 验证1: searchingMemory 状态事件出现（证明 search node 被执行且 needSearchMemory=true）
  const searchingMemoryEvents = result.events.filter(
    (e) => (e as Record<string, unknown>).status === 'searchingMemory',
  )
  assertGreaterThan(searchingMemoryEvents.length, 0, '没有收到 searchingMemory 状态消息')

  // 验证2: 回答中提及了之前记忆过的内容（动态规划）
  const expectedKeywords = ['动态规划', 'DP', '规划']
  const dynamicRelated = expectedKeywords.some(kw => result.fullContent.includes(kw))
  if (!dynamicRelated) {
    await diagnoseMemories(kbId, expectedKeywords, result.fullContent)
  }
}, { memorySearch: true, timeoutMs: 30_000 })

test('互联网搜索: 第一次搜索 — 触发 searchingWeb + web_pages 表写入数据', async () => {
  await cleanupWebpages()
  const result = await chatAndWait(client, {
    messages: [{ id: 'search-web-1', content: '搜索吊牌耻辱' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  // 验证1: searchingWeb 状态事件出现
  const searchingWebEvents = result.events.filter(
    (e) => (e as Record<string, unknown>).status === 'searchingWeb',
  )
  assertGreaterThan(searchingWebEvents.length, 0, '没有收到 searchingWeb 状态消息')

  // 验证2: searchingWeb 事件中包含 url 字段（搜索来源链接）
  const webEventsWithUrl = searchingWebEvents.filter(
    (e) => !!(e as Record<string, unknown>).url,
  )
  assertGreaterThan(webEventsWithUrl.length, 0, 'searchingWeb events with url')

  // 验证3: web_pages 表有数据写入
  const countAfter = await getWebpageCount()
  assertGreaterThan(countAfter, 0, 'web_pages count after first search')
}, { memorySearch: true, webSearch: true, timeoutMs: 90_000 })

test('互联网搜索: 第二次搜索 — 相同消息命中缓存，web_pages 表数据不增加', async () => {
  const countBefore = await getWebpageCount()

  const result = await chatAndWait(client, {
    messages: [{ id: 'search-web-2', content: '搜索吊牌耻辱' }],
    modelId,
    kbId,
    conversationId: convId1,
  })

  // 验证1: searchingWeb 状态事件出现（缓存命中也会发射 searchingWeb）
  const searchingWebEvents = result.events.filter(
    (e) => (e as Record<string, unknown>).status === 'searchingWeb',
  )
  assertGreaterThan(searchingWebEvents.length, 0, '没有收到 searchingWeb 状态消息')

  // 验证2: web_pages 表数据不增加（相同消息产生相同 keywords，upsert 不新增行）
  const countAfter = await getWebpageCount()
  assertEqual(countAfter, countBefore, 'web_pages count unchanged after cached search')
}, { memorySearch: false, webSearch: true, timeoutMs: 30_000})

run()