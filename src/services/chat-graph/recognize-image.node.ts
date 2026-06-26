import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { HumanMessage } from '@langchain/core/messages'
import { StreamStatus } from '@/src/types'
import { logger } from '@/src/lib/logger'
import { AppError } from '@/src/lib/errors'

export function createRecognizeImageNode(deps: GraphDependencies) {
  return async function recognizeImageNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (!state.images || state.images.length === 0) {
      return { hasVisionCapability: false }
    }

    if (state.hasVisionCapability) {
      logger.info('[ChatGraph] recognizeImage 模型支持 vision，跳过识图', {
        conversationId: state.conversationId,
        imageCount: state.images.length,
      })
      return {}
    }

    await deps.sseService.emit({ type: 'status', status: StreamStatus.Recognizing, conversationId: state.conversationId })

    const visionAgent = await deps.agentService.getVisionAgent()

    const imageContents = [
      { type: 'text' as const, text: '请详细描述这张图片的内容。' },
      ...state.images.map(img => ({
        type: 'image_url' as const,
        image_url: { url: img.url },
      })),
    ]

    const visionMessage = new HumanMessage({ content: imageContents as any })

    logger.info('[ChatGraph] recognizeImage 开始识图', {
      conversationId: state.conversationId,
      imageCount: state.images.length,
    })

    let recognizedText: string
    const visionResponse = await (visionAgent as { invoke: (messages: unknown[]) => Promise<Record<string, unknown>> }).invoke([visionMessage])
    recognizedText = typeof visionResponse.content === 'string'
      ? visionResponse.content
      : Array.isArray(visionResponse.content)
        ? visionResponse.content.map((c: any) => typeof c.text === 'string' ? c.text : '').filter(Boolean).join('')
        : ''

    if (!recognizedText) {
      throw new AppError('AGENT_VISION_EMPTY_RESPONSE')
    }

    logger.info('[ChatGraph] recognizeImage 识图完成', {
      conversationId: state.conversationId,
      recognizedTextLength: recognizedText.length,
      recognizedTextPreview: recognizedText.slice(0, 100),
    })

    await deps.sseService.emit({ type: 'status', status: StreamStatus.Recognizing, conversationId: state.conversationId })

    return { recognizedText }
  }
}