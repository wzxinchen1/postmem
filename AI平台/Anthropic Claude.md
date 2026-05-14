# Anthropic Claude API 协议

## 1. 基础请求格式

```http
POST /v1/messages HTTP/1.1
Host: api.anthropic.com
x-api-key: sk-ant-xxx
anthropic-version: 2023-06-01
Content-Type: application/json

{
  "model": "claude-sonnet-4-6-20260514",
  "max_tokens": 4096,
  "messages": [
    {"role": "user", "content": "解释相对论的基本原理"}
  ]
}
```

## 2. 开启思考链（Extended Thinking）

Claude 支持 Extended Thinking 功能,可以查看模型的思考过程:

```http
POST /v1/messages HTTP/1.1
Host: api.anthropic.com
x-api-key: sk-ant-xxx
anthropic-version: 2023-06-01
Content-Type: application/json

{
  "model": "claude-sonnet-4-6-20260514",
  "max_tokens": 16000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000  // 分配给思考的 token 预算
  },
  "messages": [
    {"role": "user", "content": "请详细分析：如果光速减慢到现在的1/10，宇宙会有什么变化？"}
  ],
  "stream": true
}
```

**关键参数**:
- `thinking.type`: 设为 `"enabled"` 开启思考链
- `thinking.budget_tokens`: 思考过程的最大 token 数
  - **最小值**: 1,024 tokens
  - **限制**: 必须小于 `max_tokens`
  - **建议**: 复杂任务从 16k+ tokens 开始
- `max_tokens`: 总 token 数（包含思考 + 回答）,需大于 `budget_tokens`

**Extended Thinking 限制**:
- ❌ 不能修改 `temperature` 或 `top_k`
- ❌ `top_p` 只能设置在 0.95-1 之间
- ❌ 不能预填充响应（prefill）
- ⚠️ `max_tokens > 21,333` 时必须使用流式输出
- ⚠️ 与工具配合时,`tool_choice` 仅支持 `{"type": "auto"}` 或 `{"type": "none"}`
- ⚠️ 多轮工具调用时必须将完整的 thinking 块传回 API

## 3. 流式响应报文示例（含思考链）

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 消息开始事件
event: message_start
data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6-20260514","stop_reason":null,"usage":{"input_tokens":20,"output_tokens":0}}}

// 内容块开始：思考过程
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

// 思考过程的增量更新
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"让我分析一下这个问题..."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"\n\n首先，光速是宇宙的基本常数，它影响着："}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"\n1. 时间膨胀效应\n2. 长度收缩\n3. 质能关系 E=mc²"}}

// 签名增量（在 content_block_stop 之前）
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"EqQBCgIYAhIM..."}}

// 思考块结束
event: content_block_stop
data: {"type":"content_block_stop","index":0}

// 内容块开始：最终回答
event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

// 最终回答的增量更新
event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"如果光速减慢到原来的1/10，宇宙将发生根本性变化："}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"\n\n**1. 时间膨胀效应增强**"}}

// ... 更多内容

// 回答块结束
event: content_block_stop
data: {"type":"content_block_stop","index":1}

// 消息结束事件
event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":500}}

event: message_stop
data: {"type":"message_stop"}
```

**事件类型说明**:
- `message_start`: 消息开始,包含元数据
- `content_block_start`: 内容块开始,`type` 为 `thinking`、`redacted_thinking` 或 `text`
- `content_block_delta`: 增量内容
  - `thinking_delta`: 思考过程文本
  - `signature_delta`: 思考块签名（在 content_block_stop 之前）
  - `text_delta`: 最终回答文本
- `content_block_stop`: 内容块结束
- `message_delta`: 消息状态更新
- `message_stop`: 消息结束

**内容块类型**:
- `thinking`: 思考内容块,包含 `thinking` 文本和 `signature` 签名
- `redacted_thinking`: 被安全系统加密的思考块,包含 `data` 字段而非 `thinking` 字段
- `text`: 最终文本响应
- `tool_use`: 工具调用块（与工具使用配合时）

## 4. 非流式响应（含思考链）

```json
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6-20260514",
  "content": [
    {
      "type": "thinking",
      "thinking": "让我分析这个问题...\n\n首先考虑光速对物理定律的影响...",
      "signature": "WaUjzkypQ2mUEVM36O2TxuC06KN8xyfbJwyem2dw3URve/op91XWHOEBLLqIOMfFG/UvLEczmEsUjavL...."
    },
    {
      "type": "text",
      "text": "如果光速减慢到原来的1/10，宇宙将发生根本性变化..."
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 20,
    "output_tokens": 500
  }
}
```

**注意**: 多轮对话时,必须将完整的 thinking 块（包括 signature）传回 API,否则会报错。