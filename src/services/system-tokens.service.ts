import { redis } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

const REDIS_KEY_TOKENS = 'system_tokens:default'
const REDIS_KEY_PROMPT = 'system_tokens:default_prompt'

const CALIBRATION_USER_MESSAGE = '1'

export class SystemTokensService {
  async getSystemTokens(systemPrompt: string, agent: unknown): Promise<number> {
    const cachedPrompt = await redis.get(REDIS_KEY_PROMPT)
    const cachedTokens = await redis.get(REDIS_KEY_TOKENS)

    if (cachedPrompt !== null && cachedTokens !== null) {
      if (cachedPrompt === systemPrompt) {
        logger.info('[SystemTokens] 默认提示词与缓存一致，使用缓存 token', { systemTokens: Number(cachedTokens) })
        return Number(cachedTokens)
      }

      const tokens = await this.calibrate(systemPrompt, agent)
      logger.info('[SystemTokens] 非默认提示词，校准完成', { systemTokens: tokens })
      return tokens
    }

    const tokens = await this.calibrate(systemPrompt, agent)
    await redis.set(REDIS_KEY_PROMPT, systemPrompt)
    await redis.set(REDIS_KEY_TOKENS, String(tokens))
    logger.info('[SystemTokens] 首次校准默认提示词 token 并缓存', { systemTokens: tokens })
    return tokens
  }

  private async calibrate(systemPrompt: string, agent: unknown): Promise<number> {
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(CALIBRATION_USER_MESSAGE),
    ]

    const agentInstance = agent as { invoke: (messages: unknown[]) => Promise<Record<string, unknown>> }
    const response = await agentInstance.invoke(messages)

    const usage = (response as any).usage_metadata
    if (!usage || typeof usage.input_tokens !== 'number') {
      logger.error('[SystemTokens] 校准失败：API 未返回 input_tokens', { usage: JSON.stringify(usage) })
      throw new Error('系统提示词 token 校准失败：API 未返回 input_tokens')
    }
    const inputTokens = usage.input_tokens

    const systemTokens = inputTokens - 1
    logger.info('[SystemTokens] 校准完成', { inputTokens, systemTokens })
    return systemTokens
  }

  static async calibrateContent(agent: unknown, content: string): Promise<number> {
    const messages = [
      new HumanMessage(content),
    ]

    const agentInstance = agent as { invoke: (messages: unknown[]) => Promise<Record<string, unknown>> }
    const response = await agentInstance.invoke(messages)

    const usage = (response as any).usage_metadata
    if (!usage || typeof usage.input_tokens !== 'number') {
      logger.error('[SystemTokens] 内容校准失败：API 未返回 input_tokens', { usage: JSON.stringify(usage) })
      throw new Error('内容 token 校准失败：API 未返回 input_tokens')
    }
    const inputTokens = usage.input_tokens

    const contentTokens = inputTokens
    logger.info('[SystemTokens] 内容校准完成', { inputTokens, contentTokens })
    return contentTokens
  }
}
