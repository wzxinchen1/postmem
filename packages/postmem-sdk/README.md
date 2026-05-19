# @postmem/sdk

PostMem 客户端 SDK，用于调用端与 PostMem 服务端进行对话交互。

核心机制：调用方通过 HTTP API 触发对话，然后直接从 Redis Stream 消费流式响应事件，不走 HTTP SSE。

## 安装

```bash
npm install @postmem/sdk
# 或
pnpm add @postmem/sdk
```

依赖要求：调用方必须能直连 PostMem 服务端使用的 Redis 实例。

## 快速开始

```typescript
import { PostMemClient } from '@postmem/sdk'

const client = new PostMemClient({
  baseUrl: 'http://localhost:3000',
  redis: {
    host: 'localhost',
    port: 6379,
    db: 5,
  },
})

// 阻塞式聊天，等流结束才返回
const result = await client.chat(
  {
    messages: [{ id: '1', content: '什么是 RAG？' }],
    modelId: 'model-id',
    kbId: 'kb-id',
    newConversation: true,
  },
  (event) => {
    if (event.type === 'chunk') process.stdout.write(event.content)
    if (event.type === 'status') console.log(`[${event.status}]`)
  },
)

console.log(`\nconversationId: ${result.conversationId}`)
console.log(`userTokens: ${result.userTokens}, userTotalTokens: ${result.userTotalTokens}, totalTokens: ${result.totalTokens}, completionTokens: ${result.completionTokens}`)

// 续聊
const result2 = await client.chat({
  messages: [{ id: '2', content: '详细说说' }],
  conversationId: result.conversationId,
  modelId: 'model-id',
  kbId: 'kb-id',
})

await client.disconnect()
```

## API

### `new PostMemClient(config)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `config.baseUrl` | `string` | PostMem 服务端地址 |
| `config.redis.host` | `string` | Redis 主机 |
| `config.redis.port` | `number` | Redis 端口 |
| `config.redis.db` | `number?` | Redis 数据库编号，默认 5 |
| `config.redis.password` | `string?` | Redis 密码 |

### `client.chat(request, onEvent?)`

发起对话，阻塞等待流结束。

| 参数 | 类型 | 说明 |
|------|------|------|
| `request.messages` | `ChatMessageInput[]` | 消息列表 |
| `request.modelId` | `string` | 模型 ID |
| `request.kbId` | `string` | 知识库 ID |
| `request.conversationId` | `string?` | 已有对话 ID（续聊） |
| `request.newConversation` | `boolean?` | 是否创建新对话 |
| `request.regenerateMessageId` | `string?` | 重新生成的消息 ID |
| `onEvent` | `(StreamEvent) => void?` | 流事件回调 |

返回 `ChatResult`：`{ conversationId, fullContent, userTokens, userTotalTokens, totalTokens, completionTokens }`

### `client.cancel(conversationId)`

取消当前对话。

### `client.getMessages(conversationId, params?)`

获取对话消息列表。

### `client.listConversations(params?)`

获取对话列表。

### `client.getConversation(conversationId)`

获取单个对话详情。

### `client.createConversation(metadata?)`

创建新对话。

### `client.deleteConversation(conversationId)`

删除对话。

### `client.disconnect()`

断开 Redis 连接。

## StreamEvent 类型

| type | 字段 | 说明 |
|------|------|------|
| `chunk` | `content`, `model` | LLM 流式输出片段 |
| `status` | `status` | 状态通知（searchingWeb/searchingMemory/summarizing/memoryProgress/recognizing/fetchingUrl） |
| `messageId` | `role`, `id` | 消息 ID 通知 |
| `usage` | `userTokens`, `userTotalTokens`, `totalTokens`, `completionTokens` | Token 用量 |
| `error` | `message` | 错误 |
| `done` | - | 流结束 |

## 注意事项

1. **单会话模式**：SDK 设计为单会话顺序聊天，不支持多对话并行
2. **Redis 网络可达**：调用方必须能直连 PostMem 使用的 Redis（db 默认 5）
3. **Stream 清理**：服务端在流结束后会 DEL Redis Key，SDK 收到 `done` 后自动退出消费循环