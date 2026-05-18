import { Annotation } from '@langchain/langgraph'
import { StateGraph, START, END } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { ChatMessage } from '@/src/types'
import { ConversationService } from '@/src/services/conversation.service'
import { SearchService } from '@/src/services/chat-search.service'
import { ChatMemoryService } from '@/src/services/chat-memory.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { SSEService } from '@/src/services/sse.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { createId } from '@paralleldrive/cuid2'
import { logger } from '@/src/lib/logger'

export enum ChatNode {
  Init = 'init',
  SaveMemory = 'saveMemory',
  Search = 'search',
  StreamLLM = 'streamLLM',
  Finalize = 'finalize',
}

const ChatGraphState = Annotation.Root({
  conversationId: Annotation<string>,
  modelId: Annotation<string>,
  kbId: Annotation<string>,
  agent: Annotation<ChatOpenAI>,
  modelName: Annotation<string>,
  fullContent: Annotation<string>({ reducer: (a, b) => a + b, default: () => '' }),
  promptTokens: Annotation<number>,
  completionTokens: Annotation<number>,
  searchResult: Annotation<string>,
  memoryText: Annotation<string>,
  cancelled: Annotation<boolean>,
  langchainMessages: Annotation<(HumanMessage | AIMessage)[]>,
  finalMessages: Annotation<(SystemMessage | HumanMessage | AIMessage)[]>,
})

export type ChatState = typeof ChatGraphState.State

interface GraphDependencies {
  prisma: PrismaClient
  conversationService: ConversationService
  searchService: SearchService
  chatMemoryService: ChatMemoryService
  chatSettingService: ChatSettingService
  chatModelFactory: ChatModelFactory
  sseService: SSEService
  providerService: ProviderService
  modelService: ModelService
  kbService: KBService
}

function createNodes(deps: GraphDependencies) {
  async function initNode(state: ChatState): Promise<Partial<ChatState>> {
    const model = await deps.modelService.get(state.modelId)
    if (!model) {
      throw new Error(`模型 ${state.modelId} 不存在`)
    }

    const provider = await deps.providerService.get(model.providerId)
    if (!provider) {
      throw new Error('模型对应的提供商不存在')
    }

    const chatSetting = await deps.chatSettingService.get()
    const agent = deps.chatModelFactory.createAgent(
      model.name,
      0.7,
      provider.apiKey,
      provider.baseUrl,
      chatSetting.maxOutputTokens
    )

    await deps.kbService.getKnowledgeBaseById(state.kbId)

    await deps.sseService.clearCancelled(state.conversationId)

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    const langchainMessages: (HumanMessage | AIMessage)[] = []
    for (const msg of chatMessages) {
      if (!msg.memoried) {
        if (msg.role === 'user') {
          langchainMessages.push(new HumanMessage(msg.content))
        } else if (msg.role === 'assistant') {
          langchainMessages.push(new AIMessage(msg.content))
        }
      }
    }

    logger.info('[ChatGraph] init 完成', { conversationId: state.conversationId })

    return {
      agent,
      modelName: model.name,
      langchainMessages,
    }
  }

  async function saveMemoryNode(state: ChatState): Promise<Partial<ChatState>> {
    if (await deps.sseService.isCancelled(state.conversationId)) {
      return { cancelled: true }
    }

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    if (chatMessages.length === 0) {
      return {}
    }

    const chatSetting = await deps.chatSettingService.get()
    const memoryThreshold = chatSetting.memoryContextThreshold * 1000

    const KEEP_RECENT_COUNT = 3
    const maxMemoryIndex = chatMessages.length - KEEP_RECENT_COUNT

    let firstUnmemoriedIndex = -1
    for (let i = 0; i < maxMemoryIndex; i++) {
      if (!chatMessages[i].memoried) {
        firstUnmemoriedIndex = i
        break
      }
    }

    if (firstUnmemoriedIndex === -1) {
      return {}
    }

    const unmemoriedMessages: ChatMessage[] = []
    for (let i = firstUnmemoriedIndex; i < maxMemoryIndex; i++) {
      unmemoriedMessages.push(chatMessages[i])
    }

    let currentTokens = 0
    for (const msg of unmemoriedMessages) {
      currentTokens += msg.tokens
      if (currentTokens >= memoryThreshold) {
        break
      }
    }

    if (currentTokens < memoryThreshold) {
      return {}
    }

    const memorizedMessageIds = await deps.chatMemoryService.createMemory(
      unmemoriedMessages,
      state.conversationId,
      state.kbId,
      state.agent
    )

    for (const msgId of memorizedMessageIds) {
      await deps.conversationService.markMessageMemoried(msgId)
    }

    logger.info('[ChatGraph] saveMemory 完成', { memorizedCount: memorizedMessageIds.length })

    return {}
  }

  async function searchNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (state.langchainMessages.length < 1) {
      const systemPrompt = Prompts.chatSystemRole(
        '本轮对话没有触发搜索',
        '本轮对话没有触发记忆搜索'
      )
      return {
        searchResult: '',
        memoryText: '',
        finalMessages: [new SystemMessage(systemPrompt), ...state.langchainMessages],
      }
    }

    if (await deps.sseService.isCancelled(state.conversationId)) {
      return { cancelled: true }
    }

    const recentMessages = state.langchainMessages.slice(-6).map(msg => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map(c => typeof c === 'string' ? c : ((c as any).text ?? '')).join('')
          : ''
      return {
        role: msg instanceof HumanMessage ? 'user' as const : 'assistant'as const,
        content
      }
    })

    const searchNeeds = await deps.searchService.analyzeSearchNeeds(
      state.agent,
      recentMessages
    )

    let searchResult = ''
    let memoryText = ''

    if (searchNeeds.needSearchWeb && searchNeeds.webKeywords.length > 0) {
      await deps.sseService.emit({ type: 'status', status: 'searchingWeb' })

      const cachedWebpages = await deps.searchService.getCachedWebpages(searchNeeds.webKeywords)

      const confirm = await deps.searchService.confirmNeedSearchWeb(
        recentMessages,
        state.agent,
        cachedWebpages
      )

      if (confirm) {
        const webpages = await deps.searchService.searchWeb(searchNeeds.webKeywords)
        await deps.searchService.saveWebpages(webpages)
        searchResult = webpages.map(w =>
          `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
        ).join('\n\n')
      } else {
        searchResult = cachedWebpages.map(w => {
          if (!w.title) throw Errors.internalError(`网页 ${w.url} 缺少标题`)
          return `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
        }).join('\n\n')
      }

      await deps.sseService.emit({ type: 'status', status: 'searchingWeb' })
    }

    if (searchNeeds.needSearchMemory && searchNeeds.memoryQuery) {
      await deps.sseService.emit({ type: 'status', status: 'searchingMemory' })

      const similarSummaries = await deps.chatMemoryService.searchSimilar(
        state.kbId,
        searchNeeds.memoryQuery
      )
      memoryText = similarSummaries.map(s => s.content).join('\n\n')

      await deps.sseService.emit({ type: 'status', status: 'searchingMemory' })
    }

    const systemPrompt = Prompts.chatSystemRole(
      searchResult || '本轮对话没有触发搜索',
      memoryText || '本轮对话没有触发记忆搜索'
    )

    logger.info('[ChatGraph] search 完成', {
      needSearchWeb: searchNeeds.needSearchWeb,
      needSearchMemory: searchNeeds.needSearchMemory,
    })

    return {
      searchResult,
      memoryText,
      finalMessages: [new SystemMessage(systemPrompt), ...state.langchainMessages],
    }
  }

  async function streamLLMNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    const aiMessageId = createId()
    await deps.sseService.emit({ type: 'messageId', role: 'assistant', id: aiMessageId })

    let fullContent = ''
    let promptTokens = 0
    let completionTokens = 0
    let finishReason = ''

    const stream = await state.agent.stream(state.finalMessages)

    for await (const chunk of stream) {
      if (chunk.usage_metadata) {
        promptTokens = chunk.usage_metadata.input_tokens || promptTokens
        completionTokens = chunk.usage_metadata.output_tokens || completionTokens
      } else if (chunk.response_metadata) {
        promptTokens = chunk.response_metadata.prompt_eval_count ?? promptTokens
        completionTokens = chunk.response_metadata.eval_count ?? completionTokens
        finishReason = chunk.response_metadata?.finish_reason ?? ''
      }

      const content = chunk.content ?? ''
      fullContent += content

      if (content) {
        if (await deps.sseService.isCancelled(state.conversationId)) {
          break
        }
        await deps.sseService.emit({
          type: 'chunk',
          content,
          model: { id: state.modelId, name: state.modelName },
        })
      }
    }

    if (finishReason === 'length') {
      logger.warn('[ChatGraph] 输出因达到 maxTokens 被截断', { conversationId: state.conversationId, completionTokens })
      await deps.sseService.emit({ type: 'status', status: 'truncated' })
    }

    logger.info('[ChatGraph] streamLLM 完成', { promptTokens, completionTokens, finishReason })

    return {
      fullContent,
      promptTokens,
      completionTokens,
    }
  }

  async function finalizeNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      await deps.sseService.clearProcessing(state.conversationId)
      await deps.sseService.emit({ type: 'done' })
      await deps.sseService.clearMessageStream()
      await deps.sseService.clearCancelled(state.conversationId)
      return {}
    }

    await deps.conversationService.addMessage({
      conversationId: state.conversationId,
      role: 'assistant',
      content: state.fullContent,
      tokens: state.completionTokens,
      totalTokens: state.promptTokens + state.completionTokens,
      memoried: false,
      name: state.modelName,
    })

    await deps.sseService.emit({
      type: 'usage',
      promptTokens: state.promptTokens,
      completionTokens: state.completionTokens,
    })

    await deps.sseService.clearProcessing(state.conversationId)
    await deps.sseService.emit({ type: 'done' })

    await new Promise(resolve => setTimeout(resolve, 1000))
    await deps.sseService.clearMessageStream()
    await deps.sseService.clearCancelled(state.conversationId)

    logger.info('[ChatGraph] finalize 完成', { conversationId: state.conversationId })

    return {}
  }

  return { initNode, saveMemoryNode, searchNode, streamLLMNode, finalizeNode }
}

export function createChatGraph(deps: GraphDependencies) {
  const nodes = createNodes(deps)

  const graph = new StateGraph(ChatGraphState)
    .addNode(ChatNode.Init, nodes.initNode)
    .addNode(ChatNode.SaveMemory, nodes.saveMemoryNode)
    .addNode(ChatNode.Search, nodes.searchNode)
    .addNode(ChatNode.StreamLLM, nodes.streamLLMNode)
    .addNode(ChatNode.Finalize, nodes.finalizeNode)
    .addEdge(START, ChatNode.Init)
    .addEdge(ChatNode.Init, ChatNode.SaveMemory)
    .addEdge(ChatNode.SaveMemory, ChatNode.Search)
    .addEdge(ChatNode.Search, ChatNode.StreamLLM)
    .addEdge(ChatNode.StreamLLM, ChatNode.Finalize)
    .addEdge(ChatNode.Finalize, END)

  return graph.compile()
}

export type CompiledChatGraph = ReturnType<typeof createChatGraph>
