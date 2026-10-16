/** 三个任务样例的受限业务工具；输出来自实际接口或可核查执行回执。 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const name = 'task-example-tools'
export const inject = ['tools', 'connection', 'webServer']
type Row = { asset_id: string; hostname: string; asset_type: string; risk_score: number }
type Config = { kind: 'inspection' | 'research' | 'training'; assetUrl?: string; sourceUrls?: string[] }
const execute = promisify(execFile)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const runPattern = /^task-[0-9a-f-]{36}$/
const safeCell = (value: unknown) => String(value).replace(/[\r\n|]/g, ' ').slice(0, 500)
const columns = { run_id: { type: 'string' }, action: { type: 'string', required: true }, cursor: { type: 'number' }, source: { type: 'string' }, summaries: { type: 'object', additionalProperties: { type: 'string' } }, train_py: { type: 'string', description: '仅candidate动作：修改后的完整train.py，其余上游文件不可更改。' } }
const trainingCommit = '228791fb499afffb54b46200aca536f79142f117'

export function apply(ctx: any, config: Config) {
  const base = join(process.env.DSH_HOME || '/var/lib/dsh', 'task-example-artifacts')
  async function save(id: string, value: any) {
    await mkdir(join(base, id), { recursive: true })
    await writeFile(join(base, id, 'state.json'), JSON.stringify(value, null, 2))
  }
  async function state(id: string, session: string) {
    if (!runPattern.test(id)) throw new Error('运行 ID 无效')
    const value = JSON.parse(await readFile(join(base, id, 'state.json'), 'utf8'))
    if (value.session_id !== session) throw new Error('该任务属于另一 Session')
    return value
  }
  async function get(url: string, signal: AbortSignal) {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) })
    if (!response.ok) throw new Error(`外部资料读取失败: HTTP ${response.status}`)
    const content = await response.text()
    if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error('资料超过读取上限')
    return content
  }
  async function report(id: string, value: any, content: string, csv?: string) {
    const bytes = Buffer.from(content)
    await writeFile(join(base, id, 'report.md'), bytes)
    if (csv) await writeFile(join(base, id, 'devices.csv'), csv)
    value.report_sha256 = digest(content); value.completed_at = new Date().toISOString()
    await save(id, value)
    return { run_id: id, completed: true, source_kind: value.source_kind, report_sha256: value.report_sha256, markdown: content, ...(csv ? { csv } : {}),
      download_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=report.md`,
      ...(csv ? { csv_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=devices.csv` } : {}) }
  }
  async function trainingPreflight() {
    const workspace = join(process.env.DSH_HOME || '/var/lib/dsh', 'autoresearch')
    const checks = { nvidia_gpu: false, pytorch_cuda: false, uv: false, fixed_source: false, prepared_data: false }
    try { const r = await execute('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'], { timeout: 5000 }); checks.nvidia_gpu = Boolean(r.stdout.trim()) } catch {}
    const env = { PATH: process.env.PATH!, HOME: process.env.HOME!, ...(process.env.CUDA_VISIBLE_DEVICES ? { CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES } : {}) }
    try { await execute('uv', ['--version'], { timeout: 5000, env }); checks.uv = true } catch {}
    try { const r = await execute('git', ['rev-parse', 'HEAD'], { cwd: workspace, timeout: 5000, env }); checks.fixed_source = r.stdout.trim() === trainingCommit } catch {}
    if (checks.fixed_source && checks.uv) try { await execute('uv', ['run', '--no-sync', 'python', '-c', 'import torch; assert torch.cuda.is_available()'], { cwd: workspace, timeout: 20_000, env }); checks.pytorch_cuda = true } catch {}
    try { await readFile(join(process.env.HOME || '/root', '.cache/autoresearch/tokenizer/tokenizer.pkl')); checks.prepared_data = true } catch {}
    return { workspace, env, checks, ready: Object.values(checks).every(Boolean) }
  }
  async function training(args: any, session: string, signal: AbortSignal) {
    if (args.action === 'status') return state(args.run_id || '', session)
    const preflight = await trainingPreflight()
    if (args.action === 'preflight' || !preflight.ready) return { ready: preflight.ready, checks: preflight.checks,
      status: preflight.ready ? 'ready' : 'training-resource-unavailable', inference_api_is_training_backend: false,
      fixed_source: trainingCommit, required_next: '在实例HOME/autoresearch准备已审阅的固定来源、依赖及数据；预检全部通过后才允许baseline和candidate。没有训练执行回执时不生成训练指标。' }
    if (!['baseline', 'candidate'].includes(args.action)) throw new Error('训练动作必须为preflight、baseline、candidate或status')
    const id = args.action === 'baseline' ? `task-${randomUUID()}` : args.run_id
    const value = args.action === 'baseline' ? { session_id: session, source_kind: 'real_training', created_at: new Date().toISOString(), attempts: [], best: null, candidates_used: 0 } : await state(id, session)
    if (value.attempts.some((a: any) => a.status === 'running')) throw new Error('先前训练状态未知，先查询实际进程，不能重复发起')
    if (Date.now() - Date.parse(value.created_at) > 60 * 60_000) throw new Error('训练任务总时限已到')
    if (args.action === 'candidate' && (!value.best || value.candidates_used >= 3)) throw new Error('必须先有有效基线，且候选实验最多三次')
    const script = join(preflight.workspace, 'train.py'), fixed = ['prepare.py', 'pyproject.toml', 'uv.lock']
    const fixedHashes = Object.fromEntries(await Promise.all(fixed.map(async file => [file, digest(await readFile(join(preflight.workspace, file), 'utf8'))])))
    const previous = await readFile(script, 'utf8')
    if (args.action === 'candidate' && (typeof args.train_py !== 'string' || !args.train_py.trim() || Buffer.byteLength(args.train_py) > 128 * 1024)) throw new Error('候选必须提供不超过128KiB的train.py')
    const attempt = { index: value.attempts.length, kind: args.action, status: 'running', started_at: new Date().toISOString(), script_sha256: digest(args.action === 'candidate' ? args.train_py : previous) } as any
    if (args.action === 'candidate') value.candidates_used++
    value.attempts.push(attempt); await save(id, value)
    const attemptPath = join(base, id, `attempt-${attempt.index}`); await mkdir(attemptPath, { recursive: true })
    await writeFile(join(attemptPath, 'train.py'), args.action === 'candidate' ? args.train_py : previous)
    let accepted = false
    try {
      if (args.action === 'candidate') await writeFile(script, args.train_py)
      const result = await execute('uv', ['run', '--no-sync', 'train.py'], { cwd: preflight.workspace, env: preflight.env, signal, timeout: 600_000, maxBuffer: 1024 * 1024 })
      await writeFile(join(attemptPath, 'stdout.log'), result.stdout); await writeFile(join(attemptPath, 'stderr.log'), result.stderr)
      for (const file of fixed) if (digest(await readFile(join(preflight.workspace, file), 'utf8')) !== fixedHashes[file]) throw new Error('固定评估或依赖文件发生变化，本次指标不接受')
      const metric = /^val_bpb:\s*([0-9]+(?:\.[0-9]+)?)\s*$/m.exec(result.stdout)
      if (!metric || !Number.isFinite(Number(metric[1]))) throw new Error('真实训练未返回有效val_bpb')
      attempt.val_bpb = Number(metric[1]); accepted = !value.best || attempt.val_bpb < value.best.val_bpb
      attempt.status = accepted ? 'keep' : 'discard'
      if (accepted) { value.best = { index: attempt.index, val_bpb: attempt.val_bpb, script_sha256: attempt.script_sha256 }; await writeFile(join(base, id, 'best-train.py'), await readFile(script)) }
    } catch (error: any) {
      attempt.status = signal.aborted ? 'cancelled' : 'failed'; attempt.failure = error.code || error.name || 'training-error'
      await writeFile(join(attemptPath, 'stdout.log'), String(error.stdout || '')); await writeFile(join(attemptPath, 'stderr.log'), String(error.stderr || error.message))
    } finally {
      if (!accepted) await writeFile(script, previous)
      attempt.finished_at = new Date().toISOString(); await save(id, value)
      const rows = value.attempts.map((a: any) => [a.script_sha256, a.val_bpb ?? '', a.status, a.kind].join('\t'))
      await writeFile(join(base, id, 'results.tsv'), 'source_sha256\tval_bpb\tstatus\tkind\n' + rows.join('\n') + '\n')
    }
    return { run_id: id, attempt, best: value.best, candidates_used: value.candidates_used, max_candidates: 3, source_kind: 'real_training',
      results_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=results.tsv`,
      ...(value.best ? { best_code_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=best-train.py` } : {}),
      artifacts: ['results.tsv', ...(value.best ? ['best-train.py'] : []), `attempt-${attempt.index}/stdout.log`] }
  }
  // 使用原生 Fetch 入口，保留实例认证和子路径适配。
  ctx.connection.fetch.register({ path: '/api/task-examples/artifact', methods: ['GET'], requestBody: 'buffered', fetch: async (request: Request) => {
    try {
      const url = new URL(request.url), id = url.searchParams.get('run_id') || '', file = url.searchParams.get('file') || ''
      if (!runPattern.test(id) || !['report.md', 'devices.csv', 'results.tsv', 'best-train.py'].includes(file)) return new Response('参数无效', { status: 400 })
      const bytes = await readFile(join(base, id, file))
      return new Response(bytes, { headers: { 'content-type': file.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${id}-${file}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
    } catch { return new Response('产物尚不存在', { status: 404 }) }
  } })
  ctx.tools.register({ name: `task_${config.kind}`, description: config.kind === 'inspection'
    ? '基础资产台账只读巡检：start固定资产快照，page按cursor读完分页，report校验已读取完整集合并生成实际Markdown/CSV报告。数据来自基础Mock，不能称为真实设备健康检测。'
    : config.kind === 'research' ? '多步骤资料研究：start创建任务，collect按配置资料URL读取真实正文，report用每个URL对应的summaries生成带来源的报告；资料须全部读取。'
      : '自主训练研究：preflight核查真实GPU、固定来源、uv/PyTorch与数据；baseline建立一次真实基线，candidate只修改train.py并实际训练评估，最多三个候选、单次十分钟、总时限一小时。更优保留、失败回退，status读取原运行。没有真实算力时只报告缺口，不产生模拟指标。',
    parameters: columns,
    async execute(args: any, execution: any) {
      const session = execution.agent.session.header.id, signal = execution.signal
      if (config.kind === 'training') {
        return training(args, session, signal)
      }
      if (args.action === 'start') {
        const id = `task-${randomUUID()}`
        const value: any = { session_id: session, created_at: new Date().toISOString(), source_kind: config.kind === 'inspection' ? 'basic_mock' : 'live_public_documents', read: [] }
        if (config.kind === 'inspection') {
          const all = JSON.parse(await get(config.assetUrl || 'http://127.0.0.1:53001/api/v1/assets', signal))
          if (!Array.isArray(all)) throw new Error('资产接口未返回列表')
          value.rows = all.filter((r: any) => /^asset-000[1-5]$/.test(r.asset_id)).map((r: any): Row => ({ asset_id: r.asset_id, hostname: r.hostname, asset_type: r.asset_type, risk_score: r.risk_score }))
          if (value.rows.length !== 5 || new Set(value.rows.map((r: Row) => r.asset_id)).size !== 5) throw new Error('固定基础资产范围不完整，不能生成全量报告')
          value.source_sha256 = digest(JSON.stringify(value.rows))
        } else value.sources = config.sourceUrls || []
        await save(id, value)
        return { run_id: id, source_kind: value.source_kind, ...(value.rows ? { total: value.rows.length, next_cursor: 0, source_sha256: value.source_sha256 } : { sources: value.sources }) }
      }
      const id = args.run_id || '', value = await state(id, session)
      if (args.action === 'status') return { run_id: id, read: value.read, completed: Boolean(value.completed_at), source_kind: value.source_kind }
      if (config.kind === 'inspection' && args.action === 'page') {
        const cursor = args.cursor
        if (!Number.isInteger(cursor) || cursor < 0 || cursor >= value.rows.length || cursor % 2) throw new Error('分页cursor无效')
        const rows = value.rows.slice(cursor, cursor + 2)
        value.read = [...new Set([...value.read, ...rows.map((r: Row) => r.asset_id)])]
        await save(id, value)
        return { run_id: id, rows, next_cursor: cursor + 2 < value.rows.length ? cursor + 2 : null, total: value.rows.length, source_kind: value.source_kind }
      }
      if (config.kind === 'inspection' && args.action === 'report') {
        const missing = value.rows.filter((r: Row) => !value.read.includes(r.asset_id)).map((r: Row) => r.asset_id)
        if (missing.length) throw new Error(`尚未读取全部设备，不能交付完整报告；缺少 ${missing.join('、')}`)
        const rows: Row[] = value.rows
        const text = `# 基础资产台账巡检报告\n\n来源：基础模拟接口，未连接或检测真实设备。\n\n运行：${id}\n\n设备总数：${rows.length}\n\n| 设备ID | 状态 | 名称 | 类型 | 台账风险分值 |\n| --- | --- | --- | --- | --- |\n${rows.map(r => `| ${r.asset_id} | 台账已记录 | ${safeCell(r.hostname)} | ${safeCell(r.asset_type)} | ${r.risk_score} |`).join('\n')}\n\n摘要：已核对全部 ${rows.length} 台指定基础资产的台账记录；本报告不提供实时设备健康结论。\n`
        const csv = 'device_id,status,hostname,asset_type,risk_score\n' + rows.map(r => [r.asset_id, '台账已记录', r.hostname, r.asset_type, r.risk_score].map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n'
        return { ...await report(id, value, text, csv), device_count: rows.length, device_ids: rows.map(r => r.asset_id) }
      }
      if (config.kind === 'research' && args.action === 'collect') {
        if (!value.sources.includes(args.source)) throw new Error('资料不在本任务固定来源范围内')
        const content = await get(args.source, signal)
        value.documents ||= {}; value.documents[args.source] = { sha256: digest(content), content: content.slice(0, 24_000), read_at: new Date().toISOString() }
        value.read = [...new Set([...value.read, args.source])]; await save(id, value)
        return { run_id: id, source: args.source, ...value.documents[args.source], truncated: content.length > 24_000 }
      }
      if (config.kind === 'research' && args.action === 'report') {
        if (!value.sources.length || value.sources.some((url: string) => !value.read.includes(url))) throw new Error('还有资料未读取，不能交付完整报告')
        if (value.sources.some((url: string) => typeof args.summaries?.[url] !== 'string' || !args.summaries[url].trim())) throw new Error('报告须逐项包含已读来源的结论')
        const text = '# 多步骤业务资料调研报告\n\n' + value.sources.map((url: string, i: number) => `## 资料 ${i + 1}\n\n${args.summaries[url].slice(0, 8000)}\n\n来源：[原始资料](${url})；读取时间：${value.documents[url].read_at}；摘要：${value.documents[url].sha256}\n`).join('\n')
        return { ...await report(id, value, text), source_count: value.sources.length, note: '已完成来源完整性校验；语义准确性需由独立评测核对。' }
      }
      throw new Error('本业务不支持此动作')
    },
  })
}
