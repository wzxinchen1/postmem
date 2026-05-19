import { Annotation } from '@langchain/langgraph'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'

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
  reasoningTokens: Annotation<number>,
  finishReason: Annotation<string>,
  searchResult: Annotation<string>,
  memoryText: Annotation<string>,
  cancelled: Annotation<boolean>,
  thinkingEffort: Annotation<string | undefined>,
  langchainMessages: Annotation<(HumanMessage | AIMessage)[]>,
  finalMessages: Annotation<(SystemMessage | HumanMessage | AIMessage)[]>},
)
