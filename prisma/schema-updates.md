# Provider 抽象层 Schema 更新方案

## 1. 新建 provider_templates 表

存储各厂商的配置模板，用于快速创建 provider 和自动识别厂商类型。

```sql
CREATE TABLE provider_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,           -- 厂商名称：openai, anthropic, deepseek, zhipu, siliconflow, ollama 等
  display_name VARCHAR(150),                    -- 显示名称：OpenAI, Anthropic, DeepSeek, 智谱AI, 硅基流动, Ollama
  url_pattern VARCHAR(255),                     -- URL 匹配模式：api.openai.com, api.deepseek.com, localhost:11434
  default_base_url VARCHAR(255),                -- 默认 Base URL
  api_format VARCHAR(50) DEFAULT 'openai',      -- API 格式：openai, ollama, anthropic
  supports_embedding BOOLEAN DEFAULT true,      -- 是否支持嵌入模型
  supports_chat BOOLEAN DEFAULT true,           -- 是否支持对话模型
  requires_api_key BOOLEAN DEFAULT true,        -- 是否需要 API Key
  embedding_endpoint VARCHAR(100),              -- 嵌入端点路径：/v1/embeddings, /api/embeddings
  chat_endpoint VARCHAR(100),                   -- 对话端点路径：/v1/chat/completions
  models_endpoint VARCHAR(100),                 -- 模型列表端点：/v1/models, /api/tags
  default_models JSON,                          -- 默认模型列表（用于不支持动态获取的厂商）
  request_headers JSON,                         -- 默认请求头配置
  request_format JSON,                          -- 请求格式模板
  response_format JSON,                         -- 响应解析规则
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_provider_templates_url_pattern ON provider_templates(url_pattern);
CREATE INDEX idx_provider_templates_is_active ON provider_templates(is_active);
```

## 2. 扩展 providers 表

在现有 providers 表的 config 字段中存储以下结构：

```json
{
  "templateId": 1,                    -- 关联的模板 ID
  "apiFormat": "openai",              -- API 格式（可覆盖模板配置）
  "embeddingEndpoint": "/v1/embeddings",
  "chatEndpoint": "/v1/chat/completions",
  "modelsEndpoint": "/v1/models",
  "requestHeaders": {},               -- 自定义请求头
  "requestFormat": {},                -- 自定义请求格式
  "responseFormat": {}                -- 自定义响应解析规则
}
```

## 3. 初始模板数据

插入常用厂商的模板配置：

```sql
INSERT INTO provider_templates (name, display_name, url_pattern, default_base_url, api_format, supports_embedding, supports_chat, requires_api_key, embedding_endpoint, chat_endpoint, models_endpoint, default_models, request_headers) VALUES
-- OpenAI
('openai', 'OpenAI', 'api.openai.com', 'https://api.openai.com/v1', 'openai', true, true, true, '/v1/embeddings', '/v1/chat/completions', '/v1/models', '[]', '{"Authorization": "Bearer ${apiKey}"}'),

-- Anthropic
('anthropic', 'Anthropic', 'api.anthropic.com', 'https://api.anthropic.com/v1', 'anthropic', false, true, true, NULL, '/v1/messages', NULL, '["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]', '{"x-api-key": "${apiKey}", "anthropic-version": "2023-06-01"}'),

-- DeepSeek
('deepseek', 'DeepSeek', 'api.deepseek.com', 'https://api.deepseek.com/v1', 'openai', true, true, true, '/v1/embeddings', '/v1/chat/completions', '/v1/models', '["deepseek-chat", "deepseek-coder", "deepseek-reasoner"]', '{"Authorization": "Bearer ${apiKey}"}'),

-- 智谱AI
('zhipu', '智谱AI', 'open.bigmodel.cn', 'https://open.bigmodel.cn/api/paas/v4', 'openai', true, true, true, '/api/paas/v4/embeddings', '/api/paas/v4/chat/completions', '/api/paas/v4/models', '["glm-4", "glm-4-flash", "glm-3-turbo"]', '{"Authorization": "Bearer ${apiKey}"}'),

-- 硅基流动
('siliconflow', '硅基流动', 'api.siliconflow.cn', 'https://api.siliconflow.cn/v1', 'openai', true, true, true, '/v1/embeddings', '/v1/chat/completions', '/v1/models', '[]', '{"Authorization": "Bearer ${apiKey}"}'),

-- Ollama (本地)
('ollama', 'Ollama', 'localhost:11434', 'http://localhost:11434', 'ollama', true, true, false, '/api/embeddings', '/api/chat', '/api/tags', '[]', '{}'),

-- Moonshot AI
('moonshot', 'Moonshot AI', 'api.moonshot.cn', 'https://api.moonshot.cn/v1', 'openai', true, true, true, '/v1/embeddings', '/v1/chat/completions', '/v1/models', '["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]', '{"Authorization": "Bearer ${apiKey}"}'),

-- 阿里云百炼
('bailian', '阿里云百炼', 'dashscope.aliyuncs.com', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'openai', true, true, true, '/v1/embeddings', '/v1/chat/completions', '/v1/models', '["qwen-turbo", "qwen-plus", "qwen-max"]', '{"Authorization": "Bearer ${apiKey}"}');
```

## 4. 自动识别逻辑

创建 provider 时，根据 baseUrl 自动匹配模板：
- 如果 baseUrl 包含模板的 url_pattern，自动关联该模板
- 用户可以手动选择模板覆盖自动识别
- custom 类型不关联模板，完全自定义配置

## 5. API 格式说明

### openai 格式
- 嵌入：POST /v1/embeddings，body: {model, input}
- 对话：POST /v1/chat/completions，body: {model, messages}
- 模型列表：GET /v1/models

### ollama 格式
- 嵌入：POST /api/embeddings，body: {model, prompt}
- 对话：POST /api/chat，body: {model, messages}
- 模型列表：GET /api/tags

### anthropic 格式
- 对话：POST /v1/messages，body: {model, messages, max_tokens}
- 不支持嵌入和模型列表接口

## 6. 迁移步骤

1. 创建 provider_templates 表
2. 插入初始模板数据
3. 更现有 providers 表的 config 字段（可选）
4. 创建通用 Provider 服务类

## 7. 类型定义更新

在 src/types/index.ts 中新增：

```typescript
export interface ProviderTemplate {
  id: number
  name: string
  displayName?: string
  urlPattern?: string
  defaultBaseUrl?: string
  apiFormat: 'openai' | 'ollama' | 'anthropic'
  supportsEmbedding: boolean
  supportsChat: boolean
  requiresApiKey: boolean
  embeddingEndpoint?: string
  chatEndpoint?: string
  modelsEndpoint?: string
  defaultModels?: string[]
  requestHeaders?: Record<string, string>
  requestFormat?: Record<string, unknown>
  responseFormat?: Record<string, unknown>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ProviderConfig {
  templateId?: number
  apiFormat?: 'openai' | 'ollama' | 'anthropic'
  embeddingEndpoint?: string
  chatEndpoint?: string
  modelsEndpoint?: string
  requestHeaders?: Record<string, string>
  requestFormat?: Record<string, unknown>
  responseFormat?: Record<string, unknown>
}
```