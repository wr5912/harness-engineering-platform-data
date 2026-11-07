// 附件读取解析层测试：纯 node:test，无依赖，不联网、不装载。
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { extractWorkbook, ExtractError, LIMITS } from '../dsh/managed/attachment-reader/xlsx-extract.mjs'
import { extractPolicyRows } from '../dsh/managed/attachment-reader/policy-fields.mjs'

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
  return (~crc) >>> 0
}

function buildZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data, 'utf8')
    const compressed = entry.deflate ? deflateRawSync(data) : data
    const method = entry.deflate ? 8 : 0
    const crc = crc32(data)
    const flags = entry.encrypted ? 0x1 : 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([central, name]))
    offset += local.length + name.length + compressed.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, eocd])
}

const CONTENT_TYPES = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
const RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
const WORKBOOK = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="工作表1" sheetId="1" r:id="rId1"/></sheets></workbook>'

function sheetXml(rows) {
  const body = rows.map(row => {
    const cells = row.cells.map(cell =>
      cell.type === 's'
        ? `<c r="${cell.ref}" t="s"><v>${cell.value}</v></c>`
        : cell.formula
          ? `<c r="${cell.ref}"><f>${cell.formula}</f><v>${cell.value}</v></c>`
          : `<c r="${cell.ref}"><v>${cell.value}</v></c>`).join('')
    return `<row r="${row.r}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function makeWorkbook(strings, rows, extra = []) {
  const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: 'xl/workbook.xml', data: WORKBOOK, deflate: true },
    { name: 'xl/_rels/workbook.xml.rels', data: RELS },
    { name: 'xl/sharedStrings.xml', data: sst },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(rows), deflate: true },
    ...extra,
  ])
}

const STRINGS = ['源', '目的', '协议', '端口']
const HEADER = { r: 1, cells: [
  { ref: 'A1', value: 0, type: 's' }, { ref: 'B1', value: 1, type: 's' },
  { ref: 'C1', value: 2, type: 's' }, { ref: 'D1', value: 3, type: 's' },
] }
const DATA = { r: 2, cells: [
  { ref: 'A2', value: '172.16.138.212' }, { ref: 'B2', value: '172.16.2.100' },
  { ref: 'C2', value: 'TCP' }, { ref: 'D2', value: 443 },
] }

test('完整工作簿提取四字段', () => {
  const extracted = extractWorkbook(makeWorkbook(STRINGS, [HEADER, DATA]))
  assert.equal(extracted.sheets.length, 1)
  assert.equal(extracted.sheets[0].rows.length, 2)
  assert.equal(extracted.issues.length, 0)
  const policy = extractPolicyRows(extracted)
  assert.equal(policy.policy_rows.length, 1)
  const row = policy.policy_rows[0]
  assert.equal(row.source, '172.16.138.212')
  assert.equal(row.destination, '172.16.2.100')
  assert.equal(row.protocol, 'TCP')
  assert.equal(row.destination_port, '443')
  assert.equal(row.row, 2)
  assert.equal(policy.header_fields['工作表1'].source.column, 'A')
})

test('公式单元格记录 issue 但不执行', () => {
  const formulaRow = { r: 2, cells: [
    { ref: 'A2', value: '10.0.0.1' }, { ref: 'B2', value: '10.0.0.2' },
    { ref: 'C2', value: 'TCP' }, { ref: 'D2', value: 80, formula: '1+79' },
  ] }
  const extracted = extractWorkbook(makeWorkbook(STRINGS, [HEADER, formulaRow]))
  assert.ok(extracted.issues.some(issue => issue.kind === 'formula_present'))
  assert.equal(extractPolicyRows(extracted).policy_rows[0].destination_port, '80')
})

test('表头不识别时报告而不是猜测', () => {
  const rows = [
    { r: 1, cells: [{ ref: 'A1', value: 0, type: 's' }, { ref: 'B1', value: 1, type: 's' }] },
    { r: 2, cells: [{ ref: 'A2', value: 'x' }, { ref: 'B2', value: 'y' }] },
  ]
  const policy = extractPolicyRows(extractWorkbook(makeWorkbook(['甲', '乙'], rows)))
  assert.equal(policy.policy_rows.length, 0)
  assert.ok(policy.issues.some(issue => issue.kind === 'header_not_recognized'))
})

test('无效端口不生成策略行', () => {
  const bad = { r: 2, cells: [
    { ref: 'A2', value: '10.0.0.1' }, { ref: 'B2', value: '10.0.0.2' },
    { ref: 'C2', value: 'TCP' }, { ref: 'D2', value: 70000 },
  ] }
  const policy = extractPolicyRows(extractWorkbook(makeWorkbook(STRINGS, [HEADER, bad])))
  assert.equal(policy.policy_rows.length, 0)
  assert.ok(policy.issues.some(issue => issue.kind === 'invalid_port'))
})

test('受限字段（源端口）保留报告不丢弃', () => {
  const header = { r: 1, cells: [...HEADER.cells, { ref: 'E1', value: 4, type: 's' }] }
  const row = { r: 2, cells: [
    { ref: 'A2', value: '10.0.0.1' }, { ref: 'B2', value: '10.0.0.2' },
    { ref: 'C2', value: 'TCP' }, { ref: 'D2', value: 443 }, { ref: 'E2', value: 1080 },
  ] }
  const policy = extractPolicyRows(extractWorkbook(makeWorkbook([...STRINGS, '源端口'], [header, row])))
  assert.equal(policy.policy_rows.length, 1)
  assert.equal(policy.policy_rows[0].source_port, '1080')
  assert.ok(policy.unsupported_fields.some(field => field.field === 'source_port'))
})

test('加密条目与超限文件被拒绝', () => {
  const encrypted = buildZip([{ name: 'xl/workbook.xml', data: 'x', encrypted: true }])
  assert.throws(() => extractWorkbook(encrypted), error => error instanceof ExtractError && error.code === 'encrypted')
  const over = Buffer.alloc(LIMITS.maxBytes + 1, 0)
  assert.throws(() => extractWorkbook(over), error => error instanceof ExtractError && error.code === 'limits')
})
