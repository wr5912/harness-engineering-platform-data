import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repository = process.env.HARNESS_ASSET_ROOT || fileURLToPath(new URL('../../../', import.meta.url))
const program = process.env.HARNESS_PROGRAM_ROOT
const python = process.env.HARNESS_PYTHON || process.env.PYTHON || 'python3'

test('安全运营当前评估来源完整，业务 Case 与单一事实源保持一致', () => {
  assert.ok(program, '测试需要 HARNESS_PROGRAM_ROOT')
  const agent = join(repository, 'agents/security-operations-expert')
  const evaluation = join(agent, 'evaluation.md')
  const text = readFileSync(evaluation, 'utf8')
  // 复用平台解析器；业务清单及其预期随数据仓库一起演进。
  const loaded = JSON.parse(execFileSync(python, ['-c', `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("evaluation_contract", sys.argv[1])
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
print(json.dumps(contract.load_evaluation(Path(sys.argv[2])), ensure_ascii=False))
`, join(program, '.agents/skills/research-eval/scripts/evaluation_contract.py'), evaluation], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 10_000,
  }))
  const numbered = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`)
  const expectedIds = [
    ...numbered('U-INS', 7), 'U-EMG-001', ...numbered('U-POL', 12),
    'U-FLT-MENTION', ...numbered('U-FLT', 10), ...numbered('U-QA', 14),
    'U-THREAT-MENTION', 'U-THREAT-FAST', 'U-THREAT-FULL', 'U-THREAT-CONTRACT',
    'U-THREAT-WHITELIST', 'U-THREAT-MISSING', 'U-THREAT-FOLLOWUP', ...numbered('U-VOICE', 4),
  ]
  assert.equal(existsSync(join(agent, 'definition.md')), false)
  assert.deepEqual(loaded.case_ids, expectedIds)
  for (const id of expectedIds) assert.deepEqual(Object.keys(loaded.cases[id]).sort(), ['case_id', 'expected_behavior', 'inputs', 'title'])
  assert.deepEqual(loaded.cases['U-INS-001'].inputs, ['执行一次常规巡检。'])
  assert.deepEqual(loaded.catalog.filter(item => item.fast).map(item => item.case_id),
    ['U-INS-001', 'U-EMG-001', 'U-POL-001', 'U-FLT-001', 'U-QA-002', 'U-QA-003', 'U-THREAT-FAST'])
  assert.ok(loaded.catalog.every(item => item.scene))
  for (const expected of ['设备数量', 'reportMarkdown', '不改写结论', '仅当 `reportDownloadUrl` 非空时原样提供下载地址']) {
    assert.ok(loaded.cases['U-INS-001'].expected_behavior.includes(expected))
  }
  assert.equal(loaded.cases['U-POL-008'].inputs.length, 4)
  for (const retired of ['**执行器', '**工具边界', '**副作用预算', 'Experiment 评估选择',
    'T-MIGRATION-SOURCE', 'T-DSH-LOAD-CYCLE', 'T-CONTRACT-STATIC', 'T-CONTRACT-LIVE']) {
    assert.equal(text.includes(retired), false)
  }
  assert.deepEqual(globSync('EXP-*/evaluation/plan.yaml', { cwd: join(repository, 'evolution/experiments') }), [])
})
