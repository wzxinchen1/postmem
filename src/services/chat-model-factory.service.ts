import { ChatOpenAI } from '@langchain/openai'

export class ChatModelFactory {
  private agents: Map<string, ChatOpenAI> = new Map()

  createAgent(
    modelName: string,
    temperature: number,
    apiKey?: string | null,
    baseUrl?: string | null
  ): ChatOpenAI {
    if (!modelName) {
      throw new Error('modelName is required')
    }
    if (!apiKey) {
      throw new Error('apiKey is required')
    }
    if (!baseUrl) {
      throw new Error('baseUrl is required')
    }
    if (temperature < 0 || temperature > 1) {
      throw new Error('temperature must be between 0 and 1')
    }

    const actualModelName = modelName.includes('/')
      ? modelName.split('/').pop()!
      : modelName

    const instanceKey = `${baseUrl}_${actualModelName}`

    const existing = this.agents.get(instanceKey)
    if (existing) {
      return existing
    }

    const agent = new ChatOpenAI({
      model: actualModelName,
      temperature,
      apiKey,
      configuration: {
        baseURL: baseUrl,
      },
    })

    this.agents.set(instanceKey, agent)
    return agent
  }

  hasAgent(key: string): boolean {
    return this.agents.has(key)
  }

  getAgent(key: string): ChatOpenAI {
    const agent = this.agents.get(key)
    if (!agent) {
      throw new Error(`Agent ${key} not found`)
    }
    return agent
  }

  clearAll(): void {
    this.agents.clear()
  }
}