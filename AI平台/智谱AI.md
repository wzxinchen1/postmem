# 智谱AI API 协议

> **平台官网**: https://www.zhipuai.cn
> **API平台**: https://open.bigmodel.cn
> **文档地址**: https://docs.bigmodel.cn

## 1. 基础请求格式

### 1.1 API 端点

| 端点类型 | URL |
|---------|-----|
| **通用API** | `https://open.bigmodel.cn/api/paas/v4/` |
| **编码套餐专用** | `https://open.bigmodel.cn/api/coding/paas/v4` |

### 1.2 基础请求示例

```http
POST /api/paas/v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "glm-4.7",
  "messages": [
    {"role": "user", "content": "解释强化学习的核心概念"}
  ],
  "stream": true
}
```

### 1.3 多轮对话请求

```http
POST /api/paas/v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "glm-4.7",
  "messages": [
    {"role": "system", "content": "你是一个专业的编程助手"},
    {"role": "user", "content": "什么是递归？"},
    {"role": "assistant", "content": "递归是一种编程技术..."},
    {"role": "user", "content": "能给我一个Python递归的例子吗？"}
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

---

## 2. 认证方式

### 2.1 API Key 鉴权（简单方式）

**请求头配置**:
```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

**获取 API Key 步骤**:
1. 访问智谱AI开放平台（https://open.bigmodel.cn）
2. 注册并登录账户
3. 在 API Keys 管理页面创建 API Key
4. 复制 API Key 供使用

### 2.2 JWT Token 鉴权（高安全场景）

**适用场景**: 需要更高安全性的企业级应用

**依赖安装**:
```bash
pip install PyJWT
```

**Token 生成代码**:
```python
import time
import jwt

def generate_token(apikey: str, exp_seconds: int):
    try:
        id, secret = apikey.split(".")
    except Exception as e:
        raise Exception("invalid apikey", e)

    payload = {
        "api_key": id,
        "exp": int(round(time.time() * 1000)) + exp_seconds * 1000,
        "timestamp": int(round(time.time() * 1000)),
    }

    return jwt.encode(
        payload,
        secret,
        algorithm="HS256",
        headers={"alg": "HS256", "sign_type": "SIGN"},
    )

# 使用示例：生成1小时有效期的token
token = generate_token("your-api-key", 3600)
```

**请求头配置**:
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 3. 核心请求参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | String | 模型名称，如 `glm-5.1`、`glm-4.7`、`glm-4-plus` |
| `messages` | Array | 消息数组，包含 role 和 content |
| `temperature` | Float | 温度参数，控制输出随机性（0-1） |
| `max_tokens` | Integer | 最大输出token数 |
| `stream` | Boolean | 是否启用流式输出（true/false） |
| `top_p` | Float | Top-p 采样参数 |
| `tools` | Array | 工具调用定义列表 |
| `tool_choice` | String | 工具调用策略，**默认且仅支持 `auto`** |

---

## 4. 流式响应报文

### 4.1 流式请求

```http
POST /api/paas/v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "glm-4.7",
  "messages": [
    {"role": "user", "content": "写一首关于春天的诗"}
  ],
  "stream": true
}
```

### 4.2 流式响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"123","created":1234567890,"model":"glm-4.7","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"123","created":1234567890,"model":"glm-4.7","choices":[{"index":0,"delta":{"content":"春"},"finish_reason":null}]}

data: {"id":"123","created":1234567890,"model":"glm-4.7","choices":[{"index":0,"delta":{"content":"风"},"finish_reason":null}]}

data: {"id":"123","created":1234567890,"model":"glm-4.7","choices":[{"index":0,"delta":{"content":"吹"},"finish_reason":null}]}

// ... 更多内容块

// 最后一个数据块：标记结束
data: {"id":"123","created":1234567890,"model":"glm-4.7","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":100,"total_tokens":120}}

// 最终结束标记
data: [DONE]
```

### 4.3 字段说明

| 字段 | 说明 |
|------|------|
| `delta.role` | 仅在第一个块中出现，标识角色为 assistant |
| `delta.content` | 增量文本内容，需要拼接 |
| `finish_reason` | 结束原因 |
| `usage` | Token 使用统计（仅在最后一个块中） |
| `data: [DONE]` | 流式传输结束标记 |

**finish_reason 可能值**:
- `stop`: 正常结束
- `length`: 达到 token 限制
- `tool_calls`: 需要调用工具
- `null`: 未结束

---

## 5. 工具调用（Function Calling）

### 5.1 工具定义格式

```json
{
  "type": "function",
  "function": {
    "name": "函数名称",
    "description": "函数功能描述",
    "parameters": {
      "type": "object",
      "properties": {
        "参数名": {
          "type": "参数类型",
          "description": "参数描述",
          "enum": ["可选值1", "可选值2"],
          "default": "默认值"
        }
      },
      "required": ["必填参数列表"]
    }
  }
}
```

### 5.2 工具调用请求示例

```http
POST /api/paas/v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "glm-4.7",
  "messages": [
    {"role": "user", "content": "北京今天天气怎么样？"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的当前天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称，例如：北京、上海"
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

### 5.3 工具调用响应

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "glm-4.7",
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

### 5.4 工具结果返回

```http
POST /api/paas/v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "glm-4.7",
  "messages": [
    {"role": "user", "content": "北京今天天气怎么样？"},
    {"role": "assistant", "content": null, "tool_calls": [{"id": "call_abc123", "type": "function", "function": {"name": "get_weather", "arguments": "{\"city\":\"北京\"}"}}]},
    {"role": "tool", "content": "{\"temperature\":\"22°C\",\"condition\":\"晴天\",\"humidity\":\"65%\"}", "tool_call_id": "call_abc123"}
  ]
}
```

### 5.5 响应参数说明

| 参数 | 说明 |
|------|------|
| `tool_calls` | 包含模型决定调用的函数信息 |
| `tool_calls[].id` | 工具调用的唯一标识符 |
| `tool_calls[].function.name` | 被调用的函数名称 |
| `tool_calls[].function.arguments` | 函数调用参数（JSON 格式字符串） |

**重要说明**:
- `tool_choice` **仅支持 `auto`**，不支持 `none` 或 `required`
- 支持工具调用的模型：`glm-5`、`glm-4.7`、`glm-4.6`、`glm-4-plus` 等

---

## 6. 工具流式输出（Stream Tool Call）

### 6.1 功能说明

流式工具调用是 Z.ai 最新模型的特性，允许在工具调用过程中实时获取：
- 推理过程（reasoning_content）
- 回答内容（content）
- 工具调用信息（tool_calls）

### 6.2 支持模型

仅支持以下模型：
- `glm-5` 系列
- `glm-4.7`
- `glm-4.6`

### 6.3 流式工具调用请求

```http
POST /api/paas/v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "glm-4.7",
  "messages": [
    {"role": "user", "content": "北京天气怎么样"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定地点当前的天气情况",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "城市，例如：北京、上海"}
          },
          "required": ["location"]
        }
      }
    }
  ],
  "stream": true,
  "tool_stream": true
}
```

### 6.4 流式工具响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 推理过程输出
data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"reasoning_content":"让我"},"finish_reason":null}]}

data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"reasoning_content":"查询"},"finish_reason":null}]}

data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"reasoning_content":"北京的天气信息..."},"finish_reason":null}]}

// 回答内容输出
data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"content":"根据查询"},"finish_reason":null}]}

data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"content":"结果..."},"finish_reason":null}]}

// 工具调用信息
data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"get_weather","arguments":""}}]}, "finish_reason":null}]}

data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"loc"}}]}, "finish_reason":null}]}

data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ation\":\"北京\"}"}}]}, "finish_reason":null}]}

// 结束标记
data: {"id":"123","model":"glm-4.7","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### 6.5 响应字段说明

| 字段 | 说明 |
|------|------|
| `delta.reasoning_content` | 模型推理过程的文本内容（增量） |
| `delta.content` | 模型回答的文本内容（增量） |
| `delta.tool_calls` | 工具调用信息（增量构建） |
| `tool_calls[].index` | 工具调用索引 |
| `tool_calls[].function.name` | 函数名称 |
| `tool_calls[].function.arguments` | 函数参数（需逐步拼接） |

**重要说明**:
- `stream=True` 是启用流式输出的前提条件
- `tool_stream=True` 启用工具调用流式输出
- 所有流式内容需要逐步拼接，不能直接使用完整值
- 需使用 `hasattr()` 检测可选字段是否存在

---

## 7. 错误码

### 7.1 HTTP 状态码

| 状态码 | 原因 | 解决方法 |
|--------|------|----------|
| 200 | 业务处理成功 | - |
| 400 | 参数错误 | 检查接口参数是否正确 |
| 400 | 文件内容异常 | 检查 jsonl 文件内容是否符合要求 |
| 401 | 鉴权失败或 Token 超时 | 确认 API KEY 和鉴权 token 是否正确生成 |
| 429 | 接口请求并发超额 | 调整请求频率或联系商务扩大并发数 |
| 429 | 上传文件频率过快 | 短暂等待后重新请求 |
| 429 | 账户余额已用完 | 进行账户充值以确保余额充足 |
| 429 | 账户异常 | 账户存违规行为，请联系平台客服解锁 |
| 435 | 文件大小超过 100MB | 使用小于 100MB 的文件或分批上传 |
| 500 | 服务器处理请求时发生错误 | 稍后重试或联系客服 |

### 7.2 业务错误码

#### 身份验证错误

| 错误码 | 错误信息 |
|--------|----------|
| 1000 | 身份验证失败 |
| 1001 | Header 中未收到 Authentication 参数，无法进行身份验证 |
| 1002 | Authentication Token 非法，请确认 Authentication Token 正确传递 |
| 1003 | Authentication Token 已过期，请重新生成/获取 |
| 1004 | 通过 Authentication Token 的验证失败 |

#### 账户错误

| 错误码 | 错误信息 |
|--------|----------|
| 1100 | 账户读写账户错误 |
| 1110 | 您的账户当前处于非活动状态。请检查账户信息 |
| 1111 | 您的账户不存在 |
| 1112 | 您的账户已被锁定，请联系客服解锁 |
| 1113 | 您的账户已欠费，请充值后重试 |
| 1120 | 无法成功访问您的账户，请稍后重试 |
| 1121 | 账户存违规行为，账号已被锁定 |

#### API 调用错误

| 错误码 | 错误信息 |
|--------|----------|
| 1200 | API 调用错误 |
| 1210 | API 调用参数有误，请检查文档 |
| 1211 | 模型不存在，请检查模型代码 |
| 1212 | 当前模型不支持该调用方式 |
| 1213 | 未正常接收到参数 |
| 1214 | 参数非法。请检查文档 |
| 1220 | 您无权访问该 API |
| 1221 | API 已下线 |
| 1222 | API 不存在 |
| 1261 | Prompt 超长 |

#### API 策略阻止错误

| 错误码 | 错误信息 |
|--------|----------|
| 1300 | API 调用被策略阻止 |
| 1301 | 系统检测到输入或生成内容可能包含不安全或敏感内容 |
| 1302 | 您的账户已达到速率限制，请您控制请求频率 |
| 1304 | 该 API 已达今日调用次数限额 |
| 1305 | 该模型当前访问量过大，请您稍后再试 |
| 1308 | 已达到使用上限 |
| 1309 | GLM Coding Plan 套餐已到期 |
| 1310 | 已达到每周/每月使用上限 |
| 1311 | 当前订阅套餐暂未开放该模型权限 |
| 1312 | 该模型当前访问量过大，请切换其他模型 |
| 1313 | 账户使用模式不符合公平使用策略 |

### 7.3 错误响应示例

```json
HTTP/2 401
content-type: application/json

{
  "error": {
    "code": "1002",
    "message": "Authorization Token非法，请确认Authorization Token正确传递。"
  }
}
```

**重要说明**: 使用流式（SSE）调用时，如果 API 在推理过程中异常终止，不会返回上述错误码，而是在响应体的 `finish_reason` 参数中返回异常原因。

---

## 8. OpenAI SDK 兼容

智谱AI API 兼容 OpenAI SDK 格式，可零学习成本快速迁移现有应用：

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_ZHIPU_API_KEY",
    base_url="https://open.bigmodel.cn/api/paas/v4/"
)

response = client.chat.completions.create(
    model="glm-4.7",
    messages=[
        {"role": "user", "content": "你好"}
    ],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content)
```

---

## 9. SDK 安装

### Python SDK

```bash
# 安装最新版本
pip install zai-sdk

# 或指定版本
pip install zai-sdk==0.2.2
```

### Python SDK 示例

```python
from zai import ZhipuAiClient

# 初始化客户端
client = ZhipuAiClient(api_key='YOUR_API_KEY')

# 发起对话请求
response = client.chat.completions.create(
    model="glm-4.7",
    messages=[
        {"role": "user", "content": "解释量子计算的基本原理"}
    ],
    stream=True
)

# 处理流式响应
for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

---

## 10. 最佳实践

### 10.1 安全性建议

- 妥善保管 API Key，不要在代码中硬编码
- 使用环境变量或配置文件存储敏感信息
- 定期轮换 API Key
- 高安全场景使用 JWT Token 鉴权

### 10.2 性能优化

- 实施连接池和会话复用
- 合理设置超时时间
- 使用异步请求处理高并发场景
- 实施指数退避重试机制

### 10.3 错误处理

```python
import time

def call_with_retry(func, max_retries=3, backoff_factor=2):
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            wait_time = backoff_factor ** attempt
            time.sleep(wait_time)
```

### 10.4 工具调用安全

- 严格验证所有输入参数
- 限制函数的访问权限
- 记录函数调用日志
- 每个函数只做一件事（单一职责）
- 函数名和参数名要有意义
- 提供详细的函数和参数描述

---

## 11. 核心概念

### Token 计算

- **GLM系列模型 token 与字数换算比例约 1:1.6**
- 1个中文词语/英文单词/数字/符号约计为1个token

### 上下文窗口

- 模型一次对话能处理的最大长度
- 包含用户输入、模型回复及中间推理内容

---

## 12. 协议对比

| 特性 | 智谱AI | OpenAI |
|------|--------|--------|
| **认证方式** | API Key / JWT Token | API Key |
| **请求格式** | 兼容 OpenAI | 原生 |
| **流式输出** | SSE（兼容 OpenAI） | SSE |
| **工具调用** | 支持（tool_choice 仅支持 auto） | 支持（auto/none/required） |
| **流式工具输出** | 支持（glm-4.7/4.6/5系列） | 支持 |
| **推理过程可见** | 支持（reasoning_content） | 不支持（o1系列隐藏） |
| **OpenAI SDK兼容** | ✅ 完全兼容 | ✅ 原生 |

---

*更新时间: 2026年5月*
*文档来源: 智谱AI开放平台官方文档*