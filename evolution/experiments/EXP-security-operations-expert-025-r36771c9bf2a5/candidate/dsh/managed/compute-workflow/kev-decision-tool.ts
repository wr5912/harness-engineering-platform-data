import { createHash, randomUUID } from 'node:crypto'

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type KevQuestion =
  | { type: 'choice'; instructions?: Json; criteria: Record<string, Json> }
  | { type: 'noul'; instructions?: Json; criteria?: { false?: Json; true?: Json } }
  | { type: 'score'; instructions?: Json; criteria: string[] }
export interface DecisionBinding {
  provider: string
  model: string
  reasoning_effort: string
  checkpoint_sha256: string
  state_constructor_sha256: string
  calibration_sha256: string
}
export interface KevDecisionConfig {
  name: string
  endpoint: string
  binding: DecisionBinding
  /** 由部署时的文件摘要、启动参数和真实进程共同核对；官方 /models 不提供文件摘要。 */
  serving: { run: string; base: string; temperature: number; dtype: 'float32'; backend: 'torch'; device: 'cuda' }
  /** 实际部署的官方编码器与已生成Python扩展字节身份，不能用TS源文件摘要代替。 */
  encoding: { encoder_revision: string; encoder_source_sha256: string; admission_source_sha256: string }
  /** 每个原生工具固定一个决策点，不接受调用者改写候选项或校准配置。 */
  questions: Record<string, KevQuestion>
  timeoutMs?: number
  apiKey?: () => string | undefined
}
export interface ModelExecution {
  execution_id: string
  role: 'target'
  decision_call_id: string
  session_id?: string
  tool_call_id?: string
  parent_run_id?: string
  case_id?: string
}
type Usage = { inputTokens?: number; outputTokens?: number }
type RequestReceipt = DecisionBinding & {
  request_id: string
  status: 'completed' | 'failed' | 'cancelled'
  /** 无响应的网络中断不能证明是否派发，省略后由 SDK 保留 unknown。 */
  model_invocation?: boolean
  usage?: Usage
}
export interface KevDecisionReceipt {
  ok: boolean
  typed_decision: Record<string, Json> | null
  model_execution: ModelExecution
  model_requests: RequestReceipt[]
  error_code?: string
  http_status?: number
  harness_encoding?: Record<string, Json>
}

const ENCODER_REVISION = '2074cc44256200bb37540103fa4572901faa10f3'
const ENCODING_LIMITS = { max_state: 384, max_branch: 1024, max_packed: 2048 }
const HASH_CONTRACT = 'json-wire-sha256/v1'
const sha = (value: Json) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

const own = (value: object, key: string) => Object.hasOwn(value, key)
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const probability = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1
const sameKeys = (value: unknown, expected: string[]) => object(value)
  && Object.keys(value).length === expected.length && expected.every(key => own(value, key))

function requireValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw new KevFailure(code)
}

function capabilityMatches(proof: unknown, config: KevDecisionConfig['encoding']): proof is Record<string, any> {
  return object(proof) && proof.schema_version === 'kev-encoding-proof/v1' && proof.hash_contract === HASH_CONTRACT
    && proof.encoder_repository === 'jaredpalmer/kev' && Object.entries(config).every(([key, value]) => proof[key] === value)
    && sameKeys(proof.limits, Object.keys(ENCODING_LIMITS)) && Object.entries(ENCODING_LIMITS).every(([key, value]) => proof.limits[key] === value)
}

function measuredProof(proof: unknown, encoding: KevDecisionConfig['encoding'], state: Json, questions: Record<string, KevQuestion>, model: string): proof is Record<string, Json> {
  return capabilityMatches(proof, encoding) && proof.model === model
    && proof.state_sha256 === sha(state) && proof.questions_sha256 === sha(questions as Json) && json(proof)
}

function admittedBudget(proof: Record<string, any>): boolean {
  return proof.admitted === true && ([['state_tokens', 384], ['max_branch_tokens', 1024], ['packed_tokens', 2048]] as const).every(([key, limit]) =>
    Number.isSafeInteger(proof[key]) && proof[key] > 0 && proof[key] <= limit)
    && proof.state_tokens <= proof.max_branch_tokens && proof.max_branch_tokens <= proof.packed_tokens
}
class KevFailure extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code }
}

function json(value: unknown, seen = new Set<object>()): value is Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) return true
  if (typeof value !== 'object' || !value || seen.has(value)) return false
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false
  if (Array.isArray(value) && (Object.keys(value).length !== value.length
    || !Object.keys(value).every((key, index) => key === String(index)))) return false
  seen.add(value)
  const result = Object.values(value).every(item => json(item, seen))
  seen.delete(value)
  return result
}

function validateQuestions(questions: unknown): asserts questions is Record<string, KevQuestion> {
  requireValue(object(questions) && Object.keys(questions).length > 0 && json(questions), 'KEV_INVALID_QUESTIONS')
  for (const [id, question] of Object.entries(questions as Record<string, any>)) {
    requireValue(id.trim() && object(question) && ['choice', 'noul', 'score'].includes(question.type)
      && Object.keys(question).every(key => ['type', 'instructions', 'criteria'].includes(key)), 'KEV_INVALID_QUESTIONS')
    if (question.type === 'noul') requireValue(question.criteria === undefined || object(question.criteria)
      && Object.keys(question.criteria).every(key => ['false', 'true'].includes(key)), 'KEV_INVALID_QUESTIONS')
    else {
      requireValue(question.type === 'choice' ? object(question.criteria) : Array.isArray(question.criteria), 'KEV_INVALID_QUESTIONS')
      requireValue(Object.keys(question.criteria).length >= 1 && Object.keys(question.criteria).length <= 255, 'KEV_INVALID_QUESTIONS')
      if (question.type === 'choice') requireValue(Object.keys(question.criteria).every(key => key.trim()), 'KEV_INVALID_QUESTIONS')
      else requireValue(question.criteria.every((level: unknown) => typeof level === 'string' && level.trim()), 'KEV_INVALID_QUESTIONS')
    }
  }
}

/** 与锁定版 kev.api.to_answers 对齐，容差只覆盖官方四位小数序列化。 */
export function validateKevAnswers(answers: unknown, questions: Record<string, KevQuestion>): Record<string, Json> {
  requireValue(sameKeys(answers, Object.keys(questions)) && json(answers), 'KEV_INVALID_ANSWERS')
  for (const [id, question] of Object.entries(questions)) {
    const answer = (answers as Record<string, any>)[id]
    requireValue(object(answer) && answer.type === question.type, 'KEV_INVALID_ANSWER_TYPE')
    if (question.type === 'noul') {
      requireValue(sameKeys(answer, ['type', 'noul']) && probability(answer.noul), 'KEV_INVALID_NOUL')
      continue
    }
    const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, index) => String(index))
    requireValue(sameKeys(answer.probabilities, keys) && Object.values(answer.probabilities).every(probability), 'KEV_INVALID_PROBABILITIES')
    const values = keys.map(key => answer.probabilities[key] as number)
    requireValue(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 0.02, 'KEV_INVALID_PROBABILITY_SUM')
    requireValue(probability(answer.confidence), 'KEV_INVALID_CONFIDENCE')
    if (question.type === 'choice') {
      requireValue(sameKeys(answer, ['type', 'choice', 'confidence', 'probabilities'])
        && typeof answer.choice === 'string' && keys.includes(answer.choice)
        && answer.probabilities[answer.choice] + 0.00010001 >= Math.max(...values), 'KEV_INVALID_CHOICE')
    } else {
      requireValue(sameKeys(answer, ['type', 'score', 'legend', 'probabilities', 'confidence'])
        && finite(answer.score) && answer.score >= 0 && answer.score <= keys.length - 1
        && sameKeys(answer.legend, keys) && keys.every((key, index) => answer.legend[key] === question.criteria[index]), 'KEV_INVALID_SCORE')
      const expected = values.reduce((sum, value, index) => sum + index * value, 0)
      const rounding = 0.00005001 * (1 + keys.length * (keys.length - 1) / 2)
      requireValue(Math.abs(answer.score - expected) <= rounding, 'KEV_INVALID_SCORE')
    }
  }
  return answers as Record<string, Json>
}

function usageFrom(value: unknown): Usage | undefined {
  if (!object(value)) return undefined
  const usage: Usage = {}
  for (const [source, destination] of [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens']] as const) {
    if (Number.isSafeInteger(value[source]) && value[source] >= 0) usage[destination] = value[source]
  }
  return Object.keys(usage).length ? usage : undefined
}

function validateExecution(value: unknown): asserts value is ModelExecution {
  const required = ['execution_id', 'role', 'decision_call_id']
  const optional = ['session_id', 'tool_call_id', 'parent_run_id', 'case_id']
  requireValue(object(value) && value.role === 'target' && required.every(key => typeof value[key] === 'string' && value[key].length)
    && Object.keys(value).every(key => [...required, ...optional].includes(key) && typeof value[key] === 'string' && value[key].length), 'KEV_INVALID_EXECUTION')
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

/** 原生工具直接访问官方 sidecar；不重试，不生成文本，不吞掉失败请求回执。 */
export function registerKevDecisionTool(ctx: any, options: KevDecisionConfig) {
  requireValue(typeof options.name === 'string' && options.name.trim(), 'KEV_INVALID_TOOL_NAME')
  const endpoint = new URL(options.endpoint)
  requireValue(['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password
    && !endpoint.search && !endpoint.hash && ['/', ''].includes(endpoint.pathname), 'KEV_INVALID_ENDPOINT')
  requireValue(object(options.binding) && ['provider', 'model', 'reasoning_effort'].every(key => typeof options.binding[key as keyof DecisionBinding] === 'string'
    && options.binding[key as keyof DecisionBinding].trim())
    && ['checkpoint_sha256', 'state_constructor_sha256', 'calibration_sha256'].every(key => /^[0-9a-f]{64}$/.test(options.binding[key as keyof DecisionBinding])), 'KEV_INVALID_BINDING')
  requireValue(options.binding.model === 'kev-latest' || options.binding.model === 'jev-latest', 'KEV_INVALID_MODEL')
  const serving = options.serving
  requireValue(object(serving) && typeof serving.run === 'string' && serving.run.length && typeof serving.base === 'string' && serving.base.length
    && finite(serving.temperature) && serving.temperature > 0 && serving.dtype === 'float32'
    && serving.backend === 'torch' && serving.device === 'cuda', 'KEV_INVALID_SERVING_BINDING')
  const encoding = options.encoding
  requireValue(sameKeys(encoding, ['encoder_revision', 'encoder_source_sha256', 'admission_source_sha256']) && encoding.encoder_revision === ENCODER_REVISION
    && /^[0-9a-f]{64}$/.test(encoding.encoder_source_sha256) && /^[0-9a-f]{64}$/.test(encoding.admission_source_sha256), 'KEV_INVALID_ENCODING_BINDING')
  validateQuestions(options.questions)
  const timeoutMs = options.timeoutMs ?? 30_000
  requireValue(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, 'KEV_INVALID_TIMEOUT')
  const config = freeze(structuredClone({ binding: options.binding, serving, encoding, questions: options.questions }))

  return ctx.tools.register({
    name: options.name,
    description: '使用固定 KEV 决策点输出类型化结果，并保留真实模型 HTTP 请求回执。',
    parameters: { type: 'object', properties: { state: {}, model_execution: { type: 'object' } }, required: ['state', 'model_execution'], additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute(input: Record<string, unknown>, exec: { signal: AbortSignal }): Promise<KevDecisionReceipt> {
      validateExecution(input.model_execution)
      // 每次尝试只分配一次；相同 ID 发送给官方服务并用于 SDK 去重。
      const request: RequestReceipt = { ...config.binding, request_id: `kev-${randomUUID()}`, status: 'failed', model_invocation: false }
      const result: KevDecisionReceipt = { ok: false, typed_decision: null, model_execution: structuredClone(input.model_execution), model_requests: [request] }
      const timeout = AbortSignal.timeout(timeoutMs)
      const signal = AbortSignal.any([exec.signal, timeout])
      let posting = false, responded = false
      try {
        signal.throwIfAborted()
        requireValue(sameKeys(input, ['state', 'model_execution']) && json(input.state), 'KEV_INVALID_STATE')
        const apiKey = options.apiKey?.()
        const headers = { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }
        const check = await fetch(new URL('/v1/models', endpoint), { headers, signal, redirect: 'error' })
        requireValue(check.ok, 'KEV_SERVICE_CHECK_HTTP')
        const listing = await check.json() as any
        const card = Array.isArray(listing?.models) ? listing.models.find((item: any) => item?.name === config.binding.model) : undefined
        requireValue(card && Object.entries(config.serving).every(([key, value]) => card[key] === value)
          && card.truncate_states === false && !card.cuda_graphs, 'KEV_SERVING_IDENTITY_MISMATCH')
        requireValue(capabilityMatches(listing.harness_encoding, config.encoding), 'KEV_ENCODING_SERVICE_MISMATCH')
        signal.throwIfAborted()
        posting = true
        delete request.model_invocation
        const response = await fetch(new URL('/v1/systemone', endpoint), {
          method: 'POST', headers: { ...headers, 'x-typesafe-request-id': request.request_id }, signal, redirect: 'error',
          body: JSON.stringify({ model: config.binding.model, state: input.state, questions: config.questions }),
        })
        responded = true
        request.model_invocation = true
        result.http_status = response.status
        const body = await response.json() as any
        const usage = usageFrom(body?.usage)
        if (usage) request.usage = usage
        requireValue(response.headers.get('x-typesafe-request-id') === request.request_id, 'KEV_REQUEST_ID_MISMATCH')
        const proof = body?.harness_encoding
        const matches = measuredProof(proof, config.encoding, input.state, config.questions, config.binding.model)
        if (matches) result.harness_encoding = structuredClone(proof)
        // 只有本扩展绑定同一输入的明确前置拒绝才能证明没有模型派发；其它HTTP失败保留真实尝试。
        if (response.status === 422 && matches && proof.admitted === false && proof.model_invocation === false
          && proof.rejection === 'KEV_ENCODING_NOT_ADMITTED' && !usage) request.model_invocation = false
        requireValue(response.ok, 'KEV_DECISION_HTTP')
        requireValue(matches && admittedBudget(proof), 'KEV_ENCODING_PROOF_MISMATCH')
        requireValue(body?.model === config.binding.model && body.truncated !== true, 'KEV_INVALID_RESPONSE_MODEL')
        if (object(body.usage)) requireValue(['input_tokens', 'output_tokens'].every(key => !own(body.usage, key)
          || Number.isSafeInteger(body.usage[key]) && body.usage[key] >= 0), 'KEV_INVALID_USAGE')
        result.typed_decision = validateKevAnswers(body?.answers, config.questions)
        request.status = 'completed'
        result.ok = true
      } catch (error) {
        request.status = exec.signal.aborted ? 'cancelled' : 'failed'
        if (!posting) request.model_invocation = false
        else if (!responded) delete request.model_invocation
        result.error_code = error instanceof KevFailure ? error.code : exec.signal.aborted ? 'KEV_CANCELLED'
          : timeout.aborted ? 'KEV_TIMEOUT' : 'KEV_TRANSPORT_OR_JSON_ERROR'
      }
      return result
    },
  })
}
