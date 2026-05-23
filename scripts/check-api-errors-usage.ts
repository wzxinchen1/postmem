import * as fs from 'fs'
import * as path from 'path'

const ROOT_DIR = path.resolve(process.cwd())
const API_ERRORS_PATH = path.resolve(ROOT_DIR, 'src/config/api-errors.json')
const SCAN_DIRS = ['src', 'pages']

// 需要扫描的文件扩展名
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])

function getAllTsFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'generated') {
      continue
    }
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath))
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath)
    }
  }
  return results
}

function main() {
  // 1. 读取 api-errors.json
  const apiErrors = JSON.parse(fs.readFileSync(API_ERRORS_PATH, 'utf-8')) as Record<string, unknown>
  const errorCodes = Object.keys(apiErrors)

  // 2. 收集所有源文件内容
  const files: { relativePath: string; content: string }[] = []
  for (const scanDir of SCAN_DIRS) {
    const absDir = path.resolve(ROOT_DIR, scanDir)
    if (!fs.existsSync(absDir)) continue
    for (const filePath of getAllTsFiles(absDir)) {
      files.push({
        relativePath: path.relative(ROOT_DIR, filePath),
        content: fs.readFileSync(filePath, 'utf-8'),
      })
    }
  }

  // 3. 逐个检查错误码是否被使用
  const unused: { code: string; message: string }[] = []
  for (const code of errorCodes) {
    const used = files.some(f => f.content.includes(code))
    if (!used) {
      unused.push({
        code,
        message: (apiErrors[code] as Record<string, string>)?.message ?? '',
      })
    }
  }

  // 4. 输出结果
  if (unused.length === 0) {
    console.log('✅ 所有错误码均已被使用')
  } else {
    console.log(`❌ 发现 ${unused.length} 个未使用的错误码：\n`)
    for (const { code, message } of unused) {
      console.log(`  ${code}`)
      console.log(`    消息: ${message}`)
    }
  }
}

main()
