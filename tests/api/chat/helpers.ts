import { PostMemClient } from '@postmem/sdk'
import { PrismaClient } from '@/src/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
import Redis from 'ioredis'

const BASE_URL = 'http://localhost:3000'
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '192.168.50.236',
  port: Number(process.env.REDIS_PORT) || 6379,
  db: Number(process.env.REDIS_DB) || 5,
  password: process.env.REDIS_PASSWORD || undefined,
}

export function createClient(): PostMemClient {
  return new PostMemClient({ baseUrl: BASE_URL, requestTimeout: 30_000, redis: REDIS_CONFIG })
}

export async function getTestKbId(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/kb/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const json = await res.json()
  const kbNames = json.data.kbNames
  if (!kbNames || kbNames.length === 0) {
    throw new Error('没有可用的知识库，请先创建知识库')
  }
  return kbNames[0].kbId
}

export async function getTestModelId(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/models/default`)
  const json = await res.json()
  if (!json.data?.model?.id) {
    throw new Error('没有默认模型，请先配置模型')
  }
  return json.data.model.id
}

export function getBaseUrl(): string {
  return BASE_URL
}

export function getRedisConfig() {
  return REDIS_CONFIG
}

export async function cleanupConversations(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.chatMessage.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.$disconnect()
}

export async function waitForProcessingCleared(conversationId: string, timeoutMs = 30_000): Promise<void> {
  const redis = new Redis(REDIS_CONFIG)
  const key = `chat:processing:${conversationId}`
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const exists = await redis.exists(key)
    if (exists === 0) {
      await redis.quit()
      return
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  await redis.quit()
  throw new Error(`等待 processing 状态清理超时 (${timeoutMs}ms), conversationId: ${conversationId}`)
}
