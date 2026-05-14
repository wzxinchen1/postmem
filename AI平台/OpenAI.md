# OpenAI API 协议

## 1. 基础请求格式

```http
POST /v1/chat/completions HTTP/1.1
Host: api.openai.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true  // 开启流式输出
}
```

## 2. 开启思考链（Reasoning Tokens）

OpenAI 的 o1/o3 系列模型支持思考链,会在生成最终回答前进行内部推理:

```http
POST /v1/chat/completions HTTP/1.1
Host: api.openai.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "o1-preview",  // 使用 o1 系列模型
  "messages": [
    {"role": "user", "content": "请一步步分析：为什么天空是蓝色的？"}
  ],
  "max_completion_tokens": 32768,  // 使用 max_completion_tokens 而非 max_tokens
  "stream": true
}
```

**关键说明**:
- o1/o3 系列模型的思考过程（reasoning tokens）在 API 响应中**不可见**
- 只能通过 `usage.completion_tokens_details.reasoning_tokens` 查看思考过程使用的 token 数量
- 思考 tokens 会占用上下文窗口并计费,但不包含在返回的 content 中
- 使用 `max_completion_tokens` 控制总 token 数（思考 + 回答）,而非旧的 `max_tokens`
- 建议至少预留 25,000 tokens 用于推理和输出

**o1 系列当前限制（Beta阶段）**:
- ❌ 不支持 `system` 消息（仅支持 user 和 assistant）
- ❌ 不支持图像输入（仅文本）
- ❌ 不支持工具调用（tools、function calling）
- ❌ 不支持 `temperature`、`top_p` 参数（固定为 1）
- ❌ 不支持 `presence_penalty`、`frequency_penalty`（固定为 0）
- ❌ 不支持 logprobs
- ❌ 不支持 Assistants API 和 Batch API

## 3. 流式响应报文示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"计"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"算"},"finish_reason":null}]}

// ... 更多内容块

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

// 最终结束标记
data: [DONE]
```

**字段说明**:
- `delta.role`: 仅在第一个块中出现,标识角色为 assistant
- `delta.content`: 增量文本内容,需要拼接
- `finish_reason`: 结束原因
  - `stop`: 正常结束
  - `length`: 达到 token 限制
  - `tool_calls`: 需要调用工具
  - `null`: 未结束
- `data: [DONE]`: 流式传输结束标记

## 4. Function Calling（工具调用）

```http
POST /v1/chat/completions HTTP/1.1
Host: api.openai.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "北京今天天气怎么样？"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称"
            }
          },
          "required": ["city"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**工具调用响应**:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"city\":\"北京\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```