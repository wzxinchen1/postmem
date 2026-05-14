# Meta Llama API 协议

## 1. 基础请求格式

Meta Llama API 完全兼容 OpenAI 格式,可通过多个提供商访问:

```http
POST /v1/chat/completions HTTP/1.1
Host: api.groq.com  # 或 api.together.xyz、api.deepinfra.com 等
Authorization: Bearer xxx
Content-Type: application/json

{
  "model": "meta-llama/llama-4-scout-17b-16e-instruct",
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true
}
```

## 2. 多模态输入（Llama 4 特有）

Llama 4 原生支持多模态,每个提示最多5张图片:

```http
POST /v1/chat/completions HTTP/1.1
Host: api.groq.com
Authorization: Bearer xxx
Content-Type: application/json

{
  "model": "meta-llama/llama-4-scout-17b-16e-instruct",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "描述这张图片"},
        {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
      ]
    }
  ],
  "max_tokens": 500
}
```

**关键技术**:
- 早期融合：同时处理文本和图像
- 图像分割：336×336像素tiles
- 专家图像基础：精确视觉推理

## 3. 工具调用（Function Calling）

```http
POST /v1/chat/completions HTTP/1.1
Host: api.groq.com
Authorization: Bearer xxx
Content-Type: application/json

{
  "model": "meta-llama/llama-4-maverick-17b-128e-instruct",
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
            "city": {"type": "string", "description": "城市名称"}
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
  "model": "meta-llama/llama-4-maverick-17b-128e-instruct",
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

## 4. 流式响应报文示例

格式与 OpenAI 完全相同:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"meta-llama/llama-4-scout-17b-16e-instruct","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"meta-llama/llama-4-scout-17b-16e-instruct","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"meta-llama/llama-4-scout-17b-16e-instruct","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}

// ... 更多内容

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"meta-llama/llama-4-scout-17b-16e-instruct","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

// 最终结束标记
data: [DONE]
```

## 5. API 提供商对比

| 提供商 | 端点 | 模型ID格式 | 速率限制 | 价格（输入/输出） |
|--------|------|-----------|---------|-----------------|
| GroqCloud | api.groq.com | `meta-llama/llama-4-scout-17b-16e-instruct` | 30请求/分钟（免费） | 免费 |
| OpenRouter | openrouter.ai/api/v1 | `meta-llama/llama-4-scout` | 有速率限制 | 免费 |
| Together AI | api.together.xyz/v1 | `meta-llama/Llama-4-Scout-17B-16E-Instruct` | 新用户免费额度 | $0.15/M / $0.60/M |
| DeepInfra | api.deepinfra.com/v1/openai | `meta-llama/Llama-4-Scout-17B-16E-Instruct` | - | $0.08/M / $0.30/M（最低） |
| Meta官方 | meta.ai | - | 无API | 仅网页版 |

**重要说明**:
- Meta官方于2025年4月30日在首届LlamaCon大会发布**官方Llama API**（预览版）
- 官方API与Groq合作，使用Groq LPU芯片提供加速推理
- 也可通过第三方提供商访问（GroqCloud、OpenRouter、Together AI等）
- 不同提供商的模型ID格式可能略有差异
- Llama 4 Scout支持10M tokens超长上下文,Maverick支持1M tokens