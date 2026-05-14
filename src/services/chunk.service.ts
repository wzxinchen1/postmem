import type { CutPoint, ChunkResult, MemoryMetadata } from '@/src/types'

/**
 * 文本切割服务
 */
export class ChunkService {
  private minChunkSize = 200
  private maxChunkSize = 1000

  /**
   * 智能切割文本
   */
  async chunkText(text: string): Promise<ChunkResult[]> {
    const cleanedText = this.preprocess(text)
    const cutPoints = this.ruleBasedChunk(cleanedText)
    const chunks = this.executeCut(cleanedText, cutPoints)
    const mergedChunks = this.mergeShortChunks(chunks)
    
    return mergedChunks.map((chunk, index) => ({
      content: chunk,
      index,
      metadata: {
        cutModel: 'rule-based',
        chunkSize: chunk.length,
        originalLength: cleanedText.length,
      } as MemoryMetadata,
    }))
  }

  private preprocess(text: string): string {
    let cleaned = text.replace(/\s+/g, ' ').trim()
    cleaned = cleaned.replace(/\n\s*\n/g, '\n\n')
    return cleaned
  }

  private ruleBasedChunk(text: string): CutPoint[] {
    const cutPoints: CutPoint[] = []
    const paragraphs = text.split('\n\n')
    let currentPos = 0
    
    for (const para of paragraphs) {
      currentPos += para.length + 2
      
      if (currentPos >= this.minChunkSize && currentPos < text.length) {
        cutPoints.push({
          index: currentPos,
          reason: 'Paragraph boundary',
        })
      }
    }

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

  private executeCut(text: string, cutPoints: CutPoint[]): string[] {
    if (cutPoints.length === 0) {
      return [text]
    }

    const sortedPoints = [...cutPoints].sort((a, b) => a.index - b.index)
    const chunks: string[] = []
    let lastPos = 0

    for (const point of sortedPoints) {
      if (point.index > lastPos && point.index < text.length) {
        chunks.push(text.slice(lastPos, point.index).trim())
        lastPos = point.index
      }
    }

    if (lastPos < text.length) {
      chunks.push(text.slice(lastPos).trim())
    }

    return chunks.filter(chunk => chunk.length > 0)
  }

  private mergeShortChunks(chunks: string[]): string[] {
    const merged: string[] = []
    let buffer = ''

    for (const chunk of chunks) {
      if (buffer.length + chunk.length < this.minChunkSize) {
        buffer += (buffer ? '\n\n' : '') + chunk
      } else {
        if (buffer) {
          merged.push(buffer)
          buffer = ''
        }
        
        if (chunk.length < this.minChunkSize) {
          buffer = chunk
        } else {
          merged.push(chunk)
        }
      }
    }

    if (buffer) {
      if (merged.length > 0) {
        merged[merged.length - 1] += '\n\n' + buffer
      } else {
        merged.push(buffer)
      }
    }

    return merged
  }
}
