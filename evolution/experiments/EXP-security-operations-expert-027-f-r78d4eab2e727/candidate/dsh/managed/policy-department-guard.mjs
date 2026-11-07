// 纯函数门禁；固定参考 DSH 687f282e / 0.2.1-rc.2，不注册服务或事件。
import { POLICY_SOURCE_ID, policyResourceIdentity, policyResourceKind } from './policy-resource-identity.mjs';
// 部门与 single 共享已核来源；业务分流仍依精确操作与资源合同，不按 server 推断部门。
export const DEPARTMENT_SOURCE_ID = POLICY_SOURCE_ID;
export const DEPARTMENT_OPERATIONS = Object.freeze([
  'list_policy_departments', 'preview_policy_department_targets',
  'resolve_policy_department_destination', 'preview_policy_department_plan',
  'get_policy_department_plan', 'prepare_policy_department_draft', 'get_policy_department_draft',
  'prepare_policy_department_task', 'get_policy_department_task',
]);
const PREFIX = `mcp__${DEPARTMENT_SOURCE_ID}__`;
export const DEPARTMENT_TOOL_NAMES = Object.freeze(DEPARTMENT_OPERATIONS.map(op => PREFIX + op));
const RESOURCE_NAMES = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']);
const LEGACY_OPS = new Set(['resolve_policy_endpoints', 'choose_ambiguous_policy_endpoints',
  'prepare_policy_configuration', 'select_policy_configuration_candidate']);
const BLOCKED = '部门请求不能创建或恢复旧单点草稿；请由真实用户明确切回单点，再重新只读解析。';
const UNCERTAIN = '会话记录读取异常或恢复不完整，不能证明新的单点解析；请先明确切回单点并重新只读解析。';
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = o => !!o && typeof o === 'object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const fields = (o, allowed, required = []) => object(o)
  && Object.keys(o).every(k => allowed.includes(k) && o[k] !== null && o[k] !== undefined)
  && required.every(k => own(o, k));
const positive = n => Number.isSafeInteger(n) && n > 0;
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const text = (s, max, empty = false) => typeof s === 'string' && s.length <= max
  && (empty || s.trim().length > 0) && !controls.test(s);
const safeId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(s);
const sha256 = s => text(s, 71) && s.length === 71 && /^sha256:[0-9a-fA-F]{64}$/u.test(s);
// 与 PolicyDepartmentDraftJournal 的完整小写 UUID 合同一致，不接受前后缀或编码。
const operationId = s => text(s, 41) && s.length === 41
  && /^pdop-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(s);
const ipv4 = s => typeof s === 'string' && s.split('.').length === 4
  && s.split('.').every(p => /^(0|[1-9]\d{0,2})$/u.test(p) && Number(p) <= 255);
const parse = s => { try { return typeof s === 'string' ? JSON.parse(s) : undefined; } catch { return undefined; } };
const toolArgs = exec => exec?.arguments ?? exec?.args;
const rawName = exec => exec?.name ?? exec?.tool?.name;

export function departmentOperation(name) {
  if (typeof name !== 'string' || !name.startsWith(PREFIX)) return undefined;
  const op = name.slice(PREFIX.length);
  return DEPARTMENT_OPERATIONS.includes(op) ? op : undefined;
}
function resourceName(exec) { return RESOURCE_NAMES.has(rawName(exec)) ? rawName(exec) : undefined; }
export function isDepartmentResource(exec) {
  if (!resourceName(exec)) return false;
  const args = toolArgs(exec);
  // 统一源的目录发现及 single 资源不能建立部门屏障；坏部门 URI 仍归部门拒绝路径。
  return rawName(exec) === 'read_mcp_resource' && object(args)
    && ['plans', 'tasks', 'drafts', 'department-invalid'].includes(policyResourceKind(args.uri));
}
function validTargets(body) {
  if (!fields(body, ['department_id', 'include_descendants', 'selected_asset_ids',
    'address_selections', 'expected_directory_digest'], ['department_id']) || !positive(body.department_id)) return false;
  if (own(body, 'include_descendants') && body.include_descendants !== false) return false;
  if (own(body, 'selected_asset_ids') && (!Array.isArray(body.selected_asset_ids)
    || !Array.from(body.selected_asset_ids).every(positive)
    || new Set(body.selected_asset_ids).size !== body.selected_asset_ids.length)) return false;
  if (own(body, 'address_selections') && (!object(body.address_selections)
    || !Object.entries(body.address_selections).every(([id, ip]) => /^[1-9]\d*$/u.test(id)
      && positive(Number(id)) && String(Number(id)) === id && ipv4(ip)))) return false;
  return !own(body, 'expected_directory_digest') || text(body.expected_directory_digest, 128);
}
function validDepartmentArgs(op, args) {
  if (op === 'list_policy_departments') return fields(args, ['query'])
    && (!own(args, 'query') || text(args.query, 255, true));
  if (op === 'get_policy_department_plan') return fields(args, ['planId'], ['planId']) && safeId(args.planId);
  if (op === 'get_policy_department_draft') return fields(args, ['operationId'], ['operationId']) && operationId(args.operationId);
  if (!fields(args, ['body'], ['body']) || !object(args.body)) return false;
  const b = args.body;
  if (op === 'prepare_policy_department_draft') return fields(b,
    ['request_id', 'plan_id', 'expected_plan_digest'], ['request_id', 'plan_id', 'expected_plan_digest'])
    && text(b.request_id, 128) && text(b.plan_id, 128) && sha256(b.expected_plan_digest);
  if (op === 'preview_policy_department_targets') return validTargets(b);
  if (op === 'resolve_policy_department_destination') return fields(b, ['destination_query'], ['destination_query'])
    && text(b.destination_query, 255);
  if (op !== 'preview_policy_department_plan') return false;
  return fields(b, ['request_id', 'targets', 'expected_snapshot_digest', 'destination_asset_id',
    'destination_ip', 'protocol', 'destination_port', 'device_query'],
  ['request_id', 'targets', 'expected_snapshot_digest', 'destination_asset_id', 'protocol', 'destination_port'])
    && text(b.request_id, 128) && validTargets(b.targets) && text(b.expected_snapshot_digest, 128)
    && positive(b.destination_asset_id) && ['TCP', 'UDP'].includes(b.protocol)
    && Number.isInteger(b.destination_port) && b.destination_port >= 1 && b.destination_port <= 65535
    && (!own(b, 'destination_ip') || ipv4(b.destination_ip))
    && (!own(b, 'device_query') || text(b.device_query, 255));
}
function validResource(name, args) {
  if (name !== 'read_mcp_resource') return fields(args, ['server', 'cursor'], ['server'])
    && args.server === DEPARTMENT_SOURCE_ID && (!own(args, 'cursor') || text(args.cursor, 4096, true));
  return ['plans', 'drafts'].includes(policyResourceIdentity(args)?.kind);
}
function resourceId(args, type) {
  const resource = policyResourceIdentity(args);
  return resource?.kind === type ? resource.id : undefined;
}
function legacyOperation(name) {
  if (typeof name !== 'string') return undefined;
  const match = name.match(/^mcp__policy-configuration__(\w+)$/u);
  return match && LEGACY_OPS.has(match[1]) ? match[1] : undefined;
}
function userText(event) {
  if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user' || !Array.isArray(event.data.content)) return undefined;
  return event.data.content.filter(x => x?.type === 'text' && typeof x.text === 'string').map(x => x.text).join('\n');
}
const isSingle = s => /(?:改为|切换(?:到|为)?|只做|仅做)[\s\S]{0,16}(?:单点|单台)/u.test(s)
  && !/(?:不要|别|不再|不是|并非|不想|不用|无需|不能|不得|拒绝|不改为|不切换)[\s\S]{0,8}(?:切换|改为|单点|单台)/u.test(s);
const groupMention = s => /部门|组织|\bdepartments?\b|\borganizations?\b|\ball\s+(?:hosts|assets|servers)\b|(?:全部|所有|整个|全体|一组|一批)[\s\S]{0,12}(?:主机|资产|服务器|终端)|(?:主机|资产|服务器|终端)(?:集合|列表|清单)/iu.test(s);
const policyIntent = s => /访问|策略|放行|放通|开通|阻断|拒绝|禁止|端口|\b(?:ALLOW|DENY|TCP|UDP)\b/iu.test(s);
const selectionReply = s => /选择|选第|选中|候选|(?:主机|资产|部门)(?:名|名称)|(?:名称|名字)(?:为|是|含)/u.test(s);
const isCollection = s => !selectionReply(s) && groupMention(s) && (policyIntent(s)
  || (!/巡检|威胁|告警|故障|应急|研判/u.test(s) && /目录|成员|主机|资产|组织架构|列表|清单|选项|查看|查询|列出|浏览/u.test(s)));
const changesAction = s => !selectionReply(s)
  && /(?:^|[，。；;\n])\s*(?:请)?(?:(?:把|将)?(?:本次|当前)?(?:策略)?动作)?\s*(?:改为|改成|修改为|调整为|切换为)\s*(?:允许|放行|开通|放通|ALLOW|拒绝|阻断|禁止|DENY)/iu.test(s);
const suspendsDepartment = s => !selectionReply(s)
  && /(?:^|[，。；;\n])\s*(?:请(?:帮我)?|现在|接下来|我要|我想|先)?\s*(?:(?:取消|停止|结束|暂停|终止)(?:本次|当前|这次|这个)?(?:的)?(?:部门|组织)(?:分析|策略分析|访问分析|查询|请求|模式)?|(?:改做|改为|切换到|切换为|开始|转做|转为|只做|仅做)\s*(?:只做|仅做|执行|进行)?\s*(?:巡检|威胁(?:研判|分析)|故障(?:分析|诊断)|应急(?:处置|分析)|告警(?:分析|研判)))/u.test(s);
const resumesDepartment = s => !selectionReply(s)
  && /(?:^|[，。；;\n])\s*(?:请|现在|接下来|我要|我想)?\s*(?:继续|恢复)\s*(?:本次|当前|原来|之前)?(?:的)?(?:部门|组织)(?:分析|策略分析|访问分析|查询|请求|模式)/u.test(s);
function actionOf(s) {
  const deny = /\bDENY\b|拒绝|阻断|禁止|不允许|不放行|不要放行|不准|不开放|不准许|不开通|不放通|(?:不要|别|不得|不应|不能|无需|不用)[\s\S]{0,32}(?:允许|放行|开放|准许|开通|放通|访问)/iu.test(s);
  const allow = /\bALLOW\b|放行|允许|准许|开放|开通|放通/iu.test(s.replace(/不允许|不放行|不要放行|不准许|不开放|不开通|不放通/gu, ''));
  return deny ? (allow ? 'CONFLICT' : 'DENY') : allow ? 'ALLOW' : 'UNKNOWN';
}
const asks = s => /[?？]|(?:能否|是否|可否|能不能|可不可以)|(?:吗|么)\s*[。！!]?$/u.test(s);
const noDraft = s => /只读|(?:仅|只)(?:做|要|需|进行)?(?:查询|查看|分析|预览)|(?:不要|不|别|无需|不用|禁止|不得|不能|不想)[\s\S]{0,16}(?:生成|准备|创建|草稿|写入)/u.test(s);
const explicitDraft = s => !selectionReply(s) && !asks(s) && !noDraft(s)
  && /(?:^|[，。；;\n]|并)\s*(?:请(?:帮我)?|现在|接下来|我要|我想|帮我|就)?\s*(?:生成|准备|创建)[\s\S]{0,12}草稿/u.test(s);
const completeOpening = s => !selectionReply(s) && !asks(s) && !noDraft(s)
  && !/分析|预览|查询|查看|假设|例如|举例|如果/u.test(s) && actionOf(s) === 'ALLOW'
  && /访问|开通|放通/u.test(s) && /(?:TCP|UDP)\s*[:：/\s-]*\d{1,5}\b/iu.test(s);
const independentRequest = s => !selectionReply(s) && !asks(s) && groupMention(s) && policyIntent(s)
  && /新(?:的|一个|一项)[\s\S]{0,12}请求|重新(?:发起|提出)[\s\S]{0,12}请求/u.test(s)
  && !/(?:不要|别|不|无需|不用)[\s\S]{0,8}(?:新|重新)/u.test(s);
const revisesParameters = s => !asks(s) && !/(?:不要|别|不|无需|不用)[\s\S]{0,8}(?:改|换|调整|取消)/u.test(s)
  && /(?:改为|改成|修改|调整|换成|换为|更换)|(?:目的|源|端口|协议|设备|部门|子集|地址)[\s\S]{0,8}(?:改|换|设为|设置为|使用|用|为|是)|(?:TCP|UDP)\s*[:：/\s-]*\d{1,5}\b|端口\s*\d|^(?:请)?(?:取消|停止|算了|不要了)/iu.test(s);
function initial() { return { seen: false, mode: 'legacy', action: 'UNKNOWN', epoch: 0,
  calls: new Map(), resolution: undefined, bound: undefined, uncertain: false, lastUserText: undefined,
  departmentPlan: undefined, draftPermission: false, departmentSent: false, departmentBound: undefined,
  sentDepartmentPlan: undefined, sentDepartmentRequest: undefined, departmentPhase: undefined, newDepartmentRequest: false,
  validatedDepartmentResult: undefined, revokedPlans: new Set(), callIds: new Map() }; }
function clearDepartmentPlan(state) {
  if (state.departmentPlan) state.revokedPlans.add(state.departmentPlan.id);
  state.departmentPlan = undefined;
}
function barrier(state) {
  state.seen = true; state.mode = 'readonly'; state.epoch++;
  state.resolution = undefined; state.bound = undefined; state.calls.clear(); clearDepartmentPlan(state);
  state.validatedDepartmentResult = undefined;
}
function enterDepartment(state) {
  if (state.mode === 'readonly') return;
  const current = state.lastUserText;
  const action = typeof current === 'string' && !state.currentRequestHasLegacy
    && !/单点|单台|单个(?:主机|资产|服务器)/u.test(current) && !selectionReply(current)
    && (policyIntent(current) || changesAction(current)) ? actionOf(current) : 'UNKNOWN';
  barrier(state); state.action = action;
  if (action !== 'ALLOW') state.draftPermission = false;
}
function onLegacyUser(state, s) {
  state.lastUserText = s; state.currentRequestHasLegacy = false;
  if (state.seen && (state.mode !== 'legacy' || state.uncertain) && suspendsDepartment(s)) {
    state.mode = 'suspended'; state.epoch++; state.resolution = undefined; state.bound = undefined; state.calls.clear();
    return;
  }
  if (state.mode === 'suspended' && resumesDepartment(s)) {
    const previous = state.action, current = actionOf(s);
    barrier(state); state.action = current === 'UNKNOWN' ? previous : current; return;
  }
  if (state.mode === 'readonly' && changesAction(s)) {
    barrier(state); state.action = actionOf(s); return;
  }
  if (isSingle(s)) {
    if (state.seen || state.uncertain) {
      state.mode = 'single-pending'; state.epoch++; state.resolution = undefined; state.bound = undefined;
    }
    return;
  }
  // 初始完整只读目标中的“查看候选”不是名称选择；仅提取独立明确的ALLOW目标，绝不授写。
  // 保留全文否定/冲突优先，名称/选择子句和既有会话不能借此恢复动作或旧计划。
  if (!state.seen && noDraft(s) && selectionReply(s) && actionOf(s) === 'ALLOW'
    && s.split(/[，,。；;\n]/u).some(c => !selectionReply(c) && groupMention(c) && /访问/u.test(c)
      && /^\s*(?:(?:本次)?目标(?:是|为)|请)?\s*(?:允许|放行|放通|开通|ALLOW)/iu.test(c)
      && /(?:TCP|UDP)\s*[:：/\s-]*\d{1,5}\b/iu.test(c))) {
    barrier(state); state.action = 'ALLOW'; state.draftPermission = false; return;
  }
  if (state.mode === 'readonly' && selectionReply(s)) return;
  if (isCollection(s)) {
    const wasDept = state.mode === 'readonly';
    const newRequest = !wasDept || (!/选择|选第|选中|候选/u.test(s)
      && /重新(?:发起|提出|分析|处理|开始)|新(?:的|一个|一项)[\s\S]{0,8}(?:请求|部门|组织)|(?:改为|切换)[\s\S]{0,16}(?:请求|访问需求)/u.test(s));
    if (newRequest) { barrier(state); state.action = actionOf(s); }
    else {
      const a = actionOf(s);
      if (a === 'DENY' || a === 'CONFLICT') state.action = a;
      else if (state.action === 'UNKNOWN' && a === 'ALLOW') state.action = a;
    }
    return;
  }
  if (state.mode === 'readonly') {
    const a = actionOf(s);
    if (a === 'DENY' || a === 'CONFLICT') state.action = a;
    else if (a === 'ALLOW' && state.action === 'UNKNOWN') state.action = a;
  }
  if (state.mode === 'single-pending' && /取消|算了|不要了|退出选择|停止/u.test(s)) {
    state.epoch++; state.resolution = undefined;
  }
}
function onUser(state, s) {
  state.validatedDepartmentResult = undefined;
  const epoch = state.epoch, seen = state.seen;
  onLegacyUser(state, s);
  let selectionRestriction = false;
  if (state.mode === 'readonly' && selectionReply(s)) {
    // 名称选择不是动作；但独立动作子句不能被整句 selectionReply 的早退吞掉。
    const actionClauses = s.split(/[，,。；;\n]/u).map(c => c.trim()).filter(c => !selectionReply(c)
      && (changesAction(c) || /^(?:请)?(?:(?:把|将)?(?:本次|当前)?(?:策略)?动作\s*(?:改为|改成|修改为|调整为|切换为)\s*)?(?:不允许|不放行|不要放行|不准)/u.test(c)
        || /^(?:同时)?(?:DENY|拒绝|阻断|禁止)\s*$/iu.test(c)));
    const action = actionOf(actionClauses.join('，'));
    if (action === 'DENY' || action === 'CONFLICT') {
      barrier(state); state.action = action; state.draftPermission = false; selectionRestriction = true;
    }
  }
  const changed = seen && state.mode === 'readonly' && (revisesParameters(s) || selectionReply(s));
  const selectionOnly = changed && !selectionRestriction && selectionReply(s) && !/^(?:请)?(?:取消|停止|退出|不要|算了)/u.test(s);
  if (state.epoch !== epoch || changed) {
    clearDepartmentPlan(state);
    // 必要歧义选择不新增授权，也不撤销已经明确的生成意图；只作废旧计划。
    if (!selectionOnly) state.draftPermission = false;
    // 新参数同时作废尚未返回的旧计划，不能靠迟到回执恢复。
    if (changed && state.epoch === epoch) { state.epoch++; state.calls.clear(); }
  }
  if (independentRequest(s)) {
    // 这里只标记真实独立新请求；仍须新的服务端计划证明业务参数确已改变才释放锁。
    state.newDepartmentRequest = true; state.departmentBound = undefined; state.draftPermission = false;
  } else if ((changed && !selectionOnly) || state.mode === 'suspended' || isSingle(s)) state.newDepartmentRequest = false;
  if (state.mode === 'suspended' || isSingle(s) || noDraft(s) || (changed && !selectionOnly)
    || (/分析|预览|查询|查看/u.test(s) && !explicitDraft(s))
    || asks(s)) state.draftPermission = false;
  if (explicitDraft(s) || completeOpening(s)) state.draftPermission = true;
  if (state.action === 'DENY' || state.action === 'CONFLICT') state.draftPermission = false;
}
function bodyOf(args) {
  if (!object(args)) return undefined;
  const b = args.body;
  return object(b) ? b : parse(b);
}
function stable(o) {
  if (Array.isArray(o)) return `[${o.map(stable).join(',')}]`;
  if (object(o)) return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  return JSON.stringify(o);
}
function matchesPrepare(state, args) {
  const b = bodyOf(args), r = state.resolution;
  return !!r && r.status === 'RESOLVED' && object(b) && b.request_id === r.request
    && b.endpoint_resolution?.candidate_set_digest === r.digest
    && (!r.prepare || stable(b) === stable(r.prepare));
}
function admissible(state, op, args) {
  if (op === 'resolve_policy_endpoints') return state.resolution?.status !== 'SELECTION_REQUIRED';
  if (op === 'choose_ambiguous_policy_endpoints') {
    const b = bodyOf(args), r = state.resolution;
    return !!r && r.status === 'SELECTION_REQUIRED' && b?.request_id === r.request && b?.candidate_set_digest === r.digest;
  }
  return op === 'prepare_policy_configuration' && matchesPrepare(state, args);
}
function resultEnvelope(event, callId, resourceUri) {
  const m = event.data?.message;
  if (m?.source?.kind !== 'tool' || m.source.callId !== callId || m.isError === true
    || event.data?.isError === true || event.isError === true || !Array.isArray(m.content)) return undefined;
  if (m.content.length !== 1) return undefined;
  let content = m.content;
  if (content[0]?.type === 'tool-result') {
    const wrapped = content[0];
    if (wrapped.toolCallId !== callId || wrapped.isError === true || !Array.isArray(wrapped.content)) return undefined;
    content = wrapped.content;
  }
  if (content.length !== 1 || content[0]?.type !== 'text' || typeof content[0].text !== 'string'
    || content[0].isError === true) return undefined;
  let envelope = parse(content[0].text);
  if (resourceUri !== undefined) {
    // 真实 manager.readResource 合同：唯一 contents，URI 原样回绑 call，text 为 HTTP 原文。
    if (!object(envelope) || envelope.isError === true || !Array.isArray(envelope.contents)
      || envelope.contents.length !== 1) return undefined;
    const item = envelope.contents[0];
    if (!object(item) || item.uri !== resourceUri || item.isError === true || typeof item.text !== 'string') return undefined;
    envelope = parse(item.text);
  }
  return object(envelope) && envelope.isError !== true && envelope.code === '200' && object(envelope.data) ? envelope.data : undefined;
}
const orderedIds = ids => Array.isArray(ids) && ids.length > 0
  && Array.from(ids).every((id, i) => positive(id) && (i === 0 || id > ids[i - 1]));
function validPlan(data) {
  const p = data?.preparation;
  if (!object(data) || data.schema_version !== 'policy-department-plan/v1'
    || data.read_only !== true || data.execution_allowed !== false || data.ready_for_draft !== true
    || !text(data.plan_id, 128) || !sha256(data.plan_digest) || !text(data.request_id, 128)
    || !object(p) || p.status !== 'READY_FOR_DRAFT' || p.ready_for_draft !== true
    || !orderedIds(p.asset_ids) || p.count !== p.asset_ids.length || !text(p.device_id, 128)
    || !Array.isArray(p.excluded) || !Array.isArray(data.items)) return false;
  // 只核对服务端声明的合格子集，不要求所有 items 通过，也不要求总体 READY。
  const eligible = data.items.filter(i => object(i) && i.selected === true && i.status === 'ANALYZED'
    && object(i.rule) && Object.keys(i.rule).length > 0 && text(i.device_id, 128));
  return eligible.length === p.count && eligible.every(i => i.device_id === p.device_id && positive(i.asset_id))
    && stable(eligible.map(i => i.asset_id).sort((a, b) => a - b)) === stable(p.asset_ids);
}
function planBusinessKey(data) {
  // 不比较 request_id/plan_id/digest/时间/说明文字：仅换号或重新预览相同规则不是新业务。
  return stable({ protocol: data.protocol, port: data.destination_port,
    destination: data.destination?.asset_id, destinationIp: data.destination?.selected_ip,
    device: data.preparation.device_id, assetIds: data.preparation.asset_ids,
    sources: data.items.filter(i => data.preparation.asset_ids.includes(i.asset_id))
      .map(i => ({ asset: i.asset_id, ip: i.source_ip })).sort((a, b) => a.asset - b.asset) });
}
function mayPrepareDepartment(state, args) {
  const p = state.departmentPlan, b = args?.body;
  return state.mode === 'readonly' && !state.uncertain && state.action === 'ALLOW'
    && state.draftPermission && !state.departmentSent && !!p && p.epoch === state.epoch
    && b?.plan_id === p.id && b.expected_plan_digest === p.digest
    && (!state.sentDepartmentRequest || b.request_id !== state.sentDepartmentRequest);
}
function validDraftPhase(data, plan) {
  if (data.phase === 'DRAFT_READY') {
    const b = data.binding;
    return positive(data.task_id) && object(b) && b.task_id === data.task_id && b.task_status === 'DRAFT'
      && b.execution_allowed === false && b.task_precheck_status === 'NOT_RUN'
      && b.device_count === 1 && positive(b.change_count) && b.change_count === plan.assetIds.length;
  }
  if (data.phase === 'FAILED' || data.phase === 'CANCELLED') return data.task_id === null;
  return true;
}
function validDraft(data, plan) {
  return object(data) && data.schema_version === 'policy-department-draft/v1' && operationId(data.operation_id)
    && ['ACCEPTED', 'PREPARING', 'UNKNOWN', 'DRAFT_READY', 'FAILED', 'CANCELLED'].includes(data.phase)
    && (data.task_id === null || positive(data.task_id)) && validDraftPhase(data, plan) && data.execution_allowed === false
    && data.task_precheck_status === 'NOT_RUN' && data.coverage === 'NOT_ASSESSED'
    && data.coverage_assessment === 'NOT_ASSESSED' && data.scope_evidence === 'UNVERIFIED'
    && data.direction_evidence === 'UNVERIFIED' && data.current_policy_evidence === 'UNVERIFIED'
    && data.task_status_fresh === false && Array.isArray(data.excluded)
    && stable(data.included_asset_ids) === stable(plan.assetIds);
}
function departmentCall(state, d, op, args, name, ownPendingWrite = false) {
  if (state.mode !== 'readonly') enterDepartment(state);
  else { state.seen = true; state.resolution = undefined; state.bound = undefined; }
  const resource = name === 'read_mcp_resource' && validResource(name, args);
  const planId = resource ? resourceId(args, 'plans') : undefined;
  const draftId = resource ? resourceId(args, 'drafts') : undefined;
  const valid = op ? validDepartmentArgs(op, args) : resource;
  const prepare = op === 'prepare_policy_department_draft';
  // 仅临时授权视图豁免已证明的自身写效应；正式投影仍保留sent和prepare结果配对。
  if (prepare && ownPendingWrite) return;
  const canPrepare = prepare && valid && mayPrepareDepartment(state, args);
  // 只要真实日志中出现 prepare 调用就永久记为已发；错误参数/错误回执同样不能换号重写。
  if (prepare) {
    if (!state.departmentSent) {
      state.sentDepartmentPlan = state.departmentPlan;
      state.sentDepartmentRequest = args?.body?.request_id;
      state.departmentPhase = undefined;
    }
    state.departmentSent = true; state.newDepartmentRequest = false;
  }
  if (!valid || typeof d.callId !== 'string' || !d.callId) return;
  if (op === 'preview_policy_department_plan' || op === 'get_policy_department_plan' || planId) {
    if (state.action !== 'ALLOW' || state.uncertain) return;
    // 新的预览/回读失败不能继续沿用先前计划。
    state.departmentPlan = undefined;
    state.calls.set(d.callId, { department: true, op: 'plan', epoch: state.epoch,
      expectedId: planId ?? (op === 'get_policy_department_plan' ? args.planId : undefined),
      expectedRequest: op === 'preview_policy_department_plan' ? args.body.request_id : undefined,
      resourceUri: planId ? args.uri : undefined });
  } else if (canPrepare) {
    state.calls.set(d.callId, { department: true, op: 'prepare', epoch: state.epoch,
      request: args.body.request_id, plan: state.departmentPlan });
  } else if (op === 'get_policy_department_draft' || draftId) {
    // GET 从来不能建立新的操作绑定，只有已配对 prepare 回执可以。
    const id = draftId ?? args.operationId;
    if (id !== state.departmentBound?.id) return;
    state.calls.set(d.callId, { department: true, op: 'draft', epoch: state.epoch,
      knownId: id, plan: state.departmentBound.plan, resourceUri: draftId ? args.uri : undefined });
  }
}
function fold(state, event, normalize = name => name, ownPendingWrite = false) {
  if (Number.isInteger(event?.seq)) {
    if ((state.lastSeq === undefined && event.seq > 1)
      || (state.lastSeq !== undefined && event.seq !== state.lastSeq + 1)) state.uncertain = true;
    state.lastSeq = event.seq;
  }
  const s = userText(event);
  if (s !== undefined) { onUser(state, s); return; }
  if (event?.type === 'tool/call') {
    state.validatedDepartmentResult = undefined;
    const d = event.data;
    if (!d || typeof d.name !== 'string') return;
    const args = parse(d.arguments);
    let name;
    try { name = normalize(d.name); } catch { state.uncertain = true; return; }
    if ((!name || name === '__unbound_mcp_tool__') && d.name.startsWith('mcp__')) {
      if (DEPARTMENT_OPERATIONS.some(op => d.name.endsWith(`__${op}`))) {
        if (d.name.endsWith('__prepare_policy_department_draft')) {
          if (!state.departmentSent) state.sentDepartmentPlan = state.departmentPlan;
          state.departmentSent = true; state.newDepartmentRequest = false;
        }
        barrier(state); state.action = 'UNKNOWN';
      }
      if (state.seen) state.uncertain = true;
      return;
    }
    const deptOp = departmentOperation(name);
    const proofCall = ['preview_policy_department_plan', 'get_policy_department_plan',
      'prepare_policy_department_draft', 'get_policy_department_draft'].includes(deptOp) || !!legacyOperation(name)
      || (name === 'read_mcp_resource' && validResource(name, args)
        && (!!resourceId(args, 'plans') || !!resourceId(args, 'drafts')));
    if (typeof d.callId === 'string') {
      if (state.callIds.has(d.callId) && (state.callIds.get(d.callId) || proofCall)) {
        state.uncertain = true; state.calls.delete(d.callId); clearDepartmentPlan(state);
        if (deptOp === 'prepare_policy_department_draft') state.departmentSent = true;
        return;
      }
      // 无证明能力的目录事件仍保持旧 fold 兼容；任何涉及计划/准备的重复编号拒绝。
      state.callIds.set(d.callId, proofCall);
    }
    if (deptOp || isDepartmentResource({ name, args })) {
      departmentCall(state, d, deptOp, args, name, ownPendingWrite); return;
    }
    const op = legacyOperation(name);
    if (!op || typeof d.callId !== 'string') return;
    state.currentRequestHasLegacy = true;
    if (state.mode === 'single-pending' && admissible(state, op, args)
      && (!state.uncertain || op === 'resolve_policy_endpoints')) {
      if (op === 'resolve_policy_endpoints') {
        state.epoch++; state.resolution = undefined; state.calls.clear();
      }
      state.calls.set(d.callId, { op, args, epoch: state.epoch });
    }
    return;
  }
  if (event?.type !== 'tool/result') return;
  // 交付证明只属于本次具体回执；坏回执、重复 result 不能借用前次成功。
  state.validatedDepartmentResult = undefined;
  const id = event.data?.message?.source?.callId;
  const call = state.calls.get(id);
  if (!call) return;
  state.calls.delete(id);
  if (call.epoch !== state.epoch) return;
  const data = resultEnvelope(event, id, call.resourceUri);
  if (!data) return;
  if (call.department) {
    if (call.op === 'draft') {
      const bound = state.departmentBound;
      if (!state.uncertain && bound?.id === call.knownId && data.operation_id === call.knownId
        && validDraft(data, call.plan) && (bound.knownTask === null || data.task_id === bound.knownTask)
        && (state.departmentPhase !== 'DRAFT_READY' || data.phase === 'DRAFT_READY')) {
        bound.knownTask = data.task_id; state.departmentPhase = data.phase;
        state.validatedDepartmentResult = event;
      }
      return;
    }
    if (state.mode !== 'readonly' || state.uncertain || state.action !== 'ALLOW') return;
    if (call.op === 'plan' && validPlan(data) && !state.revokedPlans.has(data.plan_id)
      && (!call.expectedId || call.expectedId === data.plan_id)
      && (!call.expectedRequest || call.expectedRequest === data.request_id)) {
      state.departmentPlan = { id: data.plan_id, digest: data.plan_digest, epoch: state.epoch,
        assetIds: [...data.preparation.asset_ids], businessKey: planBusinessKey(data) };
      if (state.newDepartmentRequest && state.departmentSent && state.sentDepartmentPlan
        && (state.departmentPlan.businessKey !== state.sentDepartmentPlan.businessKey
          || ['DRAFT_READY', 'FAILED'].includes(state.departmentPhase))
        && state.departmentPlan.id !== state.sentDepartmentPlan.id) {
        state.departmentSent = false; state.newDepartmentRequest = false;
      }
    } else if (call.op === 'prepare' && validDraft(data, call.plan)) {
      state.departmentBound = { id: data.operation_id, request: call.request, plan: call.plan, knownTask: data.task_id };
      state.departmentPhase = data.phase; state.validatedDepartmentResult = event;
    }
    return;
  }
  if (state.mode !== 'single-pending') return;
  const b = bodyOf(call.args);
  if (call.op === 'resolve_policy_endpoints' || call.op === 'choose_ambiguous_policy_endpoints') {
    const status = data.resolution_status;
    if (!text(data.request_id, 128) || data.request_id !== b?.request_id || !text(data.candidate_set_digest, 128)
      || !['RESOLVED', 'SELECTION_REQUIRED'].includes(status)) return;
    if (call.op === 'choose_ambiguous_policy_endpoints' && data.candidate_set_digest !== b.candidate_set_digest) return;
    if (status === 'RESOLVED' && (!object(data.prepare_body)
      || data.prepare_body.request_id !== data.request_id
      || data.prepare_body.endpoint_resolution?.candidate_set_digest !== data.candidate_set_digest)) return;
    state.uncertain = false;
    state.resolution = { status, request: data.request_id, digest: data.candidate_set_digest,
      prepare: status === 'RESOLVED' ? data.prepare_body : undefined };
  } else if (call.op === 'prepare_policy_configuration' && matchesPrepare(state, call.args)
    && text(data.operation_id, 128)) {
    state.bound = data.operation_id; state.mode = 'legacy'; state.uncertain = false;
  }
}

// 缓存仅是日志的派生投影；不写事件，结果不依赖调用先后。
const draftProjectionCache = new WeakMap();
const eventKey = e => e?.seq !== undefined ? `${e.seq}:${e.type}:${JSON.stringify(e.data)}` : (e?.id ?? e);
export function blocksLegacyDraft(events, operationId) {
  if (!Array.isArray(events)) return true;
  if (!events.length) return false;
  const first = events[0];
  if (!first || typeof first !== 'object') return true;
  let entry = draftProjectionCache.get(first);
  try {
    if (!entry || events.length < entry.length || eventKey(events[entry.length - 1]) !== entry.last)
      entry = { state: initial(), length: 0 };
    for (let i = entry.length; i < events.length; i++) fold(entry.state, events[i]);
    entry.length = events.length; entry.last = eventKey(events.at(-1));
    draftProjectionCache.set(first, entry);
    const state = entry.state;
    return state.uncertain || (state.seen && !(state.mode === 'legacy' && state.bound === operationId));
  } catch { return true; }
}
/** 仅证明当前会话配对 prepare 已绑定的操作；不发送工具、不创建或确认草稿。 */
export function isDepartmentDraftBound(events, id) {
  if (!Array.isArray(events) || !events.length || !operationId(id)) return false;
  try {
    const state = initial();
    for (const event of events) fold(state, event);
    return !state.uncertain && state.departmentBound?.id === id;
  } catch { return false; }
}
/** 交付时验证当前具体回执，而非仅证明该 operation 曾经绑定。输入须共用 canonical 事件对象。 */
export function isDepartmentDraftResultBound(events, resultEvent) {
  if (!Array.isArray(events) || !resultEvent || resultEvent.type !== 'tool/result'
    || !events.includes(resultEvent)) return false;
  try {
    const state = initial();
    for (const event of events) fold(state, event);
    return !state.uncertain && !!state.departmentBound && state.validatedDepartmentResult === resultEvent;
  } catch { return false; }
}
// Task 门禁复用同一真实用户/动作/epoch/日志完整性投影；不放松任何 SOC Draft 校验。
export const createDepartmentProjection = () => initial();
export const foldDepartmentEvent = (state, event, canonicalName) => fold(state, event, canonicalName);
export const departmentUserSignals = s => ({ selection: selectionReply(s), asks: asks(s),
  readonly: noDraft(s), changed: revisesParameters(s), suspended: suspendsDepartment(s), single: isSingle(s),
  analysis: /分析|预览|查询|查看/u.test(s), explicitDraft: explicitDraft(s), completeOpening: completeOpening(s),
  independent: independentRequest(s) });
export { validDepartmentArgs, resultEnvelope, validResource, resourceId };
export function createDepartmentGuard({ canonicalName = name => name } = {}) {
  const cache = new WeakMap(), pipelines = new WeakMap();
  function stateFor(agent, passive = false) {
    if (!agent || (typeof agent !== 'object' && typeof agent !== 'function')) return { ...initial(), uncertain: true };
    let entry = cache.get(agent);
    if (!entry) { entry = { state: initial(), length: 0, authorizationLength: 0, first: undefined, last: undefined }; cache.set(agent, entry); }
    let events;
    try { events = agent.session.snapshotEvents(); if (!Array.isArray(events)) throw new Error('会话日志不是数组'); }
    catch { entry.state.uncertain = true; return entry.state; }
    try {
      const key = eventKey;
      const appendOnly = events.length >= entry.length && (!entry.length
        || (key(events[0]) === entry.first && key(events[entry.length - 1]) === entry.last));
      if (!appendOnly) {
        const previous = entry.state;
        entry.state = initial(); entry.length = 0;
        if (previous.seen) {
          entry.state.seen = true; entry.state.uncertain = true; entry.state.mode = 'readonly';
          // 截断不是独立新请求；不能遗忘已经发送过 prepare 的事实。
          entry.state.departmentSent = previous.departmentSent;
        }
        try { for (const event of events) fold(entry.state, event, canonicalName); }
        catch { entry.state.uncertain = true; }
      } else {
        try { for (let i = entry.length; i < events.length; i++) fold(entry.state, events[i], canonicalName); }
        catch { entry.state.uncertain = true; }
      }
      entry.events = events;
      entry.length = events.length; entry.first = key(events[0]); entry.last = key(events.at(-1));
      // root在正式decide前调用isActive；被动读仍完整折叠sent，但不认领/消费pipeline身份。
      if (!passive) entry.authorizationLength = events.length;
      return entry.state;
    } catch { entry.state.uncertain = true; return entry.state; }
  }
  function authorizationFor(exec) {
    const agent = exec.agent, previousLength = cache.get(agent)?.authorizationLength ?? 0;
    const state = stateFor(agent), events = cache.get(agent)?.events;
    // 与Taskguard使用同一rc.5公开身份合同；token只能来自registry，不来自日志或模型参数。
    if (!events || state.uncertain || typeof exec.token !== 'symbol' || !text(exec.callId, 128)
      || exec.rootCallId !== exec.callId || exec.parent !== undefined) return state;
    try {
      const matches = events.flatMap((event, index) => event?.type === 'tool/call'
        && event.data?.callId === exec.callId ? [{ event, index }] : []);
      if (matches.length !== 1) return state;
      const { event, index } = matches[0], args = toolArgs(exec);
      if (canonicalName(event.data.name) !== exec.name || stable(parse(event.data.arguments)) !== stable(args)
        || events.some(e => e?.type === 'tool/result' && (e.data?.message?.source?.callId === exec.callId
          || e.data?.message?.content?.some(b => b?.toolCallId === exec.callId)))) return state;
      let bindings = pipelines.get(agent);
      if (!bindings) { bindings = { ids: new Map(), tokens: new Map() }; pipelines.set(agent, bindings); }
      const identity = { token: exec.token, callId: exec.callId, rootCallId: exec.rootCallId,
        name: exec.name, args: stable(args), index, event: JSON.stringify(event) };
      const old = bindings.ids.get(exec.callId), tokenOwner = bindings.tokens.get(exec.token);
      if (old) {
        if (old.token !== exec.token || old.rootCallId !== identity.rootCallId || old.name !== identity.name
          || old.args !== identity.args || old.index !== index || old.event !== identity.event) return state;
      } else {
        // 首见仅最新新增call；主动门禁已观察的历史调用不能事后认领。
        if (index !== events.length - 1 || index < previousLength || tokenOwner) return state;
        bindings.ids.set(exec.callId, identity); bindings.tokens.set(exec.token, identity);
      }
      const authorization = initial();
      // 不删除事件：seq/重复ID/真实用户/其他并发写都照常折叠，只豁免当前自身写效应。
      for (const current of events) fold(authorization, current, canonicalName, current === event);
      return authorization;
    } catch { return state; }
  }
  const nameOf = exec => rawName(exec);
  return {
    isActive(agent) {
      const state = stateFor(agent, true);
      return state.seen && state.mode !== 'suspended'
        && (state.uncertain || state.mode === 'readonly' || state.mode === 'single-pending');
    },
    beginTurn(agent, actualUserText) {
      const state = stateFor(agent);
      // 调用方保证此参数来自真实 user/message，不接受工具参数中的 user/source。
      if (typeof actualUserText === 'string' && state.lastUserText !== actualUserText) onUser(state, actualUserText);
    },
    decide(exec) {
      const op = departmentOperation(nameOf(exec));
      if (!op) return undefined;
      const state = op === 'prepare_policy_department_draft' ? authorizationFor(exec) : stateFor(exec?.agent);
      if (state.mode !== 'readonly') enterDepartment(state);
      const args = toolArgs(exec);
      if (!validDepartmentArgs(op, args)) return '部门工具参数不符合后台1.3合同：请使用对象参数，禁止未知字段、空值及字符串body。';
      if (op === 'preview_policy_department_plan' && state.action !== 'ALLOW')
        return '只读部门计划目前仅支持真实用户明确要求放行；未说明动作、拒绝或冲突请求不能改写为ALLOW。';
      if (op === 'prepare_policy_department_draft') {
        if (state.departmentSent) return '本请求已有prepare调用；结果未知也不能换请求号重发，已知操作号仅可GET查账。';
        if (!mayPrepareDepartment(state, args)) return '必须由真实用户明确要求生成草稿或提出完整开通请求，并绑定本会话成功只读计划的合格单设备子集及原始ID/摘要；只读、改参、取消或不确定记录不能写入。';
      }
      if (op === 'get_policy_department_draft' && (state.uncertain || args.operationId !== state.departmentBound?.id))
        return '部门草稿GET仅限本会话真实prepare成功回执已绑定的操作号，不能猜测或跨会话查询。';
      return undefined;
    },
    guardLegacy(exec) {
      const op = legacyOperation(nameOf(exec));
      if (!op) return undefined;
      const state = stateFor(exec?.agent);
      if (!state.seen && !state.uncertain) return undefined;
      if (state.mode === 'single-pending' && admissible(state, op, toolArgs(exec))
        && (!state.uncertain || op === 'resolve_policy_endpoints')) return undefined;
      if (state.uncertain) return UNCERTAIN;
      if (state.mode !== 'legacy') return BLOCKED;
      if (op === 'select_policy_configuration_candidate') {
        const args = toolArgs(exec);
        if (args?.operationId !== state.bound) return BLOCKED;
      }
      return undefined;
    },
    guardResource(exec) {
      const name = nameOf(exec);
      if (!RESOURCE_NAMES.has(name)) return undefined;
      const args = toolArgs(exec);
      const state = stateFor(exec?.agent), normalized = { name, args };
      // 发现统一源目录不建立部门语义；同源 single 回读也不冒充部门计划。
      if (isDepartmentResource(normalized) && state.mode !== 'readonly') enterDepartment(state);
      if (args?.server === DEPARTMENT_SOURCE_ID) {
        if (name !== 'read_mcp_resource') return validResource(name, args) ? undefined : '统一策略来源目录参数无效。';
        const resource = policyResourceIdentity(args);
        if (!resource) return '策略资源不属于已核统一来源的安全模板。';
        if (resource.kind.startsWith('single-')) return state.uncertain || (state.seen && !['legacy', 'suspended'].includes(state.mode))
          ? '部门模式不能以同源single资源绕过专用计划与当前绑定操作。' : undefined;
      }
      if (!state.seen && !state.uncertain) return undefined;
      if ((state.mode === 'legacy' || state.mode === 'suspended') && !isDepartmentResource(normalized)) return undefined;
      if (!validResource(name, args)) return '部门模式仅允许policy-configuration的目录、模板、安全计划及当前绑定草稿URI，不能访问其他server或底层SOC资源。';
      if (name === 'read_mcp_resource') {
        const id = resourceId(args, 'drafts');
        if (id && (state.uncertain || id !== state.departmentBound?.id)) return '部门草稿资源仅限本会话已绑定的操作号，不能猜测或查询其他操作。';
      }
      return undefined;
    },
  };
}
