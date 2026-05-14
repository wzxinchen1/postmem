# Mistral AI API 协议

## 1. 基础请求格式

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "mistral-large-latest",
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true  // 开启流式输出
}
```

**关键说明**:
- **API 端点**: `https://api.mistral.ai/v1/chat/completions`
- **认证方式**: Bearer Token 认证
- **API Key 获取**: 在 [Mistral AI Console](https://console.mistral.ai/api-keys/) 生成
- **OpenAI 兼容**: Mistral AI 提供兼容 OpenAI API 的端点,可直接使用 OpenAI SDK

## 2. 支持的模型列表

### 2.1 商业模型（API）

| 模型 | 参数规模 | 上下文窗口 | 特性 | 适用场景 |
|------|----------|-----------|------|----------|
| `mistral-large-latest` | 123B | 128K | 企业级旗舰,最强性能 | 复杂RAG、企业应用、多语言代码生成 |
| `mistral-large-2407` | 123B | 128K | Large 2 版本 | 复杂推理、多语言任务 |
| `mistral-medium-latest` | - | 32K | 平衡性能与成本 | 通用任务 |
| `mistral-medium-3` | - | 128K | 多模态模型 | 文档理解、视觉任务 |
| `mistral-medium-3.5` | - | 128K | 最新多模态版本 | 高级多模态应用 |
| `mistral-small-latest` | - | 32K | 极低延迟,高性价比 | 实时对话、内容审核、高频调用 |
| `mistral-small-2407` | - | 32K | Small 版本 | 快速响应任务 |
| `pixtral-large-latest` | 124B | 128K | 多模态视觉模型 | 图像理解、文档分析 |
| `pixtral-12b` | 12B | 128K | 轻量多模态模型 | 视觉任务、图像处理 |
| `codestral-latest` | 22B | 32K | 代码专用模型 | 代码生成、代码补全 |
| `ministral-8b-latest` | 8B | 128K | 轻量级模型 | 边缘设备、快速推理 |
| `ministral-3b-latest` | 3B | 128K | 超轻量模型 | 资源受限环境 |

### 2.2 开源模型（可下载权重）

| 模型 | 参数规模 | 上下文窗口 | 许可证 | 特性 |
|------|----------|-----------|--------|------|
| `open-mistral-7b` | 7B | 32K | Apache 2.0 | 开源基础模型 |
| `open-mixtral-8x7b` | 47B (MoE) | 32K | Apache 2.0 | MoE架构,高效推理 |
| `open-mixtral-8x22b` | 141B (MoE) | 65K | Apache 2.0 | 大规模MoE模型 |
| `mistral-large-3` | 675B (41B active) | 256K | Apache 2.0 | 最新开源旗舰,MoE架构 |
| `mistral-nemo` | 12B | 128K | Apache 2.0 | 高效开源模型,支持函数调用 |

### 2.3 模型选择建议

| 业务需求 | 推荐模型 | 理由 |
|----------|----------|------|
| 处理大量文档、复杂推理 | `mistral-large-latest` | 128K上下文、顶级性能 |
| 高频调用、实时响应 | `mistral-small-latest` | 极低延迟、成本控制 |
| 深度定制、私有部署 | `open-mixtral-8x7b` | 完全开源、可微调 |
| 代码生成与补全 | `codestral-latest` | 代码专用、高效准确 |
| 图像理解、多模态任务 | `pixtral-large-latest` | 支持视觉输入、文档分析 |

## 3. 请求参数详解

### 3.1 核心参数

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "mistral-large-latest",
  "messages": [
    {"role": "system", "content": "你是一个专业的科学顾问"},
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "temperature": 0.7,          // 采样温度 (0-1),默认0.7
  "top_p": 1,                  // 核采样阈值,默认1
  "max_tokens": 1024,          // 生成的最大Token数
  "stream": false,             // 是否流式输出
  "safe_prompt": false,        // 是否注入安全提示
  "random_seed": 42,           // 随机种子(Beta,用于确定性输出)
  "stop": ["END", "\n\n"],     // 停止生成的Token列表
  "response_format": {"type": "json_object"}  // 输出格式
}
```

### 3.2 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | 必填 | 模型名称,如 `mistral-large-latest` |
| `messages` | array | 必填 | 消息列表,包含角色和内容 |
| `temperature` | number | 0.7 | 采样温度(0-1),越高越随机 |
| `top_p` | number | 1 | 核采样阈值,控制多样性 |
| `max_tokens` | integer | - | 生成的最大Token数 |
| `stream` | boolean | false | 是否启用流式输出 |
| `safe_prompt` | boolean | false | 是否注入安全提示词 |
| `random_seed` | integer | - | 随机种子(Beta功能) |
| `stop` | array/string | - | 停止生成的Token列表 |
| `response_format` | object | - | 输出格式,如 `{"type": "json_object"}` |
| `tools` | array | - | 可调用的工具列表 |
| `tool_choice` | string | "auto" | 函数调用行为: auto/none |

### 3.3 参数调优建议

| 场景 | temperature | top_p | max_tokens | 说明 |
|------|-------------|-------|------------|------|
| 代码生成 | 0.1-0.3 | 0.9 | 2048+ | 低温度保证代码准确性 |
| 创意写作 | 0.8-1.0 | 0.95 | 1024+ | 高温度增加创造性 |
| 问答系统 | 0.3-0.5 | 1.0 | 512 | 平衡准确性和多样性 |
| 数据提取 | 0.0-0.2 | 1.0 | 256 | 确定性输出,适合JSON |

## 4. 流式响应报文示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"content":"计"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"content":"算"},"finish_reason":null}]}

// ... 更多内容块

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"mistral-large-latest","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

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

## 5. Function Calling（工具调用）

### 5.1 基础工具调用

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "mistral-large-latest",
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
            },
            "unit": {
              "type": "string",
              "enum": ["celsius", "fahrenheit"],
              "description": "温度单位"
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

### 5.2 工具调用响应

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "mistral-large-latest",
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
              "arguments": "{\"city\":\"北京\",\"unit\":\"celsius\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

### 5.3 多工具调用示例

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "mistral-large-latest",
  "messages": [
    {"role": "user", "content": "帮我查询北京和上海的天气,并预订明天从北京到上海的机票"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取城市天气",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"}
          },
          "required": ["city"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "book_flight",
        "description": "预订机票",
        "parameters": {
          "type": "object",
          "properties": {
            "from": {"type": "string"},
            "to": {"type": "string"},
            "date": {"type": "string", "format": "date"}
          },
          "required": ["from", "to", "date"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

### 5.4 流式工具调用

Mistral AI 支持流式函数调用,通过 `client.chat.stream()` 实时处理响应:

```python
from mistralai import Mistral

client = Mistral(api_key="your-api-key")

# 流式工具调用
response_stream = client.chat.stream(
    model="mistral-large-latest",
    messages=[{"role": "user", "content": "查询北京天气"}],
    tools=[...]
)

tool_calls = []
for chunk in response_stream:
    delta = chunk.data.choices[0].delta
    
    if delta.content:
        print(delta.content, end="")
    
    if delta.tool_calls:
        # 累积工具调用
        for tool_call in delta.tool_calls:
            tool_calls.append(tool_call)
```

## 6. JSON Mode（结构化输出）

### 6.1 启用 JSON 模式

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "mistral-large-latest",
  "messages": [
    {
      "role": "system",
      "content": "你是一个数据分析助手,总是以JSON格式返回结果"
    },
    {
      "role": "user",
      "content": "分析以下文本的情感: 今天天气真好,心情很愉快"
    }
  ],
  "response_format": {"type": "json_object"}
}
```

### 6.2 JSON 响应示例

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "mistral-large-latest",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"sentiment\":\"positive\",\"confidence\":0.95,\"keywords\":[\"天气好\",\"心情愉快\"]}"
      },
      "finish_reason": "stop"
    }
  ]
}
```

**重要提示**:
- 使用 JSON 模式时,应在 system 消息中明确指示模型输出 JSON 格式
- 模型会确保输出为有效的 JSON 对象
- 适用于数据提取、结构化信息返回等场景

## 7. 多模态能力（视觉模型）

### 7.1 图像理解示例

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "pixtral-large-latest",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图片展示了什么?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg"
          }
        }
      ]
    }
  ],
  "max_tokens": 1024
}
```

### 7.2 支持的图像格式

- **格式**: JPEG, PNG, GIF, WebP
- **大小限制**: 单张图片最大 20MB
- **输入方式**: 
  - URL: `{"type": "image_url", "image_url": {"url": "https://..."}}`
  - Base64: `{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}`

### 7.3 文档分析示例

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "pixtral-large-latest",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "请提取这份财务报告中的关键数据,并以JSON格式返回"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/financial_report.pdf"
          }
        }
      ]
    }
  ],
  "response_format": {"type": "json_object"}
}
```

## 8. 代码生成（Codestral）

### 8.1 代码补全

```http
POST /v1/chat/completions HTTP/1.1
Host: api.mistral.ai
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "codestral-latest",
  "messages": [
    {
      "role": "user",
      "content": "用Python实现一个快速排序算法,并添加详细注释"
    }
  ],
  "temperature": 0.2,
  "max_tokens": 1024
}
```

### 8.2 代码补全响应

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "codestral-latest",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "```python\ndef quicksort(arr):\n    \"\"\"\n    快速排序算法实现\n    \n    参数:\n        arr: 待排序的列表\n    \n    返回:\n        排序后的列表\n    \"\"\"\n    if len(arr) <= 1:\n        return arr\n    \n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    \n    return quicksort(left) + middle + quicksort(right)\n```"
      },
      "finish_reason": "stop"
    }
  ]
}
```

## 9. OpenAI API 兼容性

Mistral AI 提供完全兼容 OpenAI API 的端点,可直接使用 OpenAI SDK:

### 9.1 使用 OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-mistral-api-key",
    base_url="https://api.mistral.ai/v1"
)

response = client.chat.completions.create(
    model="mistral-large-latest",
    messages=[
        {"role": "user", "content": "解释量子计算的基本原理"}
    ],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

### 9.2 兼容性说明

| 特性 | 支持情况 | 说明 |
|------|----------|------|
| Chat Completions API | ✅ 完全支持 | 与 OpenAI 格式一致 |
| 流式输出 | ✅ 完全支持 | SSE 协议 |
| Function Calling | ✅ 完全支持 | 工具调用格式相同 |
| JSON Mode | ✅ 完全支持 | `response_format` 参数 |
| 图像输入 | ✅ 支持 | Pixtral 模型 |
| Embeddings API | ✅ 支持 | 文本向量化 |
| Fine-tuning | ⚠️ 部分支持 | 开源模型可微调 |

## 10. 错误处理

### 10.1 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 401 | 认证失败 | 检查 API Key 是否正确 |
| 403 | 权限不足 | 确认账户权限和模型访问权限 |
| 404 | 模型不存在 | 检查模型名称是否正确 |
| 429 | 请求过于频繁 | 降低请求频率或升级套餐 |
| 500 | 服务器错误 | 重试或联系支持 |
| 503 | 服务不可用 | 稍后重试 |

### 10.2 错误响应示例

```json
{
  "error": {
    "message": "Invalid API key provided",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

### 10.3 重试策略

```python
import time
from mistralai import Mistral

client = Mistral(api_key="your-api-key")

max_retries = 3
retry_delay = 2  # 秒

for attempt in range(max_retries):
    try:
        response = client.chat.complete(
            model="mistral-large-latest",
            messages=[{"role": "user", "content": "Hello"}]
        )
        break
    except Exception as e:
        if attempt < max_retries - 1:
            time.sleep(retry_delay * (attempt + 1))
        else:
            raise e
```

## 11. 最佳实践

### 11.1 性能优化

| 优化项 | 建议 | 说明 |
|--------|------|------|
| 模型选择 | 根据场景选择合适模型 | Small 模型延迟更低,Large 模型性能更强 |
| Token 管理 | 合理设置 `max_tokens` | 避免生成过多无用内容 |
| 流式输出 | 启用 `stream: true` | 提升用户体验,减少等待时间 |
| 缓存策略 | 缓存常见查询结果 | 降低 API 调用成本 |
| 并发控制 | 控制并发请求数 | 避免触发速率限制 |

### 11.2 成本优化

- **使用 Small 模型**: 对于简单任务,Small 模型成本仅为 Large 的 1/3
- **控制输出长度**: 精确设置 `max_tokens` 避免浪费
- **优化 Prompt**: 简洁明确的 Prompt 减少 Token 消耗
- **使用开源模型**: 对于可私有部署的场景,使用开源模型降低成本

### 11.3 安全建议

- **API Key 保护**: 不要在客户端暴露 API Key
- **输入验证**: 对用户输入进行验证和清理
- **内容过滤**: 使用 `safe_prompt` 参数过滤敏感内容
- **访问控制**: 实施适当的访问控制和速率限制

## 12. SDK 和工具

### 12.1 官方 SDK

**Python SDK:**
```bash
pip install mistralai
```

```python
from mistralai import Mistral

client = Mistral(api_key="your-api-key")

response = client.chat.complete(
    model="mistral-large-latest",
    messages=[{"role": "user", "content": "Hello"}]
)
```

**TypeScript SDK:**
```bash
npm install @mistralai/mistralai
```

```typescript
import MistralClient from '@mistralai/mistralai';

const client = new MistralClient('your-api-key');

const response = await client.chat.complete({
  model: 'mistral-large-latest',
  messages: [{role: 'user', content: 'Hello'}]
});
```

### 12.2 第三方集成

- **LangChain**: 通过 LangChain 集成 Mistral 模型
- **LlamaIndex**: 支持 Mistral 作为 LLM 后端
- **Spring AI**: Java 生态的官方集成
- **OpenAI SDK**: 通过兼容端点直接使用

## 13. 相关链接

- **官方文档**: https://docs.mistral.ai/
- **API 控制台**: https://console.mistral.ai/
- **GitHub**: https://github.com/mistralai
- **Hugging Face**: https://huggingface.co/mistralai
- **社区支持**: https://discord.gg/mistralai

---

**最后更新**: 2025年12月  
**版本**: v1.0
