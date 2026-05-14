import type { VendorInfo } from '@/src/types'

/**
 * 厂商注册表服务
 * 根据baseUrl自动识别厂商类型和API协议特征
 */
export class VendorRegistryService {
  private vendorPatterns: Array<{
    pattern: RegExp
    vendor: VendorInfo
  }>

  constructor() {
    this.vendorPatterns = [
      {
        pattern: /api\.openai\.com/i,
        vendor: {
          id: 'openai',
          name: 'OpenAI',
          apiFormat: 'openai',
          authType: 'bearer',
          requiredHeaders: {},
          defaultPath: '/v1/chat/completions',
          features: {
            thinking: true,
            streaming: true,
            tools: true,
            multimodal: true,
          },
        },
      },
      {
        pattern: /api\.anthropic\.com/i,
        vendor: {
          id: 'anthropic',
          name: 'Anthropic',
          apiFormat: 'anthropic',
          authType: 'x-api-key',
          requiredHeaders: {
            'anthropic-version': '2023-06-01',
          },
          defaultPath: '/v1/messages',
          features: {
            thinking: true,
            streaming: true,
            tools: true,
            multimodal: true,
          },
        },
      },
      {
        pattern: /dashscope.*\.aliyuncs\.com/i,
        vendor: {
          id: 'alibaba',
          name: '阿里云百炼',
          apiFormat: 'alibaba',
          authType: 'bearer',
          requiredHeaders: {},
          defaultPath: '/api/v1/services/aigc/text-generation/generation',
          features: {
            thinking: true,
            streaming: true,
            tools: true,
            multimodal: true,
          },
        },
      },
      {
        pattern: /open\.bigmodel\.cn/i,
        vendor: {
          id: 'zhipu',
          name: '智谱AI',
          apiFormat: 'zhipu',
          authType: 'bearer',
          requiredHeaders: {},
          defaultPath: '/v4/chat/completions',
          features: {
            thinking: true,
            streaming: true,
            tools: true,
            multimodal: false,
          },
        },
      },
      {
        pattern: /api\.deepseek\.com/i,
        vendor: {
          id: 'deepseek',
          name: 'DeepSeek',
          apiFormat: 'deepseek',
          authType: 'bearer',
          requiredHeaders: {},
          defaultPath: '/chat/completions',
          features: {
            thinking: true,
            streaming: true,
            tools: true,
            multimodal: false,
          },
        },
      },
      {
        pattern: /openrouter\.ai/i,
        vendor: {
          id: 'openrouter',
          name: 'OpenRouter',
          apiFormat: 'openrouter',
          authType: 'bearer',
          requiredHeaders: {
            'HTTP-Referer': 'https://localhost',
            'X-Title': 'PostMem',
          },
          defaultPath: '/api/v1/chat/completions',
          features: {
            thinking: true,
            streaming: true,
            tools: true,
            multimodal: true,
          },
        },
      },
      {
        pattern: /api\.moonshot\.cn/i,
        vendor: {
          id: 'moonshot',
          name: '月之暗面',
          apiFormat: 'openai',
          authType: 'bearer',
          requiredHeaders: {},
          defaultPath: '/v1/chat/completions',
          features: {
            thinking: false,
            streaming: true,
            tools: true,
            multimodal: false,
          },
        },
      },
      {
        pattern: /aip\.baidubce\.com.*rpc\/2\.0\/ai_custom\/v1\/wenxinworkshop/i,
        vendor: {
          id: 'baidu',
          name: '百度文心一言',
          apiFormat: 'baidu',
          authType: 'custom',
          requiredHeaders: {},
          defaultPath: '/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
          features: {
            thinking: false,
            streaming: true,
            tools: false,
            multimodal: false,
          },
        },
      },
      {
        pattern: /hunyuan\.tencentcloudapi\.com/i,
        vendor: {
          id: 'tencent',
          name: '腾讯混元',
          apiFormat: 'tencent',
          authType: 'custom',
          requiredHeaders: {},
          defaultPath: '/',
          features: {
            thinking: false,
            streaming: true,
            tools: true,
            multimodal: true,
          },
        },
      },
      {
        pattern: /api\.minimax\.chat/i,
        vendor: {
          id: 'minimax',
          name: 'MiniMax',
          apiFormat: 'openai',
          authType: 'bearer',
          requiredHeaders: {},
          defaultPath: '/v1/chat/completions',
          features: {
            thinking: false,
            streaming: true,
            tools: true,
            multimodal: true,
          },
        },
      },
    ]
  }

  /**
   * 根据baseUrl识别厂商
   */
  identify(baseUrl: string): VendorInfo {
    const url = baseUrl.toLowerCase().trim()

    for (const { pattern, vendor } of this.vendorPatterns) {
      if (pattern.test(url)) {
        return vendor
      }
    }

    return this.getDefaultVendor()
  }

  /**
   * 获取默认厂商信息（兼容OpenAI格式）
   */
  private getDefaultVendor(): VendorInfo {
    return {
      id: 'custom',
      name: '自定义厂商',
      apiFormat: 'openai',
      authType: 'bearer',
      requiredHeaders: {},
      defaultPath: '/v1/chat/completions',
      features: {
        thinking: false,
        streaming: true,
        tools: true,
        multimodal: false,
      },
    }
  }

  /**
   * 根据厂商ID获取厂商信息
   */
  getById(vendorId: string): VendorInfo | null {
    for (const { vendor } of this.vendorPatterns) {
      if (vendor.id === vendorId) {
        return vendor
      }
    }
    return null
  }

  /**
   * 获取所有已知厂商
   */
  getAll(): VendorInfo[] {
    return this.vendorPatterns.map((v) => v.vendor)
  }

  /**
   * 构建认证头部
   */
  buildAuthHeaders(vendor: VendorInfo, apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...vendor.requiredHeaders,
    }

    switch (vendor.authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${apiKey}`
        break
      case 'x-api-key':
        headers['x-api-key'] = apiKey
        break
      case 'custom':
        break
    }

    return headers
  }

  /**
   * 构建完整请求URL
   */
  buildRequestUrl(baseUrl: string, vendor: VendorInfo, customPath?: string): string {
    const base = baseUrl.replace(/\/$/, '')
    const path = customPath || vendor.defaultPath
    return `${base}${path}`
  }
}
