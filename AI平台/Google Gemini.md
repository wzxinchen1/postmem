# Google Gemini API 协议

## 1. 基础请求格式

```http
POST /v1beta/models/gemini-2.5-pro:generateContent?key=YOUR_API_KEY HTTP/1.1
Host: generativelanguage.googleapis.com
Content-Type: application/json

{
  "contents": [
    {
      "parts": [
        {"text": "解释量子纠缠现象"}
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 2048
  }
}
```

## 2. 开启思考链（Thinking Mode）

Gemini 2.5 Pro 支持思考模式（使用 `thinkingBudget`）:

```http
POST /v1beta/models/gemini-2.5-pro:generateContent?key=YOUR_API_KEY HTTP/1.1
Host: generativelanguage.googleapis.com
Content-Type: application/json

{
  "contents": [
    {
      "parts": [
        {"text": "请详细推导：为什么 E=mc²？"}
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 8192
  },
  "thinking_budget": -1  // -1=动态思考, 0=禁用, 正整数=精确上限（仅 Gemini 2.5）
}

// 或使用 Gemini 3.0+ 的 thinking_level 参数：
{
  "contents": [
    {
      "parts": [
        {"text": "请详细推导：为什么 E=mc²？"}
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 8192
  },
  "thinking_level": "high"  // minimal/low/medium/high（仅 Gemini 3.0+）
}
```

**注意**: Gemini 3.0+ 系列已改用 `thinking_level` 参数（可选值：minimal/low/medium/high）,不再使用 `thinkingBudget`。

**`thinking_level` 级别说明**:
- `"minimal"`: 最小思考,用于传递思考签名场景,接近零预算
- `"low"`: 低强度思考,适合翻译、分类、简单问答等任务
- `"medium"`: 中等思考,推荐日常默认,适合代码生成、内容写作（仅 Gemini 3 Flash 和 3.1 Pro 支持）
- `"high"`: 高强度思考,激活 Deep Think Mini,适合复杂推理任务（**API 默认值，最贵**）

**重要限制**:
- ⚠️ `thinking_budget` 和 `thinking_level` **不能同时使用**,否则返回 HTTP 400 错误
- ⚠️ API 默认使用 `"high"`（最贵选项）,建议显式指定级别
- ⚠️ Gemini 3.0+ 多轮对话复杂推理时需要传递 `thought_signatures`

## 3. 流式请求

```http
POST /v1beta/models/gemini-2.5-pro:streamGenerateContent?key=YOUR_API_KEY&alt=sse HTTP/1.1
Host: generativelanguage.googleapis.com
Content-Type: application/json

{
  "contents": [
    {
      "parts": [
        {"text": "解释黑洞的形成过程"}
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 4096
  },
  "thinking_budget": 2048  // Gemini 2.5 思考预算
  // 或使用 thinking_level: "medium"（Gemini 3.0+）
}
```

## 4. 流式响应报文示例

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

// 思考过程开始
data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"让我思考一下黑洞的形成..."}],"role":"model"},"index":0,"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":50,"totalTokenCount":60}}

// 思考过程继续
data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"\n\n黑洞形成的关键条件是：\n1. 大质量恒星\n2. 引力坍缩\n3. 超过托尔曼-奥本海默-沃尔科夫极限"}],"role":"model"},"index":0}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":150,"totalTokenCount":160}}

// 最终回答开始
data: {"candidates":[{"content":{"parts":[{"text":"黑洞的形成是一个壮观的宇宙事件："}],"role":"model"},"index":0}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":200,"totalTokenCount":210}}

// 最终回答继续
data: {"candidates":[{"content":{"parts":[{"text":"\n\n**1. 恒星演化末期**"}],"role":"model"},"index":0}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":250,"totalTokenCount":260}}

// ... 更多内容

// 最终结束
data: {"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},"index":0,"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":500,"totalTokenCount":510}}
```

**字段说明**:
- `parts[].thought`: 布尔值,`true` 表示这是思考过程
- `parts[].text`: 文本内容
- `finishReason`: 结束原因,`STOP` 表示正常结束
- `usageMetadata`: Token 使用统计