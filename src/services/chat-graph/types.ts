import { Annotation } from '@langchain/langgraph'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type { ChatMessageImage, ToolCall } from '@/src/types'

export enum ChatNode {
  Init = 'init',
  SaveMemory = 'saveMemory',
  RecognizeImage = 'recognizeImage',
  FetchUrl = 'fetchUrl',
  Search = 'search',
  StreamLLM = 'streamLLM',
  Finalize = 'finalize',
}

export const ChatGraphState = Annotation.Root({
  conversationId: Annotation<string>,
  modelId: Annotation<string>,
  kbId: Annotation<string>,
  topicIds: Annotation<string[]>,
  agent: Annotation<unknown>,
  modelName: Annotation<string>,
  searchMemory: Annotation<boolean>,
  searchWeb: Annotation<boolean>,
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
  finalMessages: Annotation<(SystemMessage | HumanMessage | AIMessage)[]>,
  images: Annotation<ChatMessageImage[]>,
  urls: Annotation<string[]>,
  hasVisionCapability: Annotation<boolean>,
  recognizedText: Annotation<string>,
  fetchedUrlContent: Annotation<string>,
  systemTokens: Annotation<number>,
  lastUserMessageId: Annotation<string>,
  toolCalls: Annotation<ToolCall[]>,
})

export type ChatState = typeof ChatGraphState.State


