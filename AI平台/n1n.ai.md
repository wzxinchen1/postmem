# n1n.ai API 协议

## 1. 平台概述

n1n.ai 是企业级大模型 LLM API 接口聚合平台，通过统一的 API Key 即可调用全球 500+ 顶尖 AI 大模型。

**核心特性**:
- **统一接口**: 完全兼容 OpenAI API 协议，零成本迁移
- **国内直连**: 24 个企业级 CN2 GIA 节点，无需代理
- **高可用性**: 99.99% 在线率，多路路由保障，模型故障自动切换
- **密钥管理**: 支持子密钥分发、Quota 限额、权限控制

**官方资源**:
- 官网: https://n1n.ai
- API 文档: https://docs.n1n.ai
- API 端点: https://api.n1n.ai

## 2. 基础请求格式

### 2.1 认证方式

```http
POST /v1/chat/completions HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "解释量子计算的基本原理"}
  ],
  "stream": true
}
```

**认证说明**:
- API Key 格式: `sk-XXX`
- 在请求 Header 的 `Authorization` 字段中携带 Bearer Token
- 一个 API Key 可访问所有支持的模型

### 2.2 接入步骤

```
步骤1: 注册账号 → https://n1n.ai（获得试用额度）
步骤2: 控制台获取 API Key（格式：sk-XXX）
步骤3: 设置 Base URL → https://api.n1n.ai
步骤4: 按 OpenAI 接口格式发起请求
```

## 3. API 端点列表

| 功能 | 端点地址 | 说明 |
|------|----------|------|
| **聊天补全** | `/v1/chat/completions` | 主要对话接口 |
| **图像生成** | `/v1/images/generations` | 文生图接口 |
| **视频生成 (OpenAI格式)** | `/v1/videos` | OpenAI 格式视频生成 |
| **视频生成 (统一格式)** | `/v1/video/create` | 统一格式视频生成 |
| **语音合成** | `/v1/audio/speech` | TTS 语音合成 |
| **语音转录** | `/v1/audio/transcriptions` | 语音转文字 |
| **模型列表** | `/v1/models` | 获取可用模型列表 |

## 4. 流式响应报文示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 第一个数据块：包含角色信息
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

// 后续数据块：逐步返回内容
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"量"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"子"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"计"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"算"},"finish_reason":null}]}

// 最后一个数据块：标记结束
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

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

```http
POST /v1/chat/completions HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "gpt-4o",
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
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o",
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

## 6. 图像生成接口

```http
POST /v1/images/generations HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "dall-e-3",
  "prompt": "一只在太空中的猫",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "response_format": "url"
}
```

**支持的图片比例**:
- `1:1` - 正方形
- `4:3` - 标准横屏
- `16:9` - 宽屏
- `9:16` - 竖屏
- `3:2` - 照片比例
- `2:3` - 肖像比例

## 7. 视频生成接口

### 7.1 OpenAI 格式

```http
POST /v1/videos HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "sora",
  "prompt": "一只在海边奔跑的狗",
  "size": "1280x720",
  "duration": 5
}
```

### 7.2 统一格式

```http
POST /v1/video/create HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "veo-2",
  "prompt": "城市夜景延时摄影",
  "aspect_ratio": "16:9",
  "duration": 8
}
```

**视频参数说明**:
- **比例**: `16:9`、`9:16`、`1:1`、`4:3`
- **时长**: `5秒`、`8秒`、`10秒`
- **生成时间**: 通常 1-5 分钟

**视频模型注意事项**:
- **Sora**: 要求图片尺寸严格为 `720x1280` 或 `1280x720`
- **Grok/Veo**: 支持多种比例

## 8. 语音接口

### 8.1 语音合成（TTS）

```http
POST /v1/audio/speech HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "tts-1",
  "input": "你好，欢迎使用 n1n.ai",
  "voice": "alloy",
  "response_format": "mp3",
  "speed": 1.0
}
```

### 8.2 语音转录（ASR）

```http
POST /v1/audio/transcriptions HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="audio.mp3"
Content-Type: audio/mpeg

[audio binary data]
------WebKitFormBoundary
Content-Disposition: form-data; name="model"

whisper-1
------WebKitFormBoundary--
```

## 9. 联网搜索功能

部分模型支持联网搜索，通过添加 `web_search_options` 参数启用：

```http
POST /v1/chat/completions HTTP/1.1
Host: api.n1n.ai
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "今天北京的天气如何？"}
  ],
  "web_search_options": {
    "enabled": true
  }
}
```

## 10. 密钥管理系统（舰队指挥系统）

n1n.ai 提供企业级密钥管理功能：

| 功能 | 说明 |
|------|------|
| **子密钥分发** | 支持创建多个子密钥分配给不同项目/部门 |
| **Quota 限额** | 可为每个 Key 设置硬性额度上限 |
| **过期时间** | 支持设置密钥有效期 |
| **权限控制** | 可精细控制每个 Key 的模型访问权限 |
| **消费监控** | 实时查看 API 调用明细与费用统计 |

## 11. 错误码说明

n1n.ai 完全兼容 OpenAI 标准错误码：

| HTTP 状态码 | 错误类型 | 说明 |
|------------|---------|------|
| `400` | `invalid_request_error` | 请求参数格式错误 |
| `401` | `authentication_error` | API Key 无效或已过期 |
| `403` | `permission_error` | 无权限访问该模型 |
| `404` | `not_found_error` | 资源不存在 |
| `429` | `rate_limit_error` | 请求频率超限 |
| `500` | `api_error` | 服务器内部错误 |
| `503` | `overloaded_error` | 服务暂时过载 |

**错误响应格式**:

```json
{
  "error": {
    "message": "Invalid API key provided",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

## 12. SDK 集成示例

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-xxx",
    base_url="https://api.n1n.ai"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "你好"}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Node.js (OpenAI SDK)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-xxx',
  baseURL: 'https://api.n1n.ai'
});

const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '你好' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### cURL

```bash
curl https://api.n1n.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxx" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

## 13. 平台性能指标

| 指标 | 数值 |
|------|------|
| **在线率 (SLA)** | 99.99% |
| **平均响应时间** | < 500ms |
| **边缘节点数量** | 24 个企业级 CN2 GIA 节点 |
| **支持模型数量** | 500+ 模型 |
| **技术支持响应** | 24 小时内 |

## 14. 应用场景

1. **多模型 A/B 测试** - 快速切换不同 LLM 对比输出质量，无需修改核心代码
2. **企业内部 AI 中台** - 统一管理各部门调用权限与预算，阶梯定价降低成本
3. **出海应用加速** - 全球边缘网络为不同地区用户提供稳定一致的响应速度
4. **个人开发者** - 低成本体验多种顶尖模型，快速原型验证

## 15. 常见问题

| 问题 | 答案 |
|------|------|
| 国内需要 VPN 吗？ | **不需要**，CN2 GIA 节点专门优化了国内直连线路 |
| 价格如何？ | 相比直接对接厂商更具优势的阶梯定价，支持统一结算 |
| 稳定性如何？ | 99.99% 在线率，模型供应商故障时自动无缝切换 |
| 支持最新模型吗？ | 支持 GPT-5、Claude 4.5、Gemini 3 Pro 等最新模型 |
| 如何迁移现有代码？ | 只需修改 `base_url` 为 `https://api.n1n.ai`，其他代码无需改动 |

---

**参考资源**:
- 官方文档: https://docs.n1n.ai
- GitHub: https://github.com/n1n-api
- API 端点: https://api.n1n.ai
