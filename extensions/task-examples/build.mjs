import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
if (!process.env.HARNESS_PROGRAM_ROOT) throw new Error('请设置 HARNESS_PROGRAM_ROOT 指向平台程序仓库')
const { build } = createRequire(join(process.env.HARNESS_PROGRAM_ROOT, 'platform/plugin/package.json'))('esbuild')
const prefix = ['EXP-daily-inspection-assistant-002-', 'EXP-autonomous-training-researcher-001-', 'EXP-multi-step-research-analyst-001-']
const available = readdirSync(join(root, 'evolution/experiments'))
const selected = process.argv.length > 2 ? process.argv.slice(2) : prefix.map(value => {
  const matches = available.filter(id => id.startsWith(value))
  if (matches.length !== 1) throw new Error('样例来源不唯一，请明确传入需要构建的Experiment ID：' + value)
  return matches[0]
})
if (new Set(selected).size !== selected.length || selected.some(id => !available.includes(id) || !prefix.some(value => id.startsWith(value)) || !/^EXP-[a-z0-9-]+-r[0-9a-f]{12}$/.test(id))) throw new Error('构建目标必须是已存在且不重复的任务样例Experiment')
for (const id of selected) {
  await build({ entryPoints: [join(root, 'extensions/task-examples/src/runtime.ts')],
    outfile: join(root, 'evolution/experiments', id, 'candidate/dsh/managed/task-example-tools.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: false })
  console.log(id)
}
