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
import { SSEService, DoneReason } from '@/src/services/sse.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { createId } from '@paralleldrive/cuid2'
import { logger } from '@/src/lib/logger'

const BALANCE_ERROR_PATTERNS = [
  /insufficient.?balance/i,
  /billing/i,
  /quota.exceeded/i,
  /payment.required/i,
  /account.deactivated/i,
  /credit.exhausted/i,
  /no.remaining.credit/i,
]

function isInsufficientBalanceError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const message = err.message
  const status = (err as any).status ?? (err as any).statusCode
  return status === 402 || BALANCE_ERROR_PATTERNS.some(p => p.test(message))
}

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
  userTokens: Annotation<number>,
  userTotalTokens: Annotation<number>,
  totalTokens: Annotation<number>,
  completionTokens: Annotation<number>,
  finishReason: Annotation<string>,
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
        role: msg instanceof HumanMessage ? 'user' as const : 'assistant' as const,
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
    let apiTotalPromptTokens = 0
    let completionTokens = 0
    let finishReason = ''

    try {
      const stream = await state.agent.stream(state.finalMessages)

      for await (const chunk of stream) {
        if (chunk.usage_metadata) {
          const meta = chunk.usage_metadata as any
          logger.info('[ChatGraph] 原始 usage_metadata', { raw: JSON.stringify(meta) })
          apiTotalPromptTokens = meta.input_tokens || apiTotalPromptTokens
          const rawOutputTokens = meta.output_tokens || 0
          const reasoningTokens = meta.output_token_details?.reasoning ?? 0
          completionTokens = rawOutputTokens - reasoningTokens
        } else if (chunk.response_metadata) {
          const meta = chunk.response_metadata as any
          apiTotalPromptTokens = Number(meta.prompt_eval_count ?? 0)
          completionTokens = Number(meta.eval_count ?? 0)
          finishReason = String(meta.finish_reason ?? '')
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
    } catch (err) {
      if (isInsufficientBalanceError(err)) {
        logger.error('[ChatGraph] 提供商 API 欠费', { conversationId: state.conversationId, errorMessage: (err as Error).message })
        await deps.sseService.emit({ type: 'done', reason: DoneReason.InsufficientBalance })
      }
      throw err
    }

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    const historyMessages = chatMessages.filter(m => !m.memoried && !m.metadata?.isWelcome)

    logger.info('[ChatGraph] 倒减开始', {
      apiInputTokens: apiTotalPromptTokens,
      messageCount: chatMessages.length,
      historyCount: historyMessages.length,
    })

    let remaining = apiTotalPromptTokens
    for (const m of historyMessages) {
      const before = remaining
      remaining -= m.tokens
      logger.info('[ChatGraph] 倒减步骤', {
        msgId: m.id,
        role: m.role,
        subtract: m.tokens,
        before,
        after: remaining,
      })
    }

    const userTokens = remaining
    const userTotalTokens = apiTotalPromptTokens
    const totalTokens = apiTotalPromptTokens + completionTokens

    logger.info('[ChatGraph] 倒减结果', {
      apiInputTokens: apiTotalPromptTokens,
      userTokens,
      userTotalTokens,
      totalTokens,
    })

    const allMessages = await deps.conversationService.getMessages(state.conversationId)
    const lastUserMsg = [...allMessages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      await deps.conversationService.updateMessageTokens(lastUserMsg.id, userTokens, userTotalTokens)
    }

    if (finishReason === 'length') {
      logger.warn('[ChatGraph] 输出因达到 maxTokens 被截断', { conversationId: state.conversationId, completionTokens })
      await deps.sseService.emit({ type: 'done', reason: DoneReason.Truncated, userTokens, userTotalTokens, totalTokens, completionTokens })
    }

    if (finishReason === 'content_filter' || finishReason === 'sensitive') {
      logger.warn('[ChatGraph] 输出因内容审核被拦截', { conversationId: state.conversationId, finishReason })
      await deps.sseService.emit({ type: 'done', reason: DoneReason.ContentFiltered, userTokens, userTotalTokens, totalTokens, completionTokens })
    }

    logger.info('[ChatGraph] streamLLM 完成', { userTokens, userTotalTokens, totalTokens, completionTokens, finishReason })

    return {
      fullContent,
      userTokens,
      userTotalTokens,
      totalTokens,
      completionTokens,
      finishReason,
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
      totalTokens: state.totalTokens,
      memoried: false,
      name: state.modelName,
    })

    const tokenError =
      !state.userTokens ? 'userTokens' :
        !state.userTotalTokens ? 'userTotalTokens' :
          !state.totalTokens ? 'totalTokens' :
            !state.completionTokens ? 'completionTokens' : null

    await deps.sseService.emit({
      type: 'done',
      error: tokenError
        ? `内部错误：${tokenError} 缺失或为0 (${tokenError}=${(state as any)[tokenError]})`
        : undefined,
      userTokens: state.userTokens ?? undefined,
      userTotalTokens: state.userTotalTokens ?? undefined,
      totalTokens: state.totalTokens ?? undefined,
      completionTokens: state.completionTokens ?? undefined,
    })

    await deps.sseService.clearProcessing(state.conversationId)

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
