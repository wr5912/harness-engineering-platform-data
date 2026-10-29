import { DECISION_SITES, questionsFor, type DecisionSite, type Json } from './decision-questions.ts'
import { deepFreeze, invariant, jsonCopy, sha256, understandingContext, SUPERVISION_ROOT_FIELDS, type UnderstandingRequest, type RecordedUnderstanding, type PrefixSource, type GroundedLiteral } from './language-understanding.ts'

export type Scalar = string | number | boolean | null
export interface FactReference { source_id: string; pointer: string; value: Json }
export type FactFields = Record<string, FactReference>
export interface CapabilityReference { source_id: string; pointer: string; arguments: FactFields }
export interface DecisionFacts {
  request: UnderstandingRequest
  response: RecordedUnderstanding
  session_binding: FactFields
  capabilities: { status: FactReference; tools: CapabilityReference[] }
  observations: { kind: 'tool_observation' | 'session_fact' | 'prior_decision'; status: FactReference; fields: FactFields }[]
  candidates: { kind: 'action' | 'inspection_template' | 'hypothesis' | 'evidence_claim' | 'recommendation' | 'plan_step' | 'material_claim'; fields: FactFields }[]
  progress: FactFields
}
export const STATE_SCHEMA_VERSION = 2
export const ENCODER_LIMITS = Object.freeze({ state_tokens: 384, max_branch_tokens: 1024, packed_tokens: 2048 })
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) }
function exact(value: unknown, required: string[]) { invariant(object(value) && Object.keys(value).sort().join('|') === [...required].sort().join('|'), 'FACT_FIELDS_INVALID') }
function canonical(value: Json): Json { return Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value }
function lookup(sources: PrefixSource[], sourceId: string, pointer: string) {
  const source = sources.find(item => item.id === sourceId)
  invariant(source && typeof pointer === 'string' && (pointer === '' || pointer.startsWith('/')), 'FACT_SOURCE_OR_POINTER_INVALID')
  let value: any = source.content
  const parts = pointer === '' ? [] : pointer.slice(1).split('/').map(key => { invariant(!/~(?![01])/.test(key), 'FACT_POINTER_ESCAPE_INVALID'); return key.replace(/~1/g, '/').replace(/~0/g, '~') })
  invariant(!parts.length || !(SUPERVISION_ROOT_FIELDS as readonly string[]).includes(parts[0]!), 'SUPERVISION_OR_FUTURE_FIELD_FORBIDDEN')
  for (const key of parts) {
    invariant(!['__proto__', 'constructor', 'prototype'].includes(key), 'FACT_POINTER_FIELD_FORBIDDEN')
    invariant(value && typeof value === 'object' && Object.hasOwn(value, key), 'FACT_POINTER_NOT_OBSERVED')
    value = value[key]
  }
  return { source, value }
}
function inputFact(value: Json): Json {
  if (Array.isArray(value)) return value.map(inputFact)
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => {
    invariant(!['__proto__', 'constructor', 'prototype'].includes(key), 'FACT_FIELD_FORBIDDEN')
    return [key, inputFact(value[key])]
  }))
  return value
}
function factValue(reference: FactReference, sources: PrefixSource[]): Json {
  exact(reference, ['source_id', 'pointer', 'value'])
  const actual = lookup(sources, reference.source_id, reference.pointer).value
  const value = inputFact(jsonCopy(actual))
  invariant(JSON.stringify(value) === JSON.stringify(canonical(jsonCopy(reference.value))), 'FACT_VALUE_NOT_OBSERVED')
  return value
}
function fields(value: FactFields, sources: PrefixSource[], sourceKinds?: PrefixSource['kind'][], prefix?: string) {
  invariant(object(value), 'FACT_MAP_REQUIRED')
  return Object.fromEntries(Object.keys(value).sort().map(key => {
    invariant(key && !['__proto__', 'constructor', 'prototype'].includes(key), 'FACT_FIELD_FORBIDDEN')
    invariant(!sourceKinds || sourceKinds.includes(lookup(sources, value[key]!.source_id, value[key]!.pointer).source.kind), 'FACT_SOURCE_KIND_NOT_AUTHORITATIVE')
    invariant(prefix === undefined || value[key]!.pointer === `${prefix}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, 'FACT_SEMANTIC_PATH_MISMATCH')
    return [key, factValue(value[key]!, sources)]
  }))
}
function visibleLiteral(value: GroundedLiteral) {
  return { text: value.quote }
}

/** 训练回放与线上只调用此构造器；不生成标签、默认事实、标识、日期或截断投影。 */
export function constructDecisionState(site: DecisionSite, facts: DecisionFacts) {
  invariant((DECISION_SITES as readonly string[]).includes(site), 'DECISION_SITE_UNKNOWN')
  exact(facts, ['request', 'response', 'session_binding', 'capabilities', 'observations', 'candidates', 'progress'])
  const context = understandingContext(facts.request, facts.response), sources = context.input.sources
  const current = sources.find(source => source.id === context.input.request_source_id)!
  exact(facts.capabilities, ['status', 'tools'])
  invariant(facts.capabilities.status.pointer === '/status', 'CAPABILITY_STATUS_PATH_INVALID')
  invariant(lookup(sources, facts.capabilities.status.source_id, facts.capabilities.status.pointer).source.kind === 'capability_catalog', 'CAPABILITY_STATUS_NOT_FROM_DISCOVERY')
  const capabilityStatus = factValue(facts.capabilities.status, sources)
  invariant(typeof capabilityStatus === 'string' && ['discovered', 'missing', 'read_failed', 'unknown'].includes(capabilityStatus) && Array.isArray(facts.capabilities.tools), 'CAPABILITY_STATUS_INVALID')
  invariant(capabilityStatus === 'discovered' || facts.capabilities.tools.length === 0, 'UNAVAILABLE_CAPABILITIES_CANNOT_HAVE_TOOLS')
  const tools = facts.capabilities.tools.map(tool => {
    exact(tool, ['source_id', 'pointer', 'arguments'])
    const actual = lookup(sources, tool.source_id, tool.pointer)
    invariant(actual.source.kind === 'capability_catalog' && object(actual.value) && typeof actual.value.name === 'string'
      && actual.value.name && object(actual.value.inputSchema), 'ACTUAL_TOOL_SCHEMA_REQUIRED')
    const required = actual.value.inputSchema.required ?? []
    invariant(Array.isArray(required) && required.every((key: unknown) => typeof key === 'string'), 'TOOL_REQUIRED_FIELDS_INVALID')
    const args = fields(tool.arguments, sources)
    return { name: actual.value.name, required_parameters: [...required], arguments: args,
      missing_parameters: required.filter((key: string) => !Object.hasOwn(args, key)) }
  })
  invariant(new Set(tools.map(tool => tool.name)).size === tools.length, 'DUPLICATE_CAPABILITY_NAME')
  invariant(Array.isArray(facts.observations) && Array.isArray(facts.candidates), 'FACT_COLLECTIONS_REQUIRED')
  const observations = facts.observations.map(observation => {
    exact(observation, ['kind', 'status', 'fields'])
    invariant(observation.status.pointer === '/status', 'OBSERVATION_STATUS_PATH_INVALID')
    invariant(['tool_observation', 'session_fact', 'prior_decision'].includes(observation.kind), 'OBSERVATION_KIND_INVALID')
    const status = factValue(observation.status, sources)
    invariant(typeof status === 'string' && ['ok', 'failed', 'empty', 'not_queried', 'truncated', 'unknown'].includes(status), 'OBSERVATION_STATUS_INVALID')
    const kinds: PrefixSource['kind'][] = observation.kind === 'session_fact' ? ['session_projection'] : ['tool_result']
    invariant(kinds.includes(lookup(sources, observation.status.source_id, observation.status.pointer).source.kind), 'OBSERVATION_STATUS_SOURCE_INVALID')
    return { kind: observation.kind, status, values: fields(observation.fields, sources, kinds) }
  })
  const candidates = facts.candidates.map(candidate => {
    exact(candidate, ['kind', 'fields'])
    invariant(['action', 'inspection_template', 'hypothesis', 'evidence_claim', 'recommendation', 'plan_step', 'material_claim'].includes(candidate.kind), 'CANDIDATE_KIND_INVALID')
    invariant(object(candidate.fields) && Object.keys(candidate.fields).length > 0, 'CANDIDATE_FACTS_REQUIRED')
    return { kind: candidate.kind, values: fields(candidate.fields, sources) }
  })
  const singleCandidateKinds: Partial<Record<DecisionSite, string>> = { emergency_action_match: 'action', inspection_template_match: 'inspection_template', fault_hypothesis: 'hypothesis', threat_evidence: 'evidence_claim', threat_recommendation: 'recommendation', frozen_plan_step: 'plan_step', material_answer: 'material_claim' }
  invariant(!singleCandidateKinds[site] || candidates.length === 1, 'SITE_REQUIRES_ONE_OBSERVED_CANDIDATE')
  invariant(!singleCandidateKinds[site] || candidates[0]!.kind === singleCandidateKinds[site], 'SITE_CANDIDATE_KIND_MISMATCH')
  const session_binding = fields(facts.session_binding, sources, ['session_projection'], '/binding')
  invariant(site !== 'frozen_plan_step' || current.kind === 'current_user' && !context.input.origin.lineage && session_binding.gate_status === 'allowed', 'FROZEN_INPUT_NOT_AUTHORIZED')
  const understanding = context.understanding
  return deepFreeze({ schema_version: STATE_SCHEMA_VERSION, site,
    request: { kind: current.kind === 'delegated_task' ? 'delegated_task' : 'human_user', actor: context.input.origin.lineage ? 'delegated_child' : 'root',
      text: current.content as string },
    understanding: { actions: understanding.actions.map(visibleLiteral), slots: understanding.slots.map(item => ({ name: item.name, ...visibleLiteral(item) })),
      constraints: understanding.constraints.map(item => ({ kind: item.kind, ...visibleLiteral(item) })), unresolved: understanding.unresolved.map(item => ({ kind: item.kind, ...visibleLiteral(item) })) },
    session_binding, capabilities: { status: capabilityStatus, tools }, observations, candidates, progress: fields(facts.progress, sources, ['session_projection'], '/progress') })
}
export type DecisionState = ReturnType<typeof constructDecisionState>
export interface ConstructorIdentity { state_constructor_sha256: string; questions_source_sha256: string; language_understanding_source_sha256: string }
export function constructDecisionRecord(site: DecisionSite, facts: DecisionFacts, identity: ConstructorIdentity, mode: 'training_replay' | 'online' | 'test_fixture') {
  exact(identity, ['state_constructor_sha256', 'questions_source_sha256', 'language_understanding_source_sha256'])
  invariant(Object.values(identity).every(value => /^[0-9a-f]{64}$/.test(value)), 'REAL_CONSTRUCTOR_SOURCE_DIGESTS_REQUIRED')
  const context = understandingContext(facts.request, facts.response), fixture = context.supervision.qwen.record_mode === 'test_fixture'
  invariant(fixture ? mode === 'test_fixture' : ['training_replay', 'online'].includes(mode), 'FIXTURE_CANNOT_BECOME_REAL_QWEN_RECORD')
  invariant(mode !== 'training_replay' || context.input.origin.kind === 'run_prefix', 'REPLAY_REQUIRES_ACTUAL_RUN_ORIGIN')
  invariant(mode !== 'online' || context.input.origin.kind === 'live_session', 'ONLINE_REQUIRES_ACTUAL_SESSION_ORIGIN')
  const state = constructDecisionState(site, facts), questions = questionsFor(site)
  const { request: _request, response: _response, ...grounding } = facts
  return deepFreeze({ state, questions, supervision: { kind: 'unlabelled_decision_state', mode, ...context.supervision,
    constructor: { schema_version: STATE_SCHEMA_VERSION, ...identity }, state_sha256: sha256(JSON.stringify(state)), questions_sha256: sha256(JSON.stringify(questions)),
    grounding: jsonCopy(grounding), language_understanding: jsonCopy(context.understanding),
    deterministic_sources: jsonCopy(context.input.sources.filter(source => ['session_projection', 'capability_catalog'].includes(source.kind))) } })
}
export interface EncoderMeasurement {
  state_sha256: string; questions_sha256: string
  encoder_repository: 'jaredpalmer/kev'; encoder_revision: string; encoder_source_sha256: string
  state_tokens: number; max_branch_tokens: number; packed_tokens: number
}
/** 使用官方encoder的实际测量；没有测量就拒绝，不用字符数估算，也不自动裁切。 */
export function assertEncodingBudget(state: DecisionState, measurement: EncoderMeasurement) {
  invariant(measurement && measurement.state_sha256 === sha256(JSON.stringify(state)) && measurement.questions_sha256 === sha256(JSON.stringify(questionsFor(state.site))), 'ENCODER_MEASUREMENT_IDENTITY_MISMATCH')
  invariant(measurement.encoder_repository === 'jaredpalmer/kev' && typeof measurement.encoder_revision === 'string' && !!measurement.encoder_revision
    && /^[0-9a-f]{64}$/.test(measurement.encoder_source_sha256), 'OFFICIAL_ENCODER_IDENTITY_REQUIRED')
  for (const key of ['state_tokens', 'max_branch_tokens', 'packed_tokens'] as const) {
    invariant(Number.isSafeInteger(measurement[key]) && measurement[key] > 0, 'ENCODER_MEASUREMENT_MISSING')
    invariant(measurement[key] <= ENCODER_LIMITS[key], `ENCODER_BUDGET_EXCEEDED:${key}`)
  }
  return deepFreeze(jsonCopy(measurement))
}
