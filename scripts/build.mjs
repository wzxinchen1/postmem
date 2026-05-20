import { execSync } from 'child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dist = join(root, 'dist')

// Clean dist directory
if (existsSync(dist)) {
  rmSync(dist, { recursive: true })
}
mkdirSync(dist, { recursive: true })

// Step 1: Generate Prisma client
console.log('[Build] Generating Prisma client...')
execSync('npx prisma generate', { cwd: root, stdio: 'inherit' })

// Step 2: Run Next.js build with standalone output
console.log('[Build] Running Next.js build...')
execSync('npx next build', { cwd: root, stdio: 'inherit' })

// Step 3: Copy standalone server + node_modules
console.log('[Build] Copying standalone output to dist/...')
const standaloneDir = join(root, '.next', 'standalone')
cpSync(standaloneDir, dist, { recursive: true })

// Step 4: Copy .next/static assets
const distNextStatic = join(dist, '.next', 'static')
mkdirSync(distNextStatic, { recursive: true })
cpSync(join(root, '.next', 'static'), distNextStatic, { recursive: true })

// Step 5: Copy public assets
cpSync(join(root, 'public'), join(dist, 'public'), { recursive: true })

// Step 6: Copy prisma schema (for db:migrate / db:deploy at deploy time)
const distPrisma = join(dist, 'prisma')
mkdirSync(distPrisma, { recursive: true })
cpSync(join(root, 'prisma'), distPrisma, { recursive: true })

// Step 7: Copy package.json for dependency reference
copyFileSync(join(root, 'package.json'), join(dist, 'package.json'))

// Step 8: Copy .env file (for Windows service / nssm deployment)
const envFile = join(root, '.env')
if (existsSync(envFile)) {
  copyFileSync(envFile, join(dist, '.env'))
  console.log('[Build] .env file copied to dist/')
} else {
  console.warn('[Build] WARNING: .env not found at project root, skipping.')
  copyFileSync(join(root, '.env.example'), join(dist, '.env.example'))
}

// Step 9: Copy dotenv bootstrap wrapper (start.cjs)
// Loads .env relative to __dirname before delegating to the Next.js standalone server.
// Essential for Windows service (nssm) deployments where working directory is unpredictable.
const startCjs = join(root, 'scripts', 'start.cjs')
if (existsSync(startCjs)) {
  copyFileSync(startCjs, join(dist, 'start.cjs'))
  console.log('[Build] start.cjs copied to dist/')
} else {
  console.error('[Build] ERROR: start.cjs not found at', startCjs)
  process.exit(1)
}

console.log(`
[Build] ========================================
[Build]   Build completed!
[Build]   Output: dist/
[Build]   Contents:
[Build]     - start.cjs        (dotenv bootstrap wrapper, use as nssm entry)
[Build]     - server.js        (standalone server entry, auto-loaded by start.cjs)
[Build]     - .env             (environment variables)
[Build]     - node_modules/    (runtime dependencies)
[Build]     - .next/static/    (static assets)
[Build]     - public/          (public assets)
[Build]     - prisma/          (schema + migrations)
[Build] ========================================
`)
