/**
 * 网络请求与 PDF 解析相关第三方调用
 * 本文件所在目录已从 lint 规则中豁免
 */

export async function fetchUrlWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function checkAndParsePdf(response: Response, url: string): Promise<string | null> {
  const contentType = response.headers.get('content-type')
  const isPdf = contentType !== null && contentType !== undefined
    ? contentType.includes('application/pdf') || url.endsWith('.pdf')
    : url.endsWith('.pdf')

  if (!isPdf) {
    return null
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const pdfParse = await import('pdf-parse' as any)
  const pdfData = await (pdfParse as any).default(buffer)
  const content = pdfData.text.replace(/\s+/g, ' ').trim().slice(0, 5000)

  if (content.length <= 100) {
    throw new Error(`PDF 正文过短: ${url}`)
  }

  return content
}

export function extractHtmlContent(html: string, maxLength: number): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
