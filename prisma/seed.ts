import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * 种子数据 - 默认应用设置和提供商
 */
async function main() {
  console.log('开始插入种子数据...')

  const defaultSettings = [
    {
      key: 'maxContentLength',
      value: { maxContentLength: 20000 },
      description: '最大内容长度限制（字符数）',
    },
    {
      key: 'defaultTopK',
      value: { defaultTopK: 5 },
      description: '默认检索数量',
    },
    {
      key: 'defaultContextWindow',
      value: { defaultContextWindow: 1 },
      description: '默认上下文窗口大小',
    },
    {
      key: 'defaultPageSize',
      value: { defaultPageSize: 20 },
      description: '默认分页大小',
    },
  ]

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
    console.log(`✓ 已插入设置: ${setting.key}`)
  }

  const defaultProviders = [
    // OpenAI 系列
    {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com',
      config: {},
      isActive: true,
    },
    {
      name: 'Microsoft Azure OpenAI',
      baseUrl: 'https://{resource-name}.openai.azure.com/openai/v1',
      config: {},
      isActive: true,
    },
    // Anthropic 系列
    {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com',
      config: {},
      isActive: true,
    },
    // Google 系列
    {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      config: {},
      isActive: true,
    },
    // Meta 系列
    {
      name: 'Meta Llama',
      baseUrl: 'https://api.llama.meta.com',
      config: {},
      isActive: true,
    },
    // Mistral AI
    {
      name: 'Mistral AI',
      baseUrl: 'https://api.mistral.ai',
      config: {},
      isActive: true,
    },
    // 国内厂商
    {
      name: '阿里云百炼',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      config: {},
      isActive: true,
    },
    {
      name: '智谱AI',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      config: {},
      isActive: true,
    },
    {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      config: {},
      isActive: true,
    },
    {
      name: '月之暗面Kimi',
      baseUrl: 'https://api.moonshot.cn',
      config: {},
      isActive: true,
    },
    {
      name: '百度文心一言',
      baseUrl: 'https://aip.baidubce.com',
      config: {},
      isActive: true,
    },
    {
      name: '腾讯混元',
      baseUrl: 'https://hunyuan.tencentcloudapi.com',
      config: {},
      isActive: true,
    },
    {
      name: '字节豆包',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      config: {},
      isActive: true,
    },
    {
      name: '讯飞星辰',
      baseUrl: 'https://maas-api.cn-huabei-1.xf-yun.com',
      config: {},
      isActive: true,
    },
    // 聚合平台
    {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      config: {},
      isActive: true,
    },
    {
      name: 'n1n.ai',
      baseUrl: 'https://api.n1n.ai',
      config: {},
      isActive: true,
    },
  ]

  for (const provider of defaultProviders) {
    await prisma.provider.upsert({
      where: { name: provider.name },
      update: { baseUrl: provider.baseUrl },
      create: provider,
    })
    console.log(`✓ 已插入提供商: ${provider.name}`)
  }

  console.log('种子数据插入完成!')
}

main()
  .catch((e) => {
    console.error('种子数据插入失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })