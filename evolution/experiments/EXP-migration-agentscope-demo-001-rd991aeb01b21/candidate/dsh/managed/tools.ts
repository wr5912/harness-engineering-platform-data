// 迁移自 AgentScope 样例的版本比较工具桥接：原生 DSH 工具经 JSON 子进程调用 Python3
// 执行独立业务函数 version_tool.py（依赖 packaging==25.0）。不复制宿主 venv。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const name = 'migration-agentscope-version-tools'
export const inject = ['tools']

const PYTHON_BRIDGE = fileURLToPath(new URL('./python/version_tool_cli.py', import.meta.url))

interface VersionToolResult {
  left: string
  right: string
  newer: string
  runtime: { python: string; packaging: string; bridge: string }
}

function runVersionTool(input: { left: string; right: string }, signal?: AbortSignal): Promise<VersionToolResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('调用已取消（AbortSignal 已中止）'))
      return
    }
    const child = spawn('python3', [PYTHON_BRIDGE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }
    const onAbort = () => {
      child.kill('SIGTERM')
      finish(() => reject(new Error('调用已取消（AbortSignal 中止了 Python3 子进程）')))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (err) => finish(() => reject(new Error('Python3 进程启动失败：' + err.message))))
    child.on('close', (code) => {
      if (signal?.aborted) {
        onAbort()
        return
      }
      let parsed: { ok?: boolean; value?: VersionToolResult; error?: { type?: string; message?: string } }
      try {
        parsed = JSON.parse(stdout)
      } catch {
        finish(() => reject(new Error(`Python 桥接返回非 JSON（退出码 ${code}）：${(stderr || stdout).slice(0, 400)}`)))
        return
      }
      if (code !== 0 || !parsed.ok || !parsed.value) {
        const detail = parsed.error?.message || stderr.trim() || '未知错误'
        const kind = parsed.error?.type ? `，${parsed.error.type}` : ''
        finish(() => reject(new Error(`Python 工具错误（退出码 ${code}${kind}）：${detail}`)))
        return
      }
      finish(() => resolve(parsed.value as VersionToolResult))
    })
    child.stdin.on('error', () => { /* 子进程提前退出时忽略 EPIPE，由 close 统一处理 */ })
    child.stdin.end(JSON.stringify(input))
  })
}

export function apply(ctx: any) {
  ctx.tools.register({
    name: 'select_newer_version',
    description: '比较两个版本号并返回较新者。经 Python3 子进程调用 packaging.version 的独立业务函数实现。比较版本必须使用本工具，不要自行判断。输入必须是合法版本号，否则工具报错。',
    parameters: {
      type: 'object',
      properties: {
        left: { type: 'string', description: '左侧版本号，例如 1.9' },
        right: { type: 'string', description: '右侧版本号，例如 1.10' },
      },
      required: ['left', 'right'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          left: { type: 'string' },
          right: { type: 'string' },
          newer: { type: 'string' },
          runtime: {
            type: 'object',
            properties: {
              python: { type: 'string' },
              packaging: { type: 'string' },
              bridge: { type: 'string' },
            },
            required: ['python', 'packaging', 'bridge'],
          },
        },
        required: ['left', 'right', 'newer', 'runtime'],
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(input: { left: string; right: string }, exec: { signal?: AbortSignal }) {
      return await runVersionTool(input, exec?.signal)
    },
  })
}
