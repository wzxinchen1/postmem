import { Errors } from '@/src/lib/errors'

/**
 * 嵌入服务 - 使用 Ollama bge-m3 模型
 */
export class EmbeddingService {
  private baseUrl: string
  private model: string

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    this.model = process.env.EMBEDDING_MODEL || 'bge-m3'
  }

  /**
   * 生成文本的嵌入向量
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama')
      }

      return data.embedding as number[]
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw Errors.embeddingError(`Failed to generate embedding: ${message}`)
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Ollama 不支持批量嵌入，逐个处理
    const embeddings: number[][] = []
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text)
      embeddings.push(embedding)
    }
    return embeddings
  }

  /**
   * 检查服务是否可用
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      })
      return response.ok
    } catch {
      return false
    }
  }
}
