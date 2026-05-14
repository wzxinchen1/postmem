import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * 种子数据 - 默认应用设置
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