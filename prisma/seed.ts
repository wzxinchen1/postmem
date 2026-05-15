import { PrismaClient } from '@prisma/client'
import { vendors } from './vendor-seed'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding vendors...')
  
  for (const vendor of vendors) {
    await prisma.vendor.upsert({
      where: { name: vendor.name },
      update: vendor,
      create: vendor,
    })
    console.log(`  ✓ ${vendor.name}`)
  }
  
  console.log('Done!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
