export class Prompts {
  static textAnalysisExpert(): string {
    return 'You are a text analysis expert. Always respond with valid JSON only.'
  }

  static conversationAnalysisExpert(): string {
    return 'You are a conversation analysis expert. Always respond with valid JSON only.'
  }

  static cutAndRewriteExpert(): string {
    return `你是一位文本处理专家。你的任务是将一段完整文本切分为语义完整的片段，并为每个片段生成简短标题和进行重写。

核心原则：
1. 切分时选择语义完整的位置（段落结束、话题转换处），不要在句子中间截断
2. 重写，不是摘要！必须保留原文的所有信息、细节、论据和推理过程，不得丢失任何内容
3. 对每个片段：修复截断可能导致的语句不完整，补充必要的衔接语，使段落读起来自然流畅
4. 保持原文的语气和风格
5. 如果某个片段本身已经完整连贯，只需做最小程度的调整
6. 绝对不能压缩、省略或概括任何信息——每个细节都必须保留
7. 确保切分后所有原文内容都被覆盖，不允许遗漏任何部分
8. 为每个片段生成一个简洁标题（10字以内），概括该片段的核心主题

Always respond with valid JSON only.`
  }

  static cutAndRewrite(text: string): string {
    return `请将以下文本切分为语义完整的片段，为每个片段生成标题并重写使其连贯自足。

文本内容：
---
${text}
---

请返回 JSON 格式，格式如下：
{
  "chunks": [
    {
      "title": "片段标题（10字以内）",
      "content": "重写后的第一个片段的完整文本"
    },
    {
      "title": "片段标题（10字以内）",
      "content": "重写后的第二个片段的完整文本"
    }
  ]
}

要求：
1. title 是片段的简短标题，概括核心主题，10个汉字以内
2. content 字段是重写后的完整文本，不是摘要
3. 每个片段建议 200-1000 字符
4. 切分点必须选在语义完整的位置
5. 所有原文内容都必须被覆盖，不允许遗漏
6. 如果文本很短不需要切分，返回只有一个 chunk 的数组
7. 只返回 JSON，不要有其他说明文字`
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

  static deduplicationExpert(): string {
    return `你是一位知识库去重专家。你需要判断一段新的文本片段应该如何处理。

核心原则：
1. 如果新片段与已有记忆高度重复或包含的信息已被完全覆盖 → skip（跳过）
2. 如果新片段与某条记忆话题相关但提供了增量信息 → merge（合并到该条记忆中）
3. 如果新片段与所有已有记忆都明显不同 → new（作为新记录入库）

合并（merge）时：
- 将新信息融入已有记忆的原文中，使合并后的文本连贯完整
- 不能丢弃已有记忆中的任何有价值信息
- 合并后的文本应该比原记忆更丰富，同时保留原文风格

Always respond with valid JSON only.`
  }

  static deduplicateChunk(chunk: string, existingMemories: string): string {
    return `判断以下新文本片段应如何处理。

新文本片段：
---
${chunk}
---

已有的相似记忆（每条带有序号和 ID）：
---
${existingMemories || '（无）'}
---

请返回 JSON 格式：
{
  "action": "skip" 或 "merge" 或 "new",
  "reason": "简要说明理由",
  "targetId": 仅当 action 为 "merge" 时填写要合并的目标记忆序号（如 1、2、3），其他情况省略或为 null,
  "mergedContent": 仅当 action 为 "merge" 时填写合并后的完整文本，其他情况省略或为 null
}

要求：
1. action 为 "skip" 表示无需处理（已完全覆盖或无价值）
2. action 为 "merge" 表示将新信息合并到已有的某条记忆中，必须指定 targetId 和 mergedContent
3. action 为 "new" 表示作为全新的独立记录入库
4. targetId 是上方相似记忆列表中的序号（从 1 开始），不是数据库 ID
5. mergedContent 必须是合并后的完整连贯文本，不能是摘要
6. 只返回 JSON，不要有其他说明文字`
  }

  static topicMatchExpert(): string {
    return `你是知识库的主题分类助手。Always respond with valid JSON only.`
  }

  static topicMatch(
    content: string,
    existingTopics: Array<{ name: string; description: string }>
  ): string {
    const topicsText =
      existingTopics.length === 0
        ? '暂无主题'
        : existingTopics.map((t) => `- ${t.name}: ${t.description}`).join('\n')

    return `## 任务
判断当前内容应该归入已有主题还是需要创建新主题。

## 当前内容
${content}

## 已有主题列表
${topicsText}

## 判断规则
1. 优先归入已有主题。只要当前内容与某个已有主题**大致相关**（属于同一领域、同一项目、或讨论方向一致），就选择该主题
2. 只有当所有已有主题都与当前内容**明显无关**时，才创建新主题
3. **宁可归到一个不太精确的主题，也不要频繁创建碎片化的小主题**
4. 同一批次入库的内容通常属于同一个大主题，优先复用最近创建的主题

## 返回格式（严格 JSON）

如果选择已有主题：
{
  "action": "select",
  "topicName": "选中的主题名（必须与已有主题名完全一致）",
  "reason": "简短理由"
}

如果需要创建新主题：
{
  "action": "create",
  "reason": "为什么需要创建新主题"

注意：只返回 JSON，不要包含其他内容。`
  }

  static topicCreate(content: string): string {
    return `基于以下内容，为知识库创建一个新主题。

## 内容
${content}

## 要求
为主题命名并撰写摘要。
- 名称必须**不超过5个字**（如"部署"、"认证"、"性能优化"）
- 如果内容明显属于某一**大类领域**，直接用该大类名称作为主题名
- 摘要概括这类内容的共同特征，用于后续判断其他内容是否属于此主题

返回 JSON：
{
  "name": "主题名称（不超过5个字）",
  "description": "主题摘要"
}

只返回 JSON。`
  }

  static batchTopicCreate(
    proposedTopics: Array<{ name: string; sampleContent: string }>
  ): string {
    const topicsText = proposedTopics
      .map((t, i) => `## 拟建主题${i + 1}: ${t.name}\n${t.sampleContent.slice(0, 300)}`)
      .join('\n\n')

    return `以下是为同一批内容拟创建的多个新主题。你的任务是**合并去重**，将语义相近的主题归为一个。

## 拟建主题列表（含示例内容）
${topicsText}

## 要求
1. **大幅合并**：这些内容通常只属于 1-2 个大主题，不要保留细碎的小分类
2. **名称不超过5个字**：用大类名（如"NLR"、"部署"、"认证"）
3. 如果多个拟建主题明显属于同一领域，直接用该领域最通用的名字作为唯一主题名
4. 为每个最终主题撰写摘要

返回 JSON：
{
  "topics": [
    { "name": "合并后的主题名（不超过5个字）", "description": "摘要" }
  ]
}

只返回 JSON。`
  }

  static readonly CURRENT_TIME_PLACEHOLDER = '{{CURRENT_TIME}}'

  static chatSystemRole(searchResult?: string, memoryResult?: string, visionResult?: string): string {
    const searchSection = searchResult
      ? `\n\n## 互联网搜索结果\n${searchResult}\n`
      : ''
    const memorySection = memoryResult
      ? `\n\n## 记忆搜索结果\n${memoryResult}\n`
      : ''
    const visionSection = visionResult
      ? `\n\n## 图片描述\n${visionResult}\n`
      : ''

    return `你是一个智能助手，拥有联网搜索和记忆搜索能力。

## 当前时间
${Prompts.CURRENT_TIME_PLACEHOLDER}

${searchSection}

${memorySection}

${visionSection}

## 指南
1. 优先使用记忆搜索结果中的信息回答，因为这是用户的历史上下文
2. 如果互联网搜索结果中有更新的信息，可以补充记忆中的内容
3. 如果搜索结果为空或与问题无关，基于自身知识回答
4. 回答时自然地融合信息，不要提及"搜索结果"或"记忆"等来源
5. 使用中文回答`
  }

  static fillCurrentTime(systemPrompt: string): string {
    return systemPrompt.replace(Prompts.CURRENT_TIME_PLACEHOLDER, new Date().toLocaleString('zh-CN'))
  }

  static searchNeedsAnalysis(historyText: string, currentQuery: string): string {
    return `你是一个智能搜索决策专家。请分析用户当前问题，判断是否需要搜索互联网和/或搜索记忆。

## 最近对话历史（最多3轮）
${historyText || '（暂无历史对话）'}

## 当前问题
${currentQuery}

## 输出要求
返回 JSON 格式：
{
  "searchWebReason": "解释为何要搜索互联网",
  "searchWebMemoryReason": "解释为何要搜索记忆",
  "needSearchWeb": true/false,
  "webKeywords": ["关键词1", "关键词2"],
  "needSearchMemory": true/false,
  "memoryQuery": "搜索关键词（如果需要搜索记忆）"
}

## 判断标准

### 搜索互联网的情况
1. 用户询问实时信息（新闻、天气、股价等）
2. 用户询问最新的技术、产品、事件
3. 用户需要查找特定网站、资源、工具
4. 对话历史中没有相关信息，需要外部知识
5. 用户明确要求"搜索"、"查一下"、"帮我找"等

### 不需要搜索互联网的情况
1. 纯粹的通用知识问题（历史、科学原理等）
2. 完全基于当前对话历史就能回答的问题
3. 简单的问候、闲聊
4. 创意写作、翻译、代码生成等任务

### 搜索记忆的情况
1. 用户消息中出现了在对话历史中信息很少的词
2. 查询涉及用户个人信息、偏好、历史记录
3. 查询上下文不明确，需要更多背景信息
4. 用户提到"之前"、"上次"、"以前"等指向过去的词汇

### 不需要搜索记忆的情况
1. 纯粹的通用知识问题
2. 完全基于当前对话历史就能回答的问题
3. 简单的问候或闲聊

只返回 JSON，不要其他内容。`
  }

  static confirmSearchWeb(historyText: string, currentQuery: string, webpagesText: string): string {
    return `判断缓存的网页内容是否足以回答用户当前问题。

## 最近对话历史
${historyText || '（暂无历史对话）'}

## 当前问题
${currentQuery}

## 已缓存的网页
${webpagesText}

如果缓存内容足以回答问题，返回 false（不需要重新搜索）。
如果缓存内容不足，需要重新搜索，返回 true。

只返回 true 或 false。`
  }

  static batchTopicMatch(
    titledChunks: Array<{ index: number; title: string }>,
    existingTopics: Array<{ name: string; description: string }>
  ): string {
    const topicsText =
      existingTopics.length === 0
        ? '暂无已有主题'
        : existingTopics.map((t) => `- ${t.name}: ${t.description}`).join('\n')

    const chunksText = titledChunks
      .map((c) => `[片段${c.index}] ${c.title}`)
      .join('\n')

    return `## 任务
根据以下片段的标题，为它们统一规划主题归属。这些标题来自同一篇文档的切分结果。

## 已有主题
${topicsText}

## 片段标题列表
${chunksText}

## 规则
1. **优先复用已有主题**：只要片段标题与某个已有主题大致相关就选它
2. **控制新主题数量**：只有当所有已有主题都与某片段明显无关时才创建新主题
3. **同源片段倾向归一**：来自同一篇文档通常属于 **1-2 个大主题**，绝不要给每个片段都建新主题
4. 新主题名称**不超过5个字**，使用大类名（如"NLR"、"部署"、"认证"），不要用细碎描述
5. 如果所有新片段明显都在描述同一个大领域，只建一个主题，直接用该领域名

## 返回格式（严格 JSON）
{
  "plans": [
    {
      "index": 0,
      "action": "select",
      "topicName": "已有主题名",
      "reason": "为什么归入这个主题"
    },
    {
      "index": 2,
      "action": "create",
      "newTopicName": "新建主题名",
      "reason": "为什么需要新主题"
    }
  ]
}

注意：
- index 必须与上方片段编号一致
- action 为 select 时，topicName **必须是已有主题列表中的短名称**（如"NLR"、"部署"），**绝不是描述文字**
- action 为 create 时必须提供 newTopicName
- 只返回 JSON，不要包含其他内容`
  }
}
