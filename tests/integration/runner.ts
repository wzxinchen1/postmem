import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import http from 'http'
import winston from 'winston'
import { SeqTransport } from '@datalust/winston-seq'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const testLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { application: 'postmem-test-runner' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] [runner]: ${message}`),
      ),
    }),
    ...(process.env.SEQ_URL
      ? [new SeqTransport({ serverUrl: process.env.SEQ_URL, apiKey: process.env.SEQ_API_KEY, onError: (e: Error) => console.error('[Seq] test runner transport error:', e) })]
      : []),
  ],
})

process.env.INTEGRATION_TEST = 'true'

export interface TestContext {
  baseUrl: string
}

export type TestFn = (ctx: TestContext) => Promise<void>

export interface TestOptions {
  /** 该测试是否需要搜索。默认 false。声明 true 的测试允许产生搜索事件，false 的测试不允许 */
  search?: boolean
}

interface TestCase {
  name: string
  fn: TestFn
  timeoutMs: number
  search: boolean
}

interface TestResult {
  name: string
  passed: boolean
  durationMs: number
  error?: string
}

interface RunState {
  failedIndex: number
  timestamp: string
}

const DEFAULT_TIMEOUT = 60_000
const STATE_FILE = path.resolve(__dirname, '.run-state.json')
const results: TestResult[] = []
const tests: TestCase[] = []

let httpServer: http.Server | null = null
const PORT = Number(process.env.PORT) || 3000
const BASE_URL = `http://localhost:${PORT}`

const retryMode = process.argv.includes('retry')
export function isRetryMode(): boolean {
  return retryMode
}

function log(message: string) {
  const timestamp = new Date().toISOString().slice(11, 19)
  console.log(`[${timestamp}] ${message}`)
}

function logSuccess(message: string) {
  log(`\x1b[32m✓\x1b[0m ${message}`)
}

function logFail(message: string) {
  log(`\x1b[31m✗\x1b[0m ${message}`)
}

function logInfo(message: string) {
  log(`\x1b[36m→\x1b[0m ${message}`)
}

const setupFns: TestFn[] = []
const beforeFns: TestFn[] = []

export function setup(fn: TestFn): void {
  setupFns.push(fn)
}

export function before(fn: TestFn): void {
  beforeFns.push(fn)
}

export function test(name: string, fn: TestFn, timeoutOrOptions?: number | TestOptions & { timeoutMs?: number }) {
  let timeoutMs = DEFAULT_TIMEOUT
  let search = false
  if (typeof timeoutOrOptions === 'number') {
    timeoutMs = timeoutOrOptions
  } else if (timeoutOrOptions) {
    timeoutMs = timeoutOrOptions.timeoutMs ?? DEFAULT_TIMEOUT
    search = timeoutOrOptions.search ?? false
  }
  tests.push({ name, fn, timeoutMs, search })
}

async function runWithTimeout(fn: TestFn, ctx: TestContext, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`用例超时 (${timeoutMs}ms)`))
    }, timeoutMs)

    fn(ctx).then(
      (result) => { clearTimeout(timer); resolve(result) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

async function waitForServer(maxRetries = 60, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(BASE_URL)
      if (res.ok || res.status === 404) {
        return true
      }
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL)
    return res.ok || res.status === 404
  } catch {
    return false
  }
}

const SERVER_STARTUP_TIMEOUT = 120_000

async function startServer(): Promise<void> {
  if (await isServerRunning()) {
    logSuccess('检测到服务器已在运行，跳过启动')
    return
  }

  logInfo('正在启动服务器（同进程模式）...')

  const startupPromise = (async () => {
    const next = await import('next')
    const app = next.default({ dev: true, dir: path.resolve(__dirname, '../..') })
    const handler = app.getRequestHandler()

    await app.prepare()

    httpServer = http.createServer(handler)
    await new Promise<void>((resolve) => {
      httpServer!.listen(PORT, () => resolve())
    })
  })()

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`服务器启动超时 (${SERVER_STARTUP_TIMEOUT}ms)`)), SERVER_STARTUP_TIMEOUT)
  })

  await Promise.race([startupPromise, timeoutPromise])

  logInfo('等待服务器就绪...')
  const ready = await waitForServer()
  if (!ready) {
    throw new Error('服务器就绪检查超时')
  }
  logSuccess('服务器已就绪')
}

async function stopServer(): Promise<void> {
  if (!httpServer) return

  logInfo('正在停止服务器...')
  await new Promise<void>((resolve) => {
    httpServer!.close(() => resolve())
  })
  httpServer = null
  logInfo('服务器已停止')
}

function loadRunState(): RunState | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8')
    return JSON.parse(raw) as RunState
  } catch {
    return null
  }
}

function saveRunState(failedIndex: number): void {
  const state: RunState = { failedIndex, timestamp: new Date().toISOString() }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function clearRunState(): void {
  try {
    fs.unlinkSync(STATE_FILE)
  } catch {
  }
}

async function runTests(): Promise<void> {
  const ctx: TestContext = { baseUrl: BASE_URL }
  let hasFailure = false

  let startIndex = 0
  if (retryMode) {
    const state = loadRunState()
    if (state) {
      startIndex = state.failedIndex
      logInfo(`retry 模式：从第 ${startIndex + 1} 个用例 "${tests[startIndex]?.name}" 继续`)
      logInfo(`上次失败时间：${state.timestamp}`)
      for (let i = 0; i < startIndex; i++) {
        results.push({ name: tests[i].name, passed: true, durationMs: 0 })
      }
    } else {
      logInfo('retry 模式：未找到上次运行状态，从头开始')
    }
  }

  log('')
  log(`\x1b[1m开始运行 ${tests.length - startIndex} 个测试用例（共 ${tests.length} 个）\x1b[0m`)
  log('')

  if (startIndex === 0) {
    for (const fn of setupFns) {
      await fn(ctx)
    }
    for (const fn of beforeFns) {
      await fn(ctx)
    }
  } else {
    for (const fn of setupFns) {
      await fn(ctx)
    }
    logInfo('retry 模式：跳过 before 钩子（不清理数据库）')
  }

  for (let i = startIndex; i < tests.length; i++) {
    const tc = tests[i]
    const label = `[${i + 1}/${tests.length}] ${tc.name}`

    if (hasFailure) {
      logFail(`${label} — 跳过（前置用例失败）`)
      results.push({ name: tc.name, passed: false, durationMs: 0, error: '跳过：前置用例失败' })
      continue
    }

    const start = Date.now()
    logInfo(`${label} 开始... (超时 ${tc.timeoutMs}ms)`)
    testLogger.info(`test_start`, { index: i + 1, total: tests.length, name: tc.name, search: tc.search })
    try {
      // 根据测试的 search 选项自动管理 searchDisabled
      const { setSearchDisabled } = await import('./helpers')
      setSearchDisabled(!tc.search)

      await runWithTimeout(tc.fn, ctx, tc.timeoutMs)
      const { checkMessageTokens, assertNoSearchWhenDisabled } = await import('./helpers')
      await checkMessageTokens()
      await assertNoSearchWhenDisabled(tc.search)
      const durationMs = Date.now() - start
      testLogger.info(`test_pass`, { index: i + 1, name: tc.name, durationMs })
      logSuccess(`${label} (${durationMs}ms)`)
      results.push({ name: tc.name, passed: true, durationMs })
    } catch (err: unknown) {
      const durationMs = Date.now() - start
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      testLogger.error(`test_fail`, { index: i + 1, name: tc.name, durationMs, error: message })
      logFail(`${label} (${durationMs}ms)`)
      console.error(`  \x1b[31m${message}\x1b[0m`)
      if (stack) {
        const stackLines = stack.split('\n').slice(1).join('\n')
        console.error(`  \x1b[90m${stackLines}\x1b[0m`)
      }
      results.push({ name: tc.name, passed: false, durationMs, error: message })
      hasFailure = true
      saveRunState(i)
    }
  }
}

function printSummary(): void {
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const total = results.length
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0)

  log('')
  log('\x1b[1m━━━ 测试结果 ━━━\x1b[0m')
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const icon = r.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
    const suffix = r.error ? ` \x1b[31m(${r.error})\x1b[0m` : ''
    log(`  ${icon} [${i + 1}/${results.length}] ${r.name} (${r.durationMs}ms)${suffix}`)
  }
  log('')
  const color = failed > 0 ? '\x1b[31m' : '\x1b[32m'
  log(`${color}${passed}/${total} 通过, ${failed} 失败\x1b[0m — 总耗时 ${totalMs}ms`)
}

export async function run(): Promise<void> {
  let exitCode = 0

  try {
    await startServer()
    await runTests()
    printSummary()

    const failed = results.filter((r) => !r.passed).length
    if (failed > 0) {
      exitCode = 1
    } else {
      clearRunState()
    }
  } catch (err) {
    logFail(`运行器异常: ${err instanceof Error ? err.message : String(err)}`)
    exitCode = 1
  } finally {
    process.exit(exitCode)
  }
}
