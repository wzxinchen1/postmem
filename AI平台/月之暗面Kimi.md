# 月之暗面 Kimi API 协议

## 1. 基础请求格式

```http
POST /v1/chat/completions HTTP/1.1
Host: api.moonshot.cn
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "moonshot-v1-128k",
  "messages": [
    {"role": "user", "content": "总结这篇长文的核心观点"}
  ],
  "stream": true
}
```

## 2. 特点：超长上下文

Kimi 支持 128k 和 256k 上下文:

```http
POST /v1/chat/completions HTTP/1.1
Host: api.moonshot.cn
Authorization: Bearer sk-xxx
Content-Type: application/json

{
  "model": "moonshot-v1-256k",  // 256k 上下文版本
  "messages": [
    {"role": "user", "content": "分析以下文档...[超长文本]"}
  ],
  "temperature": 0.3
}
```

## 3. 流式响应报文示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 完全兼容 OpenAI 格式
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"moonshot-v1-128k","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"moonshot-v1-128k","choices":[{"index":0,"delta":{"content":"这"},"finish_reason":null}]}

// ... 更多内容

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"moonshot-v1-128k","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":50000,"completion_tokens":200,"total_tokens":50200}}

data: [DONE]
```