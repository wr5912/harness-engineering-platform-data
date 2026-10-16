import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const programRoot = process.env.HARNESS_PROGRAM_ROOT
if (!programRoot) throw new Error('测试需要 HARNESS_PROGRAM_ROOT')
const parentURL = pathToFileURL(join(programRoot, 'platform/plugin/package.json')).href
// 测试运行时使用程序锁定的依赖；业务仓库不复制 node_modules 或平台源码。
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@harness-platform/mcp/')) return next(pathToFileURL(join(programRoot, 'platform/plugin/src/mcp', specifier.split('/').at(-1) + '.ts')).href, context)
  if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) {
    try { return next(specifier, context) }
    catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' && error.code !== 'MODULE_NOT_FOUND') throw error
      return next(specifier, { ...context, parentURL })
    }
  }
  return next(specifier, context)
} })
