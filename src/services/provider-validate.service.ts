import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Vendor } from '@/src/types'
import { AppError } from '@/src/lib/errors'

export class ProviderValidateService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  async validateProvider(
    vendorId: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ valid: boolean; error?: string; vendor?: Vendor; models: string[] }> {
    const result = await this.fetchModels(vendorId, apiKey, baseUrl)
    return { valid: result.models.length > 0, vendor: result.vendor, models: result.models }
  }

  async fetchModels(
    vendorId: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ models: string[]; vendor?: Vendor }> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    }) as Vendor | null

    if (!vendor) {
      throw new AppError('PROVIDER_VALIDATE_VENDOR_NOT_FOUND')
    }

    if (!baseUrl) {
      throw new AppError('PROVIDER_VALIDATE_BASE_URL_REQUIRED', { defaultUrl: vendor.url })
    }

    if (vendor.chatModelClass === 'ChatOllama') {
      return await this.fetchOllamaModels(baseUrl, vendor)
    }

    return await this.fetchOpenAICompatibleModels(apiKey, baseUrl, vendor)
  }

  private async fetchOllamaModels(
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ models: string[]; vendor: Vendor }> {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new AppError('PROVIDER_VALIDATE_OLLAMA_REQUEST_FAILED', { status: response.status })
    }

    const data = await response.json()

    if (!data.models || !Array.isArray(data.models)) {
      throw new AppError('PROVIDER_VALIDATE_OLLAMA_INVALID_FORMAT')
    }

    const models = data.models.map((model: any) => model.name)

    return { models, vendor }
  }

  private async fetchOpenAICompatibleModels(
    apiKey: string | undefined,
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ models: string[]; vendor: Vendor }> {
    if (!apiKey) {
      throw new AppError('PROVIDER_VALIDATE_API_KEY_REQUIRED', { vendorName: vendor.name })
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new AppError('PROVIDER_VALIDATE_OPENAI_REQUEST_FAILED', { status: response.status })
    }

    const data = await response.json()

    if (!data.data || !Array.isArray(data.data)) {
      throw new AppError('PROVIDER_VALIDATE_OPENAI_INVALID_FORMAT')
    }

    const models = data.data.map((model: any) => model.id)

    return { models, vendor }
  }
}
