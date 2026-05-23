import { setup, before } from './runner'
import type { TestContext } from './runner'
import {
  createClient,
  getTestKbId,
  getTestModelId,
  cleanupConversations,
  cleanupMemories,
  cleanupWebpages,
  getWebpageCount,
  waitForProcessingCleared,
  startConsume,
  chatAndWait,
  setMockChatSetting,
  setModelHasVision,
  assertTruthy,
  assertEqual,
  assertGreaterThan,
  assertLessThanOrEqual,
  assertContains,
  assertNotEqual,
  diagnoseMemories,
  assertApiError,
} from './helpers'
import type { ApiErrorCode } from './helpers'
import type { PostMemClient, ChatRequest } from '../../packages/postmem-sdk/dist/index.mjs'
import type { ChatAndWaitResult } from './helpers'

export abstract class ChatTestFixture {
  protected client!: PostMemClient
  protected kbId!: string
  protected modelId!: string
  protected convId1!: string

  /**
   * 覆盖此方法实现 mock 专用或 real-llm 专用的 setup 逻辑。
   * 子类在 setup 中调用 super.setup(ctx)，再添加自己的初始化。
   */
  protected async doSetup(_ctx: TestContext): Promise<void> {
    // 子类重写
  }

  /**
   * 覆盖此方法在每个测试前执行额外逻辑
   */
  protected async doBefore(): Promise<void> {
    // 子类重写
  }

  /**
   * 注册 setup/before 到 runner（子类在文件末尾调用）
   */
  protected registerHooks(): void {
    setup(async (ctx: TestContext) => {
      this.client = createClient()
      this.kbId = await getTestKbId()
      this.modelId = await getTestModelId()
      await startConsume(this.client)
      await this.doSetup(ctx)
    })

    before(async () => {
      await cleanupConversations()
      await this.doBefore()
    })
  }

  // ─── 封装的聊天方法 ──────────────────────────────────────

  protected async chat(request: ChatRequest): Promise<ChatAndWaitResult> {
    return chatAndWait(this.client, request)
  }

  // ─── 断言方法 ────────────────────────────────────────────

  protected assertEqual<T>(actual: T, expected: T, label: string): void {
    assertEqual(actual, expected, label)
  }

  protected assertTruthy<T>(value: T, label: string): void {
    assertTruthy(value, label)
  }

  protected assertGreaterThan(actual: number, threshold: number, label: string): void {
    assertGreaterThan(actual, threshold, label)
  }

  protected assertLessThanOrEqual(actual: number, threshold: number, label: string): void {
    assertLessThanOrEqual(actual, threshold, label)
  }

  protected assertContains(haystack: string, needle: string, label: string): void {
    assertContains(haystack, needle, label)
  }

  protected assertNotEqual<T>(actual: T, expected: T, label: string): void {
    assertNotEqual(actual, expected, label)
  }

  protected async assertApiError(
    res: Response,
    code: ApiErrorCode,
    params?: Record<string, string | number>,
  ): Promise<void> {
    await assertApiError(res, code, params)
  }

  // ─── 工具方法 ────────────────────────────────────────────

  protected async cleanupMemories(): Promise<void> {
    await cleanupMemories()
  }

  protected async cleanupWebpages(): Promise<void> {
    await cleanupWebpages()
  }

  protected async getWebpageCount(): Promise<number> {
    return getWebpageCount()
  }

  protected async waitForProcessingCleared(conversationId: string, timeoutMs?: number): Promise<void> {
    await waitForProcessingCleared(conversationId, timeoutMs)
  }

  protected async diagnoseMemories(
    kbId: string,
    expectedKeywords: string[],
    llmReply: string,
  ): Promise<void> {
    await diagnoseMemories(kbId, expectedKeywords, llmReply)
  }

  protected setMockChatSetting(settings: Record<string, unknown>): void {
    setMockChatSetting(settings as any)
  }

  protected setModelHasVision(hasVision: boolean): void {
    setModelHasVision(hasVision)
  }
}
