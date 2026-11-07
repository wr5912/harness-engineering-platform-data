import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { apply, parseConfirmationConfiguration } from '../dsh/managed/instance-confirmation-config.mjs'

test('未配置确认签发时不阻塞其他插件装载，也不注入凭据', () => {
  const before = { ...process.env }, warnings = []
  const stat = mock.method(fs, 'statSync', () => { throw new Error('fixture missing configuration') })
  syncBuiltinESMExports()
  try { assert.doesNotThrow(() => apply({ logger: { warn: text => warnings.push(text) } })) }
  finally { stat.mock.restore(); syncBuiltinESMExports() }
  assert.ok(Object.keys(before).every(key => process.env[key] === before[key]))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /其他业务继续/)
})

test('格式或密钥无效的确认配置继续明确拒绝', () => {
  assert.throws(() => parseConfirmationConfiguration({}), /配置缺失或格式无效/)
})
