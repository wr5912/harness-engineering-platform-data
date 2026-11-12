import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceSummary } from '../src/index.ts'
// 取本Run run-d9cf5920 的真实响应形状（不含凭据），校准具体缺口而非泛化"待核"。
const port = { ip: '172.16.138.232', port: 80, protocol: 'tcp', status: 'NO_RECORD', recordedAt: null, source: null, service: null, scanStartedAt: null }
const policy = { sinceEpochMs: 1791721671062, destination: [], exact: [], status: 'AVAILABLE' }
const path = { sourceIp: '172.16.1.40', targetIp: '172.16.138.232', port: 80, protocol: 'tcp', status: 'AVAILABLE', probeWindowRequested: false, logQueryAttempts: 1, sameSessionConfirmed: false,
  trafficEvidence: { status: 'AVAILABLE', windowStartMs: 1794313371347, windowEndMs: 1794313671347, scope: 'OPNSENSE_DECISIONS', truncated: false, hops: [], unassigned: [],
    gaps: ['仅查询 OPNsense 防火墙决策日志；无记录不代表不通，亦不证明日志采集完整'] },
  candidatePolicies: [{ deviceId: 'dev-9a883b959cf0', applicability: 'NOT_CONFIRMED' }] }
const route = { status: 'UNKNOWN', candidates: [], gaps: ['设备 9136 缺少目的地址的路由证据', '源主机接口与归属证据不足，无法确认实际首跳'], truncated: false }
test('真实响应结构：端口无记录/空策略/未确认路径/未知路由给出具体缺口且不确认根因', () => {
  const p = evidenceSummary({ check: 'portEvidence', payload: port })
  assert.match(p.gaps.join('|'), /NO_RECORD/)
  assert.match(p.gaps.join('|'), /recordedAt\/source\/service 均为空/)
  assert.match(p.gaps.join('|'), /端口无记录不等于未监听/)
  const pol = evidenceSummary({ check: 'policyEvidence', payload: policy })
  assert.match(pol.gaps.join('|'), /exact=0项，destination=0项/)
  assert.match(pol.source_window.note, /不等于用户故障起点/)
  const pa = evidenceSummary({ check: 'pathEvidence', payload: path })
  assert.match(pa.gaps.join('|'), /sameSessionConfirmed=false/)
  assert.match(pa.gaps.join('|'), /仅查询 OPNsense/)
  assert.match(pa.gaps.join('|'), /applicability=NOT_CONFIRMED/)
  assert.equal(pa.source_window.scope, 'OPNSENSE_DECISIONS')
  const rt = evidenceSummary({ check: 'routeEvidence', payload: route })
  assert.match(rt.gaps.join('|'), /candidates=0项/)
  assert.match(rt.gaps.join('|'), /设备 9136/)
  assert.match(rt.gaps.join('|'), /静态路由候选不证明实际转发/)
  // 任一分支都不产生 confirmed 结论或因果断言。
  for (const s of [p, pol, pa, rt]) { assert.equal(s.status === 'confirmed', false); assert.ok(s.gaps.length >= 2) }
})
