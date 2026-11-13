import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(process.env.DSH_TYPESCRIPT_ANCHOR || join(root, 'package.json'))
const ts = require('typescript')
const source = 'mcp-group-bridge.ts'
const result = ts.transpileModule(readFileSync(join(root, source), 'utf8'), {
  fileName: source,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
  reportDiagnostics: true,
})
const errors = result.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? []
if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
  getCurrentDirectory: () => root,
  getCanonicalFileName: name => name,
  getNewLine: () => '\n',
}))
if (process.argv.includes('--check')) {
  if (readFileSync(join(root, 'mcp-group-bridge.mjs'), 'utf8') !== result.outputText) throw new Error('mcp-group-bridge.mjs 已过期，请运行 pnpm build')
} else writeFileSync(join(root, 'mcp-group-bridge.mjs'), result.outputText)
