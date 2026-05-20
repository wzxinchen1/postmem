import { execSync } from 'child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
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

// Step 8: Copy .env file from project root
const envFile = join(root, '.env')
if (existsSync(envFile)) {
  copyFileSync(envFile, join(dist, '.env'))
  console.log('[Build] .env file copied to dist/')
} else {
  console.warn('[Build] WARNING: .env not found at project root, skipping.')
  copyFileSync(join(root, '.env.example'), join(dist, '.env.example'))
}

// Step 9: Copy start.cjs from scripts/
const startCjs = join(root, 'scripts', 'start.cjs')
if (existsSync(startCjs)) {
  copyFileSync(startCjs, join(dist, 'start.cjs'))
  console.log('[Build] start.cjs copied to dist/')
} else {
  console.error('[Build] ERROR: start.cjs not found at', startCjs)
  process.exit(1)
}

// Step 10: Patch hardcoded absolute paths in webpack chunks
// Next.js inlines Prisma generated code into webpack chunks, which contains
// fileURLToPath("file:///home/user/...") with the build machine's absolute path.
// On Windows, fileURLToPath() fails on these Linux paths.
// Replace the entire __dirname assignment with a cross-platform fallback.
//
// Webpack inlines the code as:
//   globalThis.__dirname=n.dirname((0,i.fileURLToPath)("file:///home/.../client.ts"))
// The regex must handle:
//   - globalThis.__dirname (dot notation) or globalThis["__dirname"] (bracket notation)
//   - (0,i.fileURLToPath) webpack comma-expression wrapper
//   - i.fileURLToPath or fileURLToPath (with or without module prefix)
console.log('[Build] Patching hardcoded paths in webpack chunks...')
const chunksDir = join(dist, '.next', 'server', 'chunks')
if (existsSync(chunksDir)) {
  const chunkFiles = readdirSync(chunksDir).filter(f => f.endsWith('.js'))
  let patched = 0
  const patchRegex = /globalThis(?:\["__dirname"\]|.__dirname)\s*=\s*[a-zA-Z_.]+\.dirname\(\(0,[a-zA-Z_.]+\.fileURLToPath\)\("file:\/\/[^"]*"\)\)/g
  for (const chunk of chunkFiles) {
    const chunkPath = join(chunksDir, chunk)
    let content = readFileSync(chunkPath, 'utf-8')
    if (content.includes('fileURLToPath') && /file:\/\/\/[A-Za-z]/.test(content)) {
      const before = content
      content = content.replace(patchRegex, 'globalThis.__dirname=process.cwd()')
      if (content === before) {
        console.error(`[Build] ERROR: Detected fileURLToPath with hardcoded path in ${chunk} but regex did not match!`)
        console.error('[Build] The chunk content around fileURLToPath:')
        const idx = content.indexOf('fileURLToPath')
        console.error(content.substring(Math.max(0, idx - 80), idx + 80))
        process.exit(1)
      }
      writeFileSync(chunkPath, content)
      patched++
    }
  }
  console.log(`[Build] Patched ${patched} chunk(s).`)
}

console.log(`
[Build] ========================================
[Build]   Build completed!
[Build]   Output: dist/
[Build]   Contents:
[Build]     - start.cjs        (dotenv bootstrap wrapper, use as nssm entry)
[Build]     - server.js        (standalone server entry, auto-loaded by start.cjs)
[Build]     - .env             (environment variables)
[Build]     - node_modules/    (runtime dependencies, hoisted - no symlinks)
[Build]     - .next/static/    (static assets)
[Build]     - public/          (public assets)
[Build]     - prisma/          (schema + migrations)
[Build] ========================================
`)
