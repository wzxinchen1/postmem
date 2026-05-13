import type { CutPoint, ChunkResult, MemoryMetadata } from '@/src/types'
import { CutModelService } from '@/src/services/cut-model.service'

/**
 * 文本切割服务
 */
export class ChunkService {
  private cutModelService: CutModelService
  private minChunkSize = 200
  private maxChunkSize = 1000

  constructor({ cutModelService }: { cutModelService: CutModelService }) {
    this.cutModelService = cutModelService
  }

  /**
   * 智能切割文本
   */
  async chunkText(text: string): Promise<ChunkResult[]> {
    // 预处理文本
    const cleanedText = this.preprocess(text)
    
    // 尝试使用模型切割
    let cutPoints: CutPoint[] = []
    try {
      cutPoints = await this.cutModelService.analyzeCutPoints(cleanedText)
    } catch (error) {
      console.warn('Model-based chunking failed, falling back to rule-based:', error)
      // 降级为规则切割
      cutPoints = this.ruleBasedChunk(cleanedText)
    }

    // 执行切割
    const chunks = this.executeCut(cleanedText, cutPoints)

    // 后处理：合并过短片段
    const mergedChunks = this.mergeShortChunks(chunks)

    // 分配索引和元数据
    const modelInfo = this.cutModelService.getModelInfo()
    return mergedChunks.map((chunk, index) => ({
      content: chunk,
      index,
      metadata: {
        cutModel: `${modelInfo.type}:${modelInfo.model}`,
        chunkSize: chunk.length,
        originalLength: cleanedText.length,
      } as MemoryMetadata,
    }))
  }

  /**
   * 预处理文本
   */
  private preprocess(text: string): string {
    // 移除多余的空白字符
    let cleaned = text.replace(/\s+/g, ' ').trim()
    
    // 保留段落分隔
    cleaned = cleaned.replace(/\n\s*\n/g, '\n\n')
    
    // 保留标题标记（如 # ## ###）
    // 不移除，因为它们有助于语义切割
    
    return cleaned
  }

  /**
   * 规则切割（降级方案）
   */
  private ruleBasedChunk(text: string): CutPoint[] {
    const cutPoints: CutPoint[] = []
    
    // 优先按段落切割
    const paragraphs = text.split('\n\n')
    let currentPos = 0
    
    for (const para of paragraphs) {
      currentPos += para.length + 2 // +2 for \n\n
      
      // 如果段落结束位置合适，添加切割点
      if (currentPos >= this.minChunkSize && currentPos < text.length) {
        cutPoints.push({
          index: currentPos,
          reason: 'Paragraph boundary',
        })
      }
    }

    // 如果没有找到合适的切割点，按固定长度切割
    if (cutPoints.length === 0 && text.length > this.maxChunkSize) {
      const chunkCount = Math.ceil(text.length / this.maxChunkSize)
      const chunkSize = Math.ceil(text.length / chunkCount)
      
      for (let i = 1; i < chunkCount; i++) {
        cutPoints.push({
          index: i * chunkSize,
          reason: 'Fixed size boundary',
        })
      }
    }

    return cutPoints
  }

  /**
   * 执行切割
   */
  private executeCut(text: string, cutPoints: CutPoint[]): string[] {
    if (cutPoints.length === 0) {
      return [text]
    }

    // 排序切割点
    const sortedPoints = [...cutPoints].sort((a, b) => a.index - b.index)
    
    const chunks: string[] = []
    let lastPos = 0

    for (const point of sortedPoints) {
      // 确保切割点在有效范围内
      if (point.index > lastPos && point.index < text.length) {
        chunks.push(text.slice(lastPos, point.index).trim())
        lastPos = point.index
      }
    }

    // 添加最后一段
    if (lastPos < text.length) {
      chunks.push(text.slice(lastPos).trim())
    }

    return chunks.filter(chunk => chunk.length > 0)
  }

  /**
   * 合并过短片段
   */
  private mergeShortChunks(chunks: string[]): string[] {
    const merged: string[] = []
    let buffer = ''

    for (const chunk of chunks) {
      if (buffer.length + chunk.length < this.minChunkSize) {
        // 合并到缓冲区
        buffer += (buffer ? '\n\n' : '') + chunk
      } else {
        // 缓冲区有内容，先输出
        if (buffer) {
          merged.push(buffer)
          buffer = ''
        }
        
        // 当前片段如果也太短，加入缓冲区
        if (chunk.length < this.minChunkSize) {
          buffer = chunk
        } else {
          merged.push(chunk)
        }
      }
    }

    // 处理剩余缓冲区
    if (buffer) {
      if (merged.length > 0) {
        // 合并到最后一个片段
        merged[merged.length - 1] += '\n\n' + buffer
      } else {
        merged.push(buffer)
      }
    }

    return merged
  }
}
