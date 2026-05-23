import { createModel } from './vendor-protocol.service'
import type { Vendor } from '@/src/types'
import { AppError } from '@/src/lib/errors'

interface CreateAgentParams {
  model: string
  apiKey?: string | null
  baseUrl?: string | null
  maxTokens?: number | null
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: string
  config?: Record<string, unknown>
}

export class ChatModelFactory {
  private agents: Map<string, unknown> = new Map()

  createAgent(vendor: Vendor, params: CreateAgentParams): unknown {
    const { model, apiKey, baseUrl, maxTokens, temperature = 0.7, reasoning, reasoningEffort, config } = params

    if (!model) {
      throw new AppError('CHAT_MODEL_FACTORY_MODEL_NAME_REQUIRED')
    }
    if (!apiKey) {
      throw new AppError('CHAT_MODEL_FACTORY_API_KEY_REQUIRED')
    }
    if (!baseUrl) {
      throw new AppError('CHAT_MODEL_FACTORY_BASE_URL_REQUIRED')
    }

    const instanceKey = `${baseUrl}_${model}`

    const existing = this.agents.get(instanceKey)
    if (existing) {
      return existing
    }

    const agent = createModel(vendor, {
      model,
      modelType: 'chat',
      apiKey,
      baseUrl,
      config: {
        temperature,
        ...(maxTokens ? { maxTokens } : {}),
        ...(typeof reasoning === 'boolean' ? { reasoning } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...config,
      },
    })

    this.agents.set(instanceKey, agent)
    return agent
  }

  hasAgent(key: string): boolean {
    return this.agents.has(key)
  }

  getAgent(key: string): unknown {
    const agent = this.agents.get(key)
    if (!agent) {
      throw new AppError('CHAT_MODEL_FACTORY_AGENT_NOT_FOUND', { key })
    }
    return agent
  }

  clearAll(): void {
    this.agents.clear()
  }
}
