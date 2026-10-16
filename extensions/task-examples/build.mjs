import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
if (!process.env.HARNESS_PROGRAM_ROOT) throw new Error('请设置 HARNESS_PROGRAM_ROOT 指向平台程序仓库')
const { build } = createRequire(join(process.env.HARNESS_PROGRAM_ROOT, 'platform/plugin/package.json'))('esbuild')
const prefix = ['EXP-daily-inspection-assistant-002-', 'EXP-autonomous-training-researcher-001-', 'EXP-multi-step-research-analyst-001-']
for (const id of readdirSync(join(root, 'evolution/experiments')).filter(id => prefix.some(p => id.startsWith(p)))) {
  await build({ entryPoints: [join(root, 'extensions/task-examples/src/runtime.ts')],
    outfile: join(root, 'evolution/experiments', id, 'candidate/dsh/managed/task-example-tools.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: false })
  console.log(id)
}
