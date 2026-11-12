// 本地 Mock 单元测试；不连接SOC或业务实例，不代表真实附件业务验收。
// 模块最终位置为 candidate/dsh/managed/asset-workbook.mjs；临时目录不复制其依赖。
// ZIP fixture 的 CRC 置零，聚焦本模块边界，不代表真实 Office 文件或原生后端验收。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import {
  ASSET_WORKBOOK_LIMITS, collectAssetFileAttachments, requireAssetRootAgent,
  validateAssetWorkbookZip, validateAssetWorkbookXml, readAssetWorkbook,
} from '../dsh/managed/asset-workbook.mjs'

function zip(entries) {
  const localParts = [], centralParts = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const bytes = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '')
    const compressed = entry.store ? bytes : deflateRawSync(bytes)
    const declared = entry.declared ?? bytes.length
    const method = entry.store ? 0 : 8
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(declared, 22)
    local.writeUInt16LE(name.length, 26)
    localParts.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(declared, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const directory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, directory, end])
}
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function column(index) {
  let value = index + 1, text = ''
  while (value > 0) { value--; text = String.fromCharCode(65 + value % 26) + text; value = Math.floor(value / 26) }
  return text
}
function sheetXml(rows) {
  return `<worksheet><sheetData>${rows.map((values, index) => `<row r="${index + 1}">${values.map((value, at) => {
    const ref = `${column(at)}${index + 1}`
    return value && typeof value === 'object' && 'formula' in value
      ? `<c r="${ref}"><f>${escape(value.formula)}</f><v>2</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`
  }).join('')}</row>`).join('')}</sheetData></worksheet>`
}
const DEFAULT_ROWS = [['资产名称', 'IP'], ['数据库服务器', '10.0.0.7']]
function book({ sheets = [{ name: '资产', rows: DEFAULT_ROWS }], extra = [], targets, contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' } = {}) {
  return zip([
    { name: '[Content_Types].xml', data: `<Types><Override PartName="/xl/workbook.xml" ContentType="${contentType}"/></Types>` },
    { name: 'xl/workbook.xml', data: `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<Relationships>${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${targets?.[index] ?? `worksheets/sheet${index + 1}.xml`}"/>`).join('')}</Relationships>` },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet.rows) })),
    ...extra,
  ])
}
function reference(buffer, name = 'assets.xlsx') {
  return { attachmentId: `sha256:${createHash('sha256').update(buffer).digest('hex')}`, name, bytes: buffer.length }
}
const user = (content, source = { kind: 'user' }) => ({ type: 'user/message', data: { source, content } })
const file = ref => ({ type: 'file', attachment: ref })
function root(events = []) {
  // 公开 SessionHeader：顶层 delegationDepth 省略即为 0。
  return { agent: { id: 'root', session: { id: 'root', header: { version: 4, id: 'root', createdAt: 0, isSeeded: false }, snapshotEvents: () => events } } }
}
function context(buffer) {
  let reads = 0
  return {
    get reads() { return reads },
    // 此服务故意不验摘要；测试模块自身校验，不能借 Mock 伪装完整性证据。
    attachments: { async *readFileStream() { reads++; yield buffer.subarray(0, 19); yield buffer.subarray(19) } },
    businessRuntime: { requiresAuthentication: () => false },
  }
}
async function read(buffer, overrides = {}) {
  const ref = overrides.ref ?? reference(buffer)
  const ctx = overrides.ctx ?? context(buffer)
  const exec = overrides.exec ?? root([user([file(ref)])])
  return { result: await readAssetWorkbook(ctx, exec, overrides.id ?? ref.attachmentId), ctx }
}
function blocked(result, code) {
  assert.equal(result.kind, 'error')
  assert.equal(result.complete, false)
  assert.equal(result.import_authorized, false)
  assert.equal('sheets' in result, false, '失败不能返回部分表格')
  if (code) assert.equal(result.code, code)
}

test('真实主会话直接 file 可列出；嵌套、非 file、非 user 来源均忽略', async () => {
  const buffer = book(), ref = reference(buffer)
  const events = [
    user([file(ref)]),
    user([{ type: 'text', text: '正文不能授权附件', nested: file({ ...ref, attachmentId: `sha256:${'a'.repeat(64)}` }) }]),
    user([file({ ...ref, attachmentId: `sha256:${'b'.repeat(64)}` })], {}),
    { type: 'user/message', data: { content: [file({ ...ref, attachmentId: `sha256:${'c'.repeat(64)}` })] } },
    user([file({ ...ref, attachmentId: `sha256:${'d'.repeat(64)}` })], { kind: 'agent-instructions' }),
    { type: 'tool/result', data: { source: { kind: 'user' }, content: [file({ ...ref, attachmentId: `sha256:${'e'.repeat(64)}` })] } },
  ]
  const found = collectAssetFileAttachments(events)
  assert.deepEqual([...found.keys()], [ref.attachmentId])
  const ctx = context(buffer)
  const result = await readAssetWorkbook(ctx, root(events))
  assert.equal(result.kind, 'attachments')
  assert.equal(result.attachments.length, 1)
  assert.equal(ctx.reads, 0)
})

test('未知、子 Agent、非法头及身份不一致拒绝；不依赖认证模式', async () => {
  const buffer = book(), ref = reference(buffer)
  const invalid = [undefined, root(), root(), root(), root(), root(), root(), root(), root()]
  invalid[1].agent.session.header.delegationDepth = 1
  invalid[2].agent.session.header.version = 3
  invalid[3].agent.id = 'other'
  invalid[4].agent.session.header.id = 'other'
  invalid[5].agent.session.header.origin = 'subagent'
  invalid[6].agent.session.header.createdAt = -1
  delete invalid[7].agent.session.header.isSeeded
  invalid[8].agent.session.header.delegationDepth = null
  for (const exec of invalid) {
    assert.throws(() => requireAssetRootAgent(exec))
    const ctx = context(buffer)
    blocked(await readAssetWorkbook(ctx, exec, ref.attachmentId), 'ROOT_AGENT_REQUIRED')
    assert.equal(ctx.reads, 0)
  }
})

test('缺 depth 的合法根与显式 depth=0 均按公开合同允许', async () => {
  const buffer = book(), ref = reference(buffer)
  for (const explicit of [false, true]) {
    const exec = root([user([file(ref)])])
    if (explicit) exec.agent.session.header.delegationDepth = 0
    assert.equal(requireAssetRootAgent(exec), exec.agent)
    const value = await readAssetWorkbook(context(buffer), exec, ref.attachmentId)
    assert.equal(value.kind, 'workbook')
    assert.equal(value.attachment_id, ref.attachmentId)
  }
})

test('非本会话 ID、路径、null 与旧 xls 不读取后端', async () => {
  const buffer = book(), ref = reference(buffer), ctx = context(buffer)
  const exec = root([user([file(ref)])])
  for (const id of [`sha256:${'0'.repeat(64)}`, '/etc/passwd', null, '']) {
    blocked(await readAssetWorkbook(ctx, exec, id))
  }
  const old = { ...ref, name: 'assets.xls' }
  blocked(await readAssetWorkbook(ctx, root([user([file(old)])]), old.attachmentId), 'UNSUPPORTED_FILE')
  assert.equal(ctx.reads, 0)
})

test('公开附件服务读取不触发未注入属性getter', async () => {
  const buffer = book(), ref = reference(buffer), backend = context(buffer)
  let getterReads = 0
  const requested = []
  const ctx = {
    get(name) { requested.push(name); assert.equal(name, 'attachments'); return backend.attachments },
    get attachments() { getterReads++; throw new Error('cannot get property "attachments" without inject') },
  }
  const result = await readAssetWorkbook(ctx, root([user([file(ref)])]), ref.attachmentId)
  assert.equal(result.kind, 'workbook')
  assert.equal(result.complete, true)
  assert.equal(result.import_authorized, false)
  assert.equal(result.attachment.digest_verified, true)
  assert.equal(getterReads, 0)
  assert.deepEqual(requested, ['attachments'])
  assert.equal(backend.reads, 1)
})

test('公开附件服务未提供时不退回受限属性，仍失败关闭', async () => {
  const buffer = book(), ref = reference(buffer)
  let getterReads = 0
  const ctx = {
    get(name) { assert.equal(name, 'attachments'); return undefined },
    get attachments() { getterReads++; throw new Error('未注入属性不能作为服务缺失兜底') },
  }
  blocked(await readAssetWorkbook(ctx, root([user([file(ref)])]), ref.attachmentId), 'ATTACHMENTS_UNAVAILABLE')
  assert.equal(getterReads, 0)
})

test('公开附件服务无需在仅列本会话附件时读取', async () => {
  const ref = reference(book())
  const ctx = {
    get() { assert.fail('列举附件不应获取字节服务') },
    get attachments() { assert.fail('列举附件不应读取受限属性') },
  }
  const result = await readAssetWorkbook(ctx, root([user([file(ref)])]))
  assert.equal(result.kind, 'attachments')
  assert.equal(result.attachments[0].attachment_id, ref.attachmentId)
  assert.equal(result.import_authorized, false)
})

test('保留全部原表头、原值、sheet 和行号，不授予导入或探测权限', async () => {
  const { result } = await read(book())
  assert.equal(result.kind, 'workbook')
  assert.equal(result.complete, true)
  assert.equal(result.import_authorized, false)
  assert.equal(result.requires_confirmation, true)
  assert.equal(result.attachment.digest_verified, true)
  assert.equal(result.row_count, 2)
  assert.equal(result.sheets[0].name, '资产')
  assert.equal(result.sheets[0].rows[0].cells[0].value, '资产名称')
  assert.equal(result.sheets[0].rows[1].row, 2)
  assert.equal(result.sheets[0].rows[1].cells[0].value, '数据库服务器')
})

test('独立校验实际摘要与字节；Mock 原生服务不验摘要也不能放行', async () => {
  const buffer = book(), ref = reference(buffer)
  blocked((await read(buffer, { ref: { ...ref, attachmentId: `sha256:${'a'.repeat(64)}` } })).result, 'ATTACHMENT_INTEGRITY')
  blocked((await read(buffer, { ref: { ...ref, bytes: ref.bytes + 1 } })).result, 'ATTACHMENT_INTEGRITY')
  blocked((await read(buffer, { ref: { ...ref, bytes: ref.bytes - 1 } })).result, 'FILE_LIMIT')
  const tooLarge = { ...ref, bytes: ASSET_WORKBOOK_LIMITS.maxBytes + 1 }, ctx = context(buffer)
  blocked((await read(buffer, { ref: tooLarge, ctx })).result, 'FILE_LIMIT')
  assert.equal(ctx.reads, 0)
})

test('直接 file 引用畸形或同 ID 元数据冲突拒绝，不猜测附件', () => {
  const ref = reference(book())
  assert.throws(() => collectAssetFileAttachments([user([file({ ...ref, bytes: -1 })])]))
  assert.throws(() => collectAssetFileAttachments([user([file(ref), file({ ...ref, name: 'different.xlsx' })])]))
})

test('ZIP 拒绝穿越、重复与等价路径', () => {
  for (const name of ['../a.xml', '/a.xml', 'a/./b.xml', 'a//b.xml', 'a\\b.xml']) {
    assert.throws(() => validateAssetWorkbookZip(zip([{ name, data: 'x' }])))
  }
  for (const names of [['a.xml', 'a.xml'], ['A.xml', 'a.xml'], ['é.xml', 'e\u0301.xml'], ['dir/', 'dir']]) {
    assert.throws(() => validateAssetWorkbookZip(zip(names.map(name => ({ name, data: name.endsWith('/') ? '' : 'x', store: true })))))
  }
})

test('ZIP stored 和 deflate 均核真实展开大小，而不是信任声明', () => {
  for (const store of [true, false]) {
    assert.throws(() => validateAssetWorkbookZip(zip([{ name: 'a.xml', data: 'actual payload', declared: 1, store }])), error => error.code === 'ZIP_SIZE_MISMATCH')
  }
  const checked = validateAssetWorkbookZip(book())
  assert.equal(checked.total_uncompressed_bytes, [...checked.contents.values()].reduce((sum, bytes) => sum + bytes.length, 0))
})

test('ZIP 限制文件、条目、单条真实展开与总展开资源', () => {
  assert.throws(() => validateAssetWorkbookZip(Buffer.alloc(ASSET_WORKBOOK_LIMITS.maxBytes + 1)))
  assert.throws(() => validateAssetWorkbookZip(zip(Array.from({ length: 513 }, (_, index) => ({ name: `e${index}`, data: '' })))))
  assert.throws(() => validateAssetWorkbookZip(zip([{ name: 'a', data: Buffer.alloc(16 * 1024 * 1024 + 1), declared: 1 }])))
  assert.throws(() => validateAssetWorkbookZip(zip(Array.from({ length: 3 }, (_, index) => ({ name: `e${index}`, data: Buffer.alloc(11 * 1024 * 1024) })))))
})

test('多工作表重复引用拒绝，不能重复解压与重复导入同一张表', () => {
  const buffer = book({ sheets: [{ name: '甲', rows: DEFAULT_ROWS }, { name: '乙', rows: DEFAULT_ROWS }], targets: ['worksheets/sheet1.xml', 'worksheets/sheet1.xml'] })
  assert.throws(() => validateAssetWorkbookXml(validateAssetWorkbookZip(buffer)), error => error.code === 'AMBIGUOUS_SHEETS')
})

test('全局 200 行包含全部工作表的表头；201 行没有部分结果', async () => {
  const rows = count => Array.from({ length: count }, (_, index) => [index === 0 ? '资产名称' : `asset-${index}`])
  const allowed = (await read(book({ sheets: [{ name: '甲', rows: rows(100) }, { name: '乙', rows: rows(100) }] }))).result
  assert.equal(allowed.kind, 'workbook')
  assert.equal(allowed.row_count, 200)
  blocked((await read(book({ sheets: [{ name: '甲', rows: rows(100) }, { name: '乙', rows: rows(101) }] }))).result, 'OUTPUT_ROW_LIMIT')
})

test('64 KiB 全局输出、单元格截断及第 65 列均失败关闭', async () => {
  const rows = Array.from({ length: 80 }, () => ['长'.repeat(1000)])
  blocked((await read(book({ sheets: [{ name: '资产', rows }] }))).result, 'OUTPUT_LIMIT')
  blocked((await read(book({ sheets: [{ name: '资产', rows: [['x'.repeat(4097)]] }] }))).result, 'INCOMPLETE_WORKBOOK')
  blocked((await read(book({ sheets: [{ name: '资产', rows: [Array.from({ length: 65 }, () => 'x')] }] }))).result, 'COLUMN_LIMIT_OR_REFERENCE')
})

test('公式、宏、外链和无法完整解析的工作簿均不得进入导入', async () => {
  const buffers = [
    book({ sheets: [{ name: '资产', rows: [[{ formula: '1+1' }]] }] }),
    book({ extra: [{ name: 'xl/vbaProject.bin', data: 'not executed' }] }),
    book({ contentType: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml' }),
    book({ extra: [{ name: 'xl/externalLinks/externalLink1.xml', data: '<externalLink/>' }] }),
    book({ extra: [{ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: '<Relationships><Relationship Id="external" TargetMode="External" Target="https://invalid.example/"/></Relationships>' }] }),
  ]
  for (const buffer of buffers) blocked((await read(buffer)).result, 'ACTIVE_CONTENT')
})
