import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const dataRoot = resolve(directory, '../..')
const programRoot = process.env.HARNESS_PROGRAM_ROOT
if (!programRoot) throw new Error('构建扩展需要 HARNESS_PROGRAM_ROOT')
const programRequire = createRequire(join(programRoot, 'platform/plugin/package.json'))
const hash = createHash('sha256')
async function digest(folder, prefix = '') {
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) await digest(path, `${prefix}${entry.name}/`)
    else hash.update(prefix + entry.name).update('\0').update(await readFile(path))
  }
}
await digest(join(directory, 'src'))
for (const path of [fileURLToPath(import.meta.url), join(directory, 'package.json'), join(programRoot, 'platform/plugin/pnpm-lock.yaml'), join(programRoot, 'platform/plugin/src/mcp/compositions.ts'), join(programRoot, 'platform/plugin/src/mcp/extension.ts')]) hash.update(await readFile(path))
const sourceDigest = hash.digest('hex')
const output = join(dataRoot, '.local/build-cache/security-operations', sourceDigest)
if (process.argv.includes('--path')) {
  process.stdout.write(output + '\n')
  process.exit(0)
}
const { build } = programRequire('esbuild')
await mkdir(output, { recursive: true })
await build({ entryPoints: [join(directory, 'src/index.ts')], outfile: join(output, 'plugin.js'), bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external', logLevel: 'silent',
  define: { __SECURITY_OPERATIONS_BUILD_DIGEST__: JSON.stringify(sourceDigest) },
  plugins: [{ name: 'platform-contract', setup(builder) {
    builder.onResolve({ filter: /^@harness-platform\/mcp\// }, args => ({ path: join(programRoot, 'platform/plugin/src/mcp', args.path.split('/').at(-1) + '.ts') }))
  } }],
})
const { name, version } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module', name, version }))
try { await symlink(join(programRoot, 'platform/plugin/node_modules'), join(output, 'node_modules'), 'dir') }
catch (error) { if (error.code !== 'EEXIST') throw error }
// 唯一标准输出供 prepare 读取；不把生成物作为另一份可编辑源码。
process.stdout.write(output + '\n')
