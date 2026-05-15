import * as fs from 'fs'
import * as path from 'path'

const PAGES_API_DIR = path.resolve(process.cwd(), 'pages/api')
const OUTPUT_FILE = path.resolve(process.cwd(), 'public/swagger.json')
const LLM_YAML_FILE = path.resolve(process.cwd(), 'public/api-reference.yaml')
const TYPES_FILE = path.resolve(process.cwd(), 'src/types/index.ts')

interface ApiEndpoint {
  path: string
  method: string
  summary: string
  description: string
  tags: string[]
  requestBody?: {
    type: string
    requiredFields?: string[]
    example?: Record<string, unknown>
  }
  params?: { name: string; description: string; type: string }[]
  query?: { name: string; description: string; type: string; default?: unknown; enum?: string[] }[]
  responses: Record<number, { description: string; type?: string }>
}

interface TypeSchema {
  name: string
  properties: Array<{
    name: string
    type: string
    required?: boolean
    description?: string
    maxLength?: number
    minimum?: number
    maximum?: number
    default?: unknown
    enum?: string[]
    itemsType?: string
  }>
}

function extractJSDoc(content: string): { summary: string; description: string } {
  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n(?:\s*\*?\s*(?:@[\w]*.*)?\n)*\s*\*\//)
  const summary = jsdocMatch?.[1]?.replace(/^\*\s*/, '') || ''
  return { summary, description: summary }
}

function parseApiFile(filePath: string): ApiEndpoint[] {
  const relativePath = path.relative(PAGES_API_DIR, filePath)
  const apiPath = '/api/' + relativePath.replace(/\\/g, '/').replace(/\.ts$/, '').replace(/\[id\]/g, '{id}')
  
  const content = fs.readFileSync(filePath, 'utf-8')
  const endpoints: ApiEndpoint[] = []
  const { summary, description } = extractJSDoc(content)

  const tagMap: Record<string, string> = {
    kb: 'Knowledge Base',
    models: 'Models',
    providers: 'Providers',
    sessions: 'Sessions',
    settings: 'Settings',
    vendors: 'Vendors'
  }
  
  const tagKey = Object.keys(tagMap).find(k => apiPath.includes(`/api/${k}`)) || ''
  const tag = tagMap[tagKey] || 'Other'

  const createApiHandlerMatch = content.match(/createApiHandler<[^>]*>\(\{[^}]*methods:\s*\[([^\]]*)\]/)
  if (createApiHandlerMatch) {
    const methods = createApiHandlerMatch[1].split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean)
    
    for (const method of methods) {
      endpoints.push(parseEndpoint(apiPath, method.toUpperCase(), content, tag))
    }
  }

  if (content.includes('apiHandler(') && !content.includes('methods:')) {
    const handlerMethods = ['GET', 'POST', 'PUT', 'DELETE']
    for (const m of handlerMethods) {
      if (new RegExp(`\\b${m}:\\s*async`).test(content)) {
        endpoints.push(parseEndpoint(apiPath, m, content, tag))
      }
    }
  }

  if (!createApiHandlerMatch && !content.includes('apiHandler(')) {
    const methodMatches = content.match(/methods:\s*\[['"]?([\w'"\s,]+)['"]?\]/)
    if (methodMatches) {
      const methods = methodMatches[1].split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean)
      for (const method of methods) {
        endpoints.push(parseEndpoint(apiPath, method.toUpperCase(), content, tag))
      }
    }
  }

  return endpoints
}

function parseEndpoint(
  apiPath: string,
  method: string,
  content: string,
  tag: string
): ApiEndpoint {
  const endpoint: ApiEndpoint = {
    path: apiPath,
    method,
    summary: '',
    description: '',
    tags: [tag],
    responses: {}
  }

  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/)
  endpoint.summary = jsdocMatch?.[1]?.replace(/^\*\s*/, '') || `${method} ${apiPath}`
  endpoint.description = endpoint.summary

  if (/\[id\]\./.test(path.basename(apiPath).replace('{id}', '[id]')) || apiPath.includes('{id}')) {
    const paramMatch = content.match(/req\.query\.(\w+)/)
    const idName = apiPath.includes('{id}') ? 'id' : (paramMatch?.[1] || 'id')
    const descMap: Record<string, string> = {
      id: apiPath.includes('/models/') ? '模型ID' : 
           apiPath.includes('/providers/') ? '提供商ID' : 
           apiPath.includes('/vendors/') ? '厂商ID' :
           apiPath.includes('/sessions/') ? '会话ID' : 'ID'
    }
    endpoint.params = [{ name: idName, description: descMap[idName] || 'ID', type: 'integer' }]
  }

  if (['POST', 'PUT'].includes(method)) {
    const reqBodyMatch = content.match(/as (\w+Request)/)
    if (reqBodyMatch) {
      endpoint.requestBody = { type: reqBodyMatch[1] }
      
      const bodyDestructure = content.match(/const \{([^}]+)\}\s*=\s*req\.body/)
      if (bodyDestructure) {
        endpoint.requestBody.requiredFields = bodyDestructure[1]
          .split(',')
          .map(f => f.trim().split(':')[0]?.trim())
          .filter(f => f && !f.startsWith('_'))
      }
    }

    const inlineBodyMatch = content.match(/const \{([^}]+)\}\s*=\s*req\.body/)
    if (inlineBodyMatch && !endpoint.requestBody) {
      const fields = inlineBodyMatch[1]
        .split(',')
        .map(f => f.trim())
        .filter(f => f && !f.startsWith('_'))
      endpoint.requestBody = {
        type: 'InlineRequestBody',
        requiredFields: fields.map(f => f.split(/[=:]/)[0]?.trim()).filter(Boolean)
      }
    }
  }

  const queryParamRegex = /req\.query\.(\w+)\s*(?:[^,\n)]*)/g
  let queryMatch
  const queryDescriptions: Record<string, { description: string; type: string; default?: unknown; enum?: string[] }> = {}

  while ((queryMatch = queryParamRegex.exec(content)) !== null) {
    const paramName = queryMatch[1]
    if (paramName === 'id') continue
    
    const descMap: Record<string, { description: string; type: string; default?: unknown }> = {
      includeInactive: { description: '是否包含已禁用的项', type: 'boolean', default: false },
      providerId: { description: '按提供商ID筛选', type: 'integer' },
      modelType: { description: '模型类型', type: 'string', enum: ['chat', 'embedding'] },
      kbId: { description: '按知识库筛选', type: 'integer' },
      status: { description: '按状态筛选', type: 'string', enum: ['pending', 'completed', 'failed'] },
      page: { description: '页码', type: 'integer', default: 1 },
      limit: { description: '每页数量', type: 'integer', default: 20 }
    }
    
    if (descMap[paramName]) {
      queryDescriptions[paramName] = descMap[paramName] as any
    }
  }

  if (Object.keys(queryDescriptions).length > 0) {
    endpoint.query = Object.entries(queryDescriptions).map(([name, info]) => ({ name, ...info }))
  }

  const responseTypes: Record<string, { code: number; type: string }> = {
    '201': { code: 201, type: 'CreatedResponse' },
    '404': { code: 404, type: 'ErrorResponse' },
    '409': { code: 409, type: 'ErrorResponse' },
  }

  endpoint.responses[200] = { description: '成功响应' }

  if (endpoint.method === 'POST' && !apiPath.includes('{id}')) {
    endpoint.responses[201] = { description: '创建成功' }
  }
  if (apiPath.includes('{id}') || /\[id\]/.test(apiPath)) {
    endpoint.responses[404] = { description: '资源不存在' }
  }
  if (endpoint.method === 'POST') {
    endpoint.responses[400] = { description: '请求参数错误' }
    endpoint.responses[409] = { description: '冲突（重复）' }
  }

  return endpoint
}

function parseTypesFile(): TypeSchema[] {
  const content = fs.readFileSync(TYPES_FILE, 'utf-8')
  const schemas: TypeSchema[] = []

  // 匹配所有 export interface / export type
  const interfaceRegex = /export\s+(interface|type)\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g
  
  let match
  while ((match = interfaceRegex.exec(content)) !== null) {
    const name = match[2]
    const body = match[3]

    const propRegex = /(\w+)(\?)?:\s*([^;\n]+?)(?:\s*\/\/.*)?$/gm
    const properties: TypeSchema['properties'] = []

    let propMatch
    while ((propMatch = propRegex.exec(body)) !== null) {
      const propName = propMatch[1]
      const optional = !!propMatch[2]
      let propType = propMatch[3].trim()

      const arrayMatch = propType.match(/^Array<(.+)>$/)
      if (arrayMatch) {
        propType = `array[${arrayMatch[1]}]`
      }

      const recordMatch = propType.match(/^Record<[^,]+,\s*(.+)>$/)
      if (recordMatch) {
        propType = recordMatch[1]
      }

      properties.push({
        name: propName,
        type: propType,
        required: !optional,
        itemsType: arrayMatch?.[1]
      })
    }

    schemas.push({ name, properties })
  }

  return schemas
}

/**
 * 从所有已解析的类型中，筛选出被端点直接或间接引用的类型集合（递归）
 */
function getUsedTypes(endpoints: ApiEndpoint[], allTypes: TypeSchema[]): TypeSchema[] {
  // 收集所有端点直接引用的类型名
  const directRefs = new Set<string>()

  for (const ep of endpoints) {
    // 请求体类型
    if (ep.requestBody?.type) directRefs.add(ep.requestBody.type)

    // 响应类型
    for (const [code] of Object.entries(ep.responses).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const typeInfo = getResponseType(ep.path, ep.method, Number(code), allTypes)
      if (typeInfo && typeInfo !== 'object' && typeInfo !== 'void' && !typeInfo.startsWith('Error') && !typeInfo.startsWith('boolean')) {
        // 去掉数组后缀获取基础类型名
        const baseType = typeInfo.replace(/\[\]$/, '')
        directRefs.add(baseType)
      }
    }
  }

  // 递归收集：从已引用类型的属性中，继续收集引用的其他自定义类型
  const visited = new Set<string>()
  function collectNested(typeName: string) {
    if (visited.has(typeName)) return
    visited.add(typeName)

    const schema = allTypes.find(t => t.name === typeName)
    if (!schema) return

    for (const prop of schema.properties) {
      // 属性值是自定义类型（不是原始类型）
      const baseType = prop.type.replace(/\[\]$/, '').replace(/Array<(.+)>/, '$1').trim()
      if (isCustomType(baseType, allTypes)) {
        directRefs.add(baseType)
        collectNested(baseType)
      }
      // 数组项也是自定义类型
      if (prop.itemsType && isCustomType(prop.itemsType, allTypes)) {
        directRefs.add(prop.itemsType)
        collectNested(prop.itemsType)
      }
    }
  }

  for (const typeName of directRefs) {
    collectNested(typeName)
  }

  return allTypes.filter(t => visited.has(t.name))
}

function isCustomType(typeName: string, allTypes: TypeSchema[]): boolean {
  if (!typeName || /^[a-z]/.test(typeName)) return false // 小写开头是原始类型
  const primitives = new Set(['string', 'number', 'boolean', 'Date', 'unknown', 'null', 'object'])
  if (primitives.has(typeName)) return false
  // 包含 | 或 Record 是联合/泛型类型，跳过
  if (typeName.includes('|') || typeName.includes('Record')) return false
  return allTypes.some(t => t.name === typeName)
}

function typeToSwaggerType(typeStr: string): { type: string; items?: any; enum?: string[] } {
  const baseMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'integer': 'integer',
    'boolean': 'boolean',
    'Date': 'string',
    'unknown': 'object'
  }

  if (typeStr.startsWith('array[')) {
    const itemType = typeStr.slice(6, -1)
    return { type: 'array', items: typeToSwaggerType(itemType) }
  }

  if (typeStr.includes('|')) {
    const enumValues = typeStr.split('|').map(v => v.trim().replace(/'/g, ''))
    return { type: 'string', enum: enumValues.filter(v => !v.match(/^[A-Z][a-z]/)) || undefined }
  }

  return { type: baseMap[typeStr] || 'string' }
}

function generateOpenAPI(endpoints: ApiEndpoint[], types: TypeSchema[]): object {
  const paths: Record<string, any> = {}
  const components: Record<string, any> = { schemas: {} }

  for (const ep of endpoints) {
    if (!paths[ep.path]) {
      paths[ep.path] = {}
    }

    const operation: any = {
      summary: ep.summary,
      description: ep.description,
      tags: ep.tags,
      parameters: [],
      responses: {}
    }

    if (ep.params) {
      operation.parameters.push(...ep.params.map(p => ({
        name: p.name,
        in: 'path',
        required: true,
        description: p.description,
        schema: { type: p.type }
      })))
    }

    if (ep.query) {
      operation.parameters.push(...ep.query.map(q => ({
        name: q.name,
        in: 'query',
        description: q.description,
        schema: { 
          type: q.type, 
          ...(q.default !== undefined ? { default: q.default } : {}),
          ...(q.enum ? { enum: q.enum } : {})
        }
      })))
    }

    if (ep.requestBody && ['POST', 'PUT'].includes(ep.method)) {
      const schemaType = types.find(t => t.name === ep.requestBody!.type)

      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: schemaType
              ? { $ref: `#/components/schemas/${schemaType.name}` }
              : { type: 'object' },
            ...(schemaType ? {
              example: Object.fromEntries(
                schemaType.properties
                  .filter(p => p.required)
                  .slice(0, 4)
                  .map(p => [p.name, getExampleValue(p.type, p.name)])
              )
            } : {})
          }
        }
      }
    }

    for (const [code, resp] of Object.entries(ep.responses)) {
      operation.responses[code] = {
        description: resp.description,
        content: {
          'application/json': {
            schema: resp.type && types.find(t => t.name === resp.type)
              ? { $ref: `#/components/schemas/${resp.type}` }
              : generateSuccessResponseSchema(ep.path, ep.method, types)
          }
        }
      }
    }

    if (operation.parameters.length === 0) {
      delete operation.parameters
    }

    paths[ep.path][ep.method.toLowerCase()] = operation
  }

  for (const t of types) {
    components.schemas[t.name] = {
      type: 'object',
      required: t.properties.filter(p => p.required).map(p => p.name),
      properties: Object.fromEntries(
        t.properties.map(p => [
          p.name,
          { ...typeToSwaggerType(p.type), description: p.description || p.name }
        ])
      )
    }

    if (components.schemas[t.name].required.length === 0) {
      delete components.schemas[t.name].required
    }
  }

  components.schemas['ApiResponse'] = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: { type: 'object' },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'string' }
        }
      }
    }
  }

  components.schemas['ErrorResponse'] = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            enum: ['BAD_REQUEST', 'VALIDATION_ERROR', 'NOT_FOUND', 'DUPLICATE_ERROR', 
                    'FETCH_ERROR', 'KB_NOT_FOUND', 'MEMORY_NOT_FOUND', 'EMBEDDING_ERROR', 
                    'CUT_MODEL_ERROR', 'DATABASE_ERROR', 'INTERNAL_ERROR']
          },
          message: { type: 'string' },
          details: { type: 'string' }
        }
      }
    }
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'PostMem API',
      description: '个人知识库系统 API - 支持本地嵌入向量和智能文本切割（自动生成）',
      version: '1.0.0',
      contact: { name: 'PostMem' }
    },
    servers: [{ url: '/', description: '当前服务器' }],
    paths,
    components,
    tags: [
      { name: 'Knowledge Base', description: '知识库管理接口' },
      { name: 'Models', description: 'AI 模型管理接口' },
      { name: 'Providers', description: 'AI 提供商管理接口' },
      { name: 'Sessions', description: '对话会话管理接口' },
      { name: 'Settings', description: '应用设置接口' },
      { name: 'Vendors', description: 'AI 厂商管理接口' }
    ]
  }
}

function getExampleValue(type: string, name: string): unknown {
  const examples: Record<string, unknown> = {
    kbId: 1,
    name: '示例名称',
    content: '示例内容...',
    query: '查询语句',
    providerId: 1,
    vendorId: 1,
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-xxx',
    modelName: 'gpt-4',
    modelType: 'chat',
    displayName: '显示名称',
    isActive: true,
    isDefault: true,
    description: '描述信息',
    maxContentLength: 20000,
    defaultTopK: 5,
    defaultContextWindow: 1,
    defaultPageSize: 20,
    id: 123,
    page: 1,
    limit: 20,
    top_k: 5,
    context_window: 1
  }
  
  if (name in examples) return examples[name]
  if (type === 'number' || type === 'integer') return 1
  if (type === 'boolean') return true
  if (type === 'string') return '示例值'
  if (type === 'Date') return new Date().toISOString()
  return {}
}

function generateSuccessResponseSchema(apiPath: string, method: string, types: TypeSchema[]): any {
  const dataKeyMap: Record<string, string> = {
    '/api/kb/create': 'KnowledgeBaseInfo',
    '/api/models': 'Model',
    '/api/providers': 'Provider',
    '/api/vendors': 'Vendor',
    '/api/settings': 'AppSettings',
    '/api/sessions': 'Session'
  }

  let dataRef = undefined
  for (const [key, typeName] of Object.entries(dataKeyMap)) {
    if (apiPath.startsWith(key)) {
      if (apiPath.includes('{id}') || apiPath.match(/\[id\]/)) {
        dataRef = typeName.toLowerCase()
      } else {
        const isList = method === 'GET' && (typeName !== 'AppSettings')
        if (isList) {
          dataRef = typeName.toLowerCase() + 's'
        } else {
          dataRef = typeName.toLowerCase()
        }
      }
    }
  }

  if (dataRef && types.find(t => t.name.toLowerCase() === dataRef)) {
    dataRef = types.find(t => t.name.toLowerCase() === dataRef)?.name
  }

  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: dataRef
        ? { $ref: `#/components/schemas/${dataRef}` }
        : { type: 'object' }
    }
  }
}

function scanDir(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...scanDir(fullPath))
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  
  return files
}

function main() {
  console.log('📝 正在扫描 API 路由...')
  
  const apiFiles = scanDir(PAGES_API_DIR).filter(f => f.endsWith('.ts'))
  console.log(`   找到 ${apiFiles.length} 个 API 文件`)
  
  const allEndpoints: ApiEndpoint[] = []
  for (const file of apiFiles) {
    const endpoints = parseApiFile(file)
    allEndpoints.push(...endpoints)
  }
  console.log(`   提取 ${allEndpoints.length} 个端点`)

  console.log('📦 正在解析类型定义...')
  const allTypes = parseTypesFile()
  console.log(`   提取 ${allTypes.length} 个类型`)

  // 过滤：只保留被端点引用的类型（递归）
  const usedTypes = getUsedTypes(allEndpoints, allTypes)
  console.log(`   筛选后: ${usedTypes.length} 个类型（已排除未使用的）`)

  console.log('🔨 正在生成 OpenAPI 规范...')
  const spec = generateOpenAPI(allEndpoints, usedTypes)

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(spec, null, 2) + '\n')
  console.log(`✅ 已生成: ${OUTPUT_FILE}`)
  console.log(`   大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`)

  console.log('🤖 正在生成 LLM 友好的 YAML 文档...')
  const yaml = generateLLMYaml(allEndpoints, usedTypes)
  fs.writeFileSync(LLM_YAML_FILE, yaml)
  console.log(`✅ 已生成: ${LLM_YAML_FILE}`)
  console.log(`   大小: ${(fs.statSync(LLM_YAML_FILE).size / 1024).toFixed(1)} KB`)
}

function generateLLMYaml(endpoints: ApiEndpoint[], types: TypeSchema[]): string {
  const lines: string[] = []

  lines.push('# PostMem API Reference (for LLM)')
  lines.push('# 自动生成的精简文档，供大模型理解 API 结构')
  lines.push('')
  lines.push('---')
  lines.push('')

  const tagGroups = groupByTag(endpoints)

  for (const [tag, eps] of Object.entries(tagGroups)) {
    lines.push(`## ${tag}`)
    lines.push('')

    for (const ep of eps.sort((a, b) => a.path.localeCompare(b.path))) {
      lines.push(`### ${ep.method} ${ep.path}`)
      
      if (ep.summary && !ep.summary.startsWith(`${ep.method}`)) {
        lines.push(`${ep.summary}`)
      }
      lines.push('')

      // 汇总该 API 使用的所有类型
      const usedTypes: string[] = []
      if (ep.requestBody?.type && types.find(t => t.name === ep.requestBody!.type)) {
        usedTypes.push(`${ep.requestBody.type} (请求)`)
      }

      // 收集所有成功响应的类型（去重）
      const respTypes = new Set<string>()
      for (const [code] of Object.entries(ep.responses).sort((a, b) => Number(a[0]) - Number(b[0]))) {
        const typeInfo = getResponseType(ep.path, ep.method, Number(code), types)
        if (typeInfo && !typeInfo.startsWith('Error') && typeInfo !== 'object') {
          respTypes.add(typeInfo)
        }
      }
      for (const t of respTypes) {
        usedTypes.push(`${t} (响应)`)
      }

      if (usedTypes.length) {
        lines.push(`**Types:** ${usedTypes.join(', ')}`)
        lines.push('')
      }

      if (ep.params?.length) {
        lines.push('Path Parameters:')
        for (const p of ep.params) {
          lines.push(`  - \`${p.name}\`: ${p.type} (required) - ${p.description}`)
        }
        lines.push('')
      }

      if (ep.query?.length) {
        lines.push('Query Parameters:')
        for (const q of ep.query) {
          const optional = q.default !== undefined || !['kbId', 'query'].includes(q.name)
          const defStr = q.default !== undefined ? ` (默认: ${q.default})` : ''
          const enumStr = q.enum ? ` [${q.enum.join('|')}]` : ''
          lines.push(`  - \`${q.name}\`: ${q.type}${optional ? '' : ' (required)'}${enumStr}${defStr} - ${q.description}`)
        }
        lines.push('')
      }

      if (ep.requestBody && ['POST', 'PUT'].includes(ep.method)) {
        const schemaType = types.find(t => t.name === ep.requestBody!.type)
        lines.push('Request Body:')
        
        if (schemaType) {
          lines.push(`  type: ${ep.requestBody!.type}`)
          for (const p of schemaType.properties) {
            const req = p.required ? ' (required)' : ''
            lines.push(`  - \`${p.name}\`: ${simplifyType(p.type)}${req}`)
          }
        } else if (ep.requestBody.requiredFields?.length) {
          for (const f of ep.requestBody.requiredFields) {
            lines.push(`  - \`${f}\`: string (required)`)
          }
        }
        lines.push('')
      }

      lines.push('Response Body:')
      const respEntries = Object.entries(ep.responses).sort((a, b) => Number(a[0]) - Number(b[0]))
      for (const [code, resp] of respEntries) {
        const typeInfo = getResponseType(ep.path, ep.method, Number(code), types)
        const refStr = typeInfo ? ` (${typeInfo})` : ''
        lines.push(`  ${code}: ${resp.description}${refStr}`)
        if (typeInfo && !typeInfo.startsWith('Error')) {
          lines.push(`    { success: boolean, data: ${typeInfo} }`)
        }
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  lines.append = () => {}

  lines.push('## Data Types')
  lines.push('')

  for (const t of types) {
    lines.push(`### ${t.name}`)
    
    if (t.properties.some(p => p.required)) {
      lines.push('Required:', t.properties.filter(p => p.required).map(p => p.name).join(', '))
    }
    
    lines.push('')
    for (const p of t.properties) {
      const req = p.required ? '*' : '?'
      lines.push(`- \`${p.name}\`${req}: ${simplifyType(p.type)}`)
    }
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

function simplifyType(type: string): string {
  if (type.startsWith('array[')) return `${type.slice(6, -1)}[]`
  if (type === 'Record<string, unknown>') return 'object'
  return type
}

function groupByTag(endpoints: ApiEndpoint[]): Record<string, ApiEndpoint[]> {
  const groups: Record<string, ApiEndpoint[]> = {}
  for (const ep of endpoints) {
    const tag = ep.tags[0] || 'Other'
    if (!groups[tag]) groups[tag] = []
    groups[tag].push(ep)
  }
  return groups
}

function getResponseType(apiPath: string, method: string, code: number, types: TypeSchema[]): string | undefined {
  if (code !== 200 && code !== 201) return 'ErrorResponse'

  // 精确匹配优先
  const exactMap: Record<string, string> = {
    '/api/kb/create': 'KnowledgeBaseInfo',
    '/api/kb/delete': 'void',
    '/api/kb/ingest': 'IngestTextResponse',
    '/api/kb/list': 'ListItem[]',
    '/api/kb/search': 'SearchResult[]',
    '/api/kb/stats': 'Stats',
    '/api/settings/index': 'AppSettings',
  }

  if (exactMap[apiPath]) return exactMap[apiPath]

  // 前缀匹配（带子路径精确规则）
  const pathToType: Array<{ prefix: string; subPaths?: Record<string, string>; type: string; isListForGET: boolean }> = [
    {
      prefix: '/api/models/',
      type: 'Model', isListForGET: true,
      subPaths: { '/default': 'Model' }
    },
    { prefix: '/api/providers/', type: 'Provider', isListForGET: true,
      subPaths: { '/models': 'Model[]', '/validate': 'boolean' }
    },
    { prefix: '/api/vendors/', type: 'Vendor', isListForGET: true },
    { prefix: '/api/sessions/', type: 'Session', isListForGET: true,
      subPaths: { '/stats': 'Stats' }
    },
  ]

  for (const rule of pathToType) {
    if (!apiPath.startsWith(rule.prefix)) continue

    // 子路径精确匹配（如 /api/providers/models）
    if (rule.subPaths) {
      const remaining = apiPath.slice(rule.prefix.length - 1) // 包含前导 /
      if (rule.subPaths[remaining]) return rule.subPaths[remaining]
    }

    if (apiPath.includes('{id}') || /\/\w+\/\d?$/.test(apiPath)) return rule.type

    if (method === 'GET' && rule.isListForGET) return `${rule.type}[]`

    return rule.type
  }

  return 'object'
}

main()
