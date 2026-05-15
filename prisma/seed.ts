import { PrismaClient } from '@prisma/client'
import { vendors } from './vendor-seed'
import { providers } from './provider-seed'
import { models } from './model-seed'

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
  
  console.log('Seeding providers...')
  
  for (const provider of providers) {
    const vendor = await prisma.vendor.findUnique({
      where: { name: provider.vendorName },
    })
    
    if (!vendor) {
      console.log(`  ✗ Vendor "${provider.vendorName}" not found, skipping provider "${provider.name}"`)
      continue
    }
    
    await prisma.provider.upsert({
      where: { name: provider.name },
      update: {
        vendorId: vendor.id,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        config: provider.config,
        isActive: provider.isActive,
      },
      create: {
        name: provider.name,
        vendorId: vendor.id,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        config: provider.config,
        isActive: provider.isActive,
      },
    })
    console.log(`  ✓ ${provider.name}`)
  }
  
  console.log('Seeding models...')
  
  for (const model of models) {
    const provider = await prisma.provider.findUnique({
      where: { name: model.providerName },
    })
    
    if (!provider) {
      console.log(`  ✗ Provider "${model.providerName}" not found, skipping model "${model.name}"`)
      continue
    }
    
    await prisma.model.upsert({
      where: {
        providerId_name: {
          providerId: provider.id,
          name: model.name,
        },
      },
      update: {
        displayName: model.displayName,
        modelType: model.modelType,
        config: model.config,
        isActive: model.isActive,
        isDefault: model.isDefault,
      },
      create: {
        providerId: provider.id,
        name: model.name,
        displayName: model.displayName,
        modelType: model.modelType,
        config: model.config,
        isActive: model.isActive,
        isDefault: model.isDefault,
      },
    })
    console.log(`  ✓ ${model.name}`)
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
