declare module 'vm2' {
  export class VM {
    constructor(options?: {
      sandbox?: Record<string, unknown>
      timeout?: number
    })
    run(code: string): unknown
  }

  export class NodeVM {
    constructor(options?: {
      sandbox?: Record<string, unknown>
      timeout?: number
      require?: {
        external?: boolean | string[]
        builtin?: string[]
        mock?: Record<string, unknown>
      }
    })
    run(code: string): unknown
    runModule(module: string): unknown
  }
}