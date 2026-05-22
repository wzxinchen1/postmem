import { StateGraph, START, END } from '@langchain/langgraph'
import { ChatNode, ChatGraphState, type OnStreamError } from './types'
import { createInitNode } from './init.node'
import { createSaveMemoryNode } from './save-memory.node'
import { createRecognizeImageNode } from './recognize-image.node'
import { createFetchUrlNode } from './fetch-url.node'
import { createSearchNode } from './search.node'
import { createStreamLLMNode } from './stream-llm.node'
import { createFinalizeNode } from './finalize.node'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { ConversationService } from '@/src/services/conversation.service'
import { SearchService } from '@/src/services/chat-search.service'
import { ChatMemoryService } from '@/src/services/chat-memory.service'
import type { IChatSettingProvider } from '@/src/interfaces/chat-setting-provider'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { SSEService } from '@/src/services/sse.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'
import { AgentService } from '@/src/services/agent.service'
import { SystemTokensService } from '@/src/services/system-tokens.service'

export type ChatState = typeof ChatGraphState.State

export interface GraphDependencies {
  prisma: PrismaClient
  conversationService: ConversationService
  searchService: SearchService
  chatMemoryService: ChatMemoryService
  chatSettingService: IChatSettingProvider
  chatModelFactory: ChatModelFactory
  sseService: SSEService
  providerService: ProviderService
  modelService: ModelService
  kbService: KBService
  agentService: AgentService
  systemTokensService: SystemTokensService
  onError: OnStreamError
}

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

function createNodes(deps: GraphDependencies) {
  return {
    initNode: createInitNode(deps),
    saveMemoryNode: createSaveMemoryNode(deps),
    recognizeImageNode: createRecognizeImageNode(deps),
    fetchUrlNode: createFetchUrlNode(deps),
    searchNode: createSearchNode(deps),
    streamLLMNode: createStreamLLMNode(deps, isInsufficientBalanceError),
    finalizeNode: createFinalizeNode(deps),
  }
}

export function createChatGraph(deps: GraphDependencies) {
  const nodes = createNodes(deps)

  const graph = new StateGraph(ChatGraphState)
    .addNode(ChatNode.Init, nodes.initNode)
    .addNode(ChatNode.SaveMemory, nodes.saveMemoryNode)
    .addNode(ChatNode.RecognizeImage, nodes.recognizeImageNode)
    .addNode(ChatNode.FetchUrl, nodes.fetchUrlNode)
    .addNode(ChatNode.Search, nodes.searchNode)
    .addNode(ChatNode.StreamLLM, nodes.streamLLMNode)
    .addNode(ChatNode.Finalize, nodes.finalizeNode)
    .addEdge(START, ChatNode.Init)
    .addEdge(ChatNode.Init, ChatNode.SaveMemory)
    .addEdge(ChatNode.SaveMemory, ChatNode.RecognizeImage)
    .addEdge(ChatNode.RecognizeImage, ChatNode.FetchUrl)
    .addEdge(ChatNode.FetchUrl, ChatNode.Search)
    .addEdge(ChatNode.Search, ChatNode.StreamLLM)
    .addEdge(ChatNode.StreamLLM, ChatNode.Finalize)
    .addEdge(ChatNode.Finalize, END)

  return graph.compile()
}

export type CompiledChatGraph = ReturnType<typeof createChatGraph>
export { ChatNode, ChatGraphState }
