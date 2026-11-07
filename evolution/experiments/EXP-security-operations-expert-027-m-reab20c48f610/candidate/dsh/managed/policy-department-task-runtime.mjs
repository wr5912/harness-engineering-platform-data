import { createHash, randomUUID } from 'node:crypto';
import { departmentTaskPlan } from './policy-department-task-guard.mjs';

export const name = 'policy-department-task-runtime';
export const inject = ['tools', 'sessionPersistence'];
export const TOOL_NAME = 'create_department_policy_task';
// 受信任部署配置，不是模型 HTTP 工具；用户/模型不能提供 URL、方法或路径。
export const BACKEND_BASE_URL = 'http://127.0.0.1:26113';
const ROOT = '/api/v1/policy-departments';
const STATE_SOURCE = 'policy-department-task-runtime';
const STATE_FORM = 'state';
const JOURNAL_VERSION = 'policy-department-task-runtime-journal/v1';
const UNKNOWN = '本地策略任务保存结果未知，请勿重复创建；当前没有可用于查询的已核实任务ID，请保留请求号待核查。';
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const taskId = x => typeof x === 'string' && /^pgt-[a-f0-9]{60}$/u.test(x);
const sha = x => typeof x === 'string' && /^sha256:[a-f0-9]{64}$/u.test(x);
const stable = x => Array.isArray(x) ? `[${x.map(stable).join(',')}]` : obj(x)
  ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}` : JSON.stringify(x);
const digest = x => `sha256:${createHash('sha256').update(stable(x)).digest('hex')}`;
const ipv4 = x => typeof x === 'string' && x.split('.').length === 4
  && x.split('.').every(p => /^(0|[1-9]\d{0,2})$/u.test(p) && Number(p) <= 255);
const text = x => typeof x === 'string' && x.length > 0 && !/[\u0000-\u001f\u007f-\u009f]/u.test(x);
const completeSourceMember = m => obj(m) && positive(m.asset_id) && m.selected === true && m.status === 'READY'
  && ['host', 'server', 'vm'].includes(m.asset_type) && m.deploy_form !== 'software' && m.nesting_kind !== 2
  && ipv4(m.selected_ip) && Array.isArray(m.addresses)
  && m.addresses.some(a => a?.ip === m.selected_ip && a.supported === true);

export function taskRequestId(sessionId, userMessageId) {
  if (!text(sessionId) || !text(userMessageId)) throw new Error('missing real session/message identity');
  return `pdtr-${createHash('sha256').update(JSON.stringify([sessionId, userMessageId])).digest('hex')}`;
}

/** 严格整句匹配；引用、工具内容、假设、只读、取消和其他自然语言不抢路由。 */
export function parseTaskCommand(message) {
  if (message?.role !== 'user' || message?.source?.kind !== 'user' || !text(message.id)
    || !Array.isArray(message.content) || message.content.length !== 1 || message.content[0]?.type !== 'text') return null;
  const s = message.content[0].text;
  if (typeof s !== 'string') return null;
  const match = s.match(/^为部门“([^“”\r\n]{1,255})”创建策略任务，允许访问((?:\d{1,3}\.){3}\d{1,3}) (TCP|UDP)(\d{1,5})，不执行[。]?$/u);
  if (!match || match[0] !== s) return null;
  const [, department, destination, protocol, portText] = match;
  const port = Number(portText);
  // 不把受支持句式扩展到其他动作/协议；名字仍必须由实时目录唯一匹配。
  if (department !== department.trim() || !text(department) || !ipv4(destination) || port < 1 || port > 65535) return null;
  return { department, destination, protocol, port };
}

function safeMarkdown(value) {
  return typeof value?.result_markdown === 'string' && value.result_markdown.trim() ? value.result_markdown : null;
}
function clarification(reason, data) {
  const backend = safeMarkdown(data);
  return `${reason}\n未创建本地策略任务，也未创建SOC草稿或执行。${backend ? `\n\n${backend}` : ''}`;
}

/** 仅以下高层 GET/POST 可达；不跟随重定向、不接收模型 URL、不访问 SOC/审批/执行。 */
export function createBackendIO({ backendBaseUrl = BACKEND_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
  if (backendBaseUrl !== BACKEND_BASE_URL) throw new Error('untrusted backendBaseUrl');
  async function request(method, path, body, signal) {
    const allowed = method === 'GET'
      ? path.startsWith(`${ROOT}?query=`) && /^\/api\/v1\/policy-departments\?query=[^&?#]*$/u.test(path)
        || new RegExp(`^${ROOT}/tasks/pgt-[a-f0-9]{60}$`, 'u').test(path)
      : method === 'POST' && [`${ROOT}/preview`, `${ROOT}/plans/destination-resolution`, `${ROOT}/plans/preview`, `${ROOT}/tasks/prepare`].includes(path);
    if (!allowed) throw new Error('runtime path/method denied');
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(120000);
    const response = await fetchImpl(`${backendBaseUrl}${path}`, {
      method, redirect: 'error', headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const value = await response.json().catch(() => null);
    if (!response.ok || String(value?.code) !== '200' || !obj(value.data)) {
      const error = new Error(`backend returned ${response.status}`);
      error.httpStatus = response.status;
      if (taskId(value?.data?.task_id)) error.taskId = value.data.task_id;
      throw error;
    }
    return value.data;
  }
  return {
    list: (query, signal) => request('GET', `${ROOT}?query=${encodeURIComponent(query)}`, undefined, signal),
    targets: (body, signal) => request('POST', `${ROOT}/preview`, body, signal),
    destination: (query, signal) => request('POST', `${ROOT}/plans/destination-resolution`, { destination_query: query }, signal),
    plan: (body, signal) => request('POST', `${ROOT}/plans/preview`, body, signal),
    prepare: (body, signal) => request('POST', `${ROOT}/tasks/prepare`, body, signal),
    get: (id, signal) => request('GET', `${ROOT}/tasks/${id}`, undefined, signal),
  };
}

function checkTask(value, state) {
  const p = state.plan;
  if (!obj(value) || !p || value.schema_version !== 'policy-department-task/v1' || !taskId(value.task_id)
    || value.task_id !== state.taskId || value.storage_phase !== 'ACCEPTED' || value.persisted !== true
    || value.execution_allowed !== false || value.task_precheck_status !== 'NOT_RUN' || value.soc_task_id !== null
    || (Object.hasOwn(value, 'execution') && value.execution !== false)
    || (Object.hasOwn(value, 'confirmation_required') && value.confirmation_required !== false)
    || value.request_id !== state.requestId || value.plan_id !== p.id || value.plan_digest !== p.digest
    || value.intents_digest !== p.intentsDigest || stable(value.included_asset_ids) !== stable(p.assetIds)
    || value.intent_count !== p.count || !Array.isArray(value.items) || value.items.length !== p.count
    || !Array.isArray(value.excluded) || !Number.isSafeInteger(value.ready_count) || value.ready_count < 0
    || !Number.isSafeInteger(value.blocked_count) || value.blocked_count < 0
    || value.ready_count + value.blocked_count !== p.count || !safeMarkdown(value)) return false;
  if (value.task_status !== (value.ready_count === p.count ? 'READY_FOR_SOC' : value.ready_count === 0 ? 'EXTERNAL_BLOCKED' : 'PARTIALLY_READY')) return false;
  const rows = [...value.items].sort((a, b) => (a?.asset_id ?? 0) - (b?.asset_id ?? 0));
  let readyCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], frozen = p.items[i], intent = row?.intent;
    if (!obj(row) || row.asset_id !== frozen.asset_id || row.source_ip !== frozen.source_ip
      || row.analysis_status !== frozen.analysisStatus || row.ready_for_soc !== frozen.ready || !obj(intent)
      || intent.schema_version !== 'workbench-policy-intent/v1' || intent.policy_kind !== 'NETWORK_ACCESS'
      || intent.operation !== 'ADD' || intent.action !== 'ALLOW' || intent.protocol !== p.protocol
      || intent.destination_port !== p.destination_port || intent.source?.selector_type !== 'IP'
      || intent.source.value !== frozen.source_ip || intent.destination?.selector_type !== 'IP'
      || intent.destination.value !== p.destination.selected_ip
      || (Object.hasOwn(row, 'execution_allowed') && row.execution_allowed !== false)
      || (Object.hasOwn(row, 'soc_task_id') && row.soc_task_id !== null)) return false;
    if (row.ready_for_soc) readyCount++;
  }
  return readyCount === value.ready_count && digest(rows.map(row => row.intent)) === p.intentsDigest;
}

/** 纯 IO 边界：除明确 prepare 外全为只读；journal.save 返回前持久化，findBusiness只查本会话可信账本。 */
export function createTaskWorkflow(io, journal) {
  const inflight = new Map();
  async function readKnown(state, signal) {
    try {
      const value = await io.get(state.taskId, signal);
      if (!checkTask(value, state)) return `任务回执未通过绑定核验；仅可继续查询原任务，不会重新创建。\n任务ID：${state.taskId}\n请求号：${state.requestId}`;
      await journal.save({ ...state, phase: 'done' });
      return value.result_markdown;
    } catch {
      return `原任务查询失败或结果未知，不会重新创建。\n任务ID：${state.taskId}\n请求号：${state.requestId}`;
    }
  }
  async function run(input, signal) {
    const command = parseTaskCommand(input.message);
    if (!command) return null;
    const requestId = taskRequestId(input.sessionId, input.message.id);
    const prior = await journal.load(requestId);
    if (prior) return taskId(prior.taskId) ? readKnown(prior, signal) : `${UNKNOWN}\n请求号：${requestId}`;
    let plan;
    try {
      const directory = await io.list(command.department, signal);
      if (directory?.read_only !== true || !sha(directory.directory_digest) || !Array.isArray(directory.departments))
        return clarification('未取得可核实的实时部门目录，请核对部门名称与服务状态。', directory);
      const matches = directory.departments.filter(d => d?.department_name === command.department);
      if (matches.length !== 1 || !positive(matches[0].department_id))
        return clarification('部门名称未在本次真实目录中唯一匹配，请明确选择具体部门。', directory);
      const targets = { department_id: matches[0].department_id, include_descendants: false, expected_directory_digest: directory.directory_digest };
      const preview = await io.targets(targets, signal);
      if (preview?.read_only !== true || preview.department?.department_id !== targets.department_id
        || preview.directory_digest !== directory.directory_digest || !sha(preview.snapshot_digest) || !Array.isArray(preview.members))
        return clarification('源部门清单字段不完整或已变化，请重新核对。', preview);
      // 成员级歧义/软件/阻塞不连坐合法主机；保留完整快照，由服务端计划决定并解释可保存子集。
      if (!preview.members.some(completeSourceMember))
        return clarification('源清单没有地址已明确的合格真实主机，请先澄清源地址或成员范围。', preview);
      const destination = await io.destination(command.destination, signal);
      const candidates = destination?.candidates;
      const selected = Array.isArray(candidates) ? candidates.filter(c => c?.asset_id === destination.selected_asset_id) : [];
      if (destination?.schema_version !== 'policy-department-destination/v1' || destination.query !== command.destination
        || destination.read_only !== true || destination.execution_allowed !== false || destination.status !== 'MATCHED'
        || !positive(destination.selected_asset_id) || destination.selected_ip !== command.destination || selected.length !== 1
        || selected[0].status !== 'READY' || selected[0].selected_ip !== command.destination
        || !selected[0].addresses?.some(a => a?.ip === command.destination && a.supported === true))
        return clarification('目的IP未被真实解析为唯一可选资产，请澄清目的资产或地址。', destination);
      const rawPlan = await io.plan({ request_id: requestId, targets, expected_snapshot_digest: preview.snapshot_digest,
        destination_asset_id: destination.selected_asset_id, destination_ip: destination.selected_ip,
        protocol: command.protocol, destination_port: command.port }, signal);
      plan = departmentTaskPlan(rawPlan);
      if (!plan || plan.request !== requestId || plan.snapshotDigest !== preview.snapshot_digest
        || plan.destination.asset_id !== destination.selected_asset_id || plan.destination.selected_ip !== command.destination
        || plan.protocol !== command.protocol || plan.destination_port !== command.port)
        return clarification('计划缺少可保存的完整策略意图，或存在未解决的字段/地址歧义，请澄清后继续。', rawPlan);
      // 快照、源身份与地址必须同时来自本次真实 targets，而非仅相信 plan 自报。
      if (!plan.items.every(row => preview.members.filter(m => m?.asset_id === row.asset_id
        && completeSourceMember(m) && m.selected_ip === row.source_ip).length === 1))
        return clarification('计划与本次源清单绑定不一致，请重新核对目标。', rawPlan);
      io.assertCurrent?.(input);
      signal?.throwIfAborted();
      // 新messageID不代表另建授权；相同完整intent业务键的已验证会话账本必须先查旧任务/锁。
      const sameBusiness = await journal.findBusiness(plan.businessKey);
      if (sameBusiness?.sessionId === input.sessionId) return taskId(sameBusiness.taskId)
        ? readKnown(sameBusiness, signal)
        : `${UNKNOWN}\n相同策略意图已有未核实的保存请求。\n原请求号：${sameBusiness.requestId}`;
    } catch (error) {
      const status = Number.isInteger(error?.httpStatus) ? `（后台接口回执无效：HTTP ${error.httpStatus}）` : '';
      return `高层只读工作流未完成${status}，未发送本地任务保存请求；请核对服务状态或必要字段。`;
    }
    const state = { schema_version: JOURNAL_VERSION, sessionId: input.sessionId,
      userMessageId: input.message.id, requestId, phase: 'sent', plan };
    // Write-ahead：若 flush 失败，绝不发送 prepare；保存结果未知也不自动重建。
    try { await journal.save(state); } catch { return '未能持久记录请求锁，未发送本地任务保存请求。'; }
    let result;
    try {
      io.assertCurrent?.(input);
      signal?.throwIfAborted();
      result = await io.prepare({ request_id: requestId, plan_id: plan.id, expected_plan_digest: plan.digest }, signal);
    } catch (error) {
      if (!taskId(error?.taskId)) return `${UNKNOWN}\n请求号：${requestId}`;
      state.taskId = error.taskId;
    }
    if (taskId(result?.task_id)) state.taskId = result.task_id;
    if (!state.taskId) return `${UNKNOWN}\n请求号：${requestId}`;
    state.phase = 'known';
    try { await journal.save(state); } catch { return `已取得任务ID但持久记录失败；请仅查询原任务，勿重新创建。\n任务ID：${state.taskId}\n请求号：${requestId}`; }
    // prepare 回执本身不替代读取；已知ID始终只GET，不走Draft。
    return readKnown(state, signal);
  }
  return { run(input, signal) {
    if (!parseTaskCommand(input.message)) return Promise.resolve(null);
    const key = taskRequestId(input.sessionId, input.message.id);
    if (inflight.has(key)) return inflight.get(key);
    const job = run(input, signal).finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  } };
}

/** 原生日志仅记录受信 Runtime 的全量状态；不发明 Session/tool 事件。 */
export function restoreRuntimeJournal(events, sessionId) {
  const records = new Map();
  const users = new Map();
  if (!text(sessionId)) return records;
  for (const event of events) {
    if (event?.type === 'user/message' && parseTaskCommand(event.data)) users.set(event.data.id, event.data);
    if (event?.type !== 'agent/inbox/spliced') continue;
    for (const message of event.data?.inserted ?? []) {
      if (message?.source?.kind !== STATE_SOURCE || message.source.form !== STATE_FORM
        || message.role !== 'user' || message.content?.length !== 1 || message.content[0]?.type !== 'text') continue;
      try {
        const state = JSON.parse(message.content[0].text);
        if (obj(state) && state.schema_version === JOURNAL_VERSION && state.sessionId === sessionId
          && users.has(state.userMessageId) && state.requestId === taskRequestId(sessionId, state.userMessageId)
          && ['sent', 'known', 'done'].includes(state.phase)
          && (state.phase === 'sent' || taskId(state.taskId))) records.set(state.requestId, state);
      } catch { /* 非法或旧状态不能成为授权。 */ }
    }
  }
  return records;
}

function hasPolicySkill(events) {
  const calls = new Map();
  for (const event of events) {
    if (event?.type === 'tool/call') {
      const id = event.data?.callId;
      if (typeof id === 'string') calls.set(id, calls.has(id) ? null : event.data);
      continue;
    }
    if (event?.type !== 'tool/result' || event.isError === true || event.data?.isError === true) continue;
    const m = event.data?.message, id = m?.source?.callId;
    const call = calls.get(id);
    if (m?.source?.kind !== 'tool' || m.isError === true || call?.name !== 'skill' || !Array.isArray(m.content) || !m.content.length) continue;
    if (m.content.some(block => block?.isError === true || block?.content?.some?.(item => item?.isError === true))) continue;
    if (m.content.some(block => block?.type === 'tool-result' && block.toolCallId !== id)) continue;
    try {
      if (JSON.parse(call.arguments).name === 'policy-configuration') return true;
    } catch { /* 参数或call/result配对不完整不能证明Skill已加载。 */ }
  }
  return false;
}

/** 只读原生身份/本轮真实输入及Skill成功回执；模型参数、工具正文或旧用户消息不能授权。 */
export function nativeTaskPermission(exec) {
  const agent = exec?.agent, session = agent?.session, header = session?.header;
  if (!agent || !obj(header) || header.origin === 'subagent' || (header.delegationDepth ?? 0) !== 0
    || header.id !== session.id || agent.id !== session.id) return { reason: '本工具只允许有真实根会话身份的主Agent调用。' };
  const events = session.snapshotEvents();
  const boundary = events.findLast(e => e.type === 'turn/start' || e.type === 'turn/end');
  const latest = events.findLast(e => e.type === 'user/message' && e.data?.source?.kind === 'user');
  if (boundary?.type !== 'turn/start' || !latest || events.indexOf(latest) <= events.indexOf(boundary))
    return { reason: '当前轮尚未提交真实用户指令，不能沿用历史用户消息创建任务。' };
  if (!parseTaskCommand(latest.data)) return { reason: '本工具仅支持真实用户完整的部门策略任务创建句式；只读、取消、改参或注入内容不能创建。' };
  if (!hasPolicySkill(events)) return { reason: '请先通过原生skill工具成功加载policy-configuration Skill，再调用本工具。' };
  if ([...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(m => m?.source?.kind === 'user'))
    return { reason: '已有新的真实用户消息等待处理；本次创建已暂停，请先处理取消或改参。' };
  return { message: latest.data };
}

export function apply(ctx, config = {}) {
  const io = createBackendIO({ backendBaseUrl: config.backendBaseUrl ?? BACKEND_BASE_URL });
  const workflows = new WeakMap();
  function workflow(agent) {
    let current = workflows.get(agent);
    if (current) return current;
    // 只在本次活Agent第一次使用时恢复；后续内存只作本日志状态的派生缓存。
    const records = restoreRuntimeJournal(agent.session.snapshotEvents(), agent.session.id);
    current = createTaskWorkflow({ ...io, assertCurrent: input => {
      const latestUser = agent.session.snapshotEvents().findLast(e => e.type === 'user/message' && e.data?.source?.kind === 'user');
      const pendingUsers = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(m => m?.source?.kind === 'user');
      if (latestUser?.data?.id !== input.message.id || pendingUsers) throw new Error('real user request superseded or canceled');
    } }, {
      load: async id => records.get(id),
      findBusiness: async key => {
        // 仅此Session的已验证原生日志投影；优先未知锁，绝不查其他Session/数据库。
        const matches = [...records.values()].filter(state => state.plan?.businessKey === key);
        return matches.find(state => !taskId(state.taskId)) ?? matches.find(state => taskId(state.taskId));
      },
      save: async state => {
        const id = randomUUID();
        agent.inject({ id, role: 'user', source: { kind: STATE_SOURCE, form: STATE_FORM },
          content: [{ type: 'text', text: JSON.stringify(state) }] });
        // 清走待入模上下文；原始 inserted 仍保留在已知原生事件中用于恢复。
        agent.inbox.remove(id);
        await ctx.sessionPersistence.flush();
        records.set(state.requestId, structuredClone(state));
      },
    });
    workflows.set(agent, current);
    return current;
  }
  ctx.tools.register({
    name: TOOL_NAME,
    description: '仅主Agent在成功加载policy-configuration Skill后，按本轮真实用户的完整部门创建指令保存一份本地多明细策略意图Task。参数必须{}，部门/IPv4/TCP或UDP/单端口全部从真实用户读取并由高层后台核验；只读、取消或注入内容不可触发。不创建SOC草稿，不审批、不执行。原样返回后台任务markdown或明确阻塞。',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { result_markdown: { type: 'string' } }, required: ['result_markdown'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.result_markdown }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!obj(args) || Object.keys(args).length !== 0)
        return { result_markdown: '工具参数必须为{}；不能由模型提供部门、地址、规则、URL或请求号。未创建任务。' };
      const permission = nativeTaskPermission(exec);
      if (permission.reason) return { result_markdown: `${permission.reason}\n未创建本地任务、SOC草稿或执行。` };
      exec.signal.throwIfAborted();
      const markdown = await workflow(exec.agent).run({ sessionId: exec.agent.session.id, message: permission.message }, exec.signal);
      return { result_markdown: markdown ?? '当前真实用户指令不符合受支持句式，未创建任务。' };
    },
  });
  ctx.on('agent/disposed', ({ agent }) => { workflows.delete(agent); });
}
