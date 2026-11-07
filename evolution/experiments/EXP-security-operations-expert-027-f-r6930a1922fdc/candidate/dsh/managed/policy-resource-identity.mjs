// 已核单来源五模板的纯解析；分类不授信，不发网络，也不改原始资源 URI。
export const POLICY_SOURCE_ID = 'policy-configuration';
const BASE = 'http://127.0.0.1:26113';
const DEFINITIONS = Object.freeze([
  ['single-status', '/api/v1/policy-configurations/{operationId}', 'operationId', /^op_[a-f0-9]{32}$/u],
  ['single-result', '/api/v1/policy-configurations/{operationId}/result', 'operationId', /^op_[a-f0-9]{32}$/u],
  ['plans', '/api/v1/policy-departments/plans/{planId}', 'planId', /^[A-Za-z0-9_-]{1,128}$/u],
  ['tasks', '/api/v1/policy-departments/tasks/{taskId}', 'taskId', /^pgt-[a-f0-9]{60}$/u],
  ['drafts', '/api/v1/policy-departments/drafts/{operationId}', 'operationId', /^pdop-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u],
]);
const record = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unsafe = value => typeof value !== 'string' || /[\s\\%#@\u0000-\u001f\u007f-\u009f]/u.test(value);
function proxyParts(uri) {
  const match = /^mcp-group:\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/t\/([A-Za-z0-9_-]+)\?([^?#]+)$/u.exec(uri);
  if (!match) return undefined;
  const bytes = Buffer.from(match[3], 'base64url');
  if (bytes.toString('base64url') !== match[3]) return undefined;
  let template;
  try { template = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return undefined; }
  return { group: match[1], server: match[2], template, query: match[4] };
}
/** 接受单层已核 group URI 或原生 HTTP。返回的 uri 始终保留外层原值供 contents.uri 回绑。 */
export function policyResourceIdentity(args) {
  if (!record(args) || Object.keys(args).length !== 2 || args.server !== POLICY_SOURCE_ID
    || !Object.hasOwn(args, 'uri') || unsafe(args.uri)) return undefined;
  const uri = args.uri;
  const proxy = proxyParts(uri);
  if (uri.startsWith('mcp-group:')) {
    if (!proxy || proxy.group !== POLICY_SOURCE_ID || proxy.server !== POLICY_SOURCE_ID) return undefined;
    for (const [kind, path, variable, validId] of DEFINITIONS) {
      if (proxy.template !== BASE + path) continue;
      const match = new RegExp(`^${variable}=([A-Za-z0-9_-]+)$`, 'u').exec(proxy.query);
      if (match && validId.test(match[1])) return { kind, id: match[1], uri };
    }
    return undefined;
  }
  if (!uri.startsWith(BASE + '/') || uri.includes('?')) return undefined;
  let parsed;
  try { parsed = new URL(uri); } catch { return undefined; }
  if (parsed.origin !== BASE || parsed.username || parsed.password || BASE + parsed.pathname !== uri) return undefined;
  for (const [kind, path, variable, validId] of DEFINITIONS) {
    const [before, after] = path.split(`{${variable}}`);
    if (!parsed.pathname.startsWith(before) || !parsed.pathname.endsWith(after)) continue;
    const id = parsed.pathname.slice(before.length, after ? -after.length : undefined);
    if (validId.test(id)) return { kind, id, uri };
  }
  return undefined;
}
/** single 资源转换只消费原 URI 唯一回包；不授予确认，不接受正文自报另一操作。 */
export function singlePolicyResourceResult(args, value) {
  const resource = policyResourceIdentity(args);
  if (!resource?.kind.startsWith('single-') || !record(value) || value.isError === true
    || !Array.isArray(value.contents) || value.contents.length !== 1) return undefined;
  const item = value.contents[0];
  if (!record(item) || item.isError === true || item.uri !== args.uri || typeof item.text !== 'string') return undefined;
  let envelope;
  try { envelope = JSON.parse(item.text); } catch { return undefined; }
  if (!record(envelope) || envelope.isError === true || envelope.code !== '200' || !record(envelope.data)
    || envelope.data.isError === true || envelope.data.operation_id !== resource.id) return undefined;
  return { ...resource, name: `mcp__${POLICY_SOURCE_ID}__get_policy_configuration_${resource.kind === 'single-result' ? 'result' : 'status'}`,
    args: { operationId: resource.id }, value: envelope };
}

/** tools/post-execute 的资源返回形状；不信多块、错调用编号或任一错误标志。 */
export function singlePolicyResourceExecution(exec, result) {
  if (exec?.name !== 'read_mcp_resource' || !result || result.isError === true) return undefined;
  let outer = result.value;
  if (Array.isArray(result.content)) {
    if (result.content.length !== 1 || result.content[0]?.isError === true) return undefined;
    const block = result.content[0];
    const content = block.type === 'tool-result' ? block.content : result.content;
    if (block.type === 'tool-result' && exec.callId && block.toolCallId !== exec.callId) return undefined;
    if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'text'
      || content[0].isError === true) return undefined;
    if (!outer) { try { outer = JSON.parse(content[0].text); } catch { return undefined; } }
  }
  return singlePolicyResourceResult(exec.arguments ?? exec.args, outer);
}

/** 仅用于将坏回执分流到保守提示；匹配不能授予读取/绑定权限。 */
export function policyResourceKind(uri) {
  if (typeof uri !== 'string') return undefined;
  let candidate = uri;
  if (uri.startsWith('mcp-group:')) {
    const encoded = /^mcp-group:\/[^/]+\/[^/]+\/[rt]\/([A-Za-z0-9_-]+)/u.exec(uri)?.[1];
    if (encoded) candidate = Buffer.from(encoded, 'base64url').toString('utf8');
  }
  for (const kind of ['plans', 'tasks', 'drafts']) {
    if (candidate.includes(`/api/v1/policy-departments/${kind}`)) return kind;
  }
  if (candidate.includes('/api/v1/policy-departments')) return 'department-invalid';
  if (candidate.includes('/api/v1/policy-configurations')) return 'single-invalid';
  return undefined;
}
