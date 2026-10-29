import { buildUnderstandingRequest, deepFreeze, invariant, jsonCopy, recordQwenResponse, sha256, type QwenModelIdentity, type QwenResponseReceipt, type TraceReference } from './language-understanding.ts'
import { constructDecisionRecord, type ConstructorIdentity, type DecisionFacts } from './decision-state.ts'
import { DECISION_SITES } from './decision-questions.ts'
import { foldMediumState, READ_ROUTES, ROOT_PRESET, type RuntimeTool, type SessionFacts } from './security-ops-context.ts'

export const REPLAY_VERSION = 'initial-main-route-replay/v1'
export const REPLAY_LIMITS = Object.freeze({ max_state: 384, max_branch: 1024, max_packed: 2048 })
export interface InitialReplayInput {
  /** 18120 datasets/read回执；可省略不用的旧questions/targets。sha256仍指原平台文件，不是投影摘要。 */
  readback: any; record_id: string
  source_page: any
  /** 分片完整重组后的decision JSON；不能把state:null的descriptor传进来。 */
  source_decision: any
  /** 18120 runs/trace原始页，必须覆盖原文件第1行至anchor（含）。 */
  trace_pages: any[]
}
export interface InitialReplayConfig {
  model: QwenModelIdentity; constructor: ConstructorIdentity; replay_source_sha256: string
  /** 实际resolver给出的完整native名；缺失的工具不会猜测其他名字。 */
  native_tool_names: Record<keyof typeof READ_ROUTES, string>
  /** 仅允许已观察到的skill装载工具名；没有该证据时省略。 */
  skill_loader_name?: string
}
export interface BoundQwenReceipt { request_sha256: string; receipt: QwenResponseReceipt }
const object = (value: any): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)
const hash = (value: any) => sha256(JSON.stringify(value))
function text(value: any): value is string { return typeof value === 'string' && !!value.trim() }
function refValid(ref: any, path: string, source: string) {
  return ref && ref.path === path && ref.source_sha256 === source && Number.isSafeInteger(ref.line) && ref.line > 0
    && typeof ref.line_sha256 === 'string' && /^[0-9a-f]{64}$/.test(ref.line_sha256)
}
function message(event: any) { return event?.data?.message ?? event?.data }
function singleText(value: any): string | null {
  return Array.isArray(value) && value.length === 1 && value[0]?.type === 'text' && text(value[0].text) ? value[0].text : null
}
function initialProof(input: InitialReplayInput, config: InitialReplayConfig) {
  const dataset = input.readback?.dataset, record = dataset?.records?.find((row: any) => row?._meta?.id === input.record_id)
  invariant(dataset?.schema_version === 2 && record && /^[0-9a-f]{64}$/.test(input.readback.sha256), 'REPLAY_DATASET_READ_REQUIRED')
  const meta = record._meta, page = input.source_page, decision = input.source_decision
  invariant(text(dataset.id) && /^[0-9a-f]{64}$/.test(meta.content_sha256) && object(meta.observed_action) && text(meta.observed_action.name), 'REPLAY_PLATFORM_RECORD_METADATA_REQUIRED')
  invariant(page?.kind === 'decisions' && page.run_id === dataset.run_id && meta.run_id === page.run_id
    && page.path === dataset.path && page.path === meta.trace_path && page.source_sha256 === dataset.source_sha256
    && page.source_sha256 === meta.trace_sha256 && /^[0-9a-f]{64}$/.test(page.source_identity_sha256), 'REPLAY_SOURCE_IDENTITY_MISMATCH')
  invariant(page.agent_id === 'security-operations-expert' && page.experiment_id
    && ['agent_id', 'experiment_id'].every(key => dataset[key] === page[key] && meta[key] === page[key]), 'REPLAY_AGENT_EXPERIMENT_MISMATCH')
  invariant(dataset.source_bundle?.sha256 === page.source_bundle?.sha256 && same(dataset.source_bundle?.files, page.source_bundle?.files)
    && page.source_bundle?.issues?.length === 0 && hash(page.source_bundle.files) === page.source_bundle.sha256, 'REPLAY_SOURCE_BUNDLE_MISMATCH')
  invariant(same(dataset.source_version, page.source_version) && same(meta.source_version, page.source_version), 'REPLAY_SOURCE_VERSION_MISMATCH')
  const descriptor = page.decisions?.find((item: any) => item.decision_id === meta.decision_id)
  invariant(descriptor && decision?.decision_id === meta.decision_id && descriptor.eligible === true && decision.eligible === true
    && decision.state && same(decision.anchor, meta.cutoff) && same(descriptor.anchor, meta.cutoff)
    && same(decision.state, record.state) && same(decision.observed_action, meta.observed_action)
    && decision.run_id === page.run_id && decision.agent_id === page.agent_id && decision.experiment_id === page.experiment_id,
  'REPLAY_COMPLETE_SELECTED_DECISION_REQUIRED')
  invariant(descriptor.detail_required ? descriptor.content_sha256 === hash(decision) : same(descriptor, decision), 'REPLAY_DECISION_FRAGMENT_DIGEST_MISMATCH')
  invariant(!meta.lineage && !decision.lineage && !descriptor.lineage_required && text(meta.source_group_id), 'REPLAY_SUBAGENT_UNSUPPORTED')
  const anchor = meta.cutoff as TraceReference
  invariant(refValid(anchor, page.path, page.source_sha256) && Number.isSafeInteger(anchor.seq) && anchor.seq! > 0
    && text(anchor.session_log) && !/[\\/]/.test(anchor.session_log!), 'REPLAY_NATIVE_ROOT_ANCHOR_REQUIRED')
  invariant(Array.isArray(input.trace_pages) && input.trace_pages.length > 0, 'REPLAY_NATIVE_PREFIX_REQUIRED')
  const byLine = new Map<number, any>()
  let rootIdentity: any
  for (const trace of input.trace_pages) {
    invariant(trace.run_id === page.run_id && trace.path === page.path && trace.source_sha256 === page.source_sha256
      && trace.source?.role === 'target' && trace.source.collection_status === 'available' && Array.isArray(trace.events), 'REPLAY_TRACE_PAGE_MISMATCH')
    if (rootIdentity) invariant(same(rootIdentity, trace.source.root_identity), 'REPLAY_ACTOR_CHANGED')
    rootIdentity = trace.source.root_identity
    for (const row of trace.events) {
      invariant(refValid(row.ref, page.path, page.source_sha256), 'REPLAY_TRACE_REF_MISMATCH')
      if (row.ref.line > anchor.line) continue
      invariant(row.status === 'valid' && row.role === 'target' && row.event && row.event.type === row.type, 'REPLAY_PREFIX_UNAVAILABLE')
      if (byLine.has(row.ref.line)) invariant(same(byLine.get(row.ref.line), row), 'REPLAY_TRACE_PAGE_CONFLICT')
      byLine.set(row.ref.line, row)
    }
  }
  invariant(byLine.size === anchor.line && [...byLine.keys()].every(line => line >= 1 && line <= anchor.line), 'REPLAY_PREFIX_GAP')
  const rows = [...byLine.values()].sort((a, b) => a.ref.line - b.ref.line)
  invariant(rows.every(row => row.ref.session_log === anchor.session_log), 'REPLAY_NONROOT_PREFIX_UNSUPPORTED')
  let previousSeq = -1
  for (const row of rows.filter(row => row.type !== 'session')) {
    invariant(Number.isSafeInteger(row.event.seq) && row.ref.seq === row.event.seq && row.ref.seq > previousSeq, 'REPLAY_NATIVE_SEQUENCE_INVALID')
    previousSeq = row.ref.seq
  }
  const headers = rows.filter(row => row.type === 'session'), header = headers[0]?.event
  invariant(headers.length === 1 && header?.version === 4 && header.origin !== 'subagent' && header.isSeeded === false
    && header.delegationDepth === 0 && header.agentPreset === ROOT_PRESET && text(header.id)
    && rootIdentity?.session_id === header.id && rootIdentity.session_log === anchor.session_log
    && rootIdentity.agent_preset === ROOT_PRESET, 'REPLAY_ROOT_HEADER_NOT_PROVEN')
  const last = rows.at(-1)
  invariant(same(last.ref, anchor) && ['tool/call', 'assistant/message'].includes(last.type)
    && last.event.data?.turn === 1, 'REPLAY_FIRST_TURN_NOT_PROVEN')
  const prefix = rows.slice(0, -1)
  invariant(prefix.filter(row => row.type === 'turn/start').length === 1
    && prefix.some(row => row.type === 'turn/start' && row.event.data?.turn === 1)
    && !prefix.some(row => row.type === 'turn/end' || Number.isSafeInteger(row.event.data?.turn) && row.event.data.turn !== 1), 'REPLAY_PRIOR_TURN_UNSUPPORTED')
  const users = prefix.filter(row => row.type === 'user/message' && message(row.event)?.source?.kind === 'user')
  invariant(prefix.filter(row => row.type === 'user/message').every(row => ['user', 'agent-instructions', 'runtime-context', 'skill-catalog', 'time-context'].includes(message(row.event)?.source?.kind)), 'REPLAY_MATERIAL_OR_DELEGATION_UNSUPPORTED')
  const visibleUsers = record.state.messages?.filter((item: any) => item.role === 'user' && item.source?.kind === 'user')
  const requestText = users.length === 1 ? singleText(message(users[0].event).content) : null
  invariant(requestText !== null && visibleUsers?.length === 1 && singleText(visibleUsers[0].content) === requestText, 'REPLAY_SINGLE_NATIVE_USER_TEXT_REQUIRED')
  invariant(Array.isArray(record.state.available_tools), 'REPLAY_SAVED_TOOL_CATALOG_REQUIRED')
  const catalog: any[] = record.state.available_tools
  invariant(catalog.every(tool => object(tool) && text(tool.name)) && new Set(catalog.map(tool => tool.name)).size === catalog.length, 'REPLAY_TOOL_CATALOG_AMBIGUOUS')
  const routes = Object.keys(READ_ROUTES) as (keyof typeof READ_ROUTES)[]
  invariant(object(config.native_tool_names) && Object.keys(config.native_tool_names).sort().join('|') === [...routes].sort().join('|')
    && Object.values(config.native_tool_names).every(text) && new Set(Object.values(config.native_tool_names)).size === routes.length, 'REPLAY_EXACT_NATIVE_TOOL_NAMES_REQUIRED')
  const tools: RuntimeTool[] = []
  for (const route of routes) {
    const name = config.native_tool_names[route], observed = catalog.find(tool => tool.name === name)
    if (!observed) continue
    invariant(object(observed.parameters) && observed.parameters.type === 'object', 'REPLAY_ACTUAL_TOOL_SCHEMA_REQUIRED')
    tools.push({ route, name, inputSchema: jsonCopy(observed.parameters) as Record<string, any> })
  }
  if (config.skill_loader_name !== undefined) invariant(config.skill_loader_name === 'skill' && catalog.some(tool => tool.name === config.skill_loader_name), 'REPLAY_SKILL_LOADER_NOT_OBSERVED')
  // initial-only：即使是已完成的目录读取也不能忽略其业务事实后重新归零。
  const allowed = new Set(config.skill_loader_name ? [config.skill_loader_name] : [])
  const priorCalls = prefix.filter(row => row.type === 'tool/call')
  invariant(priorCalls.every(row => allowed.has(row.event.data?.name)), 'REPLAY_PRIOR_BUSINESS_ACTION_UNSUPPORTED')
  const calls = new Set(priorCalls.map(row => row.event.data?.callId))
  invariant(!prefix.some(row => row.type === 'tool/result' && !calls.has(row.event.data?.message?.source?.callId)), 'REPLAY_ORPHAN_TOOL_RESULT')
  const initial: SessionFacts = { binding: {}, progress: { run_status: 'unknown', tool_attempts: [] }, observations: [], pending_calls: [] }
  const projection = prefix.map(row => row.event).reduce(foldMediumState, initial)
  invariant(same(projection, initial), 'REPLAY_INITIAL_PROJECTION_NOT_EMPTY')
  const catalogs = prefix.filter(row => row.type === 'request/header' && same(row.event.data?.header?.tools, catalog))
  invariant(catalogs.length > 0, 'REPLAY_CATALOG_NATIVE_REF_REQUIRED')
  const refs = prefix.filter(row => Number.isSafeInteger(row.ref.seq) && row.ref.seq >= 0).map(row => row.ref as TraceReference)
  invariant(refs.length > 0 && refs.every(ref => ref.seq! < anchor.seq!), 'REPLAY_NATIVE_SEQUENCE_INVALID')
  invariant(Array.isArray(meta.evidence_refs) && refs.some(ref => same(ref, users[0].ref))
    && meta.evidence_refs.some((ref: any) => same(ref, users[0].ref)) && meta.evidence_refs.some((ref: any) => same(ref, catalogs.at(-1)!.ref)), 'REPLAY_EVIDENCE_REF_NOT_IN_SELECTED_PREFIX')
  invariant(/^[0-9a-f]{64}$/.test(config.replay_source_sha256), 'REPLAY_SOURCE_DIGEST_REQUIRED')
  // 旧题目和targets不出现在回放产物，避免下游把旧教师目标误当新题监督。
  return { dataset: { id: dataset.id }, record: { _meta: { id: meta.id, content_sha256: meta.content_sha256, decision_id: meta.decision_id,
    cutoff: meta.cutoff, source_group_id: meta.source_group_id, observed_action: meta.observed_action } },
    page: { agent_id: page.agent_id, experiment_id: page.experiment_id, run_id: page.run_id, path: page.path,
      source_sha256: page.source_sha256, source_identity_sha256: page.source_identity_sha256, source_bundle: page.source_bundle,
      ...(page.source_version ? { source_version: page.source_version } : {}) },
    header: { id: header.id }, requestText, tools, projection, refs, dataset_sha256: input.readback.sha256,
    header_ref: headers[0].ref, user_ref: users[0].ref, catalog_ref: catalogs.at(-1)!.ref }
}

/** 仅构造真实initial replay请求；跳过时不调用模型、不填标签、不写数据。 */
export function prepareInitialDecisionReplay(input: InitialReplayInput, config: InitialReplayConfig) {
  try {
    const snapshot = jsonCopy(input) as unknown as InitialReplayInput, fixed = jsonCopy(config) as unknown as InitialReplayConfig
    const proof = initialProof(snapshot, fixed), { page, record } = proof
    const request = buildUnderstandingRequest({ origin: { kind: 'run_prefix', agent_id: page.agent_id, experiment_id: page.experiment_id, run_id: page.run_id,
      source_path: page.path, source_sha256: page.source_sha256, source_identity_sha256: page.source_identity_sha256,
      ...(page.source_version?.candidate_sha256 ? { candidate_sha256: page.source_version.candidate_sha256 } : {}),
      ...(page.source_version?.git_version ? { git_version: page.source_version.git_version } : {}),
      decision_ref: jsonCopy({ dataset_id: proof.dataset.id, record_id: record._meta.id, decision_id: record._meta.decision_id, cutoff: record._meta.cutoff }),
      prefix_selection: 'current_request_with_session_facts' }, model: fixed.model, sequence_basis: 'normalized_prefix_position', cutoff_sequence: 3, request_source_id: 'current-request',
      sources: [
        { id: 'current-request', role: 'target', kind: 'current_user', sequence: 0, content: proof.requestText },
        { id: 'session-facts', role: 'target', kind: 'session_projection', sequence: 1, content: jsonCopy({ binding: proof.projection.binding, progress: proof.projection.progress }) },
        { id: 'current-tools', role: 'target', kind: 'capability_catalog', sequence: 2, content: jsonCopy({ status: 'discovered', tools: proof.tools }) },
      ] })
    return deepFreeze({ status: 'ready' as const, request, proof, config: fixed })
  } catch (error) {
    return { status: 'skipped' as const, reason_codes: [error instanceof Error ? error.message : 'REPLAY_INPUT_INVALID'], ir: [],
      covered_sites: [], uncovered_sites: [...DECISION_SITES] }
  }
}

/** callback必须返回本次完整prompt的实际Qwen回执；旧user-only回执摘要不匹配。 */
export async function replayInitialDecision(input: InitialReplayInput, config: InitialReplayConfig, infer: (request: ReturnType<typeof buildUnderstandingRequest>) => Promise<BoundQwenReceipt>) {
  const prepared = prepareInitialDecisionReplay(input, config)
  if (prepared.status !== 'ready') return prepared
  const fixed = prepared.config
  const bound = await infer(prepared.request)
  invariant(bound.request_sha256 === prepared.request.request_sha256 && ['live_model', 'recorded_model'].includes(bound.receipt.record_mode)
    && bound.receipt.http_transport, 'REPLAY_ACTUAL_QWEN_RESPONSE_FOR_THIS_PROMPT_REQUIRED')
  const response = recordQwenResponse(prepared.request, bound.receipt)
  if (response.status !== 'parsed') return { status: 'invalid_qwen' as const, ir: [], recording: response.supervision, covered_sites: [], uncovered_sites: [...DECISION_SITES] }
  const facts: DecisionFacts = { request: prepared.request, response, session_binding: {}, capabilities: { status: { source_id: 'current-tools', pointer: '/status', value: 'discovered' },
    tools: prepared.proof.tools.map((_tool, index) => ({ source_id: 'current-tools', pointer: `/tools/${index}`, arguments: {} })) }, observations: [], candidates: [],
    progress: Object.fromEntries(Object.entries(prepared.proof.projection.progress).map(([key, value]) => [key, { source_id: 'session-facts', pointer: `/progress/${key}`, value: jsonCopy(value) }])) }
  const record = constructDecisionRecord('main_route', facts, fixed.constructor, 'training_replay')
  const { page, header, record: source } = prepared.proof
  const contract = `security-ops-questions/sha256:${fixed.constructor.questions_source_sha256}`
  const ir = Object.entries(record.questions).map(([qid, question]) => ({ schema_version: 'kev-decision-ir/v1',
    sample_id: `initial-main-route/${source._meta.id}/${hash([fixed.replay_source_sha256, record.supervision.state_sha256, record.supervision.questions_sha256, response.supervision.qwen.request_sha256, response.supervision.qwen.response_sha256])}/${qid}`,
    decision_site_id: `main_route.${qid}`, contract_version: contract, implementation: 'hybrid',
    state: record.state, question, observed_action: jsonCopy(source._meta.observed_action), label: { status: 'unlabeled', value: null, source: '', evidence_refs: [] },
    provenance: { trace_sha256: page.source_sha256, session_id: header.id, source_group_id: source._meta.source_group_id,
      decision_seq: source._meta.cutoff.seq, decision_line: source._meta.cutoff.line, turn: 1,
      state_evidence_refs: prepared.proof.refs.map(ref => ({ ...ref, session_id: header.id, trace_sha256: page.source_sha256 })),
      candidate_evidence_refs: [{ kind: 'contract', contract_version: contract, contract_sha256: fixed.constructor.questions_source_sha256 }],
      state_builder_version: `sha256:${fixed.constructor.state_constructor_sha256}`, candidate_builder_version: `sha256:${fixed.constructor.questions_source_sha256}` },
    review: { status: 'unreviewed', scope: REPLAY_VERSION, business_effect: 'inconclusive', required: '按精确新state/question受托复核；不得移植旧题标签。' },
    replay: { version: REPLAY_VERSION, source_sha256: fixed.replay_source_sha256, platform: { dataset_id: prepared.proof.dataset.id,
      dataset_sha256: prepared.proof.dataset_sha256, record_id: source._meta.id, source_record_content_sha256: source._meta.content_sha256,
      agent_id: page.agent_id, experiment_id: page.experiment_id, run_id: page.run_id, source_identity_sha256: page.source_identity_sha256,
      source_bundle: page.source_bundle, ...(page.source_version ? { source_version: page.source_version } : {}) },
      initial_projection: { derivation: 'foldMediumState(initial-empty,native-prefix)', user_ref: prepared.proof.user_ref, catalog_ref: prepared.proof.catalog_ref,
        header_ref: prepared.proof.header_ref }, supervision: record.supervision },
  }))
  return deepFreeze({ status: 'unlabeled' as const, record, ir, covered_sites: ['main_route'], uncovered_sites: DECISION_SITES.filter(site => site !== 'main_route'), encoder_probe: {
    schema_version: 'kev-encoder-probe/v1', kev_commit: '2074cc44256200bb37540103fa4572901faa10f3', limits: REPLAY_LIMITS,
    request: { state: record.state, questions: record.questions }, state_sha256: record.supervision.state_sha256, questions_sha256: record.supervision.questions_sha256,
  } })
}
