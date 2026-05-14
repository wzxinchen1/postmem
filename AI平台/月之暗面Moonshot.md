# 月之暗面 Moonshot API 协议

## 1. 基础信息

### 1.1 服务地址

- **Base URL**: `https://api.moonshot.cn`
- **API 端点**: `https://api.moonshot.cn/v1`
- **控制台**: https://platform.kimi.com

### 1.2 OpenAI 兼容性

Kimi API 完全兼容 OpenAI Chat Completions API 协议：

| 特性 | 说明 |
|------|------|
| SDK 兼容 | 可直接使用 OpenAI 官方 SDK（Python / Node.js） |
| 框架支持 | LangChain、Dify、Coze 等第三方工具 |
| 切换方式 | 只需将 `base_url` 指向 `https://api.moonshot.cn/v1` |

### 1.3 认证方式

所有 API 请求需在 HTTP 头中携带 API Key：

```http
Authorization: Bearer $MOONSHOT_API_KEY
```

- API Key 可在 [Kimi 开放平台控制台](https://platform.kimi.com) 创建和管理
- **安全提示**: 请勿在客户端代码、公开仓库或日志中暴露 API Key

### 1.4 SDK 安装

#### Python

```bash
pip install --upgrade 'openai>=1.0'
```

#### 初始化客户端

```python
from openai import OpenAI

client = OpenAI(
    api_key="$MOONSHOT_API_KEY",
    base_url="https://api.moonshot.cn/v1",
)
```

**版本要求**:
- Python ≥ 3.7.1
- Node.js ≥ 18
- OpenAI SDK ≥ 1.0.0

## 2. 基础请求格式

### 2.1 标准请求

```http
POST /v1/chat/completions HTTP/1.1
Host: api.moonshot.cn
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "kimi-k2.6",
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true
}
```

### 2.2 通用请求头

| 请求头 | 值 | 说明 |
|--------|-----|------|
| Content-Type | application/json | 请求体格式 |
| Authorization | Bearer $MOONSHOT_API_KEY | 认证令牌 |

## 3. 模型列表

### 3.1 可用模型

| 模型名称 | 特点描述 | 缓存命中 | 输入价格 | 输出价格 |
|---------|---------|---------|---------|---------|
| **Kimi K2.6** | 最新最智能模型，长程代码编写能力更强更稳，Agent自主执行能力显著增强 | ¥1.10/MTok | ¥6.50/MTok | ¥27.00/MTok |
| **Kimi K2.5** | 支持视觉与文本输入、思考与非思考模式、对话与Agent任务 | ¥0.70/MTok | ¥4.00/MTok | ¥21.00/MTok |
| **Kimi K2 0905** | MoE架构基础模型，总参数1T，激活参数32B，超强代码和Agent能力 | ¥1.00/MTok | ¥4.00/MTok | ¥16.00/MTok |
| **moonshot-v1-8k** | 8k 上下文基础模型 | - | - | - |
| **moonshot-v1-32k** | 32k 上下文模型 | - | - | - |
| **moonshot-v1-128k** | 128k 上下文模型 | - | - | - |

### 3.2 模型参数限制

**kimi-k2.6 / kimi-k2.5 系列**（设置其他值会报错）：

| 参数 | 固定值 |
|------|--------|
| `temperature` | thinking 模式: 1.0；非 thinking 模式: 0.6 |
| `top_p` | 0.95 |
| `n` | 1 |
| `presence_penalty` | 0.0 |
| `frequency_penalty` | 0.0 |

> 建议不要手动设置这些字段，使用默认值。

**moonshot-v1 系列**支持自定义以下参数：

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `temperature` | float | 0.0 | 采样温度，范围 [0, 1] |
| `top_p` | float | 1.0 | 核采样，范围 [0, 1] |
| `n` | integer | 1 | 每次请求返回的回复数，最大 5 |
| `presence_penalty` | float | 0 | 存在惩罚，范围 [-2, 2] |
| `frequency_penalty` | float | 0 | 频率惩罚，范围 [-2, 2] |

## 4. Thinking 模式（思考链）

### 4.1 启用思考模式

Kimi K2.5/K2.6 支持思考链，会在生成最终回答前进行内部推理：

```http
POST /v1/chat/completions HTTP/1.1
Host: api.moonshot.cn
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "kimi-k2.6",
  "messages": [
    {"role": "user", "content": "请分析：为什么天空是蓝色的？"}
  ],
  "thinking": {"type": "enabled"},
  "max_completion_tokens": 16000,
  "stream": true
}
```

### 4.2 Thinking 参数说明

```json
"thinking": {"type": "enabled"}   // 默认，启用思考
"thinking": {"type": "disabled"}  // 禁用思考
"thinking": {"type": "enabled", "keep": "all"}  // 保留历史对话的思考内容
```

**关键说明**:
- 思考过程通过 `reasoning_content` 字段返回，**可见**
- `reasoning_content` 通常比 `content` 长 3-5 倍
- 思考 tokens 会占用上下文窗口并计费
- 使用 `max_completion_tokens` 控制总 token 数（思考 + 回答）
- 启用 thinking 时，`tool_choice` 只能是 `"auto"` 或 `"none"`

**重要提示**:
- ⚠️ 工具调用结果中的 `reasoning_content` 必须原样保留在下一轮 messages 中
- ⚠️ Thinking 模式 token 消耗约为普通模式的 **2-4 倍**
- ⚠️ 建议对简单任务关闭 thinking 模式以节省成本

### 4.3 Python SDK 调用方式

```python
from openai import OpenAI

client = OpenAI(
    api_key="$MOONSHOT_API_KEY",
    base_url="https://api.moonshot.cn/v1",
)

response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[
        {"role": "user", "content": "请分析：为什么天空是蓝色的？"}
    ],
    extra_body={
        "thinking": {"type": "enabled"}  # 通过 extra_body 传入
    },
    max_completion_tokens=16000
)

message = response.choices[0].message

# 输出思考过程
if hasattr(message, 'reasoning_content') and message.reasoning_content:
    print("=== 思考过程 ===")
    print(message.reasoning_content)

# 输出最终回答
print("=== 最终回答 ===")
print(message.content)
```

## 5. 请求参数详解

### 5.1 核心参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `model` | string | ✅ | 模型 ID，如 `kimi-k2.6`、`moonshot-v1-128k` |
| `messages` | array | ✅ | 对话消息列表，每条含 role 和 content |
| `stream` | boolean | ❌ | 是否流式返回，默认 `false` |
| `max_completion_tokens` | integer | ❌ | 最大输出 token 数，默认 1024 |
| `stop` | string/array | ❌ | 停用词，最多 5 个，每个不超过 32 字节 |
| `response_format` | object | ❌ | 输出格式控制 |
| `tools` | array | ❌ | 工具定义，最多 128 个 |
| `stream_options` | object | ❌ | 流式选项，如 `{include_usage: true}` |
| `prompt_cache_key` | string | ❌ | 缓存键，用于提高 KV 缓存命中率 |

> ⚠️ **已废弃**: `max_tokens` 已替换为 `max_completion_tokens`

### 5.2 Messages 格式

**role 支持**: `system`、`user`、`assistant`

#### 纯文本消息

```json
{"role": "user", "content": "你好"}
```

#### 多模态消息（图片/视频）

```json
{
  "role": "user",
  "content": [
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}},
    {"type": "text", "text": "请描述这张图片"}
  ]
}
```

**支持的 content 类型**：

| type | 说明 | url 格式 |
|------|------|----------|
| `text` | 文本内容 | — |
| `image_url` | 图片（PNG/JPEG/WebP/GIF） | `data:image/png;base64,...` 或 `ms://<file_id>` |
| `video_url` | 视频（MP4/MPEG/MOV 等） | `data:video/mp4;base64,...` 或 `ms://<file_id>` |

#### Partial Mode 消息

```json
{
  "role": "assistant",
  "content": "尊敬的用户您好，",
  "partial": true
}
```

> **注意**: `partial` 字段写在 messages 中 assistant 消息上，不是顶层请求参数

### 5.3 Response Format 参数

```json
{"type": "text"}           // 默认，纯文本
{"type": "json_object"}    // JSON 模式，保证输出为合法 JSON
{"type": "json_schema", "json_schema": {"name": "...", "schema": {...}}}  // 结构化输出
```

## 6. 流式响应报文示例

### 6.1 标准流式响应

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"kimi-k2.6","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"kimi-k2.6","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"kimi-k2.6","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"kimi-k2.6","choices":[{"index":0,"delta":{"content":"计"},"finish_reason":null}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"kimi-k2.6","choices":[{"index":0,"delta":{"content":"算"},"finish_reason":null}]}

// ... 更多内容块

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"kimi-k2.6","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":50000,"completion_tokens":200,"total_tokens":50200}}

// 最终结束标记
data: [DONE]
```

### 6.2 Thinking 模式流式响应

流式模式下 `reasoning_content` 和 `content` 是独立字段，需分别监听：

```python
stream = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[...],
    extra_body={"thinking": {"type": "enabled"}},
    max_completion_tokens=16000,
    stream=True
)

for chunk in stream:
    delta = chunk.choices[0].delta
    
    # 处理思考内容流
    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
        print(delta.reasoning_content, end='', flush=True)
    
    # 处理最终回答流
    elif delta.content:
        print(delta.content, end='', flush=True)
```

### 6.3 字段说明

- `delta.role`: 仅在第一个块中出现，标识角色为 assistant
- `delta.content`: 增量文本内容，需要拼接
- `delta.reasoning_content`: 思考过程的增量内容（thinking 模式）
- `finish_reason`: 结束原因
  - `stop`: 正常结束
  - `length`: 达到 token 限制
  - `tool_calls`: 需要调用工具
  - `null`: 未结束
- `data: [DONE]`: 流式传输结束标记

## 7. Function Calling（工具调用）

### 7.1 工具定义格式

```http
POST /v1/chat/completions HTTP/1.1
Host: api.moonshot.cn
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "kimi-k2.6",
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
        },
        "strict": true
      }
    }
  ],
  "tool_choice": "auto"
}
```

### 7.2 function 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 函数名称，需符合正则：`^[a-zA-Z_][a-zA-Z0-9-_]$`，建议使用易理解的英文名 |
| `description` | string | ✅ | 功能描述，帮助模型判断和选择工具 |
| `parameters` | object | ✅ | JSON Schema 子集，root 必须是 object（详见 MFJS 规范） |
| `strict` | boolean | ❌ | 是否严格按 schema 约束输出，默认 `true` |

**strict 参数说明**:
- **`true`（默认）**: 系统严格按照 parameters schema 约束输出，schema 需符合 MFJS 规范
- **`false`**: 仅保证输出为合法 JSON 对象，不强制约束内部结构

**限制**:
- **tools 的 function 个数上限**: 128 个

### 7.3 工具调用响应

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "kimi-k2.6",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "reasoning_content": "用户想查询北京的天气，我需要调用 get_weather 函数...",
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

### 7.4 多轮工具调用

```python
# 第一轮：模型发起工具调用
response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[
        {"role": "user", "content": "北京今天天气怎么样？"}
    ],
    tools=[...]
)

# 获取工具调用结果
tool_call = response.choices[0].message.tool_calls[0]
tool_result = get_weather(json.loads(tool_call.function.arguments)["city"])

# 第二轮：将工具结果返回给模型
response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[
        {"role": "user", "content": "北京今天天气怎么样？"},
        response.choices[0].message,  # 包含 reasoning_content 和 tool_calls
        {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(tool_result)
        }
    ],
    tools=[...]
)
```

**重要提示**:
- ⚠️ 启用 thinking 模式时，每一轮 assistant 消息中的 `reasoning_content` 必须原样传回，否则会报错
- ⚠️ 工具调用结果必须包含 `tool_call_id` 字段

### 7.5 官方工具集

| 工具名称 | 功能描述 |
|---------|---------|
| **WEB SEARCH** | 联网搜索，获取最新资讯，引用权威来源 |
| **RETHINK** | 智能整理想法工具 |
| **RANDOM-CHOICE** | 随机选择工具 |
| **MEMORY** | 记忆存储和检索系统，支持对话历史、用户偏好持久化 |
| **EXCEL** | Excel和CSV文件分析工具 |
| **CODE-RUNNER** | Python代码执行工具 |
| **QUICK JS** | 使用QuickJS引擎安全执行JavaScript代码 |
| **DATE** | 日期时间处理工具 |
| **FETCH** | URL内容提取并格式化为Markdown |
| **CONVERT** | 单位转换工具（物理学单位、货币等） |
| **BASE 64** | 编码与解码工具 |

## 8. 响应格式详解

### 8.1 非流式响应

```json
{
  "id": "cmpl-04ea926191a14749b7f2c7a48a68abc6",
  "object": "chat.completion",
  "created": 1698999496,
  "model": "kimi-k2.6",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "1+1=2。",
        "reasoning_content": "这是一个简单的加法运算..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 21,
    "total_tokens": 40,
    "cached_tokens": 10
  }
}
```

### 8.2 finish_reason 取值

| 值 | 含义 |
|----|------|
| `stop` | 正常结束 |
| `length` | 达到 `max_completion_tokens` 限制 |
| `tool_calls` | 模型发起了工具调用 |

### 8.3 usage 字段说明

| 字段 | 说明 |
|------|------|
| `prompt_tokens` | 输入 token 数量 |
| `completion_tokens` | 输出 token 数量（包含思考内容） |
| `total_tokens` | 总 token 数量 |
| `cached_tokens` | 使用了 KV Cache 的 token 数量，命中缓存的 token 不会重复计费 |

## 9. 错误处理

### 9.1 错误响应格式

请求失败时返回 JSON 格式错误响应：

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "Invalid parameter: temperature"
  }
}
```

### 9.2 常见 HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求错误（参数错误、格式错误等） |
| 401 | 认证失败（API Key 无效或缺失） |
| 429 | 速率限制（超过配额） |
| 500 | 服务端错误 |

### 9.3 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 没有 `reasoning_content` 字段 | 未启用 thinking 模式 | 添加 `"thinking": {"type": "enabled"}` |
| 思考内容被截断 | `max_completion_tokens` 设置过小 | 设置为 ≥ 16000 |
| Python 调用无效 | 参数传递方式错误 | 使用 `extra_body={"thinking": {"type": "enabled"}}` |
| kimi-k2.6 能设置 temperature 吗？ | 不能手动设置 | thinking 模式强制 1.0，非 thinking 模式 0.6 |
| 工具调用时 reasoning_content 必须保留吗？ | 是的 | 每一轮 assistant 消息中的 reasoning_content 必须原样传回 |
| kimi-k2.6 不支持 n>1 吗？ | 不支持 | 如需多个回复选项，可用 moonshot-v1 系列（支持 n 最大 5） |

## 10. API 端点一览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | 创建对话补全 |
| `/v1/models` | GET | 列出模型 |
| `/v1/tokenizers/estimate-token-count` | POST | 计算 Token |
| `/v1/users/me/balance` | GET | 查询余额 |
| `/v1/files` | POST | 上传文件 |
| `/v1/files` | GET | 列出文件 |
| `/v1/files/{file_id}` | GET | 获取文件信息 |
| `/v1/files/{file_id}` | DELETE | 删除文件 |
| `/v1/files/{file_id}/content` | GET | 获取文件内容 |

## 11. 代码示例

### 11.1 TypeScript

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: "https://api.moonshot.cn/v1",
});

const response = await client.chat.completions.create({
  model: "kimi-k2.6",
  messages: [
    { role: "user", content: "1+1 等于多少？" },
  ],
});

console.log(response.choices[0].message.content);
```

### 11.2 cURL

```bash
curl https://api.moonshot.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MOONSHOT_API_KEY" \
  -d '{
    "model": "kimi-k2.6",
    "messages": [
      {"role": "user", "content": "你好！"}
    ]
  }'
```

### 11.3 Python（带思考模式）

```python
from openai import OpenAI

client = OpenAI(
    api_key="$MOONSHOT_API_KEY",
    base_url="https://api.moonshot.cn/v1",
)

response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[
        {"role": "user", "content": "请分析：为什么天空是蓝色的？"}
    ],
    extra_body={
        "thinking": {"type": "enabled"}
    },
    max_completion_tokens=16000
)

message = response.choices[0].message

if hasattr(message, 'reasoning_content') and message.reasoning_content:
    print("=== 思考过程 ===")
    print(message.reasoning_content)

print("=== 最终回答 ===")
print(message.content)
```

## 12. 最佳实践

### 12.1 成本优化

- 使用 `prompt_cache_key` 提高 KV 缓存命中率
- 对简单任务关闭 thinking 模式
- 合理设置 `max_completion_tokens` 避免浪费
- 使用 `cached_tokens` 监控缓存命中情况

### 12.2 性能优化

- 使用流式输出提升用户体验
- 合理使用 Partial Mode 实现渐进式响应
- 利用官方工具集减少自定义开发

### 12.3 安全建议

- 不要在客户端代码中暴露 API Key
- 使用环境变量存储敏感信息
- 定期轮换 API Key
- 监控 API 使用情况，及时发现异常

## 13. 相关资源

- **官方文档**: https://platform.kimi.com/docs
- **完整文档索引**: https://platform.kimi.com/docs/llms.txt
- **API 控制台**: https://platform.kimi.com
- **MFJS 规范**: JSON Schema 子集规范
- **兼容平台**: Coze、Bisheng、Dify、LangChain 等 Agent 平台
