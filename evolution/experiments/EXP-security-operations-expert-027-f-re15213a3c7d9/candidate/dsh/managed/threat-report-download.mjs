import { constants, readFileSync } from 'node:fs'
import { open, realpath, writeFile, rename } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'

export const name = 'threat-report-download'
export const inject = ['webServer', 'webStartup', 'tools', 'connection']
export const REPORT_ROUTE = '/api/threat-analysis/reports'
// 平台生成的受信实例补丁；只读公开入口，不读取凭据。
const BUSINESS_PATCH = '/opt/harness-business/business.patch.yml'
const RUN = /^run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const INCIDENT = /^INC-\d{8}-\d{6}$/
const LIMIT = 1048576
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function boundedFile(path, limit) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > limit) throw new Error('InvalidReportFile')
    const bytes = Buffer.alloc(limit + 1)
    let total = 0
    while (total < bytes.length) {
      const read = await handle.read(bytes, total, bytes.length - total, null)
      if (!read.bytesRead) break
      total += read.bytesRead
    }
    if (total > limit) throw new Error('ReportSizeExceeded')
    return bytes.subarray(0, total)
  } finally { await handle.close() }
}

export async function readLocalReport(home, runId) {
  if (typeof home !== 'string' || !home || !RUN.test(runId ?? '')) throw new Error('InvalidReportIdentity')
  const root = resolve(home, 'threat-analysis')
  const directory = join(root, runId)
  // DSH_HOME 可能是宿主挂载的符号链接；允许根目录别名，但禁止运行目录被替换到别处。
  const canonicalRoot = await realpath(root)
  const canonicalDirectory = await realpath(directory)
  if (canonicalDirectory !== join(canonicalRoot, runId)) throw new Error('InvalidReportDirectory')
  const record = JSON.parse((await boundedFile(join(directory, 'result.json'), 8 * LIMIT)).toString('utf8'))
  const state = record?.delivery?.storage?.report
  if (record.run_id !== runId || !INCIDENT.test(record.incident_id ?? '') || record.status !== 'completed'
    || state?.status !== 'saved' || state.storage !== 'local' || state.id !== runId
    || state.relative_path !== 'report.html' || state.content_type !== 'text/html'
    || !/^[a-f0-9]{64}$/.test(state.sha256 ?? '') || !Number.isInteger(state.size_bytes)) throw new Error('ReportBindingMismatch')
  const filename = `${record.incident_id}-${runId}.html`
  if (state.file_name !== filename) throw new Error('ReportFilenameMismatch')
  const bytes = await boundedFile(join(directory, 'report.html'), LIMIT)
  if (bytes.length !== state.size_bytes || digest(bytes) !== state.sha256) throw new Error('ReportContentMismatch')
  return { record, directory, bytes, filename }
}

async function saveArtifact(path, content) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
  await rename(temporary, path)
}

function publicUrlFromPatch() {
  try {
    const text = readFileSync(BUSINESS_PATCH, 'utf8')
    const match = /^\s*publicUrl:\s*(\S+)\s*$/mu.exec(text)
    return match?.[1]
  } catch { return undefined }
}

// 会话链接只有在能解析出 http(s) 协议时才作为外链打开；站内绝对路径会被当作工作区文件。
export function resolvePublicOrigin(read = publicUrlFromPatch) {
  const value = (process.env.HARNESS_PUBLIC_ORIGIN || read() || '').trim()
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : undefined
  } catch { return undefined }
}

export async function publishReport(value, home, linkFor) {
  if (value?.status !== 'completed' || value.delivery?.storage?.report?.storage !== 'local'
    || value.delivery.storage.report.status !== 'saved') return value
  const local = await readLocalReport(home, value.run_id)
  if (local.record.incident_id !== value.incident_id
    || local.record.delivery.storage.report.sha256 !== value.delivery.storage.report.sha256) throw new Error('ReportResultMismatch')
  const internalPath = `${REPORT_ROUTE}/${value.run_id}/download`
  const url = linkFor(internalPath)
  if (typeof url !== 'string' || !/^(?:https?:\/\/|\/)/.test(url) || url.startsWith('//')
    || /[\\\s#]/.test(url) || !url.endsWith(internalPath)) throw new Error('InvalidPublicReportPath')
  const next = structuredClone(value)
  next.delivery.storage.report.download_url = url
  const link = `**报告下载：** [下载 HTML 报告](<${url}>)`
  next.delivery.markdown = next.delivery.markdown.replace(/^\*\*报告下载：\*\*[^\n]*$/m, link)
  if (!next.delivery.markdown.includes(link)) next.delivery.markdown += `\n${link}\n`
  // 只给本次工具执行的同一运行补交付地址，不改业务结论、报告字节或 SOC 请求。
  local.record.delivery = next.delivery
  await saveArtifact(join(local.directory, 'summary.md'), next.delivery.markdown)
  await saveArtifact(join(local.directory, 'result.json'), JSON.stringify(local.record, null, 2) + '\n')
  return next
}

export function createReportHandler(home, rejection = () => undefined) {
  return async (request, response) => {
    const reject = (status, text) => {
      response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
        ...(status === 405 ? { allow: 'GET, HEAD' } : {}) })
      response.end(request.method === 'HEAD' ? undefined : text)
    }
    const denied = rejection(request)
    if (denied) return reject(denied, 'Unauthorized')
    if (!['GET', 'HEAD'].includes(request.method)) return reject(405, 'Method not allowed')
    const raw = request.url ?? ''
    if (/[\\%]/.test(raw)) return reject(404, 'Report not found')
    const pathname = new URL(raw, 'http://report.invalid').pathname
    const match = new RegExp(`^${REPORT_ROUTE}/(run-[a-f0-9-]+)/download$`).exec(pathname)
    if (!match || !RUN.test(match[1])) return reject(404, 'Report not found')
    let report
    try { report = await readLocalReport(home, match[1]) }
    catch { return reject(404, 'Report not found') }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'content-length': String(report.bytes.length),
      'content-disposition': `attachment; filename="${report.filename}"`,
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    })
    response.end(request.method === 'HEAD' ? undefined : report.bytes)
  }
}

export function apply(ctx) {
  const home = process.env.DSH_HOME
  if (!home) throw new Error('MissingReportHome')
  const origin = resolvePublicOrigin(() => publicUrlFromPatch() || ctx.webStartup.publicUrl)
  const publicPath = path => ctx.webServer.publicPath?.(path) ?? path
  const linkFor = path => {
    const mounted = publicPath(path)
    if (typeof mounted !== 'string' || !mounted.startsWith('/') || mounted.startsWith('//')
      || /[\\\s#]/.test(mounted)) throw new Error('InvalidPublicReportPath')
    return origin ? origin + mounted : mounted
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: REPORT_ROUTE,
    handler: createReportHandler(home, request => ctx.connection.requestRejection(request)) }))
  const mounted = new WeakMap()
  const mount = agent => {
    let wrappers = mounted.get(agent)
    if (!wrappers) { wrappers = new Map(); mounted.set(agent, wrappers) }
    for (const toolName of ['analyze_threat_incident', 'analyze_pending_threat_incidents']) {
      const original = ctx.tools.get(toolName, agent)
      if (!original || wrappers.get(toolName) === original) continue
      const batch = toolName === 'analyze_pending_threat_incidents'
      const wrapper = { ...original,
        output: { ...original.output,
          render: (args, value) => batch && value.report_delivery_markdown
            ? [{ type: 'text', text: value.report_delivery_markdown }] : original.output.render(args, value),
          presentationMeta: (args, value) => ({ ...original.output.presentationMeta?.(args, value),
            ...(batch && value.report_delivery_markdown
              ? { threat_analysis: { delivery: { markdown: value.report_delivery_markdown } } } : {}) }),
        },
        async execute(args, exec) {
          const value = await original.execute(args, exec)
          if (!batch) {
            try { return await publishReport(value, home, linkFor) }
            catch (error) {
              if (value?.delivery?.markdown) value.delivery.markdown += `\n报告下载链接暂不可交付（${error?.constructor?.name ?? 'Error'}）；本地保存状态见上文。\n`
              return value
            }
          }
          if (!Array.isArray(value?.results)) return value
          const next = structuredClone(value)
          const links = []
          for (const item of next.results) {
            if (item.status !== 'completed' || !RUN.test(item.run_id ?? '')) continue
            try {
              const local = await readLocalReport(home, item.run_id)
              if (local.record.incident_id !== item.incident_id) continue
              const published = await publishReport(local.record, home, linkFor)
              item.download_url = published.delivery.storage.report.download_url
              links.push(`- ${item.incident_id}：[下载 HTML 报告](<${item.download_url}>)`)
            } catch { links.push(`- ${item.incident_id}：本次报告下载链接未核验，未重新研判。`) }
          }
          if (links.length) {
            const summary = original.output.render(args, value).filter(part => part.type === 'text').map(part => part.text).join('\n')
            next.report_delivery_markdown = `${summary}\n\n报告下载：\n${links.join('\n')}`
          }
          return next
        },
      }
      const dispose = agent.ctx.tools.register(wrapper)
      wrappers.set(toolName, wrapper)
      ctx.effect(() => dispose)
    }
  }
  ctx.on('agent/created', ({ agent }) => mount(agent))
  ctx.on('agent/pre-step', async ({ agent }, next) => { mount(agent); return next() })
}
