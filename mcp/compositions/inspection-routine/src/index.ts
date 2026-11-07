import { isIP } from 'node:net'
import { base, assetItem, summary, type Soc } from '../../../src/inspection/index.ts'

export function classifyStatus(asset: any) {
  const timestamp = (value: any) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value))
  const evidence = asset.stateEvidence
  const facts = { online: asset.online, onlineBasis: asset.onlineBasis, lastSeenAt: asset.lastSeenAt, lastProbeAt: asset.lastProbeAt, probeState: asset.probeState, stateEvidence: evidence }
  if (!isIP(asset.ip ?? '') || !evidence || evidence.online !== asset.online || !Array.isArray(evidence.signals) || !['DATABASE_LOCAL', 'UTC', 'OFFSET'].includes(evidence.timeBasis) || !timestamp(evidence.evaluatedAt)) return { status: 'unknown', message: '地址或状态时间证据不完整，无法判断在线状态', facts, recommendation: '核对资产地址及 SOC 状态来源，不依据更新时间推测设备在线。' }
  const current = evidence.signals.some((signal: any) => signal.validity === 'CURRENT' && signal.supportsOnline === true && timestamp(signal.observedAt))
  if (asset.online === 'online' && current) return { status: 'normal', message: 'SOC 在其状态时间窗口内报告在线', facts }
  if (asset.online === 'offline' && !current && evidence.signals.some((signal: any) => signal.validity === 'EXPIRED' && timestamp(signal.observedAt))) return { status: 'abnormal', message: 'SOC 报告离线；不据此推断故障原因', facts, recommendation: '核对最近采集、探测和设备实际状态。' }
  return { status: 'unknown', message: '缺少有效状态证据或返回状态与证据冲突', facts, recommendation: '核对 SOC 采集、状态窗口及探测依据。' }
}

export function create(soc: Soc) {
  return { ...base(soc, true), components: {
    status: (_value: any, _config: any, context: any) => summary('status', context.shared.assets.map((asset: any) => assetItem(asset, classifyStatus(asset))), context),
    summary: (steps: Record<string, any>, _config: any, context: any) => {
      const checks = Object.fromEntries(['status', 'baseline', 'reachability'].map(id => [id, steps[id] ?? { status: 'failed', error: '缺少子检查结果' }]))
      return { kind: 'routine', scope: context.shared.scope, status: Object.values(checks).every(value => value.status === 'completed') ? 'completed' : 'incomplete', checks }
    },
  } }
}
