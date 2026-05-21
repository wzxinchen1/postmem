import { ChildProcess, spawn } from 'child_process'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export interface TestContext {
  baseUrl: string
}

export type TestFn = (ctx: TestContext) => Promise<void>

interface TestCase {
  name: string
  fn: TestFn
  timeoutMs: number
}

interface TestResult {
  name: string
  passed: boolean
  durationMs: number
  error?: string
}

const DEFAULT_TIMEOUT = 60_000
const results: TestResult[] = []
const tests: TestCase[] = []

let serverProcess: ChildProcess | null = null
const BASE_URL = `http://localhost:${process.env.PORT || 3000}`

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

export function test(name: string, fn: TestFn, timeoutMs = DEFAULT_TIMEOUT) {
  tests.push({ name, fn, timeoutMs })
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
      // Server not ready yet
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

async function startServer(): Promise<void> {
  if (await isServerRunning()) {
    logSuccess('检测到服务器已在运行，跳过启动')
    return
  }

  logInfo('正在启动服务器...')

  serverProcess = spawn('node', ['node_modules/.bin/next', 'dev', '-p', String(process.env.PORT || 3000)], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'pipe',
    env: { ...process.env },
  })

  serverProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      log(`[server:stdout] ${text}`)
    }
  })

  serverProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      log(`[server:stderr] ${text}`)
    }
  })

  serverProcess.on('error', (err) => {
    log(`[server:error] ${err.message}`)
  })

  serverProcess.on('exit', (code) => {
    log(`[server:exit] code=${code}`)
    serverProcess = null
  })

  logInfo('等待服务器就绪...')
  const ready = await waitForServer()
  if (!ready) {
    throw new Error('服务器启动超时')
  }
  logSuccess('服务器已就绪')
}

async function stopServer(): Promise<void> {
  if (!serverProcess) return

  logInfo('正在停止服务器...')
  serverProcess.kill('SIGTERM')

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      serverProcess?.kill('SIGKILL')
      resolve()
    }, 10000)

    serverProcess?.on('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })

  serverProcess = null
  logInfo('服务器已停止')
}

async function runTests(): Promise<void> {
  const ctx: TestContext = { baseUrl: BASE_URL }
  let hasFailure = false

  log('')
  log(`\x1b[1m开始运行 ${tests.length} 个测试用例\x1b[0m`)
  log('')

  for (let i = 0; i < tests.length; i++) {
    const tc = tests[i]
    const label = `[${i + 1}/${tests.length}] ${tc.name}`

    if (hasFailure) {
      logFail(`${label} — 跳过（前置用例失败）`)
      results.push({ name: tc.name, passed: false, durationMs: 0, error: '跳过：前置用例失败' })
      continue
    }

    const start = Date.now()
    logInfo(`${label} 开始... (超时 ${tc.timeoutMs}ms)`)
    try {
      await runWithTimeout(tc.fn, ctx, tc.timeoutMs)
      const durationMs = Date.now() - start
      logSuccess(`${label} (${durationMs}ms)`)
      results.push({ name: tc.name, passed: true, durationMs })
    } catch (err: unknown) {
      const durationMs = Date.now() - start
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      logFail(`${label} (${durationMs}ms)`)
      console.error(`  \x1b[31m${message}\x1b[0m`)
      if (stack) {
        const stackLines = stack.split('\n').slice(1).join('\n')
        console.error(`  \x1b[90m${stackLines}\x1b[0m`)
      }
      results.push({ name: tc.name, passed: false, durationMs, error: message })
      hasFailure = true
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
    }
  } catch (err) {
    logFail(`运行器异常: ${err instanceof Error ? err.message : String(err)}`)
    exitCode = 1
  } finally {
    await stopServer()
  }

  process.exit(exitCode)
}
