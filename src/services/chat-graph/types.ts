import { Annotation } from '@langchain/langgraph'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { ConversationService } from '@/src/services/conversation.service'
import { SearchService } from '@/src/services/chat-search.service'
import { ChatMemoryService } from '@/src/services/chat-memory.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { SSEService } from '@/src/services/sse.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'

export enum ChatNode {
  Init = 'init',
  SaveMemory = 'saveMemory',
  Search = 'search',
  StreamLLM = 'streamLLM',
  Finalize = 'finalize',
}

export const ChatGraphState = Annotation.Root({
  conversationId: Annotation<string>,
  modelId: Annotation<string>,
  kbId: Annotation<string>,
  agent: Annotation<unknown>,
  modelName: Annotation<string>,
  fullContent: Annotation<string>({ reducer: (a: string, b: string) => a + b, default: () => '' }),
  userTokens: Annotation<number>,
  userTotalTokens: Annotation<number>,
  totalTokens: Annotation<number>,
  completionTokens: Annotation<number>,
  finishReason: Annotation<string>,
  searchResult: Annotation<string>,
  memoryText: Annotation<string>,
  cancelled: Annotation<boolean>,
  enableThinking: Annotation<boolean>,
  thinkingEffort: Annotation<string>,
  langchainMessages: Annotation<(HumanMessage | AIMessage)[]>,
  finalMessages: Annotation<(SystemMessage | HumanMessage | AIMessage)[]>},
)
