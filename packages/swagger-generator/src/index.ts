import * as fs from 'fs'
import * as path from 'path'
import { parse as parseComments } from 'comment-parser'

interface SSEEventType {
  name: string
  description: string
  dataType?: string
}

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
  sse?: {
    description: string
    eventTypes: SSEEventType[]
  }
}

interface TypeSchema {
  name: string
  properties: Array<{
    name: string
    type: string
    required?: boolean
    description?: string
    example?: unknown
    maxLength?: number
    minimum?: number
    maximum?: number
    default?: unknown
    enum?: string[]
    itemsType?: string
  }>
}

interface TypeAliasSchema {
  name: string
  values: string[]
}

let swaggerConfig: {
  openapi: {
    openapi: string
    info: { title: string; description: string; version: string; contact: { name: string } }
    servers: { url: string; description: string }[]
    tags: { name: string; description: string }[]
  }
  tagMap?: Record<string, string>
  tags?: Record<string, { name: string; description: string }>
  responseExamples?: Record<string, Record<string, unknown>>
  responseWrapper?: {
    successField?: string
    dataField?: string
    properties?: Record<string, any>
  }
  responseWrappers?: {
    success?: string
    error?: string
  }
  responseWrapperSchemas?: Record<string, any>
  paths?: {
    apiDir: string
    typesFile: string
    outputFile: string
    llmYamlFile: string
    errorsFile: string
  }
}

function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir)
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(
        'Could not find workspace root (pnpm-workspace.yaml) from ' + startDir
      )
    }
    current = parent
  }
}

function generateTagMap(apiDir: string): { tagMap: Record<string, string>; tagDefs: { name: string; description: string }[] } {
  const entries = fs.readdirSync(apiDir, { withFileTypes: true })
  const tagMap: Record<string, string> = {}
  const tagDefs: { name: string; description: string }[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirName = entry.name
    const displayName = dirName
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    tagMap[dirName] = displayName
    tagDefs.push({ name: displayName, description: `${displayName} 管理接口` })
  }

  return { tagMap, tagDefs }
}

interface JSDocResponseEntry {
  code: number
  description: string
  type?: string
  method?: string
}

interface ParsedJSDoc {
  summary: string
  description: string
  queryParams: Record<string, { description: string; type: string; default?: unknown }>
  responseCodes: Record<number, { description: string; type?: string }>
  responseEntries: JSDocResponseEntry[]
  sseDescription: string
  sseEvents: SSEEventType[]
}

function parseJSDoc(content: string): ParsedJSDoc {
  const blocks = parseComments(content)

  const result: ParsedJSDoc = {
    summary: '', description: '', queryParams: {},
    responseCodes: {}, responseEntries: [],
    sseDescription: '', sseEvents: []
  }

  if (blocks.length === 0) return result

  const block = blocks[0]
  const descLines = block.description?.split('\n') || []
  result.summary = descLines[0]?.trim() || ''
  result.description = result.summary

  function d(text: string): string {
    return text.startsWith('- ') ? text.slice(2) : text
  }

  for (const tag of block.tags) {
    switch (tag.tag) {
      case 'query': {
        if (!tag.name) {
          throw new Error(`@query tag missing parameter name: "${tag.source[0]?.source.trim() || '(source unavailable)'}"`)
        }
        result.queryParams[tag.name] = {
          type: tag.type || 'string',
          description: d(tag.description) || tag.name,
          ...(tag.default !== undefined ? { default: tag.default } : {})
        }
        break
      }
      case 'response':
      case 'response.GET':
      case 'response.POST':
      case 'response.PUT':
      case 'response.DELETE':
      case 'response.PATCH': {
        if (!tag.name) {
          throw new Error(`@${tag.tag} tag missing status code: "${tag.source[0]?.source.trim() || '(source unavailable)'}"`)
        }
        const code = Number(tag.name)
        if (isNaN(code)) {
          throw new Error(`@${tag.tag} tag has non-numeric status code "${tag.name}": "${tag.source[0]?.source.trim() || '(source unavailable)'}"`)
        }
        const method = tag.tag === 'response' ? undefined : tag.tag.slice(9)
        const entry: JSDocResponseEntry = { code, description: d(tag.description) || '成功响应' }
        if (tag.type) entry.type = tag.type
        if (method) entry.method = method
        result.responseCodes[entry.code] = { description: entry.description, type: entry.type }
        result.responseEntries.push(entry)
        break
      }
      case 'sse': {
        result.sseDescription = tag.description || tag.name || 'SSE 流式响应'
        break
      }
      case 'sse-event': {
        if (!tag.name) {
          throw new Error(`@sse-event tag missing event name: "${tag.source[0]?.source.trim() || '(source unavailable)'}"`)
        }
        result.sseEvents.push({
          name: tag.name,
          description: d(tag.description) || tag.name,
          ...(tag.type ? { dataType: tag.type } : {})
        })
        break
      }
    }
  }

  return result
}

function parseApiFile(filePath: string, apiDir: string, tagMap: Record<string, string>): ApiEndpoint[] {
  const relativePath = path.relative(apiDir, filePath)
  const apiPath = '/api/' + relativePath.replace(/\\/g, '/').replace(/\.ts$/, '').replace(/\[id\]/g, '{id}')

  const content = fs.readFileSync(filePath, 'utf-8')
  const endpoints: ApiEndpoint[] = []
  const jsdoc = parseJSDoc(content)

  const tagKey = Object.keys(tagMap).find(k => apiPath.includes(`/api/${k}`)) || ''
  const tag = tagMap[tagKey] || 'Other'

  const createApiHandlerMatch = content.match(/createApiHandler<[^>]*>\(\{[^}]*methods:\s*\[([^\]]*)\]/)
  if (createApiHandlerMatch) {
    const methods = createApiHandlerMatch[1].split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean)

    for (const method of methods) {
      endpoints.push(parseEndpoint(apiPath, method.toUpperCase(), content, tag, jsdoc))
    }
  }

  if (content.includes('apiHandler(') && !content.includes('methods:')) {
    const handlerMethods = ['GET', 'POST', 'PUT', 'DELETE']
    for (const m of handlerMethods) {
      if (new RegExp(`\\b${m}:\\s*async`).test(content)) {
        endpoints.push(parseEndpoint(apiPath, m, content, tag, jsdoc))
      }
    }
  }

  if (!createApiHandlerMatch && !content.includes('apiHandler(')) {
    const methodMatches = content.match(/methods:\s*\[['"]?([\w'"\s,]+)['"]?\]/)
    if (methodMatches) {
      const methods = methodMatches[1].split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean)
      for (const method of methods) {
        endpoints.push(parseEndpoint(apiPath, method.toUpperCase(), content, tag, jsdoc))
      }
    } else if (content.match(/req\.method\s*!==?\s*['"](\w+)['"]/)) {
      const methodMatch = content.match(/req\.method\s*!==?\s*['"](\w+)['"]/)
      if (methodMatch) {
        endpoints.push(parseEndpoint(apiPath, methodMatch[1], content, tag, jsdoc))
      }
    } else if (content.includes('export default async function handler')) {
      const handlerMethods = ['GET', 'POST', 'PUT', 'DELETE']
      for (const m of handlerMethods) {
        if (new RegExp(`\\b${m}:\\s*async|if\\s*\\(req\\.method\\s*===?\\s*['"]${m}['"]\\)|req\\.method\\s*!==?\\s*['"]${m}['"]`).test(content)) {
          endpoints.push(parseEndpoint(apiPath, m, content, tag, jsdoc))
        }
      }
    }
  }

  return endpoints
}

function parseEndpoint(
  apiPath: string,
  method: string,
  content: string,
  tag: string,
  jsdoc: ParsedJSDoc
): ApiEndpoint {
  const endpoint: ApiEndpoint = {
    path: apiPath,
    method,
    summary: jsdoc.summary || `${method} ${apiPath}`,
    description: jsdoc.description || `${method} ${apiPath}`,
    tags: [tag],
    responses: {}
  }

  if (/\[id\]\./.test(path.basename(apiPath).replace('{id}', '[id]')) || apiPath.includes('{id}')) {
    const paramMatch = content.match(/req\.query\.(\w+)/)
    const idName = apiPath.includes('{id}') ? 'id' : (paramMatch?.[1] || 'id')
    endpoint.params = [{ name: idName, description: `${idName}`, type: 'string' }]
  }

  if (['POST', 'PUT'].includes(method)) {
    const reqBodyMatches = content.match(/as (\w+Request)/g)
    if (reqBodyMatches && reqBodyMatches.length > 1) {
      const typeNames = reqBodyMatches.map(m => m.replace('as ', ''))
      endpoint.requestBody = { type: typeNames.join(' | ') }
    } else {
      const reqBodyMatch = content.match(/as (\w+Request)/)
      if (reqBodyMatch) {
        endpoint.requestBody = { type: reqBodyMatch[1] }
      }
    }

    if (endpoint.requestBody) {
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
  const queryDescriptions: Record<string, { description: string; type: string; default?: unknown }> = {}

  while ((queryMatch = queryParamRegex.exec(content)) !== null) {
    const paramName = queryMatch[1]
    if (paramName === 'id') continue

    if (jsdoc.queryParams[paramName]) {
      queryDescriptions[paramName] = jsdoc.queryParams[paramName]
    }
  }

  if (Object.keys(queryDescriptions).length > 0) {
    endpoint.query = Object.entries(queryDescriptions).map(([name, info]) => ({ name, ...info }))
  }

  if (jsdoc.responseEntries.length > 0) {
    for (const entry of jsdoc.responseEntries) {
      if (!entry.method || entry.method === method) {
        endpoint.responses[entry.code] = { description: entry.description, type: entry.type }
      }
    }
  } else {
    endpoint.responses[200] = { description: '成功响应' }
  }

  if (jsdoc.sseDescription || jsdoc.sseEvents.length > 0) {
    endpoint.sse = {
      description: jsdoc.sseDescription || 'SSE 流式响应',
      eventTypes: jsdoc.sseEvents
    }
  } else if (content.includes('text/event-stream') || (content.includes('Content-Type') && content.includes('event-stream'))) {
    throw new Error(`[${apiPath}] SSE 响应缺少 @sse 或 @sse-event JSDoc 标注`)
  }

  return endpoint
}

function parsePropertyExamples(body: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = body.split('\n')
  let commentBlock: string[] = []
  let inComment = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.startsWith('/**')) {
      inComment = true
      commentBlock = [line]
      if (line.includes('*/')) {
        inComment = false
        const fullComment = commentBlock.join(' ')
        const cleaned = fullComment.replace(/\/\*+/g, '').replace(/\*+\//g, '').trim()
        const exampleMatch = cleaned.match(/@example\s+(\S[^*]*)/)
        if (exampleMatch) {
          result.__pending = exampleMatch[1].trim()
        }
        commentBlock = []
      }
      continue
    }

    if (inComment) {
      commentBlock.push(line)
      if (line.includes('*/')) {
        inComment = false
        const fullComment = commentBlock.join(' ')
        const cleaned = fullComment.replace(/\/\*+/g, '').replace(/\*+\//g, '').trim()
        const exampleMatch = cleaned.match(/@example\s+(\S[^*]*)/)
        if (exampleMatch) {
          result.__pending = exampleMatch[1].trim()
        }
        commentBlock = []
      }
      continue
    }

    const propMatch = line.match(/^(\w+)(\?)?\s*:/)
    if (propMatch && result.__pending !== undefined) {
      const propName = propMatch[1]
      const raw = String(result.__pending)
      delete result.__pending
      try {
        result[propName] = JSON.parse(raw)
      } catch {
        result[propName] = raw.replace(/^["']|["']$/g, '')
      }
    } else if (result.__pending !== undefined) {
      delete result.__pending
    }
  }

  return result
}

function parseTypesFile(typesFilePath: string): { schemas: TypeSchema[]; aliases: TypeAliasSchema[] } {
  const content = fs.readFileSync(typesFilePath, 'utf-8')
  const schemas: TypeSchema[] = []
  const aliases: TypeAliasSchema[] = []

  const interfaceRegex = /export\s+(interface|type)\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g

  let match
  while ((match = interfaceRegex.exec(content)) !== null) {
    const name = match[2]
    const body = match[3]

    const propExamples = parsePropertyExamples(body)
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

      const entry: TypeSchema['properties'][0] = {
        name: propName,
        type: propType,
        required: !optional,
        itemsType: arrayMatch?.[1]
      }

      if (propExamples[propName] !== undefined) {
        entry.example = propExamples[propName]
      }

      properties.push(entry)
    }

    schemas.push({ name, properties })
  }

  const aliasRegex = /export\s+type\s+(\w+)\s*=\s*([^;{\n]+)/g
  let aliasMatch
  while ((aliasMatch = aliasRegex.exec(content)) !== null) {
    const name = aliasMatch[1]
    const valueStr = aliasMatch[2].trim()
    const values = valueStr.split('|').map(v => v.trim().replace(/'/g, '')).filter(v => v.length > 0)
    if (values.length > 0) {
      aliases.push({ name, values })
    }
  }

  return { schemas, aliases }
}

function getUsedTypes(endpoints: ApiEndpoint[], allTypes: TypeSchema[]): TypeSchema[] {
  const directRefs = new Set<string>()

  for (const ep of endpoints) {
    if (ep.requestBody?.type) {
      for (const typeName of ep.requestBody.type.split(' | ').filter(Boolean)) {
        directRefs.add(typeName)
      }
    }

    for (const [, resp] of Object.entries(ep.responses)) {
      if (resp.type) {
        for (const typeName of resp.type.split(' | ').filter(Boolean)) {
          const baseType = typeName.replace(/\[\]$/, '')
          directRefs.add(baseType)
        }
      }
    }
  }

  const visited = new Set<string>()
  function collectNested(typeName: string) {
    if (visited.has(typeName)) return
    visited.add(typeName)

    const schema = allTypes.find(t => t.name === typeName)
    if (!schema) return

    for (const prop of schema.properties) {
      const baseType = prop.type.replace(/\[\]$/, '').replace(/Array<(.+)>/, '$1').trim()
      if (isCustomType(baseType, allTypes)) {
        directRefs.add(baseType)
        collectNested(baseType)
      }
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
  if (!typeName || /^[a-z]/.test(typeName)) return false
  const primitives = new Set(['string', 'number', 'boolean', 'Date', 'unknown', 'null', 'object'])
  if (primitives.has(typeName)) return false
  if (typeName.includes('|') || typeName.includes('Record')) return false
  return allTypes.some(t => t.name === typeName)
}

function typeToSwaggerType(typeStr: string, types?: TypeSchema[], aliases?: TypeAliasSchema[]): { type: string; items?: any; enum?: string[]; $ref?: string } {
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
    return { type: 'array', items: typeToSwaggerType(itemType, types, aliases) }
  }

  if (typeStr.endsWith('[]')) {
    const itemType = typeStr.slice(0, -2)
    return { type: 'array', items: typeToSwaggerType(itemType, types, aliases) }
  }

  if (typeStr.includes('|')) {
    const enumValues = typeStr.split('|').map(v => v.trim().replace(/'/g, ''))
    return { type: 'string', enum: enumValues.filter(v => !v.match(/^[A-Z][a-z]/)) || undefined }
  }

  if (aliases) {
    const alias = aliases.find(a => a.name === typeStr)
    if (alias) {
      return { type: 'string', enum: alias.values }
    }
  }

  if (types && isCustomType(typeStr, types)) {
    return { type: 'string', $ref: `#/components/schemas/${typeStr}` }
  }

  return { type: baseMap[typeStr] || 'string' }
}

const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean', 'integer'])

function isPrimitiveWrapper(name: string): boolean {
  return PRIMITIVE_TYPES.has(name)
}

function resolveErrorCodes(schema: any, errorCodes: string[]): any {
  if (typeof schema === 'string') {
    return schema === '__ERROR_CODES__' && errorCodes.length > 0 ? errorCodes : schema
  }
  if (Array.isArray(schema)) {
    return schema.map(item => resolveErrorCodes(item, errorCodes))
  }
  if (schema && typeof schema === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(schema)) {
      result[key] = resolveErrorCodes(value, errorCodes)
    }
    return result
  }
  return schema
}

function generateOpenAPI(endpoints: ApiEndpoint[], types: TypeSchema[], aliases: TypeAliasSchema[], errorCodes: string[], wrapperConfig?: { successField?: string; dataField?: string; properties?: Record<string, any> }, responseExamples?: Record<string, Record<string, unknown>>, responseWrappers?: { success?: string; error?: string }, responseWrapperSchemas?: Record<string, any>): object {
  const paths: Record<string, any> = {}
  const components: Record<string, any> = { schemas: {} }

  const successWrapper = responseWrappers?.success || 'ErrorResponse'
  const errorWrapper = responseWrappers?.error || 'string'

  const usedWrappers = new Set<string>()

  function wrapperSchema(wrapperName: string): any {
    usedWrappers.add(wrapperName)
    if (isPrimitiveWrapper(wrapperName)) {
      return { type: wrapperName }
    }
    return { $ref: `#/components/schemas/${wrapperName}` }
  }

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
      const typeNames = ep.requestBody.type.split(' | ').filter(Boolean)
      const matchedTypes = typeNames.map(name => types.find(t => t.name === name)).filter(Boolean) as TypeSchema[]

      let schema: any
      if (matchedTypes.length > 1) {
        schema = {
          oneOf: matchedTypes.map(t => ({ $ref: `#/components/schemas/${t.name}` })),
          description: `支持多种请求体格式: ${typeNames.join(', ')}`
        }
      } else if (matchedTypes.length === 1) {
        schema = { $ref: `#/components/schemas/${matchedTypes[0].name}` }
      } else {
        schema = { type: 'object' }
      }

      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema }
        }
      }
    }

    for (const [code, resp] of Object.entries(ep.responses)) {
      const codeNum = Number(code)
      if (ep.sse && codeNum === 200) {
        operation.responses[code] = {
          description: resp.description + '（SSE 流式响应）',
          content: {
            'text/event-stream': {
              schema: {
                type: 'object',
                description: ep.sse.description,
                properties: {
                  type: { type: 'string', description: '事件类型', enum: ep.sse.eventTypes.map(e => e.name) },
                  message: { type: 'string', description: '事件消息' },
                  data: { type: 'object', description: '事件数据' }
                }
              },
              'x-sse-event-types': ep.sse.eventTypes.map(e => ({
                event: e.name,
                description: e.description,
                ...(e.dataType ? { data: e.dataType } : {})
              }))
            }
          }
        }
      } else {
        const wrapper = codeNum < 400 ? successWrapper : errorWrapper

        let schema: any
        const hasMatchingType = resp.type && types.find(t => t.name === resp.type)
        if (hasMatchingType) {
          schema = { $ref: `#/components/schemas/${resp.type}` }
        } else {
          schema = wrapperSchema(wrapper)
        }

        operation.responses[code] = {
          description: resp.description,
          content: {
            'application/json': { schema }
          }
        }
      }
    }

    if (responseExamples && Object.keys(responseExamples).length > 0) {
      const key = `${ep.method} ${ep.path}`
      const example = responseExamples[key]
      if (example === undefined) {
        throw new Error(`Missing response example for ${key} in swagger.config.json responseExamples`)
      }
      for (const code of Object.keys(operation.responses)) {
        const content = operation.responses[code].content
        if (content?.['application/json']) {
          content['application/json'].example = example
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
        t.properties.map(p => {
          const swaggerType = typeToSwaggerType(p.type, types, aliases)
          return [p.name, {
            ...swaggerType,
            ...(p.example !== undefined ? { example: p.example } : {}),
            description: p.description || p.name
          }]
        })
      )
    }

    if (components.schemas[t.name].required.length === 0) {
      delete components.schemas[t.name].required
    }
  }

  if (responseWrapperSchemas) {
    for (const [name, schema] of Object.entries(responseWrapperSchemas)) {
      if (usedWrappers.has(name)) {
        components.schemas[name] = resolveErrorCodes(schema, errorCodes)
      }
    }
  }

  return {
    ...swaggerConfig.openapi,
    paths,
    components,
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

function generateLLMYaml(endpoints: ApiEndpoint[], types: TypeSchema[], aliases: TypeAliasSchema[]): string {
  const lines: string[] = []

  const apiTitle = swaggerConfig?.openapi?.info?.title || 'API'
  lines.push(`# ${apiTitle} Reference (for LLM)`)
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

      const usedTypes: string[] = []
      if (ep.requestBody?.type && types.find(t => t.name === ep.requestBody!.type)) {
        usedTypes.push(`${ep.requestBody.type} (请求)`)
      }

      const respTypes = new Set<string>()
      for (const [, resp] of Object.entries(ep.responses)) {
        if (resp.type && !resp.type.startsWith('Error')) {
          respTypes.add(resp.type)
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
          const optional = q.default !== undefined
          const defStr = q.default !== undefined ? ` (默认: ${q.default})` : ''
          const enumStr = q.enum ? ` [${q.enum.join('|')}]` : ''
          lines.push(`  - \`${q.name}\`: ${q.type}${optional ? '' : ' (required)'}${enumStr}${defStr} - ${q.description}`)
        }
        lines.push('')
      }

      if (ep.requestBody && ['POST', 'PUT'].includes(ep.method)) {
        const typeNames = ep.requestBody.type.split(' | ').filter(Boolean)
        const matchedTypes = typeNames.map(name => types.find(t => t.name === name)).filter(Boolean) as TypeSchema[]
        lines.push('Request Body:')

        if (matchedTypes.length > 1) {
          lines.push(`  支持多种请求体格式 (oneOf):`)
          for (const schemaType of matchedTypes) {
            lines.push(`  - ${schemaType.name}:`)
            for (const p of schemaType.properties) {
              const req = p.required ? ' (required)' : ''
              lines.push(`      - \`${p.name}\`: ${simplifyType(p.type, aliases)}${req}`)
            }
          }
        } else if (matchedTypes.length === 1) {
          lines.push(`  type: ${matchedTypes[0].name}`)
          for (const p of matchedTypes[0].properties) {
            const req = p.required ? ' (required)' : ''
            lines.push(`  - \`${p.name}\`: ${simplifyType(p.type, aliases)}${req}`)
          }
        } else if (ep.requestBody.requiredFields?.length) {
          for (const f of ep.requestBody.requiredFields) {
            lines.push(`  - \`${f}\`: string (required)`)
          }
        }
        lines.push('')
      }

      lines.push('Response Body:')
      const respEntries = Object.entries(ep.responses)
      for (const [code, resp] of respEntries) {
        const refStr = resp.type ? ` (${resp.type})` : ''
        if (ep.sse && (code === '200' || Number(code) === 200)) {
          lines.push(`  ${code}: ${resp.description}（SSE 流式响应）`)
          lines.push(`    Content-Type: text/event-stream`)
          lines.push(`    事件格式: data: { type: string, message?: string, data?: object }`)
          lines.push(`    事件类型:`)
          for (const evt of ep.sse.eventTypes) {
            const dataStr = evt.dataType ? ` → ${evt.dataType}` : ''
            lines.push(`      - ${evt.name}: ${evt.description}${dataStr}`)
          }
        } else {
          lines.push(`  ${code}: ${resp.description}${refStr}`)
          if (resp.type && !resp.type.startsWith('Error')) {
            lines.push(`    { success: boolean, data: ${resp.type} }`)
          }
        }
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  ;(lines as any).append = () => {}

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
      lines.push(`- \`${p.name}\`${req}: ${simplifyType(p.type, aliases)}`)
    }
    lines.push('')
  }

  if (aliases.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Type Aliases')
    lines.push('')
    for (const a of aliases) {
      lines.push(`### ${a.name}`)
      lines.push(`- ${a.values.join(' | ')}`)
      lines.push('')
    }
  }

  return lines.join('\n') + '\n'
}

function simplifyType(type: string, aliases?: TypeAliasSchema[]): string {
  if (type.startsWith('array[')) {
    const itemType = type.slice(6, -1)
    const alias = aliases?.find(a => a.name === itemType)
    if (alias) {
      return `${itemType}[] [${alias.values.join('|')}]`
    }
    return `${itemType}[]`
  }
  if (type === 'Record<string, unknown>') return 'object'
  const alias = aliases?.find(a => a.name === type)
  if (alias) {
    return `${type} [${alias.values.join('|')}]`
  }
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

function loadConfig(configPath: string) {
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

function findConfigFile(root: string): string {
  const candidates = ['swagger.config.json', 'swagger-config.json']
  for (const name of candidates) {
    const fullPath = path.join(root, name)
    if (fs.existsSync(fullPath)) return fullPath
  }
  const defaultPath = path.join(root, 'swagger.config.json')
  console.warn(`  未找到 swagger.config.json，尝试加载默认路径: ${defaultPath}`)
  return defaultPath
}

export function generate(workspaceRoot?: string, configPath?: string) {
  const root = workspaceRoot || findWorkspaceRoot(process.cwd())

  const resolvedConfigPath = configPath || findConfigFile(root)
  swaggerConfig = loadConfig(resolvedConfigPath)

  // paths 属于插件内部配置默认值，不受业务 Fallback 规则管控
  const { paths = { apiDir: 'pages/api', typesFile: 'src/types/index.ts', outputFile: 'public/swagger.json', llmYamlFile: 'public/api-reference.yaml', errorsFile: 'src/config/api-errors.json' } } = swaggerConfig

  const PAGES_API_DIR = path.resolve(root, paths.apiDir)
  const OUTPUT_FILE = path.resolve(root, paths.outputFile)
  const TYPES_FILE = path.resolve(root, paths.typesFile)
  const LLM_YAML_FILE = paths.llmYamlFile
  const ERRORS_FILE = paths.errorsFile

  let errorCodes: string[] = []
  try {
    const errorsJsonPath = path.resolve(root, ERRORS_FILE)
    if (fs.existsSync(errorsJsonPath)) {
      const errorsConfig = JSON.parse(fs.readFileSync(errorsJsonPath, 'utf-8'))
      errorCodes = Object.keys(errorsConfig)
      console.log(`  加载 ${errorCodes.length} 个错误码`)
    }
  } catch {
    console.warn('  无法加载错误码配置，使用默认值')
  }

  console.log('正在生成标签映射...')
  const { tagMap: autoTagMap, tagDefs: autoTagDefs } = generateTagMap(PAGES_API_DIR)

  const configTagMap = swaggerConfig.tagMap || {}
  const mergedTagMap: Record<string, string> = { ...autoTagMap, ...configTagMap }

  const configTagDefs = swaggerConfig.openapi.tags || []
  const mergedTagDefs = Object.entries(mergedTagMap).map(([key, displayName]) => {
    const existingDef = configTagDefs.find(t => t.name === displayName)
    return existingDef || { name: displayName, description: `${displayName} 管理接口` }
  })
  swaggerConfig.openapi.tags = mergedTagDefs

  console.log(`  自动生成 ${Object.keys(autoTagMap).length} 个标签`)

  console.log('正在扫描 API 路由...')

  const apiFiles = scanDir(PAGES_API_DIR).filter(f => f.endsWith('.ts'))
  console.log(`  找到 ${apiFiles.length} 个 API 文件`)

  const allEndpoints: ApiEndpoint[] = []
  for (const file of apiFiles) {
    const endpoints = parseApiFile(file, PAGES_API_DIR, mergedTagMap)
    allEndpoints.push(...endpoints)
  }
  console.log(`  提取 ${allEndpoints.length} 个端点`)

  console.log('正在解析类型定义...')
  const { schemas: allTypes, aliases } = parseTypesFile(TYPES_FILE)
  console.log(`  提取 ${allTypes.length} 个类型, ${aliases.length} 个类型别名`)

  const usedTypes = getUsedTypes(allEndpoints, allTypes)
  console.log(`  筛选后: ${usedTypes.length} 个类型（已排除未使用的）`)

  console.log('正在生成 OpenAPI 规范...')
  const wrapperConfig = swaggerConfig.responseWrapper
  const responseExamples = swaggerConfig.responseExamples || {}
  const responseWrappers = swaggerConfig.responseWrappers || {}
  const responseWrapperSchemas = swaggerConfig.responseWrapperSchemas || {}
  const spec = generateOpenAPI(allEndpoints, usedTypes, aliases, errorCodes, wrapperConfig, responseExamples, responseWrappers, responseWrapperSchemas)

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(spec, null, 2) + '\n')
  console.log(`已生成: ${OUTPUT_FILE}`)
  console.log(`  大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`)

  console.log('正在生成 LLM 友好的 YAML 文档...')
  const yaml = generateLLMYaml(allEndpoints, usedTypes, aliases)
  fs.writeFileSync(path.resolve(root, LLM_YAML_FILE), yaml)
  console.log(`已生成: ${path.resolve(root, LLM_YAML_FILE)}`)
  console.log(`  大小: ${(fs.statSync(path.resolve(root, LLM_YAML_FILE)).size / 1024).toFixed(1)} KB`)
}
