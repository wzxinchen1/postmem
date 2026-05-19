import type { ChatState, GraphDependencies } from './types'
import { HumanMessage } from '@langchain/core/messages'
import { StreamStatus } from '@/src/services/sse.service'
import { logger } from '@/src/lib/logger'
import { Errors } from '@/src/lib/errors'

export function createRecognizeImageNode(deps: GraphDependencies) {
  return async function recognizeImageNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (!state.images || state.images.length === 0) {
      return { hasVisionCapability: false, recognizedText: '' }
    }

    if (state.hasVisionCapability) {
      logger.info('[ChatGraph] recognizeImage 模型支持 vision，跳过识图', {
        conversationId: state.conversationId,
        imageCount: state.images.length,
      })
      return { recognizedText: '' }
    }

    await deps.sseService.emit({ type: 'status', status: StreamStatus.Recognizing })

    const visionModel = await deps.modelService.getDefaultByCapability('vision')
    if (!visionModel) {
      throw Errors.internalError('当前模型不支持图片处理，且系统中没有配置识图模型（vision capability），无法处理图片')
    }

    const visionProvider = await deps.providerService.get(visionModel.providerId)
    if (!visionProvider) {
      throw Errors.internalError(`识图模型 ${visionModel.name} 对应的提供商不存在`)
    }
    if (!visionProvider.vendor) {
      throw Errors.internalError(`识图模型的提供商 ${visionProvider.id} 未关联厂商`)
    }

    const visionAgent = deps.chatModelFactory.createAgent(visionProvider.vendor, {
      model: visionModel.name,
      apiKey: visionProvider.apiKey,
      baseUrl: visionProvider.baseUrl,
      config: { capabilities: visionModel.capabilities, reasoning: false },
    })

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
      visionModelName: visionModel.name,
      imageCount: state.images.length,
    })

    const visionResponse = await (visionAgent as { invoke: (messages: unknown[]) => Promise<Record<string, unknown>> }).invoke([visionMessage])
    const recognizedText = typeof visionResponse.content === 'string'
      ? visionResponse.content
      : Array.isArray(visionResponse.content)
        ? visionResponse.content.map((c: any) => c.text ?? '').join('')
        : ''

    if (!recognizedText) {
      throw Errors.internalError('识图模型返回了空内容，无法处理图片')
    }

    logger.info('[ChatGraph] recognizeImage 识图完成', {
      conversationId: state.conversationId,
      recognizedTextLength: recognizedText.length,
      recognizedTextPreview: recognizedText.slice(0, 100),
    })

    await deps.sseService.emit({ type: 'status', status: StreamStatus.Recognizing })

    return { recognizedText }
  }
}