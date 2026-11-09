import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import policySchema from '../assets/policy-schema.json' with { type: 'json' }
import contract from '../assets/real-tool-contract.json' with { type: 'json' }

const sourceText = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
const flow = JSON.parse(await readFile(new URL('../flow.json', import.meta.url), 'utf8'))

test('真实策略骨架保留三个Map字段Schema和原拼写', () => {
  assert.deepEqual(Object.keys(policySchema.maps), ['设备控制', 'login', 'net'])
  assert.ok(Object.hasOwn(policySchema.maps.login.fields, 'osuer'))
  assert.ok(Object.hasOwn(policySchema.maps.net.fields, 'proctocol'))
  for (const definition of Object.values(policySchema.maps)) {
    for (const rule of Object.values(definition.fields)) assert.equal(rule.type, 'string')
  }
})

test('真实工具合同未配置时只保留严格停点，不存在Mock回退', () => {
  assert.equal(contract.status, 'not-configured')
  assert.equal(contract.connectionAlias, 'xxDevice')
  assert.equal(contract.serverId, null)
  assert.equal(contract.operations.readPolicyTemplate, null)
  assert.equal(contract.operations.writePolicyTemplate, null)
  assert.doesNotMatch(sourceText, /fixtures|mock\s*:\s*true|模拟下发/)
  assert.match(sourceText, /真实XX连接未配置/)
  assert.match(sourceText, /真实XX工具未配置/)
  assert.match(sourceText, /create\(soc: Soc\)/)
})

test('原生图保留真实读取、差异装配、分支、真实写入和独立终态', () => {
  assert.equal(flow.metadata.hep.typescript, 'src/index.ts')
  assert.deepEqual(flow.data.nodes.map(node => node.id), ['input', 'read-template', 'assemble-delta', 'stop', 'preview-result', 'apply', 'apply-result'])
  assert.deepEqual(flow.data.nodes.filter(node => node.data.node.is_output).map(node => node.id), ['preview-result', 'apply-result'])
  assert.doesNotMatch(JSON.stringify(flow.data.nodes), /Mock|模拟/)
  assert.deepEqual(flow.data.edges.map(edge => [edge.source, edge.data.sourceHandle.name, edge.target]), [
    ['input', 'result', 'read-template'], ['read-template', 'result', 'assemble-delta'], ['assemble-delta', 'result', 'stop'],
    ['stop', 'preview', 'preview-result'], ['stop', 'apply', 'apply'], ['apply', 'result', 'apply-result'],
  ])
})
