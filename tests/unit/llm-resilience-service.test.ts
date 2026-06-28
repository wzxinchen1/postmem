import { describe, it, expect } from 'vitest'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import { AppError } from '@/src/lib/errors'

function createService(): LLMResilienceService {
  return new LLMResilienceService()
}

describe('LLMResilienceService.parseJSON', () => {
  it('解析合法 JSON', () => {
    const service = createService()
    const result = service.parseJSON<{ name: string }>('{"name":"test"}')
    expect(result).toEqual({ name: 'test' })
  })

  it('解析嵌套 JSON', () => {
    const service = createService()
    const result = service.parseJSON<{ chunks: Array<{ title: string }> }>(
      JSON.stringify({ chunks: [{ title: '片段1' }, { title: '片段2' }] }),
    )
    expect(result.chunks).toHaveLength(2)
    expect(result.chunks[0].title).toBe('片段1')
  })

  it('忽略首尾空白', () => {
    const service = createService()
    const result = service.parseJSON<{ a: number }>('  \n  {"a":1}  \n  ')
    expect(result).toEqual({ a: 1 })
  })

  it('去除尾部逗号', () => {
    const service = createService()
    const result = service.parseJSON<{ items: number[] }>('{"items":[1,2,3,]}')
    expect(result.items).toEqual([1, 2, 3])
  })

  it('去除 // 注释（非 URL）', () => {
    const service = createService()
    const input = [
      '{',
      '  // 这是注释',
      '  "key": "value"',
      '}',
    ].join('\n')
    const result = service.parseJSON<{ key: string }>(input)
    expect(result).toEqual({ key: 'value' })
  })

  it('保留 https:// 协议分隔符', () => {
    const service = createService()
    const input = JSON.stringify({
      url: 'https://example.com/path',
      content: '请访问 https://example.com 查看详情',
    })
    const result = service.parseJSON<{ url: string; content: string }>(input)
    expect(result.url).toBe('https://example.com/path')
    expect(result.content).toBe('请访问 https://example.com 查看详情')
  })

  it('混合 URL 和 // 注释时只移除注释', () => {
    const service = createService()
    const input = [
      '{',
      '  "url": "https://example.com",',
      '  // 这是行注释',
      '  "name": "test"',
      '}',
    ].join('\n')
    const result = service.parseJSON<{ url: string; name: string }>(input)
    expect(result.url).toBe('https://example.com')
    expect(result.name).toBe('test')
  })

  it('保留 http:// 协议分隔符', () => {
    const service = createService()
    const input = JSON.stringify({ link: 'http://localhost:3000/api' })
    const result = service.parseJSON<{ link: string }>(input)
    expect(result.link).toBe('http://localhost:3000/api')
  })

  it('去除 /* 块注释 */', () => {
    const service = createService()
    const input = [
      '{',
      '  /* 块注释 */',
      '  "key": "value"',
      '}',
    ].join('\n')
    const result = service.parseJSON<{ key: string }>(input)
    expect(result).toEqual({ key: 'value' })
  })

  it('提取 markdown 代码块 ```json', () => {
    const service = createService()
    const input = [
      '```json',
      '{"name": "test"}',
      '```',
    ].join('\n')
    const result = service.parseJSON<{ name: string }>(input)
    expect(result).toEqual({ name: 'test' })
  })

  it('提取 markdown 代码块 ```（无 json 标签）', () => {
    const service = createService()
    const input = [
      '这里是回复：',
      '```',
      '{"key": 42}',
      '```',
      '结束',
    ].join('\n')
    const result = service.parseJSON<{ key: number }>(input)
    expect(result).toEqual({ key: 42 })
  })

  it('提取前缀文本中的 JSON', () => {
    const service = createService()
    const input = '这是返回的 JSON：\n{"result":"ok"}\n请查收'
    const result = service.parseJSON<{ result: string }>(input)
    expect(result).toEqual({ result: 'ok' })
  })

  it('空内容抛出 LLM_JSON_PARSE_FAILED', () => {
    const service = createService()
    expect(() => service.parseJSON('')).toThrow(AppError)
    expect(() => service.parseJSON('')).toThrow('LLM_JSON_PARSE_FAILED')
  })

  it('纯文本（无 JSON）抛出 LLM_JSON_PARSE_FAILED', () => {
    const service = createService()
    expect(() => service.parseJSON('这是一段普通文本')).toThrow(AppError)
    expect(() => service.parseJSON('这是一段普通文本')).toThrow('LLM_JSON_PARSE_FAILED')
  })

  it('错误的 JSON 语法抛出 LLM_JSON_PARSE_FAILED', () => {
    const service = createService()
    expect(() => service.parseJSON('{invalid}')).toThrow(AppError)
    expect(() => service.parseJSON('{invalid}')).toThrow('LLM_JSON_PARSE_FAILED')
  })

  it('模拟真实的 cutAndRewrite 响应（含 URL）', () => {
    const service = createService()
    const input = [
      '{',
      '  "chunks": [',
      '    {',
      '      "title": "测试片段",',
      '      "content": "详情请访问 https://example.com 了解更多"',
      '    }',
      '  ]',
      '}',
    ].join('\n')
    const result = service.parseJSON<{ chunks: Array<{ title: string; content: string }> }>(input)
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0].content).toBe('详情请访问 https://example.com 了解更多')
  })

  it('模拟真实的 cutAndRewrite 响应（多片段含 URL + 注释）', () => {
    const service = createService()
    const input = [
      '{',
      '  "chunks": [',
      '    {',
      '      "title": "开场",',
      '      "content": "你好！欢迎使用。更多信息见 https://docs.example.com"',
      '    },',
      '    // 第二个片段',
      '    {',
      '      "title": "详情",',
      '      "content": "参考链接 http://help.example.com/guide"',
      '    }',
      '  ]',
      '}',
    ].join('\n')
    const result = service.parseJSON<{ chunks: Array<{ title: string; content: string }> }>(input)
    expect(result.chunks).toHaveLength(2)
    expect(result.chunks[0].content).toBe('你好！欢迎使用。更多信息见 https://docs.example.com')
    expect(result.chunks[1].content).toBe('参考链接 http://help.example.com/guide')
  })
})
