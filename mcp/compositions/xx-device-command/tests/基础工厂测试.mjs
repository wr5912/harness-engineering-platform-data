import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import commands from '../assets/command-map.json' with { type: 'json' }
import contract from '../assets/real-tool-contract.json' with { type: 'json' }

const sourceText = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
const flow = JSON.parse(await readFile(new URL('../flow.json', import.meta.url), 'utf8'))

test('真实指令骨架保留十一项映射并要求字符串ID', () => {
  const names = ['网络连通', '网络隔离', '重启', '关机', '快速查杀', '解锁', '锁屏', '全盘查杀', '取消实名登录', '恢复实名登录', '一键关闭']
  assert.equal(Object.keys(commands).length, 11)
  for (const [index, name] of names.entries()) assert.equal(commands[`87654321-3333-2222-1111-9876543210a${index + 1}`], name)
  assert.equal(new Set(Object.values(commands)).size, 11)
})

test('真实工具合同未配置时只保留严格停点，不存在Mock回退', () => {
  assert.equal(contract.status, 'not-configured')
  assert.equal(contract.connectionAlias, 'xxDevice')
  assert.equal(contract.serverId, null)
  assert.equal(contract.operations.lookupHost, null)
  assert.equal(contract.operations.sendCommand, null)
  assert.doesNotMatch(sourceText, /fixtures|mockCalls|mock\s*:\s*true|模拟下发/)
  assert.match(sourceText, /真实XX连接未配置/)
  assert.match(sourceText, /真实XX工具未配置/)
  assert.match(sourceText, /create\(soc: Soc\)/)
})

test('原生图保留真实读取、装配、分支、真实写入和独立终态', () => {
  assert.equal(flow.metadata.hep.typescript, 'src/index.ts')
  assert.deepEqual(flow.data.nodes.map(node => node.id), ['input', 'lookup-host', 'assemble-command', 'stop', 'preview-result', 'submit-command', 'apply-result'])
  assert.deepEqual(flow.data.nodes.filter(node => node.data.node.is_output).map(node => node.id), ['preview-result', 'apply-result'])
  assert.doesNotMatch(JSON.stringify(flow.data.nodes), /Mock|模拟/)
  assert.deepEqual(flow.data.edges.map(edge => [edge.source, edge.data.sourceHandle.name, edge.target]), [
    ['input', 'result', 'lookup-host'], ['lookup-host', 'result', 'assemble-command'], ['assemble-command', 'result', 'stop'],
    ['stop', 'preview', 'preview-result'], ['stop', 'apply', 'submit-command'], ['submit-command', 'result', 'apply-result'],
  ])
})
