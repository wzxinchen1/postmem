import * as fs from 'fs'
import * as path from 'path'

const SRC_DIR = path.resolve(process.cwd(), 'src')
const SERVICES_DIR = path.resolve(process.cwd(), 'src/services')
const PAGES_API_DIR = path.resolve(process.cwd(), 'pages/api')
const OUTPUT_FILE = path.resolve(process.cwd(), '.codebuddy/rules/service-map/RULE.mdc')

const JS_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
  'instanceof', 'void', 'in', 'of', 'yield', 'await', 'async', 'function',
  'class', 'extends', 'super', 'import', 'export', 'from', 'default', 'let',
  'const', 'var', 'with', 'debugger', 'static', 'get', 'set',
])

interface ClassInfo {
  name: string
  filePath: string
  methods: MethodInfo[]
  dependencies: DependencyInfo[]
}

interface MethodInfo {
  name: string
  isPrivate: boolean
  isStatic: boolean
  isAsync: boolean
  parameters: string[]
  returnType: string
  jsDoc: string
}

interface DependencyInfo {
  propertyName: string
  className: string
  filePath: string
}

interface ApiRouteInfo {
  path: string
  method: string
  serviceCalls: ServiceCallFromApi[]
}

interface ServiceCallFromApi {
  serviceName: string
  methodName: string
  className: string
  serviceFilePath: string
}

const classNameToFileMap = new Map<string, string>()
const allClasses: ClassInfo[] = []

function scanDir(dir: string, ext = '.ts'): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...scanDir(fullPath, ext))
    } else if (entry.name.endsWith(ext)) {
      files.push(fullPath)
    }
  }
  return files
}

function buildClassNameMap(): void {
  const serviceFiles = scanDir(SERVICES_DIR)
  for (const file of serviceFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const classRegex = /export\s+class\s+(\w+)/g
    let match
    while ((match = classRegex.exec(content)) !== null) {
      classNameToFileMap.set(match[1], file)
    }
  }

  const libFiles = scanDir(SRC_DIR).filter(f => f.includes('/lib/'))
  for (const file of libFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const classRegex = /export\s+class\s+(\w+)/g
    let match
    while ((match = classRegex.exec(content)) !== null) {
      classNameToFileMap.set(match[1], file)
    }
  }
}

function resolveClassNameFromProperty(propertyName: string, content: string): { className: string; filePath: string } | null {
  const depsInterfaceMatch = content.match(/interface\s+Dependencies\s*\{([^}]*)\}/s)
  if (depsInterfaceMatch) {
    const depsBody = depsInterfaceMatch[1]
    const propRegex = /(\w+)\s*:\s*(\w+)/g
    let propMatch
    while ((propMatch = propRegex.exec(depsBody)) !== null) {
      if (propMatch[1] === propertyName) {
        const typeName = propMatch[2]
        const typeFilePath = classNameToFileMap.get(typeName)
        if (typeFilePath) {
          return { className: typeName, filePath: typeFilePath }
        }
      }
    }
  }

  const constructorDepsMatch = content.match(/constructor\s*\(\s*\{([^}]*)\}\s*:\s*\{([^}]*)\}\s*\)/s)
  if (constructorDepsMatch) {
    const depsBody = constructorDepsMatch[2]
    const propRegex = /(\w+)\s*:\s*(\w+)/g
    let propMatch
    while ((propMatch = propRegex.exec(depsBody)) !== null) {
      if (propMatch[1] === propertyName) {
        const typeName = propMatch[2]
        const typeFilePath = classNameToFileMap.get(typeName)
        if (typeFilePath) {
          return { className: typeName, filePath: typeFilePath }
        }
      }
    }
  }

  return null
}

function extractClassBody(content: string, className: string): string | null {
  const classStartRegex = new RegExp(`export\\s+class\\s+${className}`)
  const classStartMatch = classStartRegex.exec(content)
  if (!classStartMatch) return null

  const firstBrace = content.indexOf('{', classStartMatch.index)
  if (firstBrace === -1) return null

  let depth = 0
  let i = firstBrace
  while (i < content.length) {
    if (content[i] === '{') depth++
    else if (content[i] === '}') {
      depth--
      if (depth === 0) {
        return content.substring(firstBrace, i + 1)
      }
    }
    i++
  }

  return null
}

function parseClassFile(filePath: string): ClassInfo | null {
  const content = fs.readFileSync(filePath, 'utf-8')
  const classRegex = /export\s+class\s+(\w+)/g
  let classMatch
  const classNames: string[] = []
  while ((classMatch = classRegex.exec(content)) !== null) {
    classNames.push(classMatch[1])
  }

  if (classNames.length === 0) return null

  const className = classNames[0]
  const classBody = extractClassBody(content, className)
  if (!classBody) return null

  const dependencies = extractDependencies(content)
  const methods = extractMethodsFromClassBody(classBody)

  return {
    name: className,
    filePath,
    methods,
    dependencies,
  }
}

function extractDependencies(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = []
  const seen = new Set<string>()

  const thisAssignments = content.matchAll(/this\.(\w+)\s*=\s*(\w+)/g)
  for (const match of thisAssignments) {
    const propName = match[1]
    const paramRef = match[2]

    if (paramRef === propName && !seen.has(propName)) {
      seen.add(propName)
      const resolved = resolveClassNameFromProperty(propName, content)
      if (resolved) {
        deps.push({
          propertyName: propName,
          className: resolved.className,
          filePath: resolved.filePath,
        })
      }
    }
  }

  return deps
}

function extractMethodsFromClassBody(classBody: string): MethodInfo[] {
  const methods: MethodInfo[] = []

  const lines = classBody.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const jsDocMatch = trimmed.match(/^\/\*\*$/)
    let jsDoc = ''
    let methodLineIndex = i

    if (jsDocMatch) {
      const jsDocLines: string[] = [trimmed]
      let j = i + 1
      while (j < lines.length && !lines[j].trim().includes('*/')) {
        jsDocLines.push(lines[j].trim())
        j++
      }
      if (j < lines.length) {
        jsDocLines.push(lines[j].trim())
        jsDoc = jsDocLines.join('\n')
        methodLineIndex = j + 1
      }
    }

    const methodLine = methodLineIndex < lines.length ? lines[methodLineIndex].trim() : ''

    const methodDeclRegex = /^(?:(private|public)\s+)?(?:(static)\s+)?(?:(async)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*(.+?))?\s*\{?\s*$/
    const methodMatch = methodLine.match(methodDeclRegex)

    if (methodMatch && !JS_KEYWORDS.has(methodMatch[4])) {
      const visibility = methodMatch[1] || 'public'
      const isStatic = !!methodMatch[2]
      const isAsync = !!methodMatch[3]
      const name = methodMatch[4]
      const paramsStr = methodMatch[5]
      const returnType = methodMatch[6]?.trim() || ''

      if (name === 'constructor') {
        i = methodLineIndex + 1
        continue
      }

      const parameters = paramsStr
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)

      methods.push({
        name,
        isPrivate: visibility === 'private',
        isStatic,
        isAsync,
        parameters,
        returnType: returnType || (isAsync ? 'Promise<void>' : 'void'),
        jsDoc,
      })

      i = methodLineIndex + 1
    } else {
      i++
    }
  }

  return methods
}

function parseApiRoutes(): ApiRouteInfo[] {
  const routes: ApiRouteInfo[] = []
  if (!fs.existsSync(PAGES_API_DIR)) return routes

  const apiFiles = scanDir(PAGES_API_DIR)
  for (const file of apiFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const relativePath = path.relative(PAGES_API_DIR, file)
    const apiPath = '/api/' + relativePath.replace(/\\/g, '/').replace(/\.ts$/, '').replace(/\[id\]/g, '{id}')

    const methods: string[] = []

    const createApiHandlerMatch = content.match(/createApiHandler[^>]*\(\{[^}]*methods:\s*\[([^\]]*)\]/)
    if (createApiHandlerMatch) {
      const methodList = createApiHandlerMatch[1].split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean)
      methods.push(...methodList.map(m => m.toUpperCase()))
    }

    for (const m of ['GET', 'POST', 'PUT', 'DELETE']) {
      if (new RegExp(`\\b${m}:\\s*async`).test(content) && !methods.includes(m)) {
        methods.push(m)
      }
    }

    if (methods.length === 0 && content.includes('export default async function handler')) {
      for (const m of ['GET', 'POST', 'PUT', 'DELETE']) {
        if (new RegExp(`req\\.method\\s*===?\\s*['"]${m}['"]`).test(content)) {
          methods.push(m)
        }
      }
    }

    if (methods.length === 0) continue

    const serviceCalls = extractApiServiceCalls(content)

    for (const method of methods) {
      routes.push({ path: apiPath, method, serviceCalls })
    }
  }

  return routes
}

function extractApiServiceCalls(content: string): ServiceCallFromApi[] {
  const calls: ServiceCallFromApi[] = []
  const seen = new Set<string>()

  const cradleRegex = /cradle\.(\w+)\.(\w+)\s*\(/g
  let match
  while ((match = cradleRegex.exec(content)) !== null) {
    const serviceName = match[1]
    const methodName = match[2]
    const key = `cradle:${serviceName}.${methodName}`
    if (seen.has(key)) continue
    seen.add(key)

    const serviceClassName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
    const serviceFilePath = classNameToFileMap.get(serviceClassName) || ''

    calls.push({
      serviceName,
      methodName,
      className: serviceClassName,
      serviceFilePath,
    })
  }

  const directImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"](@\/src\/services\/[^'"]+)['"]/g
  let importMatch
  while ((importMatch = directImportRegex.exec(content)) !== null) {
    const imports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    const importPath = importMatch[2]

    for (const imp of imports) {
      const key = `import:${imp}`
      if (seen.has(key)) continue
      seen.add(key)

      const serviceFilePath = classNameToFileMap.get(imp) || importPath

      const usageRegex = new RegExp(`(?:new\\s+)?${imp}[^.]*?\\.(\\w+)\\s*\\(`, 'g')
      let usageMatch
      const usedMethods: string[] = []
      while ((usageMatch = usageRegex.exec(content)) !== null) {
        usedMethods.push(usageMatch[1])
      }

      calls.push({
        serviceName: imp.charAt(0).toLowerCase() + imp.slice(1),
        methodName: usedMethods.length > 0 ? usedMethods.join(', ') : '*',
        className: imp,
        serviceFilePath,
      })
    }
  }

  return calls
}

function generateMermaidDiagram(classes: ClassInfo[]): string {
  const lines: string[] = []
  lines.push('```mermaid')
  lines.push('graph TD')

  for (const cls of classes) {
    const nodeId = cls.name.replace(/Service$/, 'Svc')
    lines.push(`    ${nodeId}["${cls.name}<br/><small>${getRelativePath(cls.filePath)}</small>"]`)
  }

  lines.push('')

  const drawnEdges = new Set<string>()
  for (const cls of classes) {
    const sourceId = cls.name.replace(/Service$/, 'Svc')
    for (const dep of cls.dependencies) {
      const targetId = dep.className.replace(/Service$/, 'Svc')
      const edgeKey = `${sourceId}->${targetId}`
      if (sourceId === targetId) continue
      if (drawnEdges.has(edgeKey)) continue
      drawnEdges.add(edgeKey)
      lines.push(`    ${sourceId} -->|依赖| ${targetId}`)
    }
  }

  lines.push('')
  lines.push('    subgraph 核心服务层')
  for (const name of ['ChatService', 'ConversationService', 'KBService']) {
    const nodeId = name.replace(/Service$/, 'Svc')
    if (classes.some(c => c.name === name)) {
      lines.push(`        ${nodeId}`)
    }
  }
  lines.push('    end')

  lines.push('')
  lines.push('    subgraph 基础设施层')
  for (const name of ['EmbeddingService', 'SSEService', 'LLMResilienceService', 'VendorService']) {
    const nodeId = name.replace(/Service$/, 'Svc')
    if (classes.some(c => c.name === name)) {
      lines.push(`        ${nodeId}`)
    }
  }
  lines.push('    end')

  lines.push('```')
  return lines.join('\n')
}

function getRelativePath(absPath: string): string {
  if (absPath.startsWith('@/')) return absPath
  return path.relative(process.cwd(), absPath).replace(/\\/g, '/')
}

function generateMarkdown(classes: ClassInfo[], apiRoutes: ApiRouteInfo[]): string {
  const lines: string[] = []

  lines.push('---')
  lines.push('description: PostMem 服务地图，描述服务类与文件路径的对应关系及类间依赖关系。排查问题时必须查阅此文件确定服务依赖关系和调用链路。')
  lines.push('alwaysApply: true')
  lines.push('enabled: true')
  lines.push(`updatedAt: ${new Date().toISOString()}`)
  lines.push('---')
  lines.push('')
  lines.push('# PostMem 服务地图')
  lines.push('')
  lines.push('> 自动生成，描述服务类与文件路径的对应关系及类间依赖关系')
  lines.push('')
  lines.push(`生成时间: ${new Date().toISOString()}`)
  lines.push('')

  lines.push('---')
  lines.push('')
  lines.push('## 1. 类与文件路径映射')
  lines.push('')
  lines.push('| 类名 | 文件路径 | 依赖项 | 公开方法数 |')
  lines.push('|------|----------|--------|-----------|')

  for (const cls of classes) {
    const publicMethods = cls.methods.filter(m => !m.isPrivate).length
    const depNames = cls.dependencies.map(d => d.className).join(', ') || '—'
    lines.push(`| \`${cls.name}\` | \`${getRelativePath(cls.filePath)}\` | ${depNames} | ${publicMethods} |`)
  }

  lines.push('')

  lines.push('---')
  lines.push('')
  lines.push('## 2. 依赖关系图')
  lines.push('')
  lines.push(generateMermaidDiagram(classes))
  lines.push('')

  lines.push('---')
  lines.push('')
  lines.push('## 3. 类间依赖关系')
  lines.push('')
  lines.push('| 调用方 | 被依赖类 | 被依赖文件 |')
  lines.push('|--------|----------|-----------|')

  const depPairs: { source: string; target: string; targetFile: string }[] = []
  const seenPairs = new Set<string>()
  for (const cls of classes) {
    for (const dep of cls.dependencies) {
      const key = `${cls.name}->${dep.className}`
      if (seenPairs.has(key)) continue
      seenPairs.add(key)
      depPairs.push({
        source: cls.name,
        target: dep.className,
        targetFile: getRelativePath(dep.filePath),
      })
    }
  }

  for (const dep of depPairs) {
    lines.push(`| \`${dep.source}\` | \`${dep.target}\` | \`${dep.targetFile}\` |`)
  }

  lines.push('')

  lines.push('---')
  lines.push('')
  lines.push('## 4. 各服务类详情')
  lines.push('')

  for (const cls of classes) {
    lines.push(`### ${cls.name}`)
    lines.push('')
    lines.push(`- **文件路径**: \`${getRelativePath(cls.filePath)}\``)

    if (cls.dependencies.length > 0) {
      lines.push('- **依赖项**:')
      for (const dep of cls.dependencies) {
        lines.push(`  - \`${dep.propertyName}\`: [\`${dep.className}\`](#${dep.className.toLowerCase()}) (\`${getRelativePath(dep.filePath)}\`)`)
      }
    }

    lines.push('')

    const publicMethods = cls.methods.filter(m => !m.isPrivate)
    const privateMethods = cls.methods.filter(m => m.isPrivate)

    if (publicMethods.length > 0) {
      lines.push('**公开方法**:')
      lines.push('')
      lines.push('| 方法 | 异步 | 参数 | 返回类型 |')
      lines.push('|------|------|------|----------|')

      for (const method of publicMethods) {
        const async = method.isAsync ? '✓' : ''
        const params = method.parameters.length > 0
          ? method.parameters.map(p => `\`${p.split(':')[0]?.trim()}\``).join(', ')
          : '—'
        const returnType = `\`${method.returnType}\``

        lines.push(`| \`${method.name}\` | ${async} | ${params} | ${returnType} |`)
      }
      lines.push('')
    }

    if (privateMethods.length > 0) {
      lines.push('<details>')
      lines.push('<summary>私有方法（点击展开）</summary>')
      lines.push('')
      lines.push('| 方法 | 异步 | 参数 | 返回类型 |')
      lines.push('|------|------|------|----------|')

      for (const method of privateMethods) {
        const async = method.isAsync ? '✓' : ''
        const params = method.parameters.length > 0
          ? method.parameters.map(p => `\`${p.split(':')[0]?.trim()}\``).join(', ')
          : '—'
        const returnType = `\`${method.returnType}\``

        lines.push(`| \`${method.name}\` | ${async} | ${params} | ${returnType} |`)
      }
      lines.push('')
      lines.push('</details>')
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('')
  lines.push('## 5. API 路由 → 服务调用映射')
  lines.push('')
  lines.push('| API 路由 | HTTP 方法 | 调用的服务 |')
  lines.push('|----------|-----------|-----------|')

  for (const route of apiRoutes) {
    const serviceStr = route.serviceCalls.length > 0
      ? route.serviceCalls.map(sc => {
          if (sc.methodName === '*') return `\`${sc.serviceName}\``
          return `\`${sc.serviceName}.${sc.methodName}\``
        }).join(', ')
      : '—'
    lines.push(`| \`${route.method} ${route.path}\` | ${route.method} | ${serviceStr} |`)
  }

  lines.push('')

  return lines.join('\n') + '\n'
}

function main() {
  console.log('🗺️  正在构建类名映射...')
  buildClassNameMap()
  console.log(`   找到 ${classNameToFileMap.size} 个类`)

  console.log('📋 正在解析服务类...')
  const serviceFiles = scanDir(SERVICES_DIR)
  for (const file of serviceFiles) {
    const classInfo = parseClassFile(file)
    if (classInfo) {
      allClasses.push(classInfo)
    }
  }
  console.log(`   解析 ${allClasses.length} 个服务类`)

  console.log('🌐 正在解析 API 路由...')
  const apiRoutes = parseApiRoutes()
  console.log(`   找到 ${apiRoutes.length} 个 API 端点`)

  console.log('📝 正在生成文档...')
  const markdown = generateMarkdown(allClasses, apiRoutes)

  const docsDir = path.dirname(OUTPUT_FILE)
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true })
  }

  fs.writeFileSync(OUTPUT_FILE, markdown)
  console.log(`✅ 已生成: ${OUTPUT_FILE}`)
  console.log(`   大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`)

  const totalMethods = allClasses.reduce((sum, c) => sum + c.methods.length, 0)
  const totalDeps = allClasses.reduce((sum, c) => sum + c.dependencies.length, 0)
  console.log(`   方法总数: ${totalMethods}`)
  console.log(`   依赖关系总数: ${totalDeps}`)
}

main()
