# Microsoft Azure OpenAI API 协议

## 1. 基础请求格式

### 1.1 URL 结构差异

**关键差异**：Azure OpenAI 使用**部署名称**而非模型名称，且需要指定资源端点。

```http
POST /openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21 HTTP/1.1
Host: {your-resource-name}.openai.azure.com
api-key: YOUR_API_KEY
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true  // 开启流式输出
}
```

**重要说明**：
- `{your-resource-name}`: Azure OpenAI 资源名称
- `{deployment-id}`: 模型部署时指定的名称（可自定义，如 "my-gpt-4o-deployment"）
- `api-version`: API 版本参数（格式：YYYY-MM-DD）
- 认证头使用 `api-key` 而非 `Authorization: Bearer`

### 1.2 v1 API（新版推荐）

从 2025年8月起，Azure 推出 v1 API，简化了调用方式：

```http
POST /openai/v1/chat/completions HTTP/1.1
Host: {your-resource-name}.openai.azure.com
Authorization: Bearer YOUR_API_KEY_OR_TOKEN
Content-Type: application/json

{
  "model": "my-gpt-4o-deployment",  // 使用部署名称
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true
}
```

**v1 API 改进**：
- ✅ 移除 `api-version` 参数，无需每月更新
- ✅ 支持标准 OpenAI 客户端库
- ✅ 支持跨提供商模型（DeepSeek、Grok 等）
- ✅ Microsoft Entra ID 令牌自动刷新
- ✅ URL 格式统一：`https://{resource-name}.openai.azure.com/openai/v1/`

## 2. 认证方式

### 2.1 API Key 认证

```http
POST /openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21 HTTP/1.1
Host: {your-resource-name}.openai.azure.com
api-key: YOUR_API_KEY
Content-Type: application/json
```

**Python 示例**：
```python
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    base_url="https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1/"
)

response = client.chat.completions.create(
    model="my-gpt-4o-deployment",  # 部署名称
    messages=[{"role": "user", "content": "你好"}]
)
```

### 2.2 Microsoft Entra ID 认证（推荐）

Azure OpenAI 支持 Azure Active Directory (Entra ID) 认证：

```python
from openai import OpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

# 创建令牌提供者
token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default"
)

# 使用标准 OpenAI 客户端
client = OpenAI(
    base_url="https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1/",
    api_key=token_provider  # 传入令牌提供者
)

response = client.chat.completions.create(
    model="my-gpt-4o-deployment",
    messages=[{"role": "user", "content": "你好"}]
)
```

**HTTP 请求示例**：
```http
POST /openai/v1/chat/completions HTTP/1.1
Host: {your-resource-name}.openai.azure.com
Authorization: Bearer YOUR_ENTRA_ID_TOKEN
Content-Type: application/json
```

**认证对比表**：

| 特性 | API Key | Microsoft Entra ID |
|------|---------|-------------------|
| 安全性 | 中等 | 高（支持密钥轮换） |
| 令牌刷新 | ❌ 手动管理 | ✅ 自动刷新 |
| RBAC 权限控制 | ❌ 不支持 | ✅ 支持 |
| 适用场景 | 测试/开发 | 生产环境 |
| 存储建议 | Azure Key Vault | 无需存储 |

## 3. Azure 专属扩展功能

### 3.1 数据源集成（RAG）

Azure OpenAI 支持直接集成 Azure 数据源，实现检索增强生成（RAG）：

```http
POST /openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21 HTTP/1.1
Host: {your-resource-name}.openai.azure.com
api-key: YOUR_API_KEY
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "公司有哪些产品？"}
  ],
  "data_sources": [
    {
      "type": "azure_search",
      "parameters": {
        "endpoint": "https://your-search.search.windows.net/",
        "index_name": "products-index",
        "authentication": {
          "type": "system_assigned_managed_identity"
        },
        "query_type": "vector",
        "embedding_dependency": {
          "type": "deployment_name",
          "deployment_name": "text-embedding-ada-002"
        }
      }
    }
  ]
}
```

**支持的数据源类型**：
- `azure_search` - Azure AI Search
- `azure_cosmos_db` - Azure Cosmos DB for MongoDB vCore

**认证类型**：
- `api_key` - API 密钥
- `connection_string` - 连接字符串
- `system_assigned_managed_identity` - 系统分配托管标识
- `user_assigned_managed_identity` - 用户分配托管标识

**查询类型**：
- `vector` - 向量搜索
- `vector_semantic_hybrid` - 向量+语义混合搜索
- `semantic` - 语义搜索

### 3.2 响应增强字段

使用数据源时，响应会包含额外的信息：

```json
{
  "id": "chatcmpl-123",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "根据文档，公司有以下产品...",
      "context": {
        "citations": [
          {
            "content": "产品列表文档片段",
            "filepath": "products.pdf",
            "url": "https://..."
          }
        ],
        "intent": "用户意图分析结果"
      }
    },
    "finish_reason": "stop"
  }]
}
```

## 4. 内容过滤系统

Azure OpenAI 强制启用内容安全过滤，响应中包含过滤结果：

```json
{
  "id": "chatcmpl-123",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "回复内容"
    },
    "finish_reason": "stop"
  }],
  "prompt_filter_results": [
    {
      "prompt_index": 0,
      "content_filter_results": {
        "sexual": {"severity": "safe", "filtered": false},
        "violence": {"severity": "safe", "filtered": false},
        "hate": {"severity": "safe", "filtered": false},
        "self_harm": {"severity": "safe", "filtered": false}
      }
    }
  ],
  "completion_filter_results": {
    "sexual": {"severity": "safe", "filtered": false},
    "violence": {"severity": "low", "filtered": false},
    "hate": {"severity": "safe", "filtered": false},
    "self_harm": {"severity": "safe", "filtered": false}
  }
}
```

**过滤类别**：
- `sexual` - 性内容
- `violence` - 暴力内容
- `hate` - 仇恨内容
- `self_harm` - 自残内容
- `profanity` - 脏话（可选）
- `jailbreak` - 越狱攻击检测
- `protected_material_text` - 受保护文本
- `protected_material_code` - 受保护代码

**严重级别**：
- `safe` - 安全
- `low` - 低
- `medium` - 中
- `high` - 高

**错误响应示例**：
```json
{
  "error": {
    "code": "content_filter",
    "message": "内容被过滤",
    "param": null,
    "type": "content_filter_error",
    "inner_error": {
      "code": "ResponsibleAIPolicyViolation",
      "content_filter_results": {
        "sexual": {"severity": "high", "filtered": true}
      }
    }
  }
}
```

## 5. 流式响应报文示例

Azure OpenAI 的流式响应格式与 OpenAI 相同：

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"my-gpt-4o-deployment","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"my-gpt-4o-deployment","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"my-gpt-4o-deployment","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"my-gpt-4o-deployment","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

// 最终结束标记
data: [DONE]
```

**字段说明**：
- `model`: 返回部署名称而非实际模型名
- `delta.content`: 增量文本内容，需要拼接
- `finish_reason`: 结束原因（stop/length/tool_calls/content_filter）

## 6. Function Calling（工具调用）

Azure OpenAI 完全支持 Function Calling，格式与 OpenAI 相同：

```http
POST /openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21 HTTP/1.1
Host: {your-resource-name}.openai.azure.com
api-key: YOUR_API_KEY
Content-Type: application/json

{
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
  "choices": [{
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
  }]
}
```

## 7. 推理模型（o 系列）

Azure OpenAI 支持 o1/o3/o4-mini 系列推理模型：

```http
POST /openai/deployments/{deployment-id}/chat/completions?api-version=2024-12-01-preview HTTP/1.1
Host: {your-resource-name}.openai.azure.com
api-key: YOUR_API_KEY
Content-Type: application/json

{
  "messages": [
    {"role": "developer", "content": "你是一个专业的科学顾问"},
    {"role": "user", "content": "请分析：为什么天空是蓝色的？"}
  ],
  "max_completion_tokens": 100000,
  "reasoning_effort": "medium",
  "stream": true
}
```

**关键说明**：
- o 系列模型需要使用 `max_completion_tokens` 而非 `max_tokens`
- 支持 `reasoning_effort` 参数（low/medium/high）
- `developer` 消息等同于 `system` 消息
- 思考过程（reasoning tokens）不可见，仅通过 `usage.reasoning_tokens` 查看数量

**参数支持对比**：

| 参数 | o1 系列 | o3/o4-mini 系列 |
|------|---------|----------------|
| `system` 消息 | ✅ 视为 developer | ✅ 支持 |
| `developer` 消息 | ✅ 支持 | ✅ 支持 |
| 图像输入 | ❌ 不支持 | ✅ 支持 |
| 工具调用 | ⚠️ 有限支持 | ✅ 完整支持 |
| `temperature` | ❌ 固定为 1 | ❌ 固定为 1 |
| `reasoning_effort` | ❌ 不支持 | ✅ 支持 |

## 8. API 版本管理

### 8.1 版本参数格式

Azure OpenAI 使用日期格式的 API 版本参数：

```
api-version=2024-10-21  // GA 版本（稳定版）
api-version=2024-12-01-preview  // 预览版本
```

**重要版本**：

| 版本 | 发布日期 | 主要功能 |
|------|---------|---------|
| 2024-10-21 | 2024-10 | GA 稳定版 |
| 2024-12-01-preview | 2024-12 | reasoning_effort、stored completions |
| 2025-01-01-preview | 2025-01 | prediction 参数、音频模型 |
| 2025-02-01-preview | 2025-02 | 蒸馏 API |
| 2025-03-01-preview | 2025-03 | Responses API、Computer use |
| 2025-04-01-preview | 2025-04 | 视频生成、图像生成、o3/o4-mini |
| v1 API | 2025-08+ | 移除 api-version 参数 |

### 8.2 版本选择建议

- **生产环境**：使用 GA 版本（如 2024-10-21）
- **开发测试**：可使用 preview 版本获取新功能
- **长期维护**：推荐迁移到 v1 API，无需版本管理

## 9. OpenAI 与 Azure OpenAI 协议对比

| 特性 | OpenAI | Azure OpenAI |
|------|--------|--------------|
| **基础 URL** | `api.openai.com` | `{resource-name}.openai.azure.com` |
| **路径格式** | `/v1/chat/completions` | `/openai/deployments/{deployment-id}/chat/completions` |
| **v1 API 路径** | `/v1/chat/completions` | `/openai/v1/chat/completions` |
| **认证头** | `Authorization: Bearer` | `api-key` 或 `Authorization: Bearer` |
| **模型指定** | 实际模型名（如 gpt-4o） | 部署名称（可自定义） |
| **版本参数** | ❌ 不需要 | ✅ 需要（旧版）/ ❌ 不需要（v1） |
| **Entra ID 认证** | ❌ 不支持 | ✅ 支持 |
| **数据源集成** | ❌ 不支持 | ✅ 支持（RAG） |
| **内容过滤** | ❌ 可选 | ✅ 强制启用 |
| **托管标识** | ❌ 不支持 | ✅ 支持 |
| **跨提供商模型** | ❌ 仅 OpenAI | ✅ DeepSeek、Grok 等 |

## 10. 完整请求示例

### 10.1 基础聊天补全（旧版 API）

```bash
curl -X POST \
  "https://my-resource.openai.azure.com/openai/deployments/my-gpt-4o/chat/completions?api-version=2024-10-21" \
  -H "Content-Type: application/json" \
  -H "api-key: $AZURE_OPENAI_API_KEY" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个有帮助的助手"},
      {"role": "user", "content": "解释量子计算"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000,
    "stream": false
  }'
```

### 10.2 v1 API 聊天补全（推荐）

```bash
curl -X POST \
  "https://my-resource.openai.azure.com/openai/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
  -d '{
    "model": "my-gpt-4o-deployment",
    "messages": [
      {"role": "system", "content": "你是一个有帮助的助手"},
      {"role": "user", "content": "解释量子计算"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

### 10.3 使用数据源的 RAG 请求

```bash
curl -X POST \
  "https://my-resource.openai.azure.com/openai/deployments/my-gpt-4o/chat/completions?api-version=2024-10-21" \
  -H "Content-Type: application/json" \
  -H "api-key: $AZURE_OPENAI_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "公司的产品有哪些？"}
    ],
    "data_sources": [
      {
        "type": "azure_search",
        "parameters": {
          "endpoint": "https://my-search.search.windows.net",
          "index_name": "products",
          "authentication": {
            "type": "api_key",
            "key": "YOUR_SEARCH_API_KEY"
          },
          "query_type": "vector_semantic_hybrid",
          "embedding_dependency": {
            "type": "deployment_name",
            "deployment_name": "text-embedding-ada-002"
          }
        }
      }
    ]
  }'
```

### 10.4 Entra ID 认证请求

```bash
# 获取令牌
TOKEN=$(az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv)

# 发送请求
curl -X POST \
  "https://my-resource.openai.azure.com/openai/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "my-gpt-4o-deployment",
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

## 11. 错误处理

Azure OpenAI 的错误响应格式：

```json
{
  "error": {
    "code": "DeploymentNotFound",
    "message": "部署 'my-gpt-4o' 不存在",
    "param": null,
    "type": "invalid_request_error"
  }
}
```

**常见错误代码**：

| 错误代码 | 说明 |
|---------|------|
| `DeploymentNotFound` | 部署名称不存在 |
| `ModelNotFound` | 模型未部署 |
| `InvalidApiVersion` | API 版本无效 |
| `ContentFilter` | 内容被安全过滤拦截 |
| `RateLimitExceeded` | 超过速率限制 |
| `InsufficientQuota` | 配额不足 |
| `AuthenticationError` | 认证失败 |

## 12. 最佳实践

1. **认证选择**：
   - 生产环境：使用 Microsoft Entra ID + 托管标识
   - 开发环境：API Key + Azure Key Vault 存储

2. **API 版本**：
   - 新项目：直接使用 v1 API
   - 旧项目：逐步迁移到 v1 API

3. **部署命名**：
   - 建议使用语义化命名（如 `gpt-4o-prod`）
   - 区分环境和用途（如 `gpt-4o-dev`、`gpt-4o-test`）

4. **内容过滤**：
   - 生产环境必须考虑内容过滤的影响
   - 测试时检查 `finish_reason` 是否为 `content_filter`

5. **RAG 集成**：
   - 使用托管标识而非 API Key 连接数据源
   - 选择合适的查询类型（vector/semantic/hybrid）