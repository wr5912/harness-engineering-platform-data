// 附件工具与 Guard 放行测试：纯本地 Mock，不连接附件后端之外的服务。
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { apply, TOOL_NAME } from '../dsh/managed/attachment-reader/index.mjs'
import { collectSessionAttachments } from '../dsh/managed/attachment-reader/session-attachments.mjs'
import { createSecurityOperationsGuard } from '../dsh/managed/security-operations-guard.mjs'

const ID_A = `sha256:${'c'.repeat(64)}`
const ID_B = `sha256:${'d'.repeat(64)}`

function minimalXlsx() {
  const data = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'
  const contentTypes = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
  const workbook = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const entries = [
    ['[Content_Types].xml', contentTypes], ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', rels], ['xl/worksheets/sheet1.xml', data],
  ]
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name)
    const body = Buffer.from(text)
    const compressed = deflateRawSync(body)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(body.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(body.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([central, nameBuf]))
    offset += local.length + nameBuf.length + compressed.length
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

function agentWith(list) {
  const content = list.map(attachment => ({ type: 'file', attachment }))
  return { session: { snapshotEvents: () => [{ type: 'user/message', data: { source: { kind: 'user' }, content } }] } }
}

function registerTool(attachments) {
  let tool
  apply({
    get: key => (key === 'attachments' ? attachments : undefined),
    tools: { register: definition => { tool = definition } },
  })
  return tool
}

test('不传参数列出当前会话附件', async () => {
  const tool = registerTool(undefined)
  assert.equal(tool.name, TOOL_NAME)
  const agent = agentWith([{ attachmentId: ID_A, name: 'a.xlsx', bytes: 5 }])
  const value = await tool.execute({}, { agent })
  assert.equal(value.mode, 'list')
  assert.equal(value.attachments.length, 1)
  assert.equal(value.attachments[0].attachment_id, ID_A)
})

test('render 返回 ContentBlock 数组', async () => {
  const tool = registerTool(undefined)
  const agent = agentWith([{ attachmentId: ID_A, name: 'a.xlsx', bytes: 5 }])
  const value = await tool.execute({}, { agent })
  const rendered = tool.output.render({}, value)
  assert.ok(Array.isArray(rendered))
  assert.equal(rendered[0].type, 'text')
  assert.match(rendered[0].text, /当前会话附件/)
})

test('只采信用户消息登记的附件', () => {
  const ref = { attachmentId: ID_A, name: 'a.xlsx', bytes: 10 }
  const fake = { attachmentId: ID_B, name: 'b.xlsx', bytes: 11 }
  const agent = {
    session: { snapshotEvents: () => [
      { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'file', attachment: ref }] } },
      { type: 'user/message', data: { source: { kind: 'agent-instructions' }, content: [{ attachment: fake }] } },
      { type: 'tool/result', data: { message: { content: [{ attachment: fake }] } } },
    ] },
  }
  const found = collectSessionAttachments(agent)
  assert.equal(found.size, 1)
  assert.ok(found.has(ID_A))
  assert.equal(collectSessionAttachments(undefined), undefined)
})

test('非会话附件与非法标识被拒绝', async () => {
  const tool = registerTool(undefined)
  const agent = agentWith([{ attachmentId: ID_A, name: 'a.xlsx', bytes: 5 }])
  const foreign = await tool.execute({ attachment_id: ID_B }, { agent })
  assert.match(foreign.error, /不在当前会话/)
  for (const bad of ['/etc/passwd', 'sha256:zz', ID_A.toUpperCase()]) {
    const value = await tool.execute({ attachment_id: bad }, { agent })
    assert.match(value.error, /格式无效|不在当前会话/)
  }
})

test('经原生服务读取并完成提取', async () => {
  const buffer = minimalXlsx()
  const attachment = { attachmentId: ID_A, name: 't.xlsx', bytes: buffer.length }
  const attachments = {
    async *readFileStream(ref) { assert.equal(ref.attachmentId, ID_A); yield buffer },
    fileHostPath: () => '/var/lib/dsh/attachments/v1/files/xx',
  }
  const tool = registerTool(attachments)
  const agent = agentWith([attachment])
  const value = await tool.execute({ attachment_id: ID_A }, { agent })
  assert.equal(value.mode, 'extract')
  assert.equal(value.attachment.digest_verified, true)
  const rendered = tool.output.render({}, value)
  assert.ok(Array.isArray(rendered) && rendered[0].type === 'text')
})

test('完整性校验失败与未挂载服务如实报告', async () => {
  const attachment = { attachmentId: ID_A, name: 't.xlsx', bytes: 4 }
  const corrupt = { async *readFileStream() { const error = new Error('x'); error.code = 'ATTACHMENT_CORRUPT'; throw error } }
  const toolA = registerTool(corrupt)
  const valueA = await toolA.execute({ attachment_id: ID_A }, { agent: agentWith([attachment]) })
  assert.match(valueA.error, /完整性校验失败/)
  const toolB = registerTool(undefined)
  const valueB = await toolB.execute({ attachment_id: ID_A }, { agent: agentWith([attachment]) })
  assert.match(valueB.error, /未挂载原生附件服务/)
})

test('字节数与登记不一致被拒绝', async () => {
  const attachment = { attachmentId: ID_A, name: 't.xlsx', bytes: 100 }
  const attachments = { async *readFileStream() { yield Buffer.alloc(50) } }
  const tool = registerTool(attachments)
  const value = await tool.execute({ attachment_id: ID_A }, { agent: agentWith([attachment]) })
  assert.match(value.error, /字节数与登记值不一致/)
})

test('Guard 放行附件工具且只限主 Agent', () => {
  const guard = createSecurityOperationsGuard({ environment: {} })
  const root = { agent: { session: { header: { delegationDepth: 0 } } }, name: TOOL_NAME, arguments: {} }
  assert.equal(guard.decide(root), undefined)
  const child = { ...root, agent: { session: { header: { delegationDepth: 1 } } } }
  assert.equal(guard.decide(child), '附件读取工具只允许主 Agent 调用')
  const unknown = { ...root, name: 'not_a_known_tool' }
  assert.match(String(guard.decide(unknown)), /未列入/)
  const pathProbe = { ...root, name: 'read', arguments: { file_path: '/var/lib/dsh/x' } }
  assert.equal(guard.decide(pathProbe), '不得访问 DSH 数据、凭据或 managed/preset 平面')
})
