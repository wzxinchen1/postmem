import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'
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
  responseWrappers?: {
    success?: string
    error?: string
  }
  responseWrapperSchemas?: Record<string, any>
  paths?: {
    apiDir: string
    typesFile: string
    outputFile: string
    errorsFile: string
  }
}

export function findWorkspaceRoot(startDir: string): string {
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

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])

function isHttpMethod(name: string): boolean {
  return HTTP_METHODS.has(name.toUpperCase())
}

function hasExportModifier(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node)
    if (modifiers) {
      for (const m of modifiers) {
        if (m.kind === ts.SyntaxKind.ExportKeyword) return true
      }
    }
  }
  return false
}

function extractHttpMethods(sourceFile: ts.SourceFile): string[] {
  const methods = new Set<string>()

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isHttpMethod(stmt.name.text) && hasExportModifier(stmt)) {
      methods.add(stmt.name.text)
      continue
    }
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && isHttpMethod(decl.name.text)) {
          methods.add(decl.name.text)
        }
      }
      continue
    }
    if (ts.isExportAssignment(stmt)) {
      const expr = stmt.expression
      if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
        const calleeName = expr.expression.text
        if (calleeName === 'createApiHandler') {
          const detected = extractMethodsFromCreateApiHandler(expr)
          for (const m of detected) methods.add(m)
        } else if (calleeName === 'withMiddleware') {
          const detected = extractMethodsFromHandlerBody(expr)
          for (const m of detected) methods.add(m)
        }
      }
    }
  }

  return [...methods]
}

function extractMethodsFromCreateApiHandler(call: ts.CallExpression): string[] {
  const methods: string[] = []
  const objArg = call.arguments[0]
  if (!objArg || !ts.isObjectLiteralExpression(objArg)) return methods

  for (const prop of objArg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const nameNode = prop.name
    if (!ts.isIdentifier(nameNode)) continue

    if (nameNode.text === 'methods' && ts.isArrayLiteralExpression(prop.initializer)) {
      for (const el of prop.initializer.elements) {
        if (ts.isStringLiteral(el)) methods.push(el.text.toUpperCase())
      }
    }

    if (nameNode.text === 'handler') {
      const handlerMethods = extractMethodsFromHandlerBody(prop.initializer)
      for (const m of handlerMethods) {
        if (!methods.includes(m)) methods.push(m)
      }
    }
  }

  return methods
}

function extractMethodsFromHandlerBody(node: ts.Node): string[] {
  const methods: string[] = []
  const seen = new Set<string>()

  function walk(n: ts.Node) {
    if (ts.isCallExpression(n)) {
      const callee = n.expression
      if (ts.isIdentifier(callee) && callee.text === 'apiHandler' && n.arguments.length >= 4) {
        const lastArg = n.arguments[n.arguments.length - 1]
        if (ts.isObjectLiteralExpression(lastArg)) {
          for (const prop of lastArg.properties) {
            let propName: string | undefined
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) propName = prop.name.text
            else if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) propName = prop.name.text
            else if (ts.isShorthandPropertyAssignment(prop) && ts.isIdentifier(prop.name)) propName = prop.name.text
            if (propName && isHttpMethod(propName) && !seen.has(propName)) {
              seen.add(propName)
              methods.push(propName.toUpperCase())
            }
          }
        }
      }
    }
    if (ts.isBinaryExpression(n)) {
      if (ts.isPropertyAccessExpression(n.left) &&
          ts.isIdentifier(n.left.expression) && n.left.expression.text === 'req' &&
          n.left.name.text === 'method' &&
          ts.isStringLiteral(n.right) &&
          isHttpMethod(n.right.text) &&
          (n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ||
           n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
          !seen.has(n.right.text.toUpperCase())) {
        seen.add(n.right.text.toUpperCase())
        methods.push(n.right.text.toUpperCase())
      }
    }
    ts.forEachChild(n, walk)
  }

  walk(node)
  return methods
}

function findFirstMethodHandler(sourceFile: ts.SourceFile, method: string): ts.Node | undefined {
  let result: ts.Node | undefined

  function walk(n: ts.Node) {
    if (result) return

    if (ts.isFunctionDeclaration(n) && n.name && n.name.text === method && hasExportModifier(n)) {
      result = n
      return
    }

    if (ts.isVariableStatement(n) && hasExportModifier(n)) {
      for (const decl of n.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === method) {
          result = decl
          return
        }
      }
    }

    if (ts.isExportAssignment(n) && ts.isCallExpression(n.expression) && ts.isIdentifier(n.expression.expression)) {
      const calleeName = n.expression.expression.text
      if (calleeName === 'createApiHandler') {
        result = n.expression
        return
      }
      if (calleeName === 'withMiddleware') {
        result = n.expression
        return
      }
    }

    ts.forEachChild(n, walk)
  }

  walk(sourceFile)
  return result
}

function collectQueryParamUsage(node: ts.Node): Set<string> {
  const params = new Set<string>()

  function walk(n: ts.Node) {
    if (ts.isPropertyAccessExpression(n)) {
      const nExpr = n.expression
      if (ts.isPropertyAccessExpression(nExpr)) {
        const obj = nExpr.expression
        if (ts.isIdentifier(obj) && obj.text === 'req' && nExpr.name.text === 'query' && ts.isIdentifier(n.name)) {
          if (n.name.text !== 'id') params.add(n.name.text)
        }
        return
      }
    }
    if (ts.isCallExpression(n)) {
      const nExpr = n.expression
      if (ts.isPropertyAccessExpression(nExpr) && nExpr.name.text === 'get') {
        const innerCall = nExpr.expression
        if (ts.isCallExpression(innerCall) && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0])) {
          const receiver = innerCall.expression
          if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'searchParams') {
            const val = n.arguments[0].text
            if (val !== 'id') params.add(val)
          }
        }
      }
    }
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer) {
      let init = n.initializer
      if (ts.isAwaitExpression(init)) init = init.expression
      if (ts.isPropertyAccessExpression(init) &&
          ts.isIdentifier(init.expression) && init.expression.text === 'req' &&
          init.name.text === 'query') {
        for (const element of n.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            if (element.name.text !== 'id') params.add(element.name.text)
          }
        }
      }
    }
    ts.forEachChild(n, walk)
  }

  walk(node)
  return params
}

function extractTypeNamesFromTypeNode(type: ts.TypeNode): string[] {
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return [type.typeName.text]
  }
  if (ts.isUnionTypeNode(type)) {
    const names: string[] = []
    for (const t of type.types) {
      if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) {
        names.push(t.typeName.text)
      }
    }
    return names
  }
  return []
}

function extractRequestBodyInfo(node: ts.Node): { type: string; requiredFields?: string[] } | undefined {
  let typeName: string | undefined

  function walk(n: ts.Node) {
    if (typeName) return

    if (ts.isAsExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'req' &&
        n.expression.name.text === 'body') {
      const names = extractTypeNamesFromTypeNode(n.type)
      if (names.length > 0) {
        typeName = names.join(' | ')
        return
      }
    }

    if (ts.isVariableDeclaration(n) && n.initializer) {
      let init = n.initializer
      if (ts.isAwaitExpression(init)) init = init.expression
      let isBodySource = false
      if (ts.isCallExpression(init) &&
          ts.isPropertyAccessExpression(init.expression) &&
          ts.isIdentifier(init.expression.expression) && init.expression.expression.text === 'req' &&
          (init.expression.name.text === 'json' || init.expression.name.text === 'body')) {
        isBodySource = true
      }
      if (ts.isIdentifier(init) && init.text === 'req') {
        isBodySource = true
      }
      if (ts.isPropertyAccessExpression(init) &&
          ts.isIdentifier(init.expression) && init.expression.text === 'req' &&
          (init.name.text === 'body' || init.name.text === 'json')) {
        isBodySource = true
      }
      if (isBodySource && n.type) {
        const names = extractTypeNamesFromTypeNode(n.type)
        if (names.length > 0) {
          typeName = names.join(' | ')
          return
        }
      }
    }

    ts.forEachChild(n, walk)
  }

  walk(node)

  if (!typeName) {
    return undefined
  }

  let requiredFields: string[] | undefined

  function collectFields(n: ts.Node) {
    if (requiredFields) return
    if (ts.isVariableDeclaration(n) && n.initializer) {
      let init = n.initializer
      if (ts.isAwaitExpression(init)) init = init.expression
      if (ts.isPropertyAccessExpression(init) &&
          ts.isIdentifier(init.expression) && init.expression.text === 'req' &&
          init.name.text === 'body' &&
          ts.isObjectBindingPattern(n.name)) {
        requiredFields = n.name.elements
          .map(el => {
            if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) return el.name.text
            return undefined
          })
          .filter((f): f is string => {
            if (f === undefined) return false
            if (f.startsWith('_')) return false
            return true
          })
      }
    }
    ts.forEachChild(n, collectFields)
  }

  collectFields(node)

  const result: { type: string; requiredFields?: string[] } = { type: typeName }
  if (requiredFields) {
    if (requiredFields.length > 0) {
      result.requiredFields = requiredFields
    }
  }

  return result
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

  if (blocks.length === 0) {
    throw new Error('缺少 JSDoc 标注，每个 API 端点必须包含 JSDoc')
  }

  const block = blocks[0]
  const descLines = block.description?.split('\n')
  if (!descLines || !descLines[0]?.trim()) {
    throw new Error('JSDoc 缺少描述，首行必须作为 summary')
  }
  result.summary = descLines[0].trim()
  result.description = result.summary
  if (result.summary.length > 150) {
    throw new Error(`JSDoc 描述过长（${result.summary.length} 字符），超过最大限制 150 字符。JSDoc 描述应仅包含 API 摘要信息，禁止混入内部开发备注或警告`)
  }

  function d(text: string): string {
    return text.startsWith('- ') ? text.slice(2) : text
  }

  for (const tag of block.tags) {
    switch (tag.tag) {
      case 'query': {
        if (!tag.name) {
          throw new Error(`@query tag missing parameter name: "(source unavailable)"`)
        }
        if (!tag.type) {
          throw new Error(`@query ${tag.name} 缺少类型`)
        }
        if (!d(tag.description)) {
          throw new Error(`@query ${tag.name} 缺少描述`)
        }
        result.queryParams[tag.name] = {
          type: tag.type,
          description: d(tag.description),
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
          throw new Error(`@${tag.tag} tag missing status code: "(source unavailable)"`)
        }
        const code = Number(tag.name)
        if (isNaN(code)) {
          throw new Error(`@${tag.tag} tag has non-numeric status code "${tag.name}": "(source unavailable)"`)
        }
        const method = tag.tag === 'response' ? undefined : tag.tag.slice(9)
        const entry: JSDocResponseEntry = { code, description: d(tag.description) }
        if (!entry.description) {
          throw new Error(`@${tag.tag} ${tag.name} 缺少 description`)
        }
        if (tag.type) entry.type = tag.type
        if (method) entry.method = method
        result.responseCodes[entry.code] = { description: entry.description, type: entry.type }
        result.responseEntries.push(entry)
        break
      }
      case 'sse': {
        if (!tag.description) {
          throw new Error(`@sse 缺少描述`)
        }
        result.sseDescription = tag.description
        break
      }
      case 'sse-event': {
        if (!tag.name) {
          throw new Error(`@sse-event tag missing event name: "(source unavailable)"`)
        }
        const sseEventDesc = d(tag.description)
        if (!sseEventDesc) {
          throw new Error(`@sse-event ${tag.name} 缺少描述`)
        }
        result.sseEvents.push({
          name: tag.name,
          description: sseEventDesc,
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
  const apiPath = ('/api/' + relativePath.replace(/\\/g, '/').replace(/\.ts$/, '').replace(/\[(\w+)\]/g, '{$1}')).replace(/\/route$/, '')

  const content = fs.readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
  const endpoints: ApiEndpoint[] = []
  const jsdoc = parseJSDoc(content)

  const tagKey = Object.keys(tagMap).find(k => apiPath.includes(`/api/${k}`))
  if (!tagKey) {
    throw new Error(`API 路径 ${apiPath} 未能匹配任何已知 tag`)
  }
  const tag = tagMap[tagKey]
  if (!tag) {
    throw new Error(`Tag key ${tagKey} 在 tagMap 中不存在`)
  }

  const methods = extractHttpMethods(sourceFile)

  for (const method of methods) {
    endpoints.push(parseEndpoint(apiPath, method, sourceFile, content, tag, jsdoc))
  }

  return endpoints
}

function parseEndpoint(
  apiPath: string,
  method: string,
  sourceFile: ts.SourceFile,
  content: string,
  tag: string,
  jsdoc: ParsedJSDoc
): ApiEndpoint {
  const endpoint: ApiEndpoint = {
    path: apiPath,
    method,
    summary: jsdoc.summary,
    description: jsdoc.description,
    tags: [tag],
    responses: {}
  }

  const pathParams = apiPath.match(/\{(\w+)\}/g)
  if (pathParams) {
    endpoint.params = pathParams.map(p => ({ name: p.slice(1, -1), description: p.slice(1, -1), type: 'string' }))
  }

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const handlerNode = findFirstMethodHandler(sourceFile, method)
    const searchNode = handlerNode || sourceFile
    const bodyInfo = extractRequestBodyInfo(searchNode)
    if (bodyInfo) {
      endpoint.requestBody = bodyInfo
    }
    if (!endpoint.requestBody) {
      const hasBodyUsage = content.match(/req\.body/)
      if (hasBodyUsage) {
        throw new Error(`[${method} ${apiPath}] 使用了 req.body 但缺少类型标注。请在变量声明（如 \`const body: XxxRequest = req.body\`）或类型断言（如 \`req.body as XxxRequest\`）中标注请求体类型`)
      }
    }
  }

  const queryDescriptions: Record<string, { description: string; type: string; default?: unknown }> = {}
  const codeQueryParams = new Set<string>()

  const handlerNode = findFirstMethodHandler(sourceFile, method)
  const searchNode = handlerNode || sourceFile
  const usedQueries = collectQueryParamUsage(searchNode)
  for (const q of usedQueries) {
    codeQueryParams.add(q)
    if (jsdoc.queryParams[q]) {
      queryDescriptions[q] = jsdoc.queryParams[q]
    }
  }

  for (const paramName of codeQueryParams) {
    if (!jsdoc.queryParams[paramName]) {
      throw new Error(`[${method} ${apiPath}] query 参数 \`${paramName}\` 缺少 @query JSDoc 标注`)
    }
  }

  if (Object.keys(queryDescriptions).length > 0) {
    endpoint.query = Object.entries(queryDescriptions).map(([name, info]) => ({ name, ...info }))
  }

  if (jsdoc.responseEntries.length > 0) {
    const hasMatchingResponse = jsdoc.responseEntries.some(e => !e.method || e.method === method)
    if (!hasMatchingResponse) {
      throw new Error(`[${method} ${apiPath}] 缺少 ${method} 方法的 @response JSDoc 标注`)
    }
    for (const entry of jsdoc.responseEntries) {
      if (!entry.method || entry.method === method) {
        endpoint.responses[entry.code] = { description: entry.description, type: entry.type }
      }
    }
  } else {
    throw new Error(`[${method} ${apiPath}] 缺少 @response JSDoc 标注`)
  }

  if (jsdoc.sseDescription || jsdoc.sseEvents.length > 0) {
    endpoint.sse = {
      description: jsdoc.sseDescription,
      eventTypes: jsdoc.sseEvents
    }
  } else if (content.includes('text/event-stream') || (content.includes('Content-Type') && content.includes('event-stream'))) {
    throw new Error(`[${apiPath}] SSE 响应缺少 @sse 或 @sse-event JSDoc 标注`)
  }

  return endpoint
}

function parseTypesFile(typesFilePath: string): { schemas: TypeSchema[]; aliases: TypeAliasSchema[] } {
  const content = fs.readFileSync(typesFilePath, 'utf-8')
  const sourceFile = ts.createSourceFile(typesFilePath, content, ts.ScriptTarget.Latest, true)
  const schemas: TypeSchema[] = []
  const aliases: TypeAliasSchema[] = []

  for (const stmt of sourceFile.statements) {
    if (!hasExportModifier(stmt)) continue

    if (ts.isInterfaceDeclaration(stmt)) {
      const schema = parseInterfaceDeclaration(stmt)
      if (schema) schemas.push(schema)
    }

    if (ts.isTypeAliasDeclaration(stmt)) {
      const alias = parseTypeAlias(stmt)
      if (alias) {
        if (alias.values.length > 0) {
          aliases.push({ name: alias.name, values: alias.values })
        } else if (alias.properties) {
          schemas.push({ name: alias.name, properties: alias.properties })
        }
      }
    }

    if (ts.isEnumDeclaration(stmt)) {
      const values: string[] = []
      for (const member of stmt.members) {
        if (member.initializer && ts.isStringLiteral(member.initializer)) {
          values.push(member.initializer.text)
        } else {
          values.push(member.name.getText())
        }
      }
      if (values.length > 0) {
        aliases.push({ name: stmt.name.text, values })
      }
    }
  }

  return { schemas, aliases }
}

function parseInterfaceDeclaration(node: ts.InterfaceDeclaration): TypeSchema | undefined {
  const name = node.name.text
  const properties: TypeSchema['properties'] = []

  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.name) continue
    const propName = member.name.getText()
    if (!member.type) continue

    const isOptional = !!member.questionToken
    const typeStr = typeNodeToString(member.type)

    const entry: TypeSchema['properties'][0] = {
      name: propName,
      type: typeStr,
      required: !isOptional
    }

    const arrayMatch = typeStr.match(/^Array<(.+)>$/)
    if (arrayMatch) {
      entry.itemsType = arrayMatch[1]
    }

    const jsdocTags = ts.getJSDocTags(member)
    for (const tag of jsdocTags) {
      if (tag.tagName.text === 'example' && typeof tag.comment === 'string') {
        const raw = tag.comment.trim()
        try {
          entry.example = JSON.parse(raw)
        } catch {
          throw new Error(`@example 值无法解析为 JSON: ${raw}`)
        }
      }
    }

    properties.push(entry)
  }

  return { name, properties }
}

function parseTypeAlias(node: ts.TypeAliasDeclaration): {
  name: string; values: string[]; properties?: TypeSchema['properties']
} | undefined {
  const name = node.name.text

  if (ts.isUnionTypeNode(node.type)) {
    const hasEnumPattern = node.type.types.every(t => ts.isLiteralTypeNode(t) && (ts.isStringLiteral(t.literal) || ts.isNoSubstitutionTemplateLiteral(t.literal)))
    if (hasEnumPattern) {
      const values = node.type.types.map(t => {
        const lit = (t as ts.LiteralTypeNode).literal
        if (ts.isStringLiteral(lit)) return lit.text
        if (ts.isNoSubstitutionTemplateLiteral(lit)) return lit.text
        return ''
      }).filter(v => v.length > 0)
      if (values.length > 0) return { name, values }
    }
  }

  if (ts.isTypeLiteralNode(node.type)) {
    const properties: TypeSchema['properties'] = []
    for (const member of node.type.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue
      const propName = member.name.getText()
      if (!member.type) continue
      const isOptional = !!member.questionToken
      const typeStr = typeNodeToString(member.type)
      const entry: TypeSchema['properties'][0] = { name: propName, type: typeStr, required: !isOptional }
      const arrayMatch = typeStr.match(/^Array<(.+)>$/)
      if (arrayMatch) entry.itemsType = arrayMatch[1]
      const jsdocTags = ts.getJSDocTags(member)
      for (const tag of jsdocTags) {
        if (tag.tagName.text === 'example' && typeof tag.comment === 'string') {
          const raw = tag.comment.trim()
          try {
            entry.example = JSON.parse(raw)
          } catch {
            throw new Error(`@example 值无法解析为 JSON: ${raw}`)
          }
        }
      }
      properties.push(entry)
    }
    return { name, values: [], properties }
  }

  return { name: '', values: [] }
}

function typeNodeToString(type: ts.TypeNode): string {
  const kind = type.kind

  if (kind === ts.SyntaxKind.StringKeyword) return 'string'
  if (kind === ts.SyntaxKind.NumberKeyword) return 'number'
  if (kind === ts.SyntaxKind.BooleanKeyword) return 'boolean'
  if (kind === ts.SyntaxKind.AnyKeyword) return 'unknown'
  if (kind === ts.SyntaxKind.UnknownKeyword) return 'unknown'
  if (kind === ts.SyntaxKind.NullKeyword) return 'null'
  if (kind === ts.SyntaxKind.VoidKeyword) return 'void'

  if (ts.isArrayTypeNode(type)) {
    return `Array<${typeNodeToString(type.elementType)}>`
  }

  if (ts.isTypeReferenceNode(type)) {
    const typeName = ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.getText()
    if (typeName === 'Record' && type.typeArguments && type.typeArguments.length === 2) {
      return typeNodeToString(type.typeArguments[1])
    }
    if (type.typeArguments && type.typeArguments.length > 0) {
      const args = type.typeArguments.map(t => typeNodeToString(t)).join(', ')
      return `${typeName}<${args}>`
    }
    return typeName
  }

  if (ts.isUnionTypeNode(type)) {
    const parts = type.types.map(t => typeNodeToString(t))
    const allStrings = parts.every(p => p.startsWith("'") || p === 'string')
    if (allStrings) {
      const values = parts.map(p => p.replace(/'/g, ''))
      return values.join(' | ')
    }
    return parts.join(' | ')
  }

  if (ts.isLiteralTypeNode(type)) {
    if (ts.isStringLiteral(type.literal)) return `'${type.literal.text}'`
    if (ts.isNumericLiteral(type.literal)) return type.literal.text
    if (type.literal.kind === ts.SyntaxKind.TrueKeyword) return 'true'
    if (type.literal.kind === ts.SyntaxKind.FalseKeyword) return 'false'
    return type.literal.getText()
  }

  if (ts.isTupleTypeNode(type)) {
    const parts = type.elements.map(t => typeNodeToString(t))
    return `[${parts.join(', ')}]`
  }

  if (kind === ts.SyntaxKind.TypeLiteral) {
    return 'object'
  }

  if (ts.isIntersectionTypeNode(type)) {
    return type.types.map(t => typeNodeToString(t)).join(' & ')
  }

  if (ts.isParenthesizedTypeNode(type)) {
    return typeNodeToString(type.type)
  }

  return type.getText()
}

function getUsedTypes(endpoints: ApiEndpoint[], allTypes: TypeSchema[]): TypeSchema[] {
  const directRefs = new Set<string>()

  for (const ep of endpoints) {
    if (ep.requestBody?.type) {
      const typeStr = ep.requestBody.type
      const parts = typeStr.split(' | ').filter(Boolean)
      for (const typeName of parts) {
        directRefs.add(typeName)
      }
    }

    for (const [, resp] of Object.entries(ep.responses)) {
      if (resp.type) {
        const parts = resp.type.split(' | ').filter(Boolean)
        for (const typeName of parts) {
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

function typeToSwaggerType(typeStr: string, types?: TypeSchema[], aliases?: TypeAliasSchema[]): { type?: string; items?: any; enum?: string[]; $ref?: string; nullable?: boolean } {
  const baseMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'integer': 'integer',
    'boolean': 'boolean',
    'object': 'object',
    'Date': 'string',
    'unknown': 'object'
  }

  const arrayAngleMatch = typeStr.match(/^Array<(.+)>$/)
  if (arrayAngleMatch) {
    return { type: 'array', items: typeToSwaggerType(arrayAngleMatch[1], types, aliases) }
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
    const parts = typeStr.split('|').map(v => v.trim().replace(/'/g, ''))
    const filtered = parts.filter(v => {
      if (!v) return false
      if (v === 'null' || v === 'undefined') return false
      if (/^[a-z]/.test(v) && ['string', 'number', 'boolean'].includes(v)) return false
      if (/^[A-Z]/.test(v)) return false
      return true
    })
    if (filtered.length > 0) {
      return { type: 'string', enum: filtered }
    }
    // 处理 "string | null" / "number | null" / "boolean | null" 等可空类型
    const nonNullParts = parts.filter(v => v !== 'null' && v !== 'undefined')
    if (nonNullParts.length === 1) {
      const base = typeToSwaggerType(nonNullParts[0], types, aliases)
      return { ...base, nullable: true }
    }
  }

  if (aliases) {
    const alias = aliases.find(a => a.name === typeStr)
    if (alias) {
      return { type: 'string', enum: alias.values }
    }
  }

  if (types && isCustomType(typeStr, types)) {
    return { $ref: `#/components/schemas/${typeStr}` }
  }

  const mapped = baseMap[typeStr]
  if (!mapped) {
    throw new Error(`未知类型: ${typeStr}`)
  }
  return { type: mapped }
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

function generateOpenAPI(endpoints: ApiEndpoint[], types: TypeSchema[], aliases: TypeAliasSchema[], errorCodes: string[], responseWrappers?: { success?: string; error?: string }, responseWrapperSchemas?: Record<string, any>): object {
  const paths: Record<string, any> = {}
  const components: Record<string, any> = { schemas: {} }

  const successWrapper = responseWrappers?.success
  const errorWrapper = responseWrappers?.error

  if (responseWrappers && !successWrapper) {
    throw new Error('responseWrappers.success 必须配置')
  }
  if (responseWrappers && !errorWrapper) {
    throw new Error('responseWrappers.error 必须配置')
  }
  if (responseWrapperSchemas) {
    if (successWrapper && !responseWrapperSchemas[successWrapper] && !isPrimitiveWrapper(successWrapper)) {
      throw new Error(`responseWrappers.success 引用了 schema "${successWrapper}"，但 responseWrapperSchemas 中未定义`)
    }
    if (errorWrapper && !responseWrapperSchemas[errorWrapper] && !isPrimitiveWrapper(errorWrapper)) {
      throw new Error(`responseWrappers.error 引用了 schema "${errorWrapper}"，但 responseWrapperSchemas 中未定义`)
    }
  }

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

    if (ep.requestBody && ['POST', 'PUT', 'PATCH'].includes(ep.method)) {
      const typeNames = ep.requestBody.type.split(' | ').filter(Boolean)
      const matchedTypes = typeNames.map(name => types.find(t => t.name === name)).filter(Boolean) as TypeSchema[]

      if (matchedTypes.length === 0) {
        throw new Error(`[${ep.method} ${ep.path}] 请求体类型 "${typeNames.join(', ')}" 未在类型定义中找到，请在 JSDoc @response 或代码中标注正确的请求体类型`)
      }

      let schema: any
      if (matchedTypes.length > 1) {
        schema = {
          oneOf: matchedTypes.map(t => ({ $ref: `#/components/schemas/${t.name}` })),
          description: `支持多种请求体格式: ${typeNames.join(', ')}`
        }
      } else {
        schema = { $ref: `#/components/schemas/${matchedTypes[0].name}` }
      }

      const reqExample = matchedTypes.length === 1
        ? Object.fromEntries(
            matchedTypes[0].properties
              .filter(p => p.example !== undefined)
              .map(p => [p.name, p.example])
          )
        : undefined

      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema,
            ...(reqExample && Object.keys(reqExample).length > 0 ? { example: reqExample } : {})
          }
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
        if (resp.type) {
          schema = typeToSwaggerType(resp.type, types, aliases)
        } else {
          if (!wrapper) {
            throw new Error(`响应 ${code} 缺少 type，且未配置 responseWrappers`)
          }
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
            ...(p.description ? { description: p.description } : {})
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

function loadConfig(configPath: string) {
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

export function findConfigFile(root: string): string {
  const candidates = ['swagger.config.json', 'swagger-config.json']
  for (const name of candidates) {
    const fullPath = path.join(root, name)
    if (fs.existsSync(fullPath)) return fullPath
  }
  throw new Error(`未找到 swagger 配置文件 (swagger.config.json / swagger-config.json): ${root}`)
}

export function generate(workspaceRoot: string, configPath: string) {
  const root = workspaceRoot

  const resolvedConfigPath = configPath
  swaggerConfig = loadConfig(resolvedConfigPath)

  if (!swaggerConfig.openapi || typeof swaggerConfig.openapi !== 'object') {
    throw new Error('swagger.config.json 缺少 openapi 配置')
  }
  if (!swaggerConfig.openapi.info || typeof swaggerConfig.openapi.info !== 'object') {
    throw new Error('swagger.config.json 缺少 openapi.info 配置')
  }
  if (!Array.isArray(swaggerConfig.openapi.tags)) {
    throw new Error('swagger.config.json 缺少 openapi.tags 配置（需要数组）')
  }

  const { paths = { apiDir: 'pages/api', typesFile: 'src/types/index.ts', outputFile: 'public/swagger.json', errorsFile: 'src/config/api-errors.json' } } = swaggerConfig

  if (!paths.apiDir || !paths.typesFile || !paths.outputFile) {
    throw new Error('swagger.config.json 中 paths 配置不完整，需要 apiDir、typesFile、outputFile')
  }

  const PAGES_API_DIR = path.resolve(root, paths.apiDir)
  const OUTPUT_FILE = path.resolve(root, paths.outputFile)
  const TYPES_FILE = path.resolve(root, paths.typesFile)
  const ERRORS_FILE = paths.errorsFile

  let errorCodes: string[] = []
  const errorsJsonPath = path.resolve(root, ERRORS_FILE)
  if (!fs.existsSync(errorsJsonPath)) {
    throw new Error(`错误码文件不存在: ${errorsJsonPath}`)
  }
  try {
    const errorsConfig = JSON.parse(fs.readFileSync(errorsJsonPath, 'utf-8'))
    errorCodes = Object.keys(errorsConfig)
    console.log(`  加载 ${errorCodes.length} 个错误码`)
  } catch (e) {
    throw new Error(`错误码文件解析失败: ${errorsJsonPath}`)
  }

  console.log('正在生成标签映射...')
  const { tagMap: autoTagMap, tagDefs: autoTagDefs } = generateTagMap(PAGES_API_DIR)

  const configTagMap = swaggerConfig.tagMap
  const mergedTagMap: Record<string, string> = configTagMap ? { ...autoTagMap, ...configTagMap } : { ...autoTagMap }

  if (!swaggerConfig.openapi.tags) {
    throw new Error('swagger.config.json 缺少 openapi.tags 配置')
  }
  const configTagDefs = swaggerConfig.openapi.tags
  const mergedTagDefs = Object.entries(mergedTagMap).map(([key, displayName]) => {
    const existingDef = configTagDefs.find(t => t.name === displayName)
    if (!existingDef) {
      throw new Error(`swagger.config.json 中缺少 tag "${displayName}" 的定义，请在 openapi.tags 中配置`)
    }
    return existingDef
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
  const responseWrappers = swaggerConfig.responseWrappers
  const responseWrapperSchemas = swaggerConfig.responseWrapperSchemas
  const spec = generateOpenAPI(allEndpoints, usedTypes, aliases, errorCodes, responseWrappers, responseWrapperSchemas)

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(spec, null, 2) + '\n')
  console.log(`已生成: ${OUTPUT_FILE}`)
  console.log(`  大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`)
}
