# 智谱 GLM API 协议

## 1. 基础请求格式

```http
POST /v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer xxx.xxx.xxx
Content-Type: application/json

{
  "model": "glm-4",
  "messages": [
    {"role": "user", "content": "解释强化学习的核心概念"}
  ],
  "stream": true
}
```

## 2. 开启思考链

智谱 GLM-4 支持通过特定 prompt 触发思考链:

```http
POST /v4/chat/completions HTTP/1.1
Host: open.bigmodel.cn
Authorization: Bearer xxx.xxx.xxx
Content-Type: application/json

{
  "model": "glm-4-plus",
  "messages": [
    {
      "role": "system",
      "content": "你是一个善于深度思考的AI助手，在回答问题前请先进行详细的分析和推理。"
    },
    {
      "role": "user",
      "content": "请一步步分析：如何设计一个推荐系统？"
    }
  ],
  "stream": true
}
```

## 3. 流式响应报文示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 数据块格式与 OpenAI 兼容
data: {"id":"123","created":1234567890,"model":"glm-4-plus","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"123","created":1234567890,"model":"glm-4-plus","choices":[{"index":0,"delta":{"content":"设"},"finish_reason":null}]}

data: {"id":"123","created":1234567890,"model":"glm-4-plus","choices":[{"index":0,"delta":{"content":"计"},"finish_reason":null}]}

// ... 更多内容

data: {"id":"123","created":1234567890,"model":"glm-4-plus","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":100,"total_tokens":120}}

data: [DONE]
```