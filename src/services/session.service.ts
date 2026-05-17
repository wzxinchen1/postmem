import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type {
  Session,
  SessionMessage,
  CreateSessionRequest,
  AddSessionMessageRequest,
} from '@/src/types'

export class SessionService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  async create(data: CreateSessionRequest): Promise<Session> {
    return this.prisma.session.create({
      data: {
        kbId: data.kbId,
        modelType: data.modelType,
        modelName: data.modelName,
        provider: data.provider,
        metadata: data.metadata,
        status: 'pending',
      },
    }) as Promise<Session>
  }

  async addMessage(data: AddSessionMessageRequest): Promise<SessionMessage> {
    return this.prisma.sessionMessage.create({
      data: {
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        tokens: data.tokens,
        metadata: data.metadata,
      },
    }) as Promise<SessionMessage>
  }

  async complete(sessionId: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'completed' },
    }) as Promise<Session>
  }

  async fail(sessionId: string, error: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'failed',
        error,
      },
    }) as Promise<Session>
  }

  async list(options: {
    kbId?: string
    modelType?: string
    status?: string
    page?: number
    limit?: number
  }): Promise<{ sessions: Session[]; total: number; page: number; limit: number }> {
    const page = options.page ?? 1
    const limit = options.limit ?? 20
    const skip = (page - 1) * limit

    const where: any = {}
    if (options.kbId) where.kbId = options.kbId
    if (options.modelType) where.modelType = options.modelType
    if (options.status) where.status = options.status

    const [sessions, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.session.count({ where }),
    ])

    return {
      sessions: sessions as Session[],
      total,
      page,
      limit,
    }
  }

  async get(sessionId: string): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    }) as Promise<Session | null>
  }

  async delete(sessionId: string): Promise<void> {
    await this.prisma.session.delete({
      where: { id: sessionId },
    })
  }

  async stats(): Promise<{
    total: number
    completed: number
    failed: number
    pending: number
  }> {
    const [total, completed, failed, pending] = await Promise.all([
      this.prisma.session.count(),
      this.prisma.session.count({ where: { status: 'completed' } }),
      this.prisma.session.count({ where: { status: 'failed' } }),
      this.prisma.session.count({ where: { status: 'pending' } }),
    ])

    return { total, completed, failed, pending }
  }
}