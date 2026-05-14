# DeepSeek API 协议

## 1. 基础请求格式

DeepSeek 兼容 OpenAI API 格式:

```http
POST /chat/completions HTTP/1.1
Host: api.deepseek.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "deepseek-chat",
  "messages": [
    {"role": "user", "content": "解释机器学习的基本概念"}
  ],
  "stream": true
}
```

## 2. 开启思考链（DeepSeek V4）

DeepSeek V4 支持思考模式（Thinking Mode）:

```http
POST /chat/completions HTTP/1.1
Host: api.deepseek.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "deepseek-v4-pro",  // 使用 V4 Pro 模型
  "messages": [
    {"role": "user", "content": "证明：根号2是无理数"}
  ],
  "enable_thinking": true,  // 开启思考模式
  "stream": true
}
```

**注意**: DeepSeek R1 模型（`deepseek-reasoner`）默认开启思考链,无需额外参数。

## 3. 流式响应报文示例（含思考链）

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 思考过程开始
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"让我用反证法来证明..."},"finish_reason":null}]}

// 思考过程继续
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"\n\n假设根号2是有理数，即 √2 = p/q，其中 p、q 互质"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"\n\n两边平方得：2 = p²/q²\n因此 p² = 2q²"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"\n\n这意味着 p² 是偶数，所以 p 也是偶数\n设 p = 2k，代入得：4k² = 2q²\n即 q² = 2k²，所以 q 也是偶数"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"\n\n但这与 p、q 互质矛盾！\n因此假设不成立，根号2是无理数。"},"finish_reason":null}]}

// 最终回答开始（思考结束后）
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"content":"**证明：根号2是无理数**\n\n我们使用反证法："},"finish_reason":null}]}

// 最终回答继续
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"content":"\n\n假设 √2 是有理数..."},"finish_reason":null}]}

// ... 更多内容

// 结束标记
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**字段说明**:
- `delta.reasoning_content`: 思考过程的增量内容（DeepSeek 特有字段）
- `delta.content`: 最终回答的增量内容
- 思考过程和最终回答是分开的字段,便于前端区分显示

## 4. 非流式响应（含思考链）

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek-reasoner",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "reasoning_content": "让我用反证法来证明...\n\n假设根号2是有理数...",
        "content": "**证明：根号2是无理数**\n\n我们使用反证法..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 500,
    "total_tokens": 520,
    "prompt_tokens_details": {
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 300,  // 思考过程使用的 token
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  }
}
```