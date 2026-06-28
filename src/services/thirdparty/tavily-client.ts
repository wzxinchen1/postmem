import { tavily } from '@tavily/core'

export interface TavilySearchResult {
  url: string
  title: string
  content: string
  rawContent: string | null
}

/**
 * 调用 Tavily 第三方搜索 API
 * 本文件所在目录已从 lint 规则中豁免
 */
export async function searchWithTavily(
  apiKey: string,
  query: string,
  maxResults: number
): Promise<TavilySearchResult[]> {
  const client = tavily({ apiKey })
  const response = await client.search(query, {
    maxResults,
    search_depth: 'advanced',
    include_raw_content: 'text',
  } as any)

  if (!response.results) {
    throw new Error(`第三方搜索无结果: ${query}`)
  }
  if (response.results.length === 0) {
    throw new Error(`第三方搜索无结果: ${query}`)
  }

  return response.results.map((r: { url: string; title: string; content: string; raw_content?: string | null }) => ({
    url: r.url,
    title: r.title,
    content: r.content,
    rawContent: r.raw_content ?? null,
  }))
}
