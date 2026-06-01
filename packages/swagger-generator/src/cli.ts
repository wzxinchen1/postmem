#!/usr/bin/env node
import { findWorkspaceRoot, findConfigFile, generate } from './index'

function parseArgs(args: string[]): { workspaceRoot?: string; configPath?: string } {
  const result: { workspaceRoot?: string; configPath?: string } = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--workspace-root':
      case '-w':
        result.workspaceRoot = args[++i]
        break
      case '--config':
      case '-c':
        result.configPath = args[++i]
        break
    }
  }
  return result
}

const command = process.argv[2]

switch (command) {
  case 'generate': {
    const { workspaceRoot, configPath } = parseArgs(process.argv.slice(3))
    const root = workspaceRoot || findWorkspaceRoot(process.cwd())
    const cf = configPath || findConfigFile(root)
    generate(root, cf)
    break
  }
  case 'help':
  case '--help':
  case '-h':
    console.log(`
Usage: swagger-generator <command> [options]

Commands:
  generate   Generate OpenAPI 3.0 spec from API routes and TypeScript types
  help       Show this help message

Options (generate):
  --workspace-root, -w <path>   Workspace root directory (required, unless running from workspace root)
  --config, -c <path>            Swagger config file path (required, unless <workspace-root>/swagger.config.json exists)
`)
    break
  default:
    if (command) {
      console.error(`Unknown command: ${command}`)
    }
    console.log('Usage: swagger-generator generate')
    console.log('       swagger-generator help')
    process.exit(command ? 1 : 0)
}
