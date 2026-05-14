# OpenRouter API 协议

## 1. 基础信息

**OpenRouter** 是一个 AI 模型聚合路由平台，通过统一的 OpenAI 兼容 API 格式调用 GPT-5、Claude Opus 4、Gemini 2.5、Llama 4、DeepSeek V3 等 300+ 模型。

- **Base URL**: `https://openrouter.ai/api/v1`
- **认证方式**: Bearer Token
- **兼容性**: 完全兼容 OpenAI API 格式

## 2. 基础请求格式

```http
POST /v1/chat/completions HTTP/1.1
Host: openrouter.ai
Authorization: Bearer sk-or-v1-xxx
Content-Type: application/json
HTTP-Referer: https://your-domain.com
X-Title: YourAppName

{
  "model": "openai/gpt-4o",
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true
}
```

**关键说明**:
- **必须携带 HTTP-Referer 和 X-Title 请求头**，否则调用免费模型时会返回 402 错误
- `HTTP-Referer`: 标识你的应用来源（可填写任意域名）
- `X-Title`: 标识你的应用名称（可填写任意名称）
- 这两个头部用于在 OpenRouter 网站上展示和发现你的应用

## 3. 免费模型机制

### 3.1 免费原理

OpenRouter 本身没有"全局免费套餐"，其免费能力来自代理的第三方模型提供方。调用模型名带 `:free` 后缀时，OpenRouter 不收取中转费。

### 3.2 两种调用方式

| 方式 | 模型名 | 说明 | 适用场景 |
|------|--------|------|----------|
| 指定模型 | `meta-llama/llama-4-scout:free` | 明确指定免费模型 | 对模型有明确偏好 |
| 免费路由 | `openrouter/free` | 系统自动随机选可用免费模型 | 成功率最高 |

### 3.3 额度限制

- **速率限制**: 30 请求/分钟，60,000 token/分钟
- **日限制**: 1,000,000 token/天

### 3.4 免费模型清单（2026年2月实测有效）

| 模型全名 | 最大输出 | 特点 |
|----------|----------|------|
| `openrouter/free` | 自动 | 万能免费路由，自动选择 |
| `arcee-ai/trinity-large-preview:free` | 512K | Arcee 前沿规模开放权重模型 |
| `stepfun/step-3.5-flash:free` | 256K | StepFun 最强开源基础模型 |
| `z-ai/glm-4.5-air:free` | 96K | 智谱最新旗舰轻量化版本 |
| `deepseek/deepseek-r1-0528:free` | 163.8K | DeepSeek 最新推理模型 |
| `nvidia/nemotron-3-nano-30b-a3b:free` | 256K | 英伟达小型语言MoE模型 |
| `openai/gpt-oss-120b:free` | 131.1K | OpenAI 开放权重MoE模型 |

## 4. 流式响应报文示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"gen-123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"gen-123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}
data: {"id":"gen-123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}
data: {"id":"gen-123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{"content":"计"},"finish_reason":null}]}
data: {"id":"gen-123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{"content":"算"},"finish_reason":null}]}

// ... 更多内容块

// 最后一个数据块：标记结束
data: {"id":"gen-123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

// 最终结束标记
data: [DONE]
```

**字段说明**:
- `delta.role`: 仅在第一个块中出现，标识角色为 assistant
- `delta.content`: 增量文本内容，需要拼接
- `finish_reason`: 结束原因
  - `stop`: 正常结束
  - `length`: 达到 token 限制
  - `tool_calls`: 需要调用工具
  - `null`: 未结束
- `data: [DONE]`: 流式传输结束标记

## 5. Function Calling（工具调用）

OpenRouter 支持 OpenAI 兼容的工具调用功能，跨多个提供商标准化工具和函数调用。

```http
POST /v1/chat/completions HTTP/1.1
Host: openrouter.ai
Authorization: Bearer sk-or-v1-xxx
Content-Type: application/json
HTTP-Referer: https://your-domain.com
X-Title: YourAppName

{
  "model": "openai/gpt-4o",
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
  "id": "gen-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "openai/gpt-4o",
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

## 6. 多模态支持

OpenRouter 支持多种输入和输出模态，包括图像、PDF、音频和视频文件。

### 6.1 图像输入

```http
POST /v1/chat/completions HTTP/1.1
Host: openrouter.ai
Authorization: Bearer sk-or-v1-xxx
Content-Type: application/json
HTTP-Referer: https://your-domain.com
X-Title: YourAppName

{
  "model": "openai/gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图片里有什么？"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg"
          }
        }
      ]
    }
  ]
}
```

**支持的图像格式**:
- JPEG/JPG
- PNG
- GIF
- WebP

**图像输入方式**:
- URL 方式：提供图像的公开 URL
- Base64 编码：`data:image/jpeg;base64,{base64_data}`

### 6.2 检查模型多模态支持

通过查询模型元数据的 `architecture.input_modalities` 字段，可以判断模型是否支持图像输入：

```http
GET /api/v1/models HTTP/1.1
Host: openrouter.ai
Authorization: Bearer sk-or-v1-xxx
```

响应示例：

```json
{
  "data": [
    {
      "id": "openai/gpt-4o",
      "architecture": {
        "input_modalities": ["text", "image"],
        "output_modalities": ["text"]
      }
    }
  ]
}
```

## 7. Provider 路由配置

OpenRouter 允许配置提供商偏好、模型路由配置等高级功能。

### 7.1 按价格过滤提供商

```json
{
  "model": "anthropic/claude-sonnet-4",
  "messages": [...],
  "provider": {
    "max_price": {
      "prompt": 1,
      "completion": 2
    }
  }
}
```

### 7.2 指定特定提供商

```json
{
  "model": "anthropic/claude-sonnet-4",
  "messages": [...],
  "provider": {
    "order": ["anthropic", "azure", "aws"]
  }
}
```

### 7.3 查询模型端点信息

```http
GET /api/v1/models/anthropic/claude-sonnet-4/endpoints HTTP/1.1
Host: openrouter.ai
Authorization: Bearer sk-or-v1-xxx
```

可以查看该模型支持哪些参数和提供商。

## 8. 常用参数

| 参数 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `model` | string | 模型名称（必填） | - |
| `messages` | array | 消息数组（必填） | - |
| `stream` | boolean | 是否流式输出 | false |
| `temperature` | number | 采样温度（0-2） | 1 |
| `max_tokens` | integer | 最大输出 token 数 | 模型默认 |
| `top_p` | number | 核采样参数（0-1） | 1 |
| `top_k` | number | Top-k 采样参数 | - |
| `frequency_penalty` | number | 频率惩罚（-2 到 2） | 0 |
| `presence_penalty` | number | 存在惩罚（-2 到 2） | 0 |
| `stop` | string/array | 停止序列 | - |
| `tools` | array | 工具定义数组 | - |
| `tool_choice` | string/object | 工具选择策略 | "auto" |
| `response_format` | object | 响应格式（如 JSON 模式） | - |
| `seed` | integer | 随机种子 | - |
| `provider` | object | 提供商配置 | - |

## 9. 响应格式

### 9.1 非流式响应

```json
{
  "id": "gen-1234567890",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "openai/gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "量子计算是利用量子力学原理..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 50,
    "total_tokens": 65
  }
}
```

### 9.2 OpenRouter 特有字段

OpenRouter 在响应中会添加一些特有字段：

```json
{
  "id": "gen-1234567890",
  "provider": "openai",
  "provider_name": "OpenAI",
  "model": "openai/gpt-4o",
  "native_tokens": {
    "prompt": 15,
    "completion": 50
  },
  "native_finish_reason": "stop"
}
```

**字段说明**:
- `provider`: 实际处理请求的提供商 ID
- `provider_name`: 提供商名称
- `native_tokens`: 原生 token 计数（不同提供商的 token 计数可能不同）
- `native_finish_reason`: 原生结束原因

## 10. 错误处理

### 10.1 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 401 | API Key 无效 | 检查 Authorization 头部 |
| 402 | 余额不足或缺少必需头部 | 检查 HTTP-Referer 和 X-Title 头部 |
| 429 | 请求过于频繁 | 降低请求频率，检查速率限制 |
| 500 | 服务器错误 | 重试或联系支持 |
| 503 | 模型不可用 | 尝试其他模型或提供商 |

### 10.2 错误响应格式

```json
{
  "error": {
    "message": "Insufficient credits",
    "type": "insufficient_credits",
    "code": 402
  }
}
```

## 11. 最佳实践

### 11.1 使用建议

1. **初次上手**: 使用 `curl` 或 OpenAI SDK + `openrouter/free` 测试
2. **稳定使用**: 配置 2-3 个备选免费模型，实现自动故障转移
3. **成本控制**: 定期查看 Activity 用量，避免被误判为滥用
4. **最后防线**: 如项目不能中断，建议最低充值 $5 获得付费资格，免费失败时自动切付费

### 11.2 Python SDK 示例

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-你的密钥",
)

completion = client.chat.completions.create(
    extra_headers={
        "HTTP-Referer": "https://myapp.com",   # 必填
        "X-Title": "MyApp",                    # 必填
    },
    model="openrouter/free",   # 或指定免费模型
    messages=[
        {"role": "user", "content": "写一首关于秋天的五言绝句"}
    ],
    temperature=0.8,
    max_tokens=200
)

print(completion.choices[0].message.content)
```

**注意**: OpenRouter 暂不支持 AsyncOpenAI 异步调用，可用 `asyncio.to_thread` 包装同步调用。

### 11.3 cURL 测试示例

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-or-v1-你的密钥" \
  -H "HTTP-Referer: https://localhost" \
  -H "X-Title: MyFreeTest" \
  -d '{
    "model": "meta-llama/llama-4-scout:free",
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍自己"}
    ]
  }'
```

## 12. 官方资源

- **官方文档**: https://openrouter.ai/docs/quickstart
- **API 参考**: https://openrouter.ai/docs/api/reference/overview
- **模型列表**: https://openrouter.ai/models（可筛选 Free 标签）
- **用量查看**: https://openrouter.ai/activity

---

**注意**: 免费模型政策可能随时变动，请以 OpenRouter 官网为准。本文档基于 2026 年 2 月的信息整理。
