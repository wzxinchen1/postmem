# 腾讯云 TokenHub API 协议

## 1. 平台概述

腾讯云 TokenHub 是腾讯云推出的大模型服务平台，整合腾讯自研混元大模型及优质第三方模型，提供统一的 API 调用入口。平台**兼容 OpenAI API 和 Anthropic API 协议**，可直接使用 OpenAI SDK 快速接入。

**核心特性**：
- 协议兼容：支持 OpenAI API 和 Anthropic API 两种协议
- 多模型支持：覆盖文本生成、图像生成、视频生成、3D 生成、多模态理解等场景
- 统一鉴权：使用 API Key 进行身份验证
- 流式输出：支持 SSE（Server-Sent Events）流式响应

## 2. 接入地址

### 2.1 默认接入地址

| 地域 | OpenAI API | Anthropic API |
|------|------------|---------------|
| 广州 | `https://tokenhub.tencentmaas.com/v1` | `https://tokenhub.tencentmaas.com` |
| 新加坡 | `https://tokenhub-intl.tencentmaas.com/v1` | `https://tokenhub-intl.tencentmaas.com` |

### 2.2 备用接入地址（异常情况使用）

| 地域 | OpenAI API | Anthropic API |
|------|------------|---------------|
| 广州 | `https://tokenhub.tencentmaas.cn/v1` | `https://tokenhub.tencentmaas.cn` |
| 新加坡 | `https://tokenhub-intl.tencentmaas.cn/v1` | `https://tokenhub-intl.tencentmaas.cn` |

## 3. 鉴权方式

使用 **API Key** 通过 `Authorization: Bearer` Header 进行鉴权。

```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**API Key 管理**：
- 在控制台「API Key 管理」页面创建
- 支持设置访问范围（指定可访问的模型/推理服务）
- 创建后请务必复制并妥善保管

## 4. OpenAI API 协议

### 4.1 基础请求格式

```http
POST /v1/chat/completions HTTP/1.1
Host: tokenhub.tencentmaas.com
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "deepseek-v3.2",
  "messages": [
    {"role": "system", "content": "你是一个有帮助的助手"},
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true
}
```

### 4.2 请求参数

| 参数名 | 必选 | 类型 | 描述 |
|--------|------|------|------|
| **model** | 是 | String | 服务 ID。平台默认服务与模型名称相同（如 `deepseek-v3.2`）；用户自定义服务格式为 `ep-xxxxxxxx` |
| **messages** | 是 | Array | 聊天上下文消息数组 |
| stream | 否 | Boolean | 是否启用流式输出，默认 `false` |
| temperature | 否 | Float | 输出随机性，范围 [0.0, 2.0] |
| top_p | 否 | Float | 输出多样性（核采样），范围 [0.0, 1.0] |
| max_tokens | 否 | Integer | 限制最大输出 Token 数 |
| stop | 否 | Array of String | 停止序列，最多 4 个 |
| tools | 否 | Array | Function Calling 工具定义列表 |
| tool_choice | 否 | String | 工具调用策略：`none` / `auto` / `required` |
| thinking | 否 | Object | 思考模式控制：`{"type": "enabled"}` / `{"type": "disabled"}` |
| reasoning_effort | 否 | String | 推理深度控制：`low` / `medium` / `high` |
| seed | 否 | Integer | 随机种子，用于结果复现 |

### 4.3 Messages 参数说明

| 字段 | 类型 | 描述 |
|------|------|------|
| role | String | 角色：`system`（系统提示）、`user`（用户）、`assistant`（助手）、`tool`（工具返回） |
| content | String | 消息文本内容 |

**消息顺序规则**：`[system(可选) → user → assistant → user → ...]`，必须以 `user` 角色结尾。

### 4.4 返回参数

| 参数名 | 类型 | 描述 |
|--------|------|------|
| id | String | 请求唯一标识 |
| object | String | 对象类型，固定 `chat.completion` |
| created | Integer | 创建时间（Unix 时间戳） |
| model | String | 实际使用的模型名称 |
| choices | Array | 候选结果列表 |
| usage | Object | Token 消耗统计 |

**choices 数组元素**：

| 字段 | 类型 | 描述 |
|------|------|------|
| index | Integer | 选项索引 |
| message | Object | 回复消息，包含 `role` 和 `content` |
| finish_reason | String | 结束原因：`stop`（正常结束）、`length`（达到最大长度）、`tool_calls`（需要调用工具） |

**usage 对象**：

| 字段 | 类型 | 描述 |
|------|------|------|
| prompt_tokens | Integer | 输入 Token 数 |
| completion_tokens | Integer | 输出 Token 数 |
| total_tokens | Integer | 总 Token 数（按此计费） |
| prompt_tokens_details.cached_token | Integer | 缓存 Token 数 |
| completion_tokens_details.reasoning_tokens | Integer | 推理 Token 数 |

### 4.5 返回示例

```json
{
  "id": "5e9c7ae9-e0e4-4ec1-bbd0-22bcfda61e45",
  "object": "chat.completion",
  "model": "deepseek-v3.1-terminus",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！很高兴见到你！..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 244,
    "total_tokens": 254,
    "prompt_tokens_details": {
      "cached_token": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
```

### 4.6 流式响应格式

采用 **SSE（Server-Sent Events）** 格式：

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v3.2","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v3.2","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v3.2","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v3.2","choices":[{"index":0,"delta":{"content":"计"},"finish_reason":null}]}
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v3.2","choices":[{"index":0,"delta":{"content":"算"},"finish_reason":null}]}

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-v3.2","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

// 最终结束标记
data: [DONE]
```

**流式返回特点**：
- 使用 `delta` 字段替代 `message` 字段
- 每个数据块包含增量内容
- 最后返回 `data: [DONE]` 标识结束

## 5. Anthropic API 协议

### 5.1 请求端点

```
POST /v1/messages
```

### 5.2 HTTP Headers

| 字段 | 支持状态 | 说明 |
|------|----------|------|
| anthropic-beta | 忽略 | 不处理此头部 |
| anthropic-version | 忽略 | 不处理此头部 |
| x-api-key | 完全支持 | 用于身份验证 |

### 5.3 请求参数支持情况

| 字段 | 支持状态 | 说明 |
|------|----------|------|
| model | 支持 | 使用模型列表中的参数值 |
| max_tokens | 完全支持 | 最大输出令牌数 |
| container | 忽略 | 不处理 |
| mcp_servers | 忽略 | 不处理 |
| metadata | 忽略 | 不处理 |
| service_tier | 忽略 | 不处理 |
| stop_sequences | 完全支持 | 停止序列 |
| stream | 完全支持 | 流式响应 |
| system | 完全支持 | 系统消息 |
| temperature | 完全支持 | 温度参数 (0.0-2.0) |
| thinking | 忽略 | 不处理 |
| top_k | 忽略 | 不处理 |
| top_p | 完全支持 | Top-p 采样 |

### 5.4 工具支持

| 字段 | 支持状态 |
|------|----------|
| name | 完全支持 |
| input_schema | 完全支持 |
| description | 完全支持 |
| cache_control | 忽略 |

**tool_choice 支持**：
- 字符串格式：`none`、`auto`、`any`、`tool` 均完全支持
- `disable_parallel_tool_use`：忽略

### 5.5 消息字段支持

| 字段类型 | 变体 | 支持状态 |
|----------|------|----------|
| content | string | 完全支持 |
| content | array, type="text" | 完全支持 |
| content | array, type="image" | **不支持** |
| content | array, type="document" | **不支持** |
| content | array, type="tool_use" | 完全支持 |
| content | array, type="tool_result" | 完全支持 |

### 5.6 流式返回示例

```http
data: {"content_block":{"text":"","type":"text"},"index":1,"type":"content_block_start"}

event: content_block_delta
data: {"delta":{"text":"Hey","type":"text_delta"},"index":0,"type":"content_block_delta"}

event: message_delta
data: {"delta":{"stop_reason":"end_turn","stop_sequence":null},"type":"message_delta","usage":{"output_tokens":57}}

event: message_stop
data: {"type":"message_stop"}
```

## 6. Function Calling（工具调用）

### 6.1 请求示例

```http
POST /v1/chat/completions HTTP/1.1
Host: tokenhub.tencentmaas.com
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "deepseek-v3.1-terminus",
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

### 6.2 工具调用响应

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek-v3.1-terminus",
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

## 7. 错误响应格式

### 7.1 OpenAI 兼容协议错误格式

```json
{
  "error": {
    "type": "<错误类型>",
    "code": "<业务错误码>",
    "message": "<错误描述>",
    "source": "client | gateway | upstream",
    "upstream_code": "<上游错误码，仅上游错误时返回>",
    "upstream_status": "<上游 HTTP 状态码，仅上游错误时返回>",
    "request_id": "<请求唯一标识>"
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 错误类型，用于程序判断错误大类 |
| code | string | 平台业务错误码（如 401002），用于精确定位问题 |
| message | string | 可读的错误描述 |
| source | string | 错误来源：client（请求端）、gateway（网关）、upstream（上游服务） |
| upstream_code | string | 上游服务原始错误码，仅当 source=upstream 时出现 |
| upstream_status | number | 上游服务 HTTP 状态码，仅当 source=upstream 时出现 |
| request_id | string | 请求 ID，用于问题排查和提交工单 |

### 7.2 Anthropic 兼容协议错误格式

```json
{
  "type": "error",
  "error": {
    "type": "<错误类型>",
    "message": "<错误描述>",
    "reqid": "<请求唯一标识>"
  }
}
```

**与 OpenAI 协议的区别**：
- 外层多一个 `"type": "error"`
- 不返回 `code` 字段
- 请求 ID 字段名为 `reqid`（而非 `request_id`）
- 不返回 `source` 字段

## 8. HTTP 状态码与错误类型

| HTTP 状态码 | 错误类型 | 含义 |
|-------------|----------|------|
| 400 | invalid_request_error | 请求参数不合法 |
| 401 | authentication_error | API Key 无效 / 鉴权失败 |
| 402 | permission_error | 套餐或计费限制 |
| 403 | permission_error | 权限不足 / 白名单限制 |
| 429 | rate_limit_error | 限流触发 |
| 451 | content_filter_error | 内容安全拦截 |
| 502 | upstream_error | 上游模型服务报错 |
| 503 | service_unavailable | 网关 / 依赖服务不可用 |
| 504 | timeout_error | 超时 |
| 410 | server_error | 会话亲和失效 |
| 499 | server_error | 客户端主动取消 |

## 9. 业务错误码列表

### 9.1 400 系列（请求错误）

| 业务码 | 名称 | 触发场景 |
|--------|------|----------|
| 400001 | CodeInvalidRequest | 请求体不是合法 JSON 或为空 |
| 400002 | CodeInvalidParameter | 必填字段缺失或字段值非法 |
| 400003 | CodeInputTooLong | 输入 token 数超出模型上下文窗口 |
| 400004 | CodeModelNotFound | 请求的 model 在平台不存在 |
| 400005 | CodeUnsupportedModel | 模型不支持当前请求协议或能力 |
| 400006 | CodeUnsupportedFormat | 请求的 response_format 或输出格式不被模型支持 |

### 9.2 401 系列（认证错误）

| 业务码 | 名称 | 触发场景 |
|--------|------|----------|
| 401001 | CodeUnauthorized | 未携带任何认证信息，或认证方式无法识别 |
| 401002 | CodeInvalidAPIKey | API Key 不存在或签名校验失败 |
| 401003 | CodeAPIKeyExpired | API Key 已超过有效期 |
| 401004 | CodeAPIKeyDisabled | API Key 被主动禁用或被后台封禁 |
| 401005 | CodeSignatureInvalid | CAM / 自定义签名校验不通过 |
| 401006 | CodeInvalidEndpoint | Endpoint 不存在或模型与 Endpoint 不匹配 |

### 9.3 402/403 系列（权限与计费）

| 业务码 | 名称 | 触发场景 |
|--------|------|----------|
| 401007 | CodeEndpointNoFreePackage | Endpoint 下无可用免费套餐 |
| 401008 | CodeEndpointFreeQuotaExhausted | Endpoint 免费配额已耗尽 |
| 403001 | CodePermissionDenied | 套餐包被禁用，或无调用权限 |
| 403002 | CodeModelAccessDenied | API Key 未被授权访问该模型 |
| 403003 | CodeAccountBlocked | 账号（UIN）被后台封禁 |
| 403004 | CodeInsufficientBalance | 账户欠费隔离，计费服务冻结 |
| 403005 | CodeIPNotAllowed | 来源 IP 不在 API Key 白名单内 |

### 9.4 429 系列（限流）

| 业务码 | 名称 | 触发场景 |
|--------|------|----------|
| 429001 | CodeRateLimitExceeded | 综合限流触发 |
| 429002 | CodeRPMLimitExceeded | 每分钟请求数（RPM）超限 |
| 429003 | CodeTPMLimitExceeded | 每分钟 token 数（TPM）超限 |
| 429004 | CodeTPDLimitExceeded | 每日 token 数（TPD）超限 |
| 429005 | CodeConcurrencyLimitExceeded | 并发数超限 |

### 9.5 4xx 其他

| 业务码 | 名称 | 触发场景 |
|--------|------|----------|
| 499001 | CodeRequestCanceled | 客户端主动断开连接 |
| 410001 | CodeSessionExpired | 会话亲和绑定的 provider 下线 |
| 451001 | CodeContentFiltered | 输入或输出触发内容安全策略 |

### 9.6 5xx 系列（服务端错误）

| 业务码 | 名称 | 触发场景 |
|--------|------|----------|
| 500001 | CodeInternalError | 网关内部未预期错误 |
| 502001 | CodeUpstreamError | 上游模型服务返回 5xx 或不可达 |
| 503001 | CodeServiceUnavailable | 网关自身或关键依赖服务不可用 |
| 504001 | CodeGatewayTimeout | 上游响应超时，网关主动中断 |

## 10. 特殊错误情况

### 10.1 链路短路返回

错误在请求链路早期被拦截时，返回简化格式：

```json
{
  "error": {
    "type": "gateway_error",
    "code": "401002",
    "message": "invalid api key",
    "request_id": "req-123"
  }
}
```

- `type` 固定为 `gateway_error`
- 没有 `source`、`upstream_code`、`upstream_status` 字段

### 10.2 请求体超限（HTTP 413）

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "request body too large, max allowed is 2097152 bytes"
  }
}
```

### 10.3 服务内部异常（HTTP 500）

```json
{
  "error": {
    "type": "server_error",
    "message": "internal server error"
  }
}
```

## 11. SDK 使用示例

### 11.1 Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://tokenhub.tencentmaas.com/v1"
)

# 非流式调用
response = client.chat.completions.create(
    model="deepseek-v3.1-terminus",
    messages=[
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "请用一句话解释什么是大语言模型"}
    ]
)
print(response.choices[0].message.content)

# 流式调用
stream = client.chat.completions.create(
    model="deepseek-v3.1-terminus",
    messages=[
        {"role": "user", "content": "解释量子计算的基本原理"}
    ],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### 11.2 Node.js SDK

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: 'YOUR_API_KEY',
    baseURL: 'https://tokenhub.tencentmaas.com/v1',
});

// 非流式调用
const response = await client.chat.completions.create({
    model: 'deepseek-v3.1-terminus',
    messages: [
        { role: 'system', content: '你是一个有帮助的助手。' },
        { role: 'user', content: '请用一句话解释什么是大语言模型' },
    ],
});
console.log(response.choices[0].message.content);

// 流式调用
const stream = await client.chat.completions.create({
    model: 'deepseek-v3.1-terminus',
    messages: [
        { role: 'user', content: '解释量子计算的基本原理' }
    ],
    stream: true,
});
for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### 11.3 cURL 示例

```bash
# 非流式调用
curl -X POST 'https://tokenhub.tencentmaas.com/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-v3.2",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# 流式调用
curl -X POST 'https://tokenhub.tencentmaas.com/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-v3.2",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

## 12. 注意事项

1. **思考模式下的工具调用**：需在每一轮请求都回填历史 `reasoning_content`
2. **Anthropic API 限制**：不支持图像、文档类型内容；`cache_control` 相关字段被忽略
3. **工具并行调用**：`disable_parallel_tool_use` 参数在 Anthropic API 中被忽略
4. **API Key 保管**：创建后请务必复制并妥善保管 API Key
5. **模型选择**：修改 `model` 字段可更换调用的模型，具体值参见模型列表
6. **免费额度**：新用户可领取免费体验包，具体额度以控制台显示为准

## 13. 问题排查

如需联系腾讯云技术支持，请提供：
1. **Request ID**（错误响应中的 `request_id` 或 `reqid`）
2. **请求时间**
3. **请求参数**（model 名称、endpoint 等）
4. **完整的错误响应 JSON**
