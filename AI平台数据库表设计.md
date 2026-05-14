# AI 平台数据库表设计文档

> 基于对 AI平台 文件夹中 20 个平台文档的深度分析，提取出的差异点和需要的数据库表结构。

---

## 一、平台差异点分析

### 1. 认证方式差异

| 平台 | 认证方式 | Header 名称 | 认证格式 | 特殊说明 |
|------|---------|------------|---------|---------|
| OpenAI | Bearer Token | `Authorization` | `Bearer sk-xxx` | 标准方式 |
| Anthropic Claude | API Key Header | `x-api-key` | `sk-ant-xxx` | 需额外 `anthropic-version` 头 |
| Microsoft Azure OpenAI | API Key 或 Entra ID | `api-key` 或 `Authorization` | `Bearer token` | 支持 Entra ID 自动刷新 |
| 智谱AI | Bearer Token 或 JWT | `Authorization` | `Bearer xxx` 或 JWT 签名 | JWT 用于高安全场景 |
| 百度文心一言 | Access Token | URL 参数 | `?access_token=xxx` | 需先获取 token |
| 腾讯混元 | 签名鉴权 | `Authorization` | 签名计算 | 需 SecretId + SecretKey |
| 讯飞星辰 (WebSocket) | 签名鉴权 | URL 参数 | 签名计算 | 需 APIKey + APISecret |
| 讯飞星辰 (HTTP) | Bearer Token | `Authorization` | `Bearer xxx` | MaaS 平台 |
| Google Gemini | API Key | URL 参数 | `?key=xxx` | 无 Bearer 前缀 |
| 其他平台 | Bearer Token | `Authorization` | `Bearer xxx` | 标准方式 |

**需要存储的字段**:
- 认证类型 (bearer, api-key-header, jwt, signature, access-token, url-param)
- Header 名称 (Authorization, x-api-key, api-key 等)
- Header 格式模板 (Bearer {key}, {key} 等)
- 额外必需的 Headers (如 anthropic-version)
- 是否需要预获取 token (如百度)
- 签名算法 (如腾讯、讯飞的 HMAC-SHA256)

---

### 2. 请求路径差异

| 平台 | Base URL | 请求路径 | 路径参数 | 说明 |
|------|---------|---------|---------|------|
| OpenAI | `api.openai.com` | `/v1/chat/completions` | 无 | 标准路径 |
| Anthropic Claude | `api.anthropic.com` | `/v1/messages` | 无 | 不同端点 |
| Microsoft Azure OpenAI | `{resource}.openai.azure.com` | `/openai/deployments/{deployment-id}/chat/completions` | deployment-id, api-version | 需部署名称 |
| Google Gemini | `generativelanguage.googleapis.com` | `/v1/models/{model}:generateContent` | model | 模型在路径中 |
| 腾讯混元 | `hunyuan.tencentcloudapi.com` | `/` | 无 | 通过 Header 指定 Action |
| 百度文心一言 | `aip.baidubce.com` | `/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions` | access_token | token 在 URL |
| 讯飞星辰 (WebSocket) | `spark-api.xf-yun.com` | `/v4.0/chat` | 无 | WebSocket 协议 |
| 阿里云百炼 | `dashscope.aliyuncs.com` | `/compatible-mode/v1/chat/completions` | 无 | OpenAI 兼容 |
| 智谱AI | `open.bigmodel.cn` | `/api/paas/v4/chat/completions` | 无 | 自定义路径 |

**需要存储的字段**:
- Base URL 模板 (支持变量替换,如 `{resource-name}`)
- 请求路径模板 (支持变量替换,如 `{deployment-id}`)
- 路径参数列表 (deployment-id, api-version, model 等)
- 查询参数列表 (api-version, access_token, key 等)
- 协议类型 (http, websocket)

---

### 3. 请求体格式差异

| 平台 | 消息字段名 | 模型字段名 | 特殊参数 | 参数位置 |
|------|-----------|-----------|---------|---------|
| OpenAI | `messages` | `model` | `reasoning_effort`, `max_completion_tokens` | 顶层 |
| Anthropic Claude | `messages` | `model` | `max_tokens`(必填), `thinking` | 顶层 |
| Google Gemini | `contents[].parts` | URL 路径 | `generationConfig`, `thinking_budget` | 嵌套结构 |
| 腾讯混元 | `Messages` (大写) | `Model` (大写) | `EnableThinking`, `StreamModeration` | 顶层,首字母大写 |
| 讯飞星辰 (WebSocket) | `payload.message.text` | `parameter.chat.domain` | `header.app_id` | 三层嵌套 |
| 百度文心一言 | `messages` | `model` | 无特殊 | 顶层 |
| DeepSeek | `messages` | `model` | `thinking`, `reasoning_effort` | 顶层 |
| 阿里云百炼 | `messages` | `model` | `enable_thinking`, `thinking_budget` | extra_body |

**需要存储的字段**:
- 请求体结构类型 (flat, nested, gemini-style, xunfei-ws)
- 消息字段路径 (messages, payload.message.text, contents[].parts)
- 模型字段路径 (model, parameter.chat.domain, URL路径)
- 参数映射规则 (哪些参数需要转换名称或位置)
- 是否需要 extra_body 传参

---

### 4. 流式响应格式差异

| 平台 | 流式格式 | 内容字段 | 思考字段 | 结束标记 |
|------|---------|---------|---------|---------|
| OpenAI | SSE | `delta.content` | 无(不可见) | `data: [DONE]` |
| Anthropic Claude | SSE (事件类型) | `text_delta` | `thinking_delta` | `message_stop` |
| DeepSeek | SSE | `delta.content` | `delta.reasoning_content` | `data: [DONE]` |
| 智谱AI | SSE | `delta.content` | `delta.reasoning_content` | `data: [DONE]` |
| 阿里云百炼 | SSE | `delta.content` | `delta.reasoning_content` | `data: [DONE]` |
| Google Gemini | SSE | `parts[].text` | `parts[].text` (thought:true) | 无明确标记 |
| 腾讯混元 | SSE | `Delta.Content` | 无 | 无明确标记 |
| 讯飞星辰 (WebSocket) | WebSocket 消息 | `text[].content` | 无 | status=2 |
| 百度文心一言 | SSE | `result` | 无 | 无明确标记 |

**需要存储的字段**:
- 流式格式类型 (sse, websocket, json-lines)
- 内容字段路径 (delta.content, text_delta, result)
- 思考字段路径 (reasoning_content, thinking_delta, parts[].thought)
- 结束标记 (data: [DONE], message_stop, status=2)
- 事件类型字段 (用于 Anthropic 的事件驱动)

---

### 5. 特殊功能支持差异

| 功能 | 支持平台 | 参数名 | 说明 |
|------|---------|--------|------|
| **思考链 (Thinking)** | OpenAI o系列, Claude, DeepSeek, 智谱, 阿里百炼, 豆包, Gemini, 腾讯混元 | `thinking`, `enable_thinking`, `thinking_budget`, `reasoning_effort`, `EnableThinking` | 不同平台参数名和格式不同 |
| **Function Calling** | 大部分平台 | `tools`, `tool_choice` | 智谱AI 仅支持 `tool_choice=auto` |
| **联网搜索** | 阿里百炼, 讯飞星辰, Kimi, n1n.ai | `enable_search`, `search_disable`, `web_search_options` | 部分平台默认开启 |
| **多模态 (图像)** | GPT-4V, Claude 3, Gemini, 通义VL, 混元-vision, Pixtral | `image_url` | 支持格式不同 |
| **多模态 (视频)** | 混元-vision-video, Gemini | `video_url` | 较少平台支持 |
| **多模态 (音频)** | GPT-4o-audio, 讯飞星辰 | `input_audio` | 较少平台支持 |
| **RAG 数据源** | Azure OpenAI | `data_sources` | Azure 专属 |
| **内容过滤** | Azure OpenAI | 自动 | 强制启用,响应中包含过滤结果 |
| **上下文缓存** | DeepSeek, 阿里百炼, 豆包 | `context_cache`, 自动 | 降低成本 |

**需要存储的字段**:
- 功能名称 (thinking, function_calling, web_search, vision, audio, video, rag, content_filter, context_cache)
- 是否支持
- 参数名映射 (不同平台的参数名)
- 参数格式 (boolean, object, string)
- 默认值
- 限制条件 (如智谱AI 的 tool_choice 仅支持 auto)

---

### 6. 错误码差异

| 平台 | 错误格式 | 错误码字段 | 常见错误码 |
|------|---------|-----------|-----------|
| OpenAI | `error.code` | 字符串 | `invalid_api_key`, `rate_limit_exceeded` |
| Anthropic Claude | `error.type` | 字符串 | `invalid_request_error`, `authentication_error` |
| Azure OpenAI | `error.code` | 字符串 | `DeploymentNotFound`, `ContentFilter` |
| 智谱AI | `error.code` | 数字 | `1000`(身份验证失败), `1301`(敏感内容) |
| 腾讯混元 | `header.code` | 数字 | `0`(成功), `10013`(敏感信息) |
| 讯飞星辰 | `header.code` | 数字 | `0`(成功), `10013`(审核不通过) |

**需要存储的字段**:
- 错误码类型 (string, number)
- 错误码字段路径
- 错误消息字段路径
- HTTP 状态码映射
- 业务错误码列表 (用于识别具体错误类型)

---

## 二、需要的数据库表

### 表 1: `providers` (提供商基础表)

**用途**: 存储每个 AI 平台的基础信息

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| id | Int | 主键 | 1 |
| name | String | 平台名称 | "OpenAI" |
| display_name | String | 显示名称 | "OpenAI" |
| description | String | 平台描述 | "OpenAI 官方 API" |
| website_url | String | 官网地址 | "https://openai.com" |
| docs_url | String | 文档地址 | "https://platform.openai.com/docs" |
| logo_url | String | Logo 地址 | "/logos/openai.png" |
| is_active | Boolean | 是否启用 | true |
| created_at | DateTime | 创建时间 | |
| updated_at | DateTime | 更新时间 | |

---

### 表 2: `provider_auth_configs` (认证配置表)

**用途**: 存储每个平台的认证方式

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| id | Int | 主键 | |
| provider_id | Int | 关联提供商 | |
| auth_type | String | 认证类型 | "bearer", "api-key-header", "jwt", "signature", "access-token", "url-param" |
| header_name | String | Header 名称 | "Authorization", "x-api-key", "api-key" |
| header_format | String | Header 格式模板 | "Bearer {key}", "{key}" |
| extra_headers | JSON | 额外必需的 Headers | `{"anthropic-version": "2023-06-01"}` |
| requires_token_fetch | Boolean | 是否需要预获取 token | false (百度为 true) |
| token_fetch_url | String | 获取 token 的 URL | (百度需要) |
| signature_algorithm | String | 签名算法 | "hmac-sha256" (腾讯、讯飞) |
| signature_params | JSON | 签名参数 | `["secret_id", "secret_key"]` |

**示例数据**:

```json
// OpenAI
{
  "auth_type": "bearer",
  "header_name": "Authorization",
  "header_format": "Bearer {key}"
}

// Anthropic Claude
{
  "auth_type": "api-key-header",
  "header_name": "x-api-key",
  "header_format": "{key}",
  "extra_headers": {"anthropic-version": "2023-06-01"}
}

// 腾讯混元
{
  "auth_type": "signature",
  "header_name": "Authorization",
  "signature_algorithm": "hmac-sha256",
  "signature_params": ["secret_id", "secret_key"]
}

// Google Gemini
{
  "auth_type": "url-param",
  "header_name": null,
  "url_param_name": "key"
}
```

---

### 表 3: `provider_endpoints` (端点配置表)

**用途**: 存储每个平台的 API 端点信息

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| id | Int | 主键 | |
| provider_id | Int | 关联提供商 | |
| endpoint_type | String | 端点类型 | "chat", "embeddings", "images", "audio", "responses" |
| protocol | String | 协议类型 | "http", "websocket" |
| base_url_template | String | Base URL 模板 | "https://api.openai.com", "https://{resource-name}.openai.azure.com" |
| path_template | String | 路径模板 | "/v1/chat/completions", "/openai/deployments/{deployment-id}/chat/completions" |
| path_params | JSON | 路径参数定义 | `["deployment-id", "model"]` |
| query_params | JSON | 查询参数定义 | `["api-version", "access_token", "key"]` |
| default_query_params | JSON | 默认查询参数 | `{"api-version": "2024-10-21"}` |
| is_default | Boolean | 是否默认端点 | true |

**示例数据**:

```json
// OpenAI Chat
{
  "endpoint_type": "chat",
  "protocol": "http",
  "base_url_template": "https://api.openai.com",
  "path_template": "/v1/chat/completions",
  "path_params": [],
  "query_params": []
}

// Azure OpenAI Chat (旧版)
{
  "endpoint_type": "chat",
  "protocol": "http",
  "base_url_template": "https://{resource-name}.openai.azure.com",
  "path_template": "/openai/deployments/{deployment-id}/chat/completions",
  "path_params": ["deployment-id"],
  "query_params": ["api-version"],
  "default_query_params": {"api-version": "2024-10-21"}
}

// Google Gemini
{
  "endpoint_type": "chat",
  "protocol": "http",
  "base_url_template": "https://generativelanguage.googleapis.com",
  "path_template": "/v1/models/{model}:generateContent",
  "path_params": ["model"],
  "query_params": ["key"]
}

// 讯飞星辰 WebSocket
{
  "endpoint_type": "chat",
  "protocol": "websocket",
  "base_url_template": "wss://spark-api.xf-yun.com",
  "path_template": "/v4.0/chat",
  "path_params": [],
  "query_params": ["authorization", "host", "date"]
}
```

---

### 表 4: `provider_request_formats` (请求格式配置表)

**用途**: 存储每个平台的请求体格式差异

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| id | Int | 主键 | |
| provider_id | Int | 关联提供商 | |
| endpoint_type | String | 端点类型 | "chat" |
| format_type | String | 格式类型 | "flat", "nested", "gemini-style", "xunfei-ws" |
| messages_field_path | String | 消息字段路径 | "messages", "payload.message.text", "contents[].parts" |
| model_field_path | String | 模型字段路径 | "model", "parameter.chat.domain", null(URL路径) |
| stream_field_path | String | 流式字段路径 | "stream", "Stream", "parameter.chat.stream" |
| params_mapping | JSON | 参数映射规则 | 见下方示例 |
| requires_extra_body | Boolean | 是否需要 extra_body | false (阿里百炼为 true) |

**params_mapping 示例**:

```json
// 腾讯混元 - 参数名首字母大写
{
  "temperature": {"path": "Temperature", "type": "float"},
  "top_p": {"path": "TopP", "type": "float"},
  "max_tokens": {"path": "MaxTokens", "type": "int"},
  "messages": {"path": "Messages", "type": "array"},
  "model": {"path": "Model", "type": "string"}
}

// Google Gemini - 嵌套结构
{
  "temperature": {"path": "generationConfig.temperature", "type": "float"},
  "max_tokens": {"path": "generationConfig.maxOutputTokens", "type": "int"},
  "messages": {"path": "contents[].parts", "type": "gemini-messages"}
}

// 讯飞星辰 WebSocket - 三层嵌套
{
  "app_id": {"path": "header.app_id", "type": "string"},
  "model": {"path": "parameter.chat.domain", "type": "string"},
  "temperature": {"path": "parameter.chat.temperature", "type": "float"},
  "messages": {"path": "payload.message.text", "type": "array"}
}
```

---

### 表 5: `provider_response_formats` (响应格式配置表)

**用途**: 存储每个平台的响应体格式差异

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| id | Int | 主键 | |
| provider_id | Int | 关联提供商 | |
| endpoint_type | String | 端点类型 | "chat" |
| stream_format | String | 流式格式 | "sse", "websocket", "json-lines" |
| content_field_path | String | 内容字段路径 | "choices[0].delta.content", "choices[0].Delta.Content" |
| reasoning_field_path | String | 思考字段路径 | "choices[0].delta.reasoning_content", "choices[0].delta.thinking_delta" |
| role_field_path | String | 角色字段路径 | "choices[0].delta.role" |
| finish_reason_field_path | String | 结束原因字段路径 | "choices[0].finish_reason", "choices[0].FinishReason" |
| usage_field_path | String | Token 统计字段路径 | "usage" |
| end_marker | String | 结束标记 | "data: [DONE]", "message_stop", "status=2" |
| event_type_field | String | 事件类型字段 | "type" (Anthropic 用) |
| supports_events | Boolean | 是否支持事件类型 | false (Anthropic 为 true) |

**示例数据**:

```json
// OpenAI
{
  "stream_format": "sse",
  "content_field_path": "choices[0].delta.content",
  "reasoning_field_path": null,
  "finish_reason_field_path": "choices[0].finish_reason",
  "end_marker": "data: [DONE]"
}

// Anthropic Claude
{
  "stream_format": "sse",
  "content_field_path": "delta.text",
  "reasoning_field_path": "delta.thinking",
  "finish_reason_field_path": "delta.stop_reason",
  "end_marker": "message_stop",
  "event_type_field": "type",
  "supports_events": true
}

// DeepSeek
{
  "stream_format": "sse",
  "content_field_path": "choices[0].delta.content",
  "reasoning_field_path": "choices[0].delta.reasoning_content",
  "finish_reason_field_path": "choices[0].finish_reason",
  "end_marker": "data: [DONE]"
}

// 讯飞星辰 WebSocket
{
  "stream_format": "websocket",
  "content_field_path": "payload.choices.text[0].content",
  "finish_reason_field_path": "header.status",
  "end_marker": "status=2"
}
```

---

### 表 6: `provider_features` (功能支持表)

**用途**: 存储每个平台支持的特殊功能

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| id | Int | 主键 | |
| provider_id | Int | 关联提供商 | |
| feature_name | String | 功能名称 | "thinking", "function_calling", "web_search", "vision", "audio", "video", "rag", "context_cache" |
| is_supported | Boolean | 是否支持 | true |
| param_name | String | 参数名 | "enable_thinking", "thinking", "EnableThinking" |
| param_format | String | 参数格式 | "boolean", "object", "string" |
| param_location | String | 参数位置 | "top-level", "extra_body", "nested" |
| default_value | JSON | 默认值 | `true`, `{"type": "enabled"}` |
| constraints | JSON | 限制条件 | `{"tool_choice": ["auto"]}` (智谱AI) |
| description | String | 功能说明 | "开启深度思考模式" |

**示例数据**:

```json
// OpenAI - 思考链 (o系列)
{
  "feature_name": "thinking",
  "is_supported": true,
  "param_name": "reasoning_effort",
  "param_format": "string",
  "param_location": "top-level",
  "default_value": "medium",
  "constraints": {"models": ["o1", "o3-mini", "o4-mini"]}
}

// Anthropic Claude - 思考链
{
  "feature_name": "thinking",
  "is_supported": true,
  "param_name": "thinking",
  "param_format": "object",
  "param_location": "top-level",
  "default_value": {"type": "enabled", "budget_tokens": 1024}
}

// 阿里百炼 - 思考链
{
  "feature_name": "thinking",
  "is_supported": true,
  "param_name": "enable_thinking",
  "param_format": "boolean",
  "param_location": "extra_body",
  "default_value": true
}

// 智谱AI - Function Calling
{
  "feature_name": "function_calling",
  "is_supported": true,
  "param_name": "tools",
  "param_format": "array",
  "param_location": "top-level",
  "constraints": {"tool_choice": ["auto"]}  // 仅支持 auto
}

// Azure OpenAI - RAG
{
  "feature_name": "rag",
  "is_supported": true,
  "param_name": "data_sources",
  "param_format": "array",
  "param_location": "top-level",
  "description": "Azure 专属 RAG 数据源集成"
}
```

---

### 表 7: `provider_error_codes` (错误码配置表)

**用途**: 存储每个平台的错误码定义

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| id | Int | 主键 | |
| provider_id | Int | 关联提供商 | |
| error_code_type | String | 错误码类型 | "string", "number" |
| error_code_path | String | 错误码字段路径 | "error.code", "header.code" |
| error_message_path | String | 错误消息字段路径 | "error.message", "header.message" |
| http_status_code | Int | HTTP 状态码 | 401, 429, 500 |
| error_code | String | 业务错误码 | "invalid_api_key", "1000", "10013" |
| error_type | String | 错误类型 | "auth", "rate_limit", "content_filter", "server_error" |
| error_message | String | 错误消息 | "API Key 无效" |
| solution | String | 解决方案 | "检查 API Key 是否正确" |

**示例数据**:

```json
// OpenAI
{"error_code": "invalid_api_key", "error_type": "auth", "error_message": "API Key 无效"}
{"error_code": "rate_limit_exceeded", "error_type": "rate_limit", "error_message": "请求频率超限"}

// 智谱AI
{"error_code": "1000", "error_type": "auth", "error_message": "身份验证失败"}
{"error_code": "10013", "error_type": "content_filter", "error_message": "用户问题涉及敏感信息"}

// Azure OpenAI
{"error_code": "DeploymentNotFound", "error_type": "invalid_request", "error_message": "部署不存在"}
{"error_code": "ContentFilter", "error_type": "content_filter", "error_message": "内容被安全过滤拦截"}
```

---

### 表 8: `models` (模型表 - 已存在,需扩展)

**用途**: 存储每个平台提供的模型信息

**需要扩展的字段**:

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| provider_id | Int | 关联提供商 | (已存在) |
| name | String | 模型名称 | "gpt-4o", "claude-sonnet-4" |
| display_name | String | 显示名称 | "GPT-4o", "Claude Sonnet 4" |
| model_type | String | 模型类型 | "chat", "embedding", "image", "audio", "video" |
| context_window | Int | 上下文窗口 | 128000, 200000 |
| max_output_tokens | Int | 最大输出 tokens | 16384, 4096 |
| supports_vision | Boolean | 支持图像 | true |
| supports_audio | Boolean | 支持音频 | false |
| supports_video | Boolean | 支持视频 | false |
| supports_function_calling | Boolean | 支持工具调用 | true |
| supports_thinking | Boolean | 支持思考链 | true |
| thinking_mode | String | 思考模式 | "hidden"(OpenAI o系列), "visible"(DeepSeek), "none" |
| input_price_per_million | Float | 输入价格($/百万tokens) | 5.0 |
| output_price_per_million | Float | 输出价格($/百万tokens) | 15.0 |
| is_active | Boolean | 是否启用 | true |
| is_default | Boolean | 是否默认 | false |

---

## 三、表关系图

```
providers (提供商基础表)
    ├── provider_auth_configs (认证配置) - 1对多
    ├── provider_endpoints (端点配置) - 1对多
    ├── provider_request_formats (请求格式) - 1对多
    ├── provider_response_formats (响应格式) - 1对多
    ├── provider_features (功能支持) - 1对多
    ├── provider_error_codes (错误码) - 1对多
    └── models (模型) - 1对多
```

---

## 四、设计优势

### 1. **结构化存储,便于查询**
- 可以快速查询"所有支持思考链的平台"
- 可以快速查询"支持 Function Calling 且 tool_choice 支持 auto/none/required 的平台"
- 可以快速查询"支持图像输入的模型"

### 2. **灵活扩展**
- 新增平台时,只需插入配置数据,无需修改代码
- 新增功能时,只需在 `provider_features` 表添加记录

### 3. **类型安全**
- TypeScript 可以根据数据库 schema 自动生成类型定义
- 避免手写 config 对象导致的类型错误

### 4. **动态适配**
- 系统可以根据配置自动适配不同平台的请求格式
- 无需为每个平台写专门的适配代码

### 5. **配置与代码分离**
- 配置存储在数据库,便于管理界面修改
- 代码只需实现通用的适配逻辑

---

## 五、下一步行动

1. **创建数据库迁移文件** - 基于上述表结构创建 Prisma schema
2. **编写 seed 数据** - 根据文档内容填充初始配置数据
3. **实现适配层** - 编写通用的请求/响应适配逻辑
4. **创建管理界面** - 提供可视化的配置管理界面

---

**文档版本**: v1.0  
**创建时间**: 2026-05-14  
**基于文档**: AI平台文件夹中 20 个平台的 API 协议文档
