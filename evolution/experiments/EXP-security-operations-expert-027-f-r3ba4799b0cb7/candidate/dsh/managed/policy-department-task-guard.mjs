// 本地持久化意图任务的纯事件投影；不创建 SOC Draft，不注册网络/存储/执行能力。
import { createHash } from 'node:crypto';
import { POLICY_SOURCE_ID, policyResourceIdentity, policyResourceKind } from './policy-resource-identity.mjs';
import { createDepartmentProjection, foldDepartmentEvent, departmentUserSignals,
  validDepartmentArgs, validResource, resourceId, resultEnvelope } from './policy-department-guard.mjs';

export const TASK_OPERATIONS = Object.freeze(['prepare_policy_department_task', 'get_policy_department_task']);
export const TASK_TOOL_NAMES = Object.freeze(TASK_OPERATIONS.map(op => `mcp__${POLICY_SOURCE_ID}__${op}`));
const [PREPARE, GET] = TASK_TOOL_NAMES;
const PLAN = `mcp__${POLICY_SOURCE_ID}__preview_policy_department_plan`;
const PLAN_GET = `mcp__${POLICY_SOURCE_ID}__get_policy_department_plan`;
const DRAFT_PREPARE = `mcp__${POLICY_SOURCE_ID}__prepare_policy_department_draft`;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const record = o => !!o && typeof o === 'object' && !Array.isArray(o)
  && [Object.prototype, null].includes(Object.getPrototypeOf(o));
const exact = (o, keys) => record(o) && Object.keys(o).length === keys.length && keys.every(k => own(o, k));
const text = (s, max = 128) => typeof s === 'string' && !!s.trim() && s.length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(s);
const sha = s => typeof s === 'string' && /^sha256:[a-f0-9]{64}$/u.test(s);
const positive = n => Number.isSafeInteger(n) && n > 0;
const ipv4 = s => typeof s === 'string' && s.split('.').length === 4
  && s.split('.').every(p => /^(0|[1-9]\d{0,2})$/u.test(p) && Number(p) <= 255);
const ordered = a => Array.isArray(a) && a.length > 0 && Array.from(a).every((v, i) => positive(v) && (!i || v > a[i - 1]));
const parse = s => { try { return JSON.parse(s); } catch { return undefined; } };
const stable = o => Array.isArray(o) ? `[${o.map(stable).join(',')}]` : record(o)
  ? `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}` : JSON.stringify(o);
export const isDepartmentTaskId = id => typeof id === 'string' && /^pgt-[a-f0-9]{60}$/u.test(id);
export const isDepartmentTaskTool = name => TASK_TOOL_NAMES.includes(name);
export function validDepartmentTaskArgs(name, args) {
  if (name === GET) return exact(args, ['taskId']) && isDepartmentTaskId(args.taskId);
  return name === PREPARE && exact(args, ['body'])
    && exact(args.body, ['request_id', 'plan_id', 'expected_plan_digest'])
    && text(args.body.request_id) && text(args.body.plan_id) && sha(args.body.expected_plan_digest);
}

/** 仅分类；合法性与会话绑定另验，不能凭 URI 外观授权。 */
export function isDepartmentTaskResource(exec) {
  const args = exec?.arguments ?? exec?.args;
  return exec?.name === 'read_mcp_resource' && record(args) && policyResourceKind(args.uri) === 'tasks';
}
function taskResourceId(args) {
  const resource = policyResourceIdentity(args);
  return resource?.kind === 'tasks' ? resource.id : undefined;
}

function validIntent(intent, sourceIp, data) {
  return record(intent) && intent.schema_version === 'workbench-policy-intent/v1'
    && Object.keys(intent).every(k => ['schema_version', 'policy_kind', 'operation', 'action', 'source', 'destination',
      'protocol', 'destination_port', 'target_external_id', 'validity', 'change_reason', 'device_query'].includes(k))
    && intent.policy_kind === 'NETWORK_ACCESS' && intent.operation === 'ADD' && intent.action === 'ALLOW'
    && exact(intent.source, ['selector_type', 'value']) && intent.source.selector_type === 'IP' && intent.source.value === sourceIp
    && exact(intent.destination, ['selector_type', 'value']) && intent.destination.selector_type === 'IP' && ipv4(intent.destination.value)
    && ['TCP', 'UDP'].includes(intent.protocol) && Number.isInteger(intent.destination_port)
    && intent.destination_port >= 1 && intent.destination_port <= 65535
    && (!own(intent, 'target_external_id') || intent.target_external_id === null)
    && (!data || (intent.protocol === data.protocol && intent.destination_port === data.destination_port
      && intent.destination.value === data.destination?.selected_ip
      && (data.deviceQuery === undefined || intent.device_query === data.deviceQuery)));
}
/** 独立于 preparation.ready_for_draft；只接受服务端明确可保存的完整真实策略集合。 */
export function departmentTaskPlan(data) {
  const p = data?.task_preparation;
  if (!record(data) || data.schema_version !== 'policy-department-plan/v1' || data.read_only !== true
    || data.execution_allowed !== false || !text(data.plan_id) || !sha(data.plan_digest) || !text(data.request_id)
    || !record(p) || p.ready_for_task !== true || !ordered(p.asset_ids) || !positive(p.intent_count)
    || p.intent_count !== p.asset_ids.length || !sha(p.intents_digest) || !Array.isArray(data.items)
    || !record(data.destination) || data.destination.status !== 'READY' || !ipv4(data.destination.selected_ip)) return undefined;
  const declared = (o, ip) => Array.isArray(o?.addresses)
    && o.addresses.some(a => record(a) && a.ip === ip && a.supported === true);
  if (!positive(data.destination.asset_id) || !declared(data.destination, data.destination.selected_ip)
    || !['TCP', 'UDP'].includes(data.protocol) || !Number.isInteger(data.destination_port)
    || data.destination_port < 1 || data.destination_port > 65535
    || !text(data.snapshot_digest) || !Array.isArray(data.targets?.members)) return undefined;
  const rows = data.items.filter(i => record(i) && p.asset_ids.includes(i.asset_id));
  if (rows.length !== p.intent_count || new Set(rows.map(i => i.asset_id)).size !== rows.length) return undefined;
  // 即使后台错把共享源地址的一项留在Task子集中，也不能以子集自身唯一掩盖完整快照冲突。
  const sourceCounts = new Map();
  for (const m of data.targets.members) {
    if (!record(m) || !positive(m.asset_id) || m.selected !== true || m.status !== 'READY'
      || !['host', 'server', 'vm'].includes(m.asset_type) || m.deploy_form === 'software' || m.nesting_kind === 2
      || !ipv4(m.selected_ip) || !declared(m, m.selected_ip)) continue;
    sourceCounts.set(m.selected_ip, (sourceCounts.get(m.selected_ip) ?? 0) + 1);
  }
  const preparation = data.preparation;
  const strictDevice = preparation?.device_id;
  const groupReady = preparation?.ready_for_draft === true && text(strictDevice);
  const strictAssets = groupReady && ordered(preparation.asset_ids) ? preparation.asset_ids : [];
  const groupBlockReason = groupReady ? null : preparation?.status === 'MULTI_DEVICE_UNSUPPORTED'
    ? 'MULTI_DEVICE_UNSUPPORTED' : 'STRICT_SUBSET_NOT_READY';
  if (own(p, 'group_block_reason') && p.group_block_reason !== groupBlockReason) return undefined;
  // 与服务端 INVALID_INTENT_CODES 精确一致；不以笼统 INVALID/UNSUPPORTED 后缀误排外部证据阻塞。
  const invalidIntentCodes = new Set(['POLICY_CONFIGURATION_REQUEST_INVALID', 'policy_intent_missing',
    'policy_intent_not_supported_by_v1_authority', 'only_ip_or_cidr_network_access_is_supported']);
  const items = [];
  for (const row of rows) {
    const members = data.targets.members.filter(m => record(m) && m.asset_id === row.asset_id);
    const m = members[0];
    if (members.length !== 1 || row.selected !== true || row.source_status !== 'READY' || !ipv4(row.source_ip)
      || m.selected !== true || m.status !== 'READY' || !['host', 'server', 'vm'].includes(m.asset_type)
      || m.deploy_form === 'software' || m.nesting_kind === 2 || m.selected_ip !== row.source_ip
      || !declared(m, row.source_ip) || row.reason_code === 'SOURCE_ADDRESS_NOT_UNIQUE' || !text(row.status)
      || row.asset_id === data.destination.asset_id || row.source_ip === data.destination.selected_ip
      || sourceCounts.get(row.source_ip) !== 1 || invalidIntentCodes.has(row.reason_code)) return undefined;
    // 完整意图可以本地保存；SOC准备就绪必须来自原strict单设备准备子集，不能借Task放松。
    const analyzed = row.status === 'ANALYZED' && record(row.rule) && Object.keys(row.rule).length > 0 && text(row.device_id);
    const ready = analyzed && strictAssets.includes(row.asset_id) && row.device_id === strictDevice;
    const blockReason = ready ? null : !groupReady && preparation?.status === 'MULTI_DEVICE_UNSUPPORTED'
      ? 'MULTI_DEVICE_UNSUPPORTED' : analyzed ? 'STRICT_SUBSET_NOT_READY' : row.reason_code;
    items.push({ asset_id: row.asset_id, source_ip: row.source_ip, analysisStatus: row.status, ready, blockReason });
  }
  items.sort((a, b) => a.asset_id - b.asset_id);
  if (stable(items.map(i => i.asset_id)) !== stable(p.asset_ids)) return undefined;
  const readyCount = items.filter(i => i.ready).length;
  if (p.ready_count !== readyCount || p.blocked_count !== p.intent_count - readyCount) return undefined;
  return { id: data.plan_id, digest: data.plan_digest, request: data.request_id,
    assetIds: [...p.asset_ids], count: p.intent_count, intentsDigest: p.intents_digest, items,
    protocol: data.protocol, destination_port: data.destination_port, destination: data.destination,
    readyCount, groupBlockReason, snapshotDigest: data.snapshot_digest,
    businessKey: p.intents_digest };
}
function validTask(data, binding) {
  const p = binding.plan;
  if (!record(data) || data.schema_version !== 'policy-department-task/v1' || !isDepartmentTaskId(data.task_id)
    || data.storage_phase !== 'ACCEPTED' || data.persisted !== true || data.execution_allowed !== false
    || data.task_precheck_status !== 'NOT_RUN' || data.soc_task_id !== null
    || (own(data, 'execution') && data.execution !== false)
    || (own(data, 'confirmation_required') && data.confirmation_required !== false)
    || data.request_id !== binding.request || data.plan_id !== p.id || data.plan_digest !== p.digest
    || data.intents_digest !== p.intentsDigest || stable(data.included_asset_ids) !== stable(p.assetIds)
    || (own(data, 'group_block_reason') && data.group_block_reason !== p.groupBlockReason)
    || data.intent_count !== p.count || !Array.isArray(data.excluded) || !Array.isArray(data.items)
    || data.items.length !== p.count || typeof data.result_markdown !== 'string'
    || !data.result_markdown.trim() || data.result_markdown.length > 1000000
    || !Number.isSafeInteger(data.ready_count) || data.ready_count < 0
    || !Number.isSafeInteger(data.blocked_count) || data.blocked_count < 0
    || data.ready_count + data.blocked_count !== p.count) return false;
  const expectedStatus = data.ready_count === p.count ? 'READY_FOR_SOC'
    : data.ready_count === 0 ? 'EXTERNAL_BLOCKED' : 'PARTIALLY_READY';
  if (data.task_status !== expectedStatus) return false;
  const rows = [...data.items].sort((a, b) => (a?.asset_id ?? 0) - (b?.asset_id ?? 0));
  let ready = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], frozen = p.items[index];
    if (!record(row) || row.asset_id !== frozen.asset_id || row.source_ip !== frozen.source_ip
      || !validIntent(row.intent, frozen.source_ip, p) || row.analysis_status !== frozen.analysisStatus
      || row.ready_for_soc !== frozen.ready
      || (own(row, 'block_reason') && row.block_reason !== frozen.blockReason)
      || (own(row, 'execution_allowed') && row.execution_allowed !== false)
      || (own(row, 'soc_task_id') && row.soc_task_id !== null)) return false;
    if (row.ready_for_soc === true) ready++;
  }
  // 与后端 StrategyJson 的递归按键排序规范化一致；不能只相信回执自报 intents_digest。
  const digest = `sha256:${createHash('sha256').update(stable(rows.map(row => row.intent)), 'utf8').digest('hex')}`;
  return ready === data.ready_count && digest === p.intentsDigest;
}
/** 供受信 Runtime 复用的纯结果核验；不建立模型工具日志绑定、不产生写入授权。 */
export function validateDepartmentTaskResult(data, plan, request) {
  if (!plan || !text(request)) return false;
  try { return validTask(data, { plan, request }); } catch { return false; }
}
const taskNoWrite = s => /只读|(?:仅|只)(?:做|要|需|进行)?(?:查询|查看|分析|预览)|(?:不要|不|别|无需|不用|禁止|不得|不能|不想)[\s\S]{0,20}(?:生成|准备|创建|保存|持久化|写入|任务|草稿)/u.test(s);
const explicitTask = s => !departmentUserSignals(s).selection && !departmentUserSignals(s).asks && !taskNoWrite(s)
  && !/假设|例如|示例|举例|如果|引用|转述|解释|说明|讲解|如何|怎么|这(?:句|段)(?:话|指令)|模板/u.test(s)
  // 范围修订不是选择许可；只按本条真实用户明确肯定的创建/保存命令重新授予Task许可。
  && /(?:^|[，,。；;\n]|并)\s*(?:请(?:帮我)?|现在|接下来|我要|我想|帮我|就)?\s*(?:(?:(?:仅|只)?为|给|针对)[^，,。；;\n！？?]{1,80}?)?(?:继续)?(?:生成|准备|创建|保存|持久化)[\s\S]{0,16}(?:任务|策略意图)/u.test(s);
function initial() {
  return { semantic: createDepartmentProjection(), permission: false, plan: undefined, calls: new Map(),
    callIds: new Set(), usedRequests: new Set(), sent: undefined, bound: undefined, validResult: undefined, uncertain: false,
    newRequest: false, revoked: new Set() };
}
function revoke(state) { if (state.plan) state.revoked.add(state.plan.id); state.plan = undefined; }
function modeReady(state) {
  return !state.uncertain && !state.semantic.uncertain && state.semantic.mode === 'readonly' && state.semantic.action === 'ALLOW';
}
function mayPrepare(state, args) {
  return modeReady(state) && state.permission && !state.sent && !!state.plan
    && state.plan.epoch === state.semantic.epoch && args.body.plan_id === state.plan.id
    && args.body.expected_plan_digest === state.plan.digest && !state.usedRequests.has(args.body.request_id);
}
function fold(state, event, normalize = name => name, ownPendingWrite = false) {
  state.validResult = undefined;
  const previousEpoch = state.semantic.epoch, previousPermission = state.permission;
  // 对真实用户、部门屏障及日志完整性只使用旧门禁同一纯投影。
  foldDepartmentEvent(state.semantic, event, normalize);
  if (state.semantic.epoch !== previousEpoch) {
    revoke(state); state.calls.clear();
    if (event?.type === 'user/message') state.permission = false;
  }
  if (event?.type === 'user/message' && event.data?.source?.kind === 'user' && Array.isArray(event.data.content)) {
    const s = event.data.content.filter(i => i?.type === 'text' && typeof i.text === 'string').map(i => i.text).join('\n');
    const signals = departmentUserSignals(s);
    const cancelled = /^(?:请)?(?:取消|停止|退出|算了|不要了|不要选择)/u.test(s.trim());
    if (signals.independent) state.newRequest = true;
    else if ((!signals.selection && signals.changed) || signals.suspended || signals.single) state.newRequest = false;
    if (signals.selection) state.permission = previousPermission;
    if (taskNoWrite(s) || signals.asks || signals.suspended || signals.single
      || (!signals.selection && (signals.changed || signals.analysis))) state.permission = false;
    // 只按本条真实用户的新授权授予；保留的旧 draftPermission 不能复活被撤销的 Task 权限。
    if (signals.completeOpening || signals.explicitDraft || explicitTask(s)) state.permission = true;
    // 否定与动作冲突优先；动态部门名尚未触发部门调用时可暂存授权，prepare仍要求明确ALLOW。
    if (taskNoWrite(s) || signals.asks || cancelled || ['DENY', 'CONFLICT'].includes(state.semantic.action)
      || state.semantic.mode === 'suspended' || signals.single) { state.permission = false; state.newRequest = false; }
    return;
  }
  if (event?.type === 'tool/call') {
    const d = event.data, args = parse(d?.arguments);
    let name;
    try { name = normalize(d?.name); } catch { state.uncertain = true; return; }
    const resemblesPrepare = typeof d?.name === 'string' && [PREPARE, DRAFT_PREPARE].some(n => d.name.endsWith(n.slice(n.lastIndexOf('__'))));
    if (name === '__unbound_mcp_tool__' && resemblesPrepare) {
      state.sent ??= { kind: 'unknown', plan: state.plan }; state.uncertain = true; return;
    }
    const resource = name === 'read_mcp_resource' && validResource(name, args);
    const planId = resource ? resourceId(args, 'plans') : undefined;
    const taskId = name === 'read_mcp_resource' ? taskResourceId(args) : undefined;
    const isPlan = name === PLAN || name === PLAN_GET || !!planId;
    const relevant = isPlan || isDepartmentTaskTool(name) || !!taskId || name === DRAFT_PREPARE;
    const duplicate = typeof d?.callId === 'string' && state.callIds.has(d.callId);
    if (typeof d?.callId === 'string') state.callIds.add(d.callId);
    if (!relevant) { if (duplicate) state.uncertain = true; return; }
    if (typeof d?.callId !== 'string' || !d.callId || duplicate) {
      state.uncertain = true; revoke(state); return;
    }
    // 仅授权视图略过已绑定当前pipeline的写入效应；seq、重复ID和旧部门语义仍照常折叠。
    // 正式投影从不传此标记，sent/结果配对/GET绑定不变。
    if (ownPendingWrite && [PREPARE, DRAFT_PREPARE].includes(name)) return;
    if (isPlan) {
      const previousPlan = state.plan;
      state.plan = undefined;
      if (!resource && !validDepartmentArgs(name === PLAN ? 'preview_policy_department_plan' : 'get_policy_department_plan', args)) return;
      const expectedId = planId ?? (name === PLAN_GET ? args.planId : undefined);
      // GET 是回读本会话当前计划，不接受外来/用户粘贴计划号建立新的 Task 准备许可。
      if (expectedId && (!previousPlan || previousPlan.id !== expectedId || previousPlan.epoch !== state.semantic.epoch)) return;
      if (modeReady(state)) state.calls.set(d.callId, { kind: 'plan', epoch: state.semantic.epoch,
        expectedId, expectedDigest: expectedId ? previousPlan.digest : undefined,
        expectedDevice: expectedId ? previousPlan.deviceQuery : undefined,
        expectedRequest: name === PLAN ? args.body.request_id : undefined,
        expectedBody: name === PLAN ? args.body : undefined, resourceUri: planId ? args.uri : undefined });
    } else if (name === PREPARE) {
      const admissible = validDepartmentTaskArgs(name, args) && mayPrepare(state, args);
      if (text(args?.body?.request_id)) state.usedRequests.add(args.body.request_id);
      const oldSent = state.sent;
      if (oldSent) { oldSent.known = false; state.uncertain = true; return; }
      state.sent ??= { kind: 'task', plan: state.plan, request: args?.body?.request_id, known: false };
      state.newRequest = false;
      if (admissible && !oldSent) state.calls.set(d.callId, { kind: 'prepare', epoch: state.semantic.epoch,
        plan: state.plan, request: args.body.request_id });
    } else if (name === DRAFT_PREPARE) {
      if (text(args?.body?.request_id)) state.usedRequests.add(args.body.request_id);
      if (state.sent) { state.sent.known = false; state.uncertain = true; return; }
      state.sent ??= { kind: 'draft', plan: state.plan, request: args?.body?.request_id, known: false };
      state.newRequest = false;
    } else if (name === GET || taskId) {
      const id = taskId ?? args?.taskId;
      if ((!taskId && !validDepartmentTaskArgs(name, args)) || id !== state.bound?.id || !modeReady(state)) return;
      state.calls.set(d.callId, { kind: 'get', epoch: state.semantic.epoch, binding: state.bound,
        resourceUri: taskId ? args.uri : undefined });
    }
    return;
  }
  if (event?.type !== 'tool/result') return;
  const id = event.data?.message?.source?.callId;
  const call = state.calls.get(id);
  if (!call) return;
  state.calls.delete(id);
  if (!modeReady(state) || call.epoch !== state.semantic.epoch) return;
  const data = resultEnvelope(event, id, call.resourceUri);
  if (!data) return;
  if (call.kind === 'plan') {
    const p = departmentTaskPlan(data);
    if (!p || state.revoked.has(p.id) || (call.expectedId && call.expectedId !== p.id)
      || (call.expectedDigest && call.expectedDigest !== p.digest)
      || (call.expectedRequest && call.expectedRequest !== p.request)) return;
    const b = call.expectedBody;
    if (b && (p.protocol !== b.protocol || p.destination_port !== b.destination_port
      || p.destination.asset_id !== b.destination_asset_id || p.snapshotDigest !== b.expected_snapshot_digest
      || (own(b, 'destination_ip') && p.destination.selected_ip !== b.destination_ip))) return;
    // 设备原话来自当前真实计划调用；计划GET不能遗忘约束，Task每项原意图必须同值。
    // 不要求后端计划声明新字段，仍由原 intents_digest 绑定完整意图集合。
    state.plan = { ...p, epoch: state.semantic.epoch,
      deviceQuery: b ? b.device_query : call.expectedDevice };
    const sent = state.sent;
    // 未知写入不能靠换计划或换 Draft/Task 绕锁；明确新请求且已知旧结果才允许新计划。
    if (sent && state.newRequest && sent.known && sent.plan && p.id !== sent.plan.id) {
      state.sent = undefined; state.newRequest = false;
    }
  } else {
    const binding = call.kind === 'prepare' ? { plan: call.plan, request: call.request } : call.binding;
    if (!validTask(data, binding) || (call.kind === 'get' && data.task_id !== binding.id)) return;
    state.bound = { ...binding, id: data.task_id };
    if (state.sent?.kind === 'task') state.sent.known = true;
    state.validResult = event;
  }
}
function projection(events, normalize, ownPendingEvent) {
  const state = initial();
  for (const event of events) {
    fold(state, event, normalize, event === ownPendingEvent);
    if (state.sent?.kind === 'draft' && state.semantic.departmentBound
      && ['DRAFT_READY', 'FAILED', 'CANCELLED'].includes(state.semantic.departmentPhase)) state.sent.known = true;
  }
  return state;
}
/** 只消费 canonical 事件，且必须是数组内同一对象的当次回执；历史绑定不能代替本次证明。 */
export function isDepartmentTaskResultBound(events, resultEvent) {
  if (!Array.isArray(events) || !resultEvent || resultEvent.type !== 'tool/result' || !events.includes(resultEvent)) return false;
  try {
    const state = projection(events);
    return modeReady(state) && !!state.bound && state.validResult === resultEvent;
  } catch { return false; }
}
export function createDepartmentTaskGuard({ canonicalName = name => name } = {}) {
  const cache = new WeakMap(), pipelines = new WeakMap();
  const key = e => e && JSON.stringify(e);
  function stateFor(agent) {
    let previous = cache.get(agent), events;
    try { events = agent.session.snapshotEvents(); if (!Array.isArray(events)) throw new Error('无会话日志'); }
    catch { return { ...initial(), uncertain: true }; }
    const appendOnly = previous && events.length >= previous.length && (!previous.length
      || (key(events[0]) === previous.first && key(events[previous.length - 1]) === previous.last));
    let state = appendOnly ? previous.state : initial();
    if (previous && !appendOnly) { state.uncertain = true; state.sent = previous.state.sent; }
    try {
      for (let i = appendOnly ? previous.length : 0; i < events.length; i++) {
        fold(state, events[i], canonicalName);
        if (state.sent?.kind === 'draft' && state.semantic.departmentBound
          && ['DRAFT_READY', 'FAILED', 'CANCELLED'].includes(state.semantic.departmentPhase)) state.sent.known = true;
      }
    } catch { state.uncertain = true; }
    cache.set(agent, { state, events, length: events.length, first: key(events[0]), last: key(events.at(-1)) });
    return state;
  }
  function authorizationFor(exec) {
    const agent = exec.agent, previousLength = cache.get(agent)?.length ?? 0;
    const state = stateFor(agent), events = cache.get(agent)?.events;
    // rc.5 registry-owned token只活在当前pipeline，不来自持久日志/模型参数。
    // 无公开身份只保留原投影，绝不能据工具名、参数或后缀豁免sent。
    if (!events || state.uncertain || typeof exec.token !== 'symbol' || !text(exec.callId)
      || exec.rootCallId !== exec.callId || exec.parent !== undefined) return state;
    try {
      const matches = events.flatMap((event, index) => event?.type === 'tool/call'
        && event.data?.callId === exec.callId ? [{ event, index }] : []);
      if (matches.length !== 1) return state;
      const { event, index } = matches[0], args = exec.arguments ?? exec.args;
      if (canonicalName(event.data.name) !== exec.name || stable(parse(event.data.arguments)) !== stable(args)
        || events.some(e => e?.type === 'tool/result' && (e.data?.message?.source?.callId === exec.callId
          || e.data?.message?.content?.some(b => b?.toolCallId === exec.callId)))) return state;
      let bindings = pipelines.get(agent);
      if (!bindings) { bindings = { ids: new Map(), tokens: new Map() }; pipelines.set(agent, bindings); }
      const identity = { token: exec.token, callId: exec.callId, rootCallId: exec.rootCallId,
        name: exec.name, args: stable(args), index, event: key(event) };
      const old = bindings.ids.get(exec.callId), tokenOwner = bindings.tokens.get(exec.token);
      if (old) {
        if (old.token !== exec.token || old.rootCallId !== identity.rootCallId || old.name !== identity.name
          || old.args !== identity.args || old.index !== index || old.event !== identity.event) return state;
      } else {
        // 首见必须是此次新增的末尾call；已折叠历史调用不能事后认领为当前调用。
        // 真实scheduler先append当前call再进入registry；并发/重放须有各自的call记录。
        if (index !== events.length - 1 || index < previousLength || tokenOwner) return state;
        bindings.ids.set(exec.callId, identity); bindings.tokens.set(exec.token, identity);
      }
      // 只略过一个已经证明的自身写入；历史或并发Task/Draft仍完整投影并持有sent锁。
      return projection(events, canonicalName, event);
    } catch { return state; }
  }
  return {
    decide(exec) {
      if (!isDepartmentTaskTool(exec?.name)) return undefined;
      const state = exec.name === PREPARE ? authorizationFor(exec) : stateFor(exec.agent), args = exec.arguments ?? exec.args;
      if (!validDepartmentTaskArgs(exec.name, args)) return '本地部门Task参数不符合冻结合同：仅对象三引用body或真实taskId，禁止未知字段。';
      if (exec.name === PREPARE) {
        if (state.sent) return '本请求已有Task或Draft准备调用；未知写入不得换号、换计划或跨协议重发，已知ID仅GET查账。';
        if (!mayPrepare(state, args)) return '本地Task必须有真实用户明确保存意图及当前完整task_preparation计划原ID/摘要；只读、改参、旧计划或不确定日志不能写入。';
      } else if (!modeReady(state) || args.taskId !== state.bound?.id) return 'Task GET仅限本会话真实prepare成功回执绑定的taskId。';
      return undefined;
    },
    guardDraft(exec) {
      if (exec?.name !== DRAFT_PREPARE) return undefined;
      const state = authorizationFor(exec);
      return state.sent?.kind === 'task' || state.sent?.kind === 'unknown'
        || state.usedRequests.has((exec.arguments ?? exec.args)?.body?.request_id)
        ? '本请求已有本地Task或同request写入；不得切换Draft绕过幂等锁，已知ID仅GET查账。' : undefined;
    },
    guardResource(exec) {
      if (!isDepartmentTaskResource(exec)) return undefined;
      const state = stateFor(exec.agent), id = taskResourceId(exec.arguments ?? exec.args);
      return !id || !modeReady(state) || id !== state.bound?.id
        ? 'Task资源仅允许本会话真实prepare绑定的原始任务URI；不得猜测、跨会话或改写路径。' : undefined;
    },
  };
}
