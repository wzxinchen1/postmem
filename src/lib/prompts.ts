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

  static cutAndRewrite(text: string, charRange: string = '200-500', instruction?: string): string {
    const instructionBlock = instruction
      ? `\n\n## 用户的特殊要求\n${instruction}\n请在切分时严格遵循上述要求。`
      : ''
    return `请将以下文本切分为语义完整的片段，为每个片段生成标题并重写使其连贯自足。${instructionBlock}

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
3. 每个片段建议 ${charRange} 字符
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

  static topicMatchExpert(): string {
    return `你是知识库的主题分类助手。Always respond with valid JSON only.`
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

  static readonly CURRENT_TIME_PLACEHOLDER = '{{CURRENT_TIME}}'

  static chatSystemRole(searchResult?: string, memoryResult?: string, visionResult?: string, userProfile?: string): string {
    const searchSection = searchResult
      ? `\n\n## 互联网搜索结果\n${searchResult}\n`
      : ''
    const memorySection = memoryResult
      ? `\n\n## 记忆搜索结果\n${memoryResult}\n`
      : ''
    const visionSection = visionResult
      ? `\n\n## 图片描述\n${visionResult}\n`
      : ''
    const userProfileSection = userProfile
      ? `\n\n## 用户信息\n${userProfile}\n`
      : ''

    return `你是一个智能助手，拥有联网搜索和记忆搜索能力。

## 当前时间
${Prompts.CURRENT_TIME_PLACEHOLDER}
${userProfileSection}
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

  static searchNeedsAnalysis(
    historyText: string,
    currentQuery: string,
    options?: { includeWebSearch?: boolean; includeMemorySearch?: boolean }
  ): string {
    let includeWeb = true
    let includeMemory = true
    if (options !== undefined && options !== null) {
      if (options.includeWebSearch === false) {
        includeWeb = false
      }
      if (options.includeMemorySearch === false) {
        includeMemory = false
      }
    }

    const outputFields: string[] = []
    if (includeWeb) {
      outputFields.push(`  "searchWebReason": "解释为何要搜索互联网",`)
      outputFields.push(`  "needSearchWeb": true/false,`)
      outputFields.push(`  "webKeywords": ["关键词1", "关键词2"],`)
    }
    if (includeMemory) {
      outputFields.push(`  "searchMemoryReason": "解释为何要搜索记忆",`)
      outputFields.push(`  "needSearchMemory": true/false,`)
      outputFields.push(`  "memoryQuery": "搜索关键词（如果需要搜索记忆，否则为null）",`)
    }

    let searchScope: string
    if (includeWeb && includeMemory) {
      searchScope = '，判断是否需要搜索互联网和/或搜索记忆'
    } else if (includeWeb) {
      searchScope = '，判断是否需要搜索互联网'
    } else {
      searchScope = '，判断是否需要搜索记忆'
    }

    const sections: string[] = [
      `你是一个智能搜索决策专家。请分析用户当前问题${searchScope}。`,
      ``,
      `## 最近对话历史（最多3轮）`,
      historyText,
      ``,
      `## 当前问题`,
      currentQuery,
      ``,
      `## 输出要求`,
      `返回 JSON 格式：`,
      `{`,
      ...outputFields,
      `}`,
    ]

    if (includeWeb) {
      sections.push(
        ``,
        `## webKeywords 生成规则（非常重要）`,
        `1. **必须严格基于用户原查询**，不能自由联想或脑补`,
        `2. 优先使用用户问题中的原词作为关键词`,
        `3. 如果原词过于口语化/网络用语，可以补充其标准含义的同义词，但**必须确保含义一致**`,
        `4. **禁止**：将用户的查询错误归因到其他领域（如"翻机"≠"翻墙"）`,
        `5. **禁止**：添加用户没有提及的无关子话题`,
        `6. **如果无法确定准确关键词，直接使用用户原句搜索**`,
      )
    }

    if (includeWeb) {
      sections.push(
        ``,
        `## 需要搜索互联网的情况`,
        `1. 用户询问实时信息（新闻、天气、股价等）`,
        `2. 用户询问最新的技术、产品、事件`,
        `3. 用户需要查找特定网站、资源、工具`,
        `4. 对话历史中没有相关信息，需要外部知识`,
        `5. 用户明确要求"搜索"、"查一下"、"帮我找"等`,
        ``,
        `## 不需要搜索互联网的情况`,
        `1. 纯粹的通用知识问题（历史、科学原理等）`,
        `2. 完全基于当前对话历史就能回答的问题`,
        `3. 简单的问候、闲聊`,
        `4. 创意写作、翻译、代码生成等任务`,
      )
    }

    if (includeMemory) {
      sections.push(
        ``,
        `## 需要搜索记忆的情况`,
        `1. 用户消息中出现了在对话历史中信息很少的词`,
        `2. 查询涉及用户个人信息、偏好、历史记录`,
        `3. 查询上下文不明确，需要更多背景信息`,
        `4. 用户提到"之前"、"上次"、"以前"等指向过去的词汇`,
        ``,
        `## 不需要搜索记忆的情况`,
        `1. 纯粹的通用知识问题`,
        `2. 完全基于当前对话历史就能回答的问题`,
        `3. 简单的问候或闲聊`,
      )
    }

    sections.push(``, `只返回 JSON，不要其他内容。`)

    return sections.join('\n')
  }

  static confirmSearchWeb(historyText: string, currentQuery: string, webpagesText: string): string {
    return `判断缓存的网页内容是否足以回答用户当前问题。

## 最近对话历史
${historyText || '（暂无历史对话）'}

## 当前问题
${currentQuery}

## 已缓存的网页（含缓存时间）
${webpagesText}

判断时需考虑时效性：
- 如果用户询问的是新闻、实时信息或时效性强的內容，而缓存网页的缓存时间较早，则缓存可能已过时，需要重新搜索
- 如果用户询问的是通用知识、技术文档等非时效性内容，则缓存时间影响不大，缓存摘要若已覆盖核心信息即可判为足够

如果缓存内容足以回答问题，返回 false（不需要重新搜索）。
如果缓存内容不足或可能过时，需要重新搜索，返回 true。

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
1. **只能从已有主题中选择**，禁止创建新主题
2. 只要片段标题与某个已有主题大致相关就归入该主题
3. 如果所有已有主题都与某片段**明显无关**，则标记为"none"（未分类）
4. **同源片段倾向归一**：来自同一篇文档的片段应尽量归入**相同的 1-2 个主题**

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
      "action": "none",
      "reason": "为什么现有主题都不匹配"
    }
  ]
}

注意：
- index 必须与上方片段编号一致
- action 为 select 时，topicName **必须是已有主题列表中的短名称**（如"NLR"、"部署"），**绝不是描述文字**
- action 为 none 时，不需要提供 topicName
- 只返回 JSON，不要包含其他内容`
  }

  static mergeExpert(): string {
    return '你是一位文本合并专家。Always respond with valid JSON only.'
  }

  static mergeTexts(chunks: Array<{ title: string; content: string }>): string {
    const chunksText = chunks
      .map((c, i) => `[片段${i + 1}] ${c.title}\n${c.content}`)
      .join('\n\n')

    return `请将以下多个文本片段合并为一段连贯完整的文本。这些片段来自同一份文档或话题，需要将它们合为一个整体。

## 待合并的片段
${chunksText}

## 要求
1. 合并后的文本必须包含所有片段中的核心信息、关键论据和推理逻辑，但不必逐句保留原文
2. 消除重复内容，将语义相近的部分自然融合
3. 调整语序使文本逻辑连贯、层次清晰
4. 修复片段间的断裂感，补充必要的衔接语
5. 保持原文的语气和风格
6. 允许省略重复的论证轮次、口语化的来回反驳、以及上下文切换时的元对话
7. 为合并后的文本生成一个总括性标题（10字以内）

## 返回格式（严格 JSON）
{
  "title": "合并后标题（10字以内）",
  "content": "合并后的完整文本"
}

只返回 JSON，不要有其他说明文字`
  }

  static webpageSummary(webpage: { title: string; url: string; content: string }): string {
    return `请阅读以下网页内容，并生成一个精简摘要（500字以内），提炼核心信息和关键要点。

## 网页信息
标题：${webpage.title}
URL：${webpage.url}

## 正文
${webpage.content}

## 要求
1. 摘要需涵盖该网页的核心主题和主要观点
2. 保留关键数据、事实和结论，不要丢失实质性细节
3. 语言简洁明了，用中文撰写
4. 字数控制在500字以内
5. 直接输出摘要文本，不要添加解释、评价或其他内容`
  }
}
