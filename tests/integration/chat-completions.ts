import { test, run } from './runner'
import type { TestContext } from './runner'
import {
  createClient,
  getTestKbId,
  getTestModelId,
  cleanupConversations,
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
} from './helpers'
import type { PostMemClient } from '../../packages/postmem-sdk/dist/index.mjs'

const CHAT_TIMEOUT = 90_000

let client: PostMemClient
let kbId: string
let modelId: string
let convId1: string

test('空库时聊天 — 自动创建新对话并返回有效 ChatResult', async (ctx: TestContext) => {
  await cleanupConversations()
  client = createClient()
  kbId = await getTestKbId()
  modelId = await getTestModelId()
  startConsume(client)

  const result = await chatAndWait(
    client,
    {
      messages: [{ id: '1', content: '你好' }],
      modelId,
      kbId,
    },
    true,
  )

  assertTruthy(result.conversationId, 'conversationId')
  assertTruthy(result.fullContent, 'fullContent')
  assertEqual(result.error, undefined, 'error')
  assertGreaterThan(result.userTokens!, 0, 'userTokens')
  assertGreaterThan(result.completionTokens!, 0, 'completionTokens')
  assertGreaterThan(result.totalTokens!, 0, 'totalTokens')

  const conversations = await client.listConversations()
  assertEqual(conversations.total, 1, 'conversations.total')
  assertEqual(conversations.conversations[0].id, result.conversationId, 'conversationId match')

  convId1 = result.conversationId
}, 120_000)

test('有对话时复用最新对话', async () => {
  const result = await chatAndWait(
    client,
    {
      messages: [{ id: '2', content: '我叫什么？' }],
      modelId,
      kbId,
    },
    true,
  )

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
})

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
})

test('缺少 messages — 返回 400', async () => {
  const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId, kbId }),
  })

  assertEqual(res.status, 400, 'status')
})

test('同一对话正在处理时再次请求 → 400', async () => {
  await waitForProcessingCleared(convId1)

  const firstRes = await fetch(`${getBaseUrl()}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: '5', content: '请详细解释量子力学的原理' }],
      modelId,
      kbId,
      conversationId: convId1,
    }),
  })
  assertEqual(firstRes.ok, true, 'firstRes.ok')

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

  await waitForProcessingCleared(convId1)
}, CHAT_TIMEOUT)

test('首 token 时间 ≤ 10s', async () => {
  const result = await chatAndWait(
    client,
    {
      messages: [{ id: '6', content: '你好' }],
      modelId,
      kbId,
      conversationId: convId1,
    },
    true,
  )

  const firstChunk = result.events.find((e) => e.type === 'chunk')
  assertTruthy(firstChunk, 'firstChunk event')
  const timestamp = (firstChunk as Record<string, unknown>)?._timestamp as number | undefined
  const ttfb = (timestamp ?? 0) - result.requestStartTime
  assertGreaterThan(ttfb, 0, 'ttfb > 0')
  assertLessThanOrEqual(ttfb, 10_000, 'ttfb <= 10s')
}, CHAT_TIMEOUT)

test('流事件包含 chunk → done 序列（含 token 计数）', async () => {
  const result = await chatAndWait(
    client,
    {
      messages: [{ id: '7', content: '1+1等于几？' }],
      modelId,
      kbId,
      conversationId: convId1,
    },
    true,
  )

  const types = result.events.map((e) => e.type)
  assertTruthy(types.includes('chunk'), 'has chunk event')
  assertTruthy(types.includes('done'), 'has done event')

  const chunkIndex = types.indexOf('chunk')
  const doneIndex = types.indexOf('done')
  assertLessThanOrEqual(chunkIndex, doneIndex - 1, 'chunk before done')

  const doneEvent = result.events.find((e) => e.type === 'done') as Record<string, unknown> | undefined
  assertTruthy(doneEvent, 'doneEvent')
  assertEqual(doneEvent!.error, undefined, 'doneEvent.error')
  assertGreaterThan(doneEvent!.userTokens as number, 0, 'doneEvent.userTokens')
  assertGreaterThan(doneEvent!.completionTokens as number, 0, 'doneEvent.completionTokens')
}, CHAT_TIMEOUT)

test('流事件包含 messageId（user + assistant）', async () => {
  const result = await chatAndWait(
    client,
    {
      messages: [{ id: '8', content: '今天天气怎么样？' }],
      modelId,
      kbId,
      conversationId: convId1,
    },
    true,
  )

  const messageIdEvents = result.events.filter((e) => e.type === 'messageId')
  assertGreaterThan(messageIdEvents.length, 1, 'messageIdEvents count >= 2')

  const userMessageId = messageIdEvents.find((e) => (e as Record<string, unknown>).role === 'user')
  const assistantMessageId = messageIdEvents.find((e) => (e as Record<string, unknown>).role === 'assistant')
  assertTruthy(userMessageId, 'user messageId')
  assertTruthy(assistantMessageId, 'assistant messageId')
}, CHAT_TIMEOUT)

test('流事件包含 status 事件', async () => {
  const result = await chatAndWait(
    client,
    {
      messages: [{ id: '9', content: '帮我搜索一下记忆' }],
      modelId,
      kbId,
      conversationId: convId1,
    },
    true,
  )

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
}, CHAT_TIMEOUT)

test('聊天完成后消息正确保存', async () => {
  await chatAndWait(
    client,
    {
      messages: [{ id: '10', content: '测试消息持久化' }],
      modelId,
      kbId,
      conversationId: convId1,
    },
    false,
  )

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

  const result = await chatAndWait(
    client,
    {
      messages: [],
      modelId,
      kbId,
      conversationId: convId1,
      regenerateMessageId: lastUserMsg.id,
    },
    true,
  )

  assertTruthy(result.fullContent, 'fullContent')

  const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 50 })
  const newAssistantMsgs = msgResultAfter.messages.filter((m) => m.role === 'assistant')
  const newLastAssistant = newAssistantMsgs[newAssistantMsgs.length - 1]

  assertTruthy(newLastAssistant.content, 'newLastAssistant.content')
  assertNotEqual(newLastAssistant.id, lastUserMsg.id, 'assistant message id changed')
  assertLessThanOrEqual(msgResultAfter.total, previousTotal, 'messages deleted after regenerate')
}, CHAT_TIMEOUT)

test('重发后继续聊天 — 新消息追加在重发内容之后', async () => {
  const msgResultBefore = await client.getMessages(convId1, { page: 1, limit: 50 })

  const result = await chatAndWait(
    client,
    {
      messages: [{ id: '11', content: '重发后继续聊天' }],
      modelId,
      kbId,
      conversationId: convId1,
    },
    true,
  )

  assertEqual(result.conversationId, convId1, 'conversationId')
  assertTruthy(result.fullContent, 'fullContent')

  const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 50 })

  assertGreaterThan(msgResultAfter.total, msgResultBefore.total, 'message count increased')

  const lastUserMsg = msgResultAfter.messages.filter((m) => m.role === 'user').slice(-1)[0]
  const lastAssistantMsg = msgResultAfter.messages.filter((m) => m.role === 'assistant').slice(-1)[0]

  assertContains(lastUserMsg.content, '重发后继续聊天', 'lastUserMsg.content')
  assertTruthy(lastAssistantMsg.content, 'lastAssistantMsg.content')
}, CHAT_TIMEOUT)

run()
