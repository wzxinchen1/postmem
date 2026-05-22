import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { logger } from '../src/lib/logger'
import { vendors } from './vendor-seed'

const adapter = new PrismaPg({ 
  connectionString: process.env.DATABASE_URL! 
})

const prisma = new PrismaClient({ adapter })

async function main() {
  logger.info('[Seed] Seeding vendors...')
  
  for (const vendor of vendors) {
    await prisma.vendor.upsert({
      where: { name: vendor.name },
      update: vendor,
      create: vendor,
    })
    logger.info(`[Seed] ✓ ${vendor.name}`)
  }
  
  logger.info('[Seed] Done!')
}

main()
  .catch((e) => {
    logger.error('[Seed] 种子数据初始化失败', e as Error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
