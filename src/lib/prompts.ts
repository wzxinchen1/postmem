export class Prompts {
  static textAnalysisExpert(): string {
    return 'You are a text analysis expert. Always respond with valid JSON only.'
  }

  static conversationAnalysisExpert(): string {
    return 'You are a conversation analysis expert. Always respond with valid JSON only.'
  }

  static cutPoints(text: string): string {
    return `分析以下文本的逻辑结构，找出最佳的切割点。切割点应该选择在语义完整的位置，如段落结束、章节结束或主题转换处。

文本内容：
${text}

请返回 JSON 格式的切割点数组，格式如下：
{
  "cutPoints": [
    {"index": 100, "reason": "第一段结束"},
    {"index": 250, "reason": "第二章节开始"}
  ]
}

要求：
1. index 是切割点在原文中的字符位置（从0开始）
2. 每个片段长度建议在 200-1000 字符之间
3. 只返回 JSON，不要有其他说明文字
4. 如果文本很短不需要切割，返回空数组 {"cutPoints": []}`
  }

  static messageAnalysis(messages: { id: string; role: string; content: string }[]): string {
    const messageList = messages.map((m) => `[${m.id}] ${m.role}: ${m.content}`).join('\n')

    return `分析以下对话消息列表，识别其中包含的所有独立话题。消息列表可能讨论了多件不同的事情，需要将讨论同一件事的消息分到同一组。

消息列表：
${messageList}

请返回 JSON 格式的消息分组数组，格式如下：
{
  "groups": [
    {
      "messageIds": ["msg1", "msg2"],
      "summary": "这组消息在讨论XXX",
      "isComplete": true
    },
    {
      "messageIds": ["msg3", "msg4"],
      "summary": "这组消息在讨论YYY",
      "isComplete": true
    }
  ]
}

要求：
1. 仔细分析消息内容，识别所有独立的话题，每个话题对应一个 group
2. messageIds 是该组消息的 ID 数组，按消息顺序排列
3. summary 是对该组消息内容的简要描述
4. isComplete 表示这组消息是否形成了一个完整的话题（有明确的开始和结束）
5. 最近的消息（最后几条）如果话题尚未结束，设置 isComplete 为 false
6. 只返回 JSON，不要有其他说明文字
7. 确保所有消息都被分配到某个分组中`
  }

  static textAnalysis(text: string): string {
    return `分析以下文本，识别其中包含的所有独立话题或主题。一段文本可能讨论了多件不同的事情，需要将它们分开。

文本内容：
${text.slice(0, 3000)}

请返回 JSON 格式的分组数组，格式如下：
{
  "groups": [
    {
      "summary": "这部分文本讨论的是XXX",
      "isComplete": true
    },
    {
      "summary": "这部分文本讨论的是YYY",
      "isComplete": true
    }
  ]
}

要求：
1. 仔细分析文本，识别所有独立的话题，每个话题对应一个 group
2. summary 是对该话题内容的简要描述
3. isComplete 表示该话题是否完整（有明确的开始和结束）
4. 如果文本末尾话题未结束，设置 isComplete 为 false
5. 只返回 JSON，不要有其他说明文字
6. 确保所有文本内容都被分配到某个话题中`
  }
}
