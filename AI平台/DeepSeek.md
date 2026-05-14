# DeepSeek API 协议

## 1. 基础请求格式

DeepSeek 兼容 OpenAI API 格式：

```http
POST /chat/completions HTTP/1.1
Host: api.deepseek.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "deepseek-v4-pro",
  "messages": [
    {"role": "user", "content": "解释机器学习的基本概念"}
  ],
  "stream": true
}
```

**关键说明**：
- Base URL: `https://api.deepseek.com`
- 认证方式: Bearer Token
- 完全兼容 OpenAI Chat Completions API 格式
- 支持流式输出（SSE 格式）

## 2. 开启思考模式（Thinking Mode）

DeepSeek V4 系列支持思考模式，会在生成最终回答前进行内部推理：

```http
POST /chat/completions HTTP/1.1
Host: api.deepseek.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "deepseek-v4-pro",
  "messages": [
    {"role": "user", "content": "证明：根号2是无理数"}
  ],
  "thinking": {
    "type": "enabled",  // enabled: 思考模式, disabled: 非思考模式
    "reasoning_effort": "high"  // 推理强度: high / max
  },
  "stream": true
}
```

**关键说明**：
- `thinking.type`: 控制思考模式开启/关闭（`enabled` / `disabled`）
- `reasoning_effort`: 控制推理强度（`high` / `max`，复杂 Agent 类请求自动设为 max）
- 思考过程通过 `reasoning_content` 字段返回，与最终回答分开
- 思考 tokens 会占用上下文窗口并计费，但包含在响应中（与 OpenAI o1/o3 不同）
- 支持 `max_tokens` 参数控制总 token 数

**可用模型与上下文窗口**：

| 模型 | 输入 Token | 输出 Token | 说明 |
|------|-----------|-----------|------|
| deepseek-v4-flash | 1,000,000 | 384,000 | 轻量版，适合快速响应 |
| deepseek-v4-pro | 1,000,000 | 384,000 | 旗舰版，更强推理能力 |

**参数支持情况对比**：

| 参数 | DeepSeek V4 | 说明 |
|------|------------|------|
| `system` 消息 | ✅ 支持 | 用于设定模型行为 |
| `user` 消息 | ✅ 支持 | 用户输入 |
| `assistant` 消息 | ✅ 支持 | 可含 `prefix`、`reasoning_content` 等扩展字段 |
| `tool` 消息 | ✅ 支持 | 响应 tool call |
| 图像输入 | ❌ 不支持 | 仅支持文本 |
| 工具调用（tools） | ✅ 完整支持 | 最多 128 个 function |
| 多工具编排 | ✅ 支持 | 支持并行工具调用 |
| `temperature` | ✅ 支持 | 范围 0-2，默认 1 |
| `top_p` | ✅ 支持 | 范围 0-1，默认 1 |
| `presence_penalty` | ❌ 不支持 | 已弃用 |
| `frequency_penalty` | ❌ 不支持 | 已弃用 |
| `logprobs` | ✅ 支持 | 返回输出 token 的对数概率 |
| `top_logprobs` | ✅ 支持 | 返回每个位置 top N 的 token 对数概率（0-20） |
| `reasoning_effort` | ✅ 支持 | 控制推理强度（high / max） |
| `max_tokens` | ✅ 支持 | 限制生成 completion 的最大 token 数 |
| `response_format` | ✅ 支持 | 支持 JSON 模式 |
| `stop` | ✅ 支持 | 遇到这些词时停止生成，最多 16 个 string |
| `stream_options` | ✅ 支持 | `include_usage: true` 可在最后返回 token 用量统计 |

**重要提示**：
- ⚠️ 旧模型名称 `deepseek-chat` 和 `deepseek-reasoner` 将于 2026年7月24日 废弃
- ⚠️ DeepSeek V4 的思考过程在 API 响应中**可见**（通过 `reasoning_content` 字段）
- ⚠️ 使用 Beta 功能需设置 `base_url="https://api.deepseek.com/beta"`

## 3. 流式响应报文示例

### 3.1 普通模式流式响应

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"机"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"器"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"学"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"习"},"finish_reason":null}]}

// ... 更多内容块

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

// 最终结束标记
data: [DONE]
```

### 3.2 思考模式流式响应（含思考链）

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 思考过程开始
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"让我用反证法来证明..."},"finish_reason":null}]}

// 思考过程继续
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"reasoning_content":"\n\n假设根号2是有理数，即 √2 = p/q，其中 p、q 互质"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"reasoning_content":"\n\n两边平方得：2 = p²/q²\n因此 p² = 2q²"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"reasoning_content":"\n\n这意味着 p² 是偶数，所以 p 也是偶数\n设 p = 2k，代入得：4k² = 2q²\n即 q² = 2k²，所以 q 也是偶数"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"reasoning_content":"\n\n但这与 p、q 互质矛盾！\n因此假设不成立，根号2是无理数。"},"finish_reason":null}]}

// 最终回答开始（思考结束后）
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"**证明：根号2是无理数**\n\n我们使用反证法："},"finish_reason":null}]}

// 最终回答继续
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"\n\n假设 √2 是有理数..."},"finish_reason":null}]}

// ... 更多内容

// 结束标记
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**字段说明**：
- `delta.role`: 仅在第一个块中出现，标识角色为 assistant
- `delta.reasoning_content`: 思考过程的增量内容（DeepSeek 特有字段）
- `delta.content`: 最终回答的增量内容
- 思考过程和最终回答是分开的字段，便于前端区分显示
- `finish_reason`: 结束原因
  - `stop`: 正常结束
  - `length`: 达到 token 限制
  - `tool_calls`: 需要调用工具
  - `content_filter`: 内容触发过滤策略
  - `insufficient_system_resource`: 系统推理资源不足
  - `null`: 未结束
- `data: [DONE]`: 流式传输结束标记

## 4. 非流式响应（含思考链）

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek-v4-pro",
  "system_fingerprint": "后端配置指纹",
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
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 20,
    "completion_tokens_details": {
      "reasoning_tokens": 300,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  }
}
```

**usage 字段说明**：
- `prompt_tokens`: 输入 token 数
- `completion_tokens`: 输出 token 数（包含思考 tokens）
- `total_tokens`: 总 token 数
- `prompt_cache_hit_tokens`: 命中缓存的 token 数
- `prompt_cache_miss_tokens`: 未命中缓存的 token 数
- `completion_tokens_details.reasoning_tokens`: 思考过程使用的 token 数

## 5. Function Calling（工具调用）

### 5.1 基本工具调用

```http
POST /chat/completions HTTP/1.1
Host: api.deepseek.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "deepseek-v4-pro",
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

**工具调用响应**：

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek-v4-pro",
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

### 5.2 工具结果返回

```python
# 将工具调用结果返回给模型
messages.append({
    "role": "tool",
    "tool_call_id": "call_abc123",
    "content": "北京今天天气：晴，温度 24℃"
})
```

### 5.3 Strict 模式（Beta）

启用严格模式确保输出符合 JSON Schema：

```http
POST /chat/completions HTTP/1.1
Host: api.deepseek.com/beta
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "deepseek-v4-pro",
  "messages": [
    {"role": "user", "content": "查询北京天气"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "strict": true,
        "description": "获取指定城市的天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称"
            }
          },
          "required": ["city"],
          "additionalProperties": false
        }
      }
    }
  ]
}
```

**Strict 模式要求**：
- 设置 `base_url="https://api.deepseek.com/beta"`
- 所有 function 均需设置 `strict: true`
- 所有属性必须设置为 `required`
- `additionalProperties` 必须为 `false`

### 5.4 支持的 JSON Schema 类型

| 类型 | 说明 | 支持的参数 |
|------|------|-----------|
| `object` | 包含键值对的深层结构 | `properties`, `required`, `additionalProperties` |
| `string` | 字符串类型 | `pattern`, `format`（支持 email, hostname, ipv4, ipv6, uuid） |
| `number` | 数字类型 | `const`, `default`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |
| `integer` | 整数类型 | `const`, `default`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |
| `boolean` | 布尔类型 | - |
| `array` | 数组类型 | `items`（不支持 `minItems`, `maxItems`） |
| `enum` | 枚举类型 | - |
| `anyOf` | 匹配多个 schema 中的任意一个 | - |

**不支持的字段**：
- `minLength`, `maxLength`（string 类型）
- `minItems`, `maxItems`（array 类型）

### 5.5 tool_choice 选项

| 值 | 说明 |
|----|------|
| `none` | 不调用工具 |
| `auto` | 自动决定是否调用工具 |
| `required` | 必须调用工具 |
| `{"type": "function", "function": {"name": "function_name"}}` | 强制调用指定工具 |

## 6. 请求参数详解

### 6.1 必填参数

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `messages` | object[] | 对话的消息列表，最少包含 1 条消息 |
| `model` | string | 使用的模型 ID：`deepseek-v4-flash` 或 `deepseek-v4-pro` |

### 6.2 messages 消息类型

| 角色 | 必填字段 | 说明 |
|------|----------|------|
| `system` | `content`, `role` | 系统消息，用于设定模型行为 |
| `user` | `content`, `role` | 用户消息 |
| `assistant` | `content`, `role` | 助手消息（可含 `prefix`、`reasoning_content` 等扩展字段） |
| `tool` | `content`, `role`, `tool_call_id` | 工具消息，响应 tool call |

**通用可选字段**：
- `name`: 参与者名称，用于区分相同角色的参与者

**assistant 特殊字段**（Beta）：
- `prefix` (bool): 强制模型以提供的前缀内容开始回答（需设置 `base_url="https://api.deepseek.com/beta"`）
- `reasoning_content` (string): 思考模式下作为最后一条 assistant 思维链内容的输入

### 6.3 可选参数

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `thinking` | object | - | 控制思考模式与非思考模式的转换 |
| ↳ `type` | string | `enabled` | 可选值：`enabled`（思考模式）、`disabled`（非思考模式） |
| ↳ `reasoning_effort` | string | `high` | 推理强度：`high`、`max`（复杂 Agent 类请求自动设为 max） |
| `max_tokens` | integer | - | 限制生成 completion 的最大 token 数 |
| `response_format` | object | - | 指定输出格式，`{"type": "json_object"}` 启用 JSON 模式 |
| `stop` | string/string[] | - | 遇到这些词时停止生成，最多 16 个 string |
| `stream` | boolean | - | 设为 `true` 以 SSE 流式发送消息增量 |
| `stream_options` | object | - | 流式输出选项，`include_usage: true` 可在最后返回 token 用量统计 |
| `temperature` | number | 1 | 采样温度，范围 0-2，值越高输出越随机 |
| `top_p` | number | 1 | 考虑前 top_p 概率的 token，范围 0-1 |
| `tools` | object[] | - | 工具列表，最多 128 个 function |
| `tool_choice` | object/string | - | 控制工具调用行为：`none`、`auto`、`required` 或指定特定工具 |
| `logprobs` | boolean | - | 是否返回输出 token 的对数概率 |
| `top_logprobs` | integer | - | 返回每个位置 top N 的 token 对数概率（0-20） |
| `user_id` | string | - | 自定义用户 ID，用于区分用户身份和缓存隔离 |

### 6.4 已弃用参数

- `frequency_penalty`: 不再支持
- `presence_penalty`: 不再支持

## 7. JSON Output 模式

```http
POST /chat/completions HTTP/1.1
Host: api.deepseek.com
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "deepseek-v4-pro",
  "messages": [
    {"role": "system", "content": "你是一个助手，总是以 JSON 格式输出"},
    {"role": "user", "content": "列出三个编程语言及其特点"}
  ],
  "response_format": {"type": "json_object"}
}
```

**注意**：需在 system/user 消息中指示模型生成 JSON。

## 8. 上下文硬盘缓存

DeepSeek 支持上下文硬盘缓存，可显著降低长上下文场景的成本：

**缓存机制**：
- 响应中包含 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`
- `user_id` 可用于 KVCache 缓存隔离

**缓存优势**：
- 命中缓存的 token 价格更低
- 适合长上下文、多轮对话场景

## 9. Anthropic API 兼容

DeepSeek 支持 Anthropic API 格式兼容：

**Base URL**: `https://api.deepseek.com/anthropic`

**SDK 安装**：

```bash
pip install anthropic
```

**使用示例**：

```python
import anthropic

client = anthropic.Anthropic(
    base_url="https://api.deepseek.com/anthropic",
    api_key="${YOUR_API_KEY}"
)

message = client.messages.create(
    model="deepseek-v4-pro",
    max_tokens=1000,
    system="You are a helpful assistant.",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Hi, how are you?"
                }
            ]
        }
    ]
)
print(message.content)
```

**注意**：当传入不支持的模型名时，API 后端会自动将其映射到 `deepseek-v4-flash` 模型。

### Anthropic API 字段兼容性

**HTTP Header 兼容性**：

| Field | 支持状态 |
|-------|---------|
| `anthropic-beta` | 忽略 |
| `anthropic-version` | 忽略 |
| `x-api-key` | ✅ 完全支持 |

**简单字段兼容性**：

| Field | 支持状态 |
|-------|---------|
| `model` | 使用 DeepSeek 模型名替代 |
| `max_tokens` | ✅ 完全支持 |
| `container` | 忽略 |
| `mcp_servers` | 忽略 |
| `metadata` | 忽略 |
| `service_tier` | 忽略 |
| `stop_sequences` | ✅ 完全支持 |
| `stream` | ✅ 完全支持 |
| `system` | ✅ 完全支持 |
| `temperature` | ✅ 完全支持（范围 [0.0 ~ 2.0]） |
| `thinking` | ✅ 支持（`budget_tokens` 被忽略） |
| `output_config` | 仅 `effort` 支持 |
| `top_k` | 忽略 |
| `top_p` | ✅ 完全支持 |

**Tool 字段兼容性**：

| Field | 支持状态 |
|-------|---------|
| `name` | ✅ 完全支持 |
| `input_schema` | ✅ 完全支持 |
| `description` | ✅ 完全支持 |
| `cache_control` | 忽略 |

**TOOL_CHOICE 选项**：

| Value | 支持状态 |
|-------|---------|
| `none` | ✅ 完全支持 |
| `auto` | 支持（`disable_parallel_tool_use` 被忽略） |
| `any` | 支持（`disable_parallel_tool_use` 被忽略） |
| `tool` | 支持（`disable_parallel_tool_use` 被忽略） |

**Message 字段兼容性**：

| Field | 变体类型 | 子字段 | 支持状态 |
|-------|---------|--------|---------|
| `content` | string | - | ✅ 完全支持 |
| `content` | array, type="text" | `text` | ✅ 完全支持 |
| | | `cache_control` | 忽略 |
| | | `citations` | 忽略 |
| `content` | array, type="image" | - | ❌ 不支持 |
| `content` | array, type="document" | - | ❌ 不支持 |
| `content` | array, type="search_result" | - | ❌ 不支持 |
| `content` | array, type="thinking" | - | ✅ 支持 |
| `content` | array, type="redacted_thinking" | - | ❌ 不支持 |
| `content` | array, type="tool_use" | `id` | ✅ 完全支持 |
| | | `input` | ✅ 完全支持 |
| | | `name` | ✅ 完全支持 |
| | | `cache_control` | 忽略 |
| `content` | array, type="tool_result" | `tool_use_id` | ✅ 完全支持 |
| | | `content` | ✅ 完全支持 |
| | | `cache_control` | 忽略 |
| | | `is_error` | 忽略 |
| `content` | array, type="server_tool_use" | - | ❌ 不支持 |
| `content` | array, type="web_search_tool_result" | - | ❌ 不支持 |
| `content` | array, type="code_execution_tool_result" | - | ❌ 不支持 |
| `content` | array, type="mcp_tool_use" | - | ❌ 不支持 |
| `content` | array, type="mcp_tool_result" | - | ❌ 不支持 |
| `content` | array, type="container_upload" | - | ❌ 不支持 |

## 10. 错误处理

### finish_reason 可能值

| 值 | 说明 |
|----|------|
| `stop` | 模型自然停止或遇到 stop 序列 |
| `length` | 达到 max_tokens 或上下文长度限制 |
| `content_filter` | 内容触发过滤策略 |
| `tool_calls` | 模型调用了工具 |
| `insufficient_system_resource` | 系统推理资源不足 |

## 11. 最佳实践

### 11.1 模型选择

- **deepseek-v4-flash**: 适合快速响应、简单任务、成本敏感场景
- **deepseek-v4-pro**: 适合复杂推理、Agent 任务、需要更强能力的场景

### 11.2 思考模式使用

- 复杂推理任务建议开启思考模式
- 简单任务可关闭思考模式以节省 tokens
- 使用 `reasoning_effort` 控制推理强度

### 11.3 上下文缓存

- 长上下文场景利用缓存机制降低成本
- 使用 `user_id` 进行缓存隔离
- 监控 `prompt_cache_hit_tokens` 优化缓存使用

### 11.4 工具调用

- 使用 Strict 模式确保输出符合预期
- 合理设置 `tool_choice` 控制工具调用行为
- 最多支持 128 个 function

## 12. 迁移指南

### 从 OpenAI 迁移

```python
# OpenAI
from openai import OpenAI

client = OpenAI(
    api_key="sk-xxx",
    base_url="https://api.openai.com/v1"
)

# DeepSeek（仅需修改 base_url 和 api_key）
from openai import OpenAI

client = OpenAI(
    api_key="sk-xxx",
    base_url="https://api.deepseek.com"
)
```

### 从旧模型迁移

- `deepseek-chat` → `deepseek-v4-flash`
- `deepseek-reasoner` → `deepseek-v4-pro`（开启思考模式）

**注意**：旧模型名称将于 2026年7月24日 废弃。
