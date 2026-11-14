import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'

export const name = 'ai-proposal-workbench'
export const inject = ['webServer']

const ROUTE = '/plugins/ai-proposal-workbench/state'
const PROJECT_ROOT = '/work/project'
const FIXED_ROOT = '/work/harness/workspace/references/demo-pack/01-input/rfp'
const FIXED_FILES = ['rfp-main.md', 'amendment-01.md', 'submission-rules.md']

function json(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function uniqueMatches(text, pattern) {
  return [...new Set(text.match(pattern) ?? [])]
}

function readFile(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function workspaceArtifact() {
  try {
    const names = readdirSync(PROJECT_ROOT)
      .filter(name => /\.(md|markdown|json|csv|yml|yaml)$/i.test(name))
      .filter(name => name !== 'README.md')
      .sort()
    const preferred = names.find(name => /render-probe|需求台账|方案章节|发布判断/i.test(name))
    return preferred === undefined ? null : `${PROJECT_ROOT}/${preferred}`
  } catch {
    return null
  }
}

function buildState() {
  const artifact = workspaceArtifact()
  const live = artifact !== null
  const sourcePaths = live ? [artifact] : FIXED_FILES.map(name => `${FIXED_ROOT}/${name}`)
  const text = sourcePaths.map(readFile).join('\n\n')
  const requirements = uniqueMatches(text, /\b(?:REQ|SUB)-\d{3}\b/g).slice(0, 24)
  const evidence = uniqueMatches(text, /\bE-\d{3}\b/g).slice(0, 24)
  const findings = uniqueMatches(text, /\bFIND-\d{3}\b/g).slice(0, 12)
  const blockers = (text.match(/阻断|缺口|NO-GO|不可发布/g) ?? []).length
  const atomMatch = text.match(/(\d+) 条原子要求/)
  const title = text.split(/\r?\n/).find(line => line.startsWith('# '))?.replace(/^#\s+/, '') ?? '方案文档生成工作区'
  const version = text.match(/当前版本\s*\|\s*([^|\n]+)/)?.[1]?.trim() ?? '待验证'
  const baseline = text.match(/基线状态\s*\|\s*([^|\n]+)/)?.[1]?.trim() ?? '待验证'
  let asOf = null
  try {
    asOf = statSync(live ? artifact : sourcePaths[0]).mtime.toISOString()
  } catch {}
  return {
    schemaVersion: '1.0',
    stateMode: live ? 'live' : 'fixture',
    source: live ? 'project-workspace' : 'fixed-demo-pack',
    sourceFiles: sourcePaths,
    sourceSha256: sha256(text),
    asOf,
    project: { name: title, workspace: PROJECT_ROOT },
    document: { title, version, baseline, requirementCount: Number(atomMatch?.[1] ?? requirements.length) },
    requirements: requirements.map(id => ({ id, status: '待验证', source: live ? '项目工作区产物' : '固定参考材料' })),
    evidence: evidence.map(id => ({ id, status: '待核对', source: live ? '项目工作区产物' : '固定参考材料' })),
    review: { findings, status: findings.length > 0 ? '待处理' : '待验证' },
    publish: { status: blockers > 0 ? 'blocked' : '待验证', blockerCount: blockers },
  }
}

function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { ok: false, code: 'method', message: '仅支持 GET' })
    return
  }
  json(res, 200, { ok: true, state: buildState() })
}

export function apply(ctx) {
  const dispose = ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: handle })
  ctx.logger?.info?.(`[ai-proposal-workbench] 状态路由已注册：GET ${ROUTE}`)
  return dispose
}

apply.inject = inject
export default apply
