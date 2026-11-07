import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { callOpenApiTool, loadOpenApi, readOpenApiResource, validateAuthHeader, validateSpecUrl } from './openapi.mjs';
const runtimeRequire = createRequire(process.env.DSH_MCP_CLIENT_ANCHOR || '/opt/dsh/packages/mcp/mcp-client/package.json');
const z = runtimeRequire('@deepseek-ai/schemastery');
const { Client, StreamableHTTPClientTransport, UriTemplate } = runtimeRequire('@modelcontextprotocol/client');
const { McpServer, createMcpHandler } = runtimeRequire('@modelcontextprotocol/server');
const { toNodeHandler } = runtimeRequire('@modelcontextprotocol/node');
const { createScope, scopeParentOf } = await import(runtimeRequire.resolve('@deepseek-ai/dsh-scope'));
const McpClient = await import(runtimeRequire.resolve('@deepseek-ai/dsh-mcp-client'));
export const name = 'mcp-session-manager';
export const inject = ['agents', 'webServer', 'connection', 'tools'];
const key = z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/);
const toolPolicy = z.object({
    mode: z.union([z.const('all'), z.const('selected')]).default('all'),
    names: z.array(z.string()).default([]),
});
const serverSchema = z.object({
    id: key,
    serverName: z.string(),
    description: z.string(),
    enabled: z.boolean().default(true),
    specUrl: z.string(),
    apiKey: z.string(),
    authType: z.string(),
    authHeader: z.string(),
    loginUrl: z.string(),
    loginUsername: z.string(),
    loginPassword: z.string(),
    loginTokenPath: z.string(),
    url: z.string(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
    managementUrl: z.string(),
    tools: toolPolicy,
});
const groupSchema = z.object({
    id: key,
    members: z.array(z.object({ serverId: key, names: z.array(z.string()).default([]),
        resourceUris: z.array(z.string()).default([]), resourceTemplates: z.array(z.string()).default([]) })).default([]),
});
export const Config = z.object({
    servers: z.array(serverSchema).default([]).volatile(),
    groups: z.array(groupSchema).default([]).volatile(),
    sharedToken: z.string().default('').volatile(),
});
const namePattern = /^[A-Za-z0-9_-]{1,32}$/;
const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MAX_BODY = 64 * 1024;
const MAX_RESPONSE = 1024 * 1024;
function validateUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('MCP 地址须为不含凭据、查询参数和片段的 HTTP(S) URL');
    }
    return url.href;
}
export function snapshot(config) {
    const servers = structuredClone(config.servers.get());
    const groups = structuredClone(config.groups.get());
    const sharedToken = config.sharedToken.get();
    if (sharedToken && !/^[0-9a-f]{64}$/.test(sharedToken))
        throw new Error('统一 Token 格式无效；请在工具与资源分组页重新生成');
    const ids = new Set();
    const names = new Set();
    for (const server of servers) {
        const serverName = server.serverName || server.id;
        if (!namePattern.test(server.id) || !namePattern.test(serverName)
            || ids.has(server.id) || names.has(serverName))
            throw new Error('MCP 服务器 ID 或名称重复/无效');
        ids.add(server.id);
        names.add(serverName);
        if (server.specUrl) {
            validateSpecUrl(server.specUrl);
            if (server.url || server.managementUrl || server.headers?.length)
                throw new Error(`${server.id}: OpenAPI 与现成 MCP 连接不能混用`);
            if (server.authType === 'login') {
                if (server.enabled && (!server.loginUrl || !server.loginUsername || !server.loginPassword || !server.loginTokenPath))
                    throw new Error(`${server.id}: 登录授权信息不完整`);
                if (server.loginUrl)
                    validateSpecUrl(server.loginUrl);
                if (server.loginTokenPath && !server.loginTokenPath.split('.').every((part) => /^[A-Za-z_][\w-]*$/.test(part)))
                    throw new Error(`${server.id}: 凭据字段路径无效`);
            }
            else if (server.authType === 'credential') {
                validateAuthHeader(server.authHeader ?? 'Authorization');
            }
            else if (server.authType)
                throw new Error(`${server.id}: 不支持的授权方式`);
            continue;
        }
        if (server.url)
            validateUrl(server.url);
        if (server.managementUrl)
            validateUrl(server.managementUrl);
        if (server.enabled && !server.url)
            throw new Error(`${server.id}: 缺少 MCP URL`);
        const headerNames = new Set();
        for (const header of server.headers ?? []) {
            const name = header.name?.toLowerCase();
            if (!headerNamePattern.test(header.name) || (server.enabled && !header.value) || /[\r\n]/.test(header.value) || headerNames.has(name)) {
                throw new Error(`${server.id}: 请求 Header 无效或重复`);
            }
            headerNames.add(name);
        }
        if (server.tools.mode === 'selected' && new Set(server.tools.names).size !== server.tools.names.length) {
            throw new Error(`${server.id}: 工具名重复`);
        }
    }
    const groupIds = new Set();
    for (const group of groups) {
        if (!namePattern.test(group.id) || groupIds.has(group.id))
            throw new Error('MCP 分组 ID 重复/无效');
        groupIds.add(group.id);
        for (const member of group.members) {
            const selections = [member.names ?? [], member.resourceUris ?? [], member.resourceTemplates ?? []];
            if (!ids.has(member.serverId) || !selections.some(items => items.length)
                || selections.some(items => items.some((item) => typeof item !== 'string' || !item)
                    || new Set(items).size !== items.length)) {
                throw new Error(`${group.id}: 分组成员、工具或资源选择无效/重复`);
            }
        }
    }
    return { servers, groups, sharedToken };
}
function resolvedUrl(server) {
    return server.url ? validateUrl(server.url) : undefined;
}
function serverName(server) { return server.serverName || server.id; }
// 与锁定 DSH mcp-client 的公开名称合同一致；是否已注册仍由本轮 ToolRuntime 核对。
export function publicToolName(name, rawName) {
    const joined = `mcp__${name}__${rawName}`;
    const normalized = joined.replace(/[^A-Za-z0-9_-]/g, '_');
    if (normalized === joined && normalized.length <= 64)
        return normalized;
    const hash = createHash('sha256').update(`${name}\0${rawName}`).digest('hex').slice(0, 12);
    return `${normalized.slice(0, 51)}_${hash}`;
}
async function serverTools(server) {
    if (server.specUrl)
        return (await loadOpenApi(server)).tools;
    return withClient(server, async (client) => client.getServerCapabilities()?.tools
        ? (await listAll(client, 'listTools', 'tools', server.signal)).tools : []);
}
export async function listAll(client, method, field, signal) {
    const items = [];
    const cursors = new Set();
    let cursor;
    do {
        const page = await client[method](cursor ? { cursor } : undefined, { signal });
        items.push(...page[field]);
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor))
            throw new Error('MCP 分页游标重复');
        if (cursor)
            cursors.add(cursor);
    } while (cursor);
    return { [field]: items };
}
async function discover(server) {
    if (server.specUrl) {
        const source = await loadOpenApi(server);
        return { tools: source.tools, resources: { resources: source.resources },
            resourceTemplates: { resourceTemplates: source.resourceTemplates } };
    }
    return withClient(server, async (client) => ({
        tools: client.getServerCapabilities()?.tools ? (await listAll(client, 'listTools', 'tools', server.signal)).tools : [],
        resources: await listAll(client, 'listResources', 'resources', server.signal)
            .catch((error) => ({ resources: [], unavailable: true, error: error.message })),
        resourceTemplates: await listAll(client, 'listResourceTemplates', 'resourceTemplates', server.signal)
            .catch((error) => ({ resourceTemplates: [], unavailable: true, error: error.message })),
    }));
}
async function withClient(server, run, signal) {
    const url = resolvedUrl(server);
    if (!url)
        throw new Error(`${server.id}: MCP URL 未配置`);
    const client = new Client({ name: 'dsh-web-mcp-manager', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } });
    const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: Object.fromEntries((server.headers ?? []).map(({ name, value }) => [name, value])) },
    });
    try {
        await client.connect(transport, { signal: signal ?? server.signal });
        return await run(client);
    }
    finally {
        await client.close();
    }
}
function send(res, status, body) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(body));
}
async function bodyOf(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY)
            throw new Error('请求超过 64 KiB');
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function bearerAccepted(req, sharedToken) {
    if (!sharedToken)
        return false;
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer '))
        return false;
    const actual = Buffer.from(header.slice(7));
    const expected = Buffer.from(sharedToken);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function callManagedTool(server, name, args, meta, signal) {
    if (server.enabled === false || server.tools?.mode === 'selected' && !server.tools.names.includes(name)) {
        throw new Error('工具不属于当前 MCP 范围');
    }
    if (server.specUrl)
        return callOpenApiTool(await loadOpenApi(server), name, args);
    return withClient(server, async (client) => {
        const tools = (await listAll(client, 'listTools', 'tools', signal ?? server.signal)).tools;
        if (!tools.some((tool) => tool.name === name))
            throw new Error('工具不属于当前 MCP 范围');
        return client.callTool({ name, arguments: args, ...(meta ? { _meta: meta } : {}) }, { signal: signal ?? server.signal });
    }, signal);
}
async function readManagedResource(server, uri, signal) {
    if (server.enabled === false)
        throw new Error('MCP 服务器已停用');
    if (server.specUrl)
        return readOpenApiResource(await loadOpenApi(server), uri);
    return withClient(server, client => client.readResource({ uri }, { signal: signal ?? server.signal }), signal);
}
export const GROUP_TARGET_META_KEY = 'io.deepseek.dsh/mcp-group-target';
/** 与既有业务 MCP 桥使用同一身份合同，凭据轮换不改变目标摘要。 */
export function groupTargetDigest(target, version = 1) {
    if (version === 2 && new Set(target.group.members.map((member) => member.serverId)).size !== target.group.members.length) {
        throw new Error('MCP v2 分组服务 ID 重复');
    }
    const members = target.group.members.map((member) => {
        const server = target.servers.find(item => item.id === member.serverId);
        let endpoint = server?.specUrl || server?.url || '';
        if (endpoint) {
            const url = new URL(endpoint);
            url.username = '';
            url.password = '';
            for (const key of [...url.searchParams.keys()])
                if (/token|secret|password|credential|authorization|api[-_]?key/i.test(key))
                    url.searchParams.delete(key);
            url.searchParams.sort();
            endpoint = url.href;
        }
        if (version === 2)
            return { serverId: member.serverId, enabled: server?.enabled,
                kind: server?.specUrl ? 'openapi' : 'mcp', endpoint, tools: server?.tools,
                names: [...member.names].sort(), resourceUris: [...(member.resourceUris ?? [])].sort(),
                resourceTemplates: [...(member.resourceTemplates ?? [])].sort() };
        // v1 保持原有字段、排序与序列化次序，旧绑定按原合同核对。
        return { serverId: member.serverId, serverName: server && serverName(server), enabled: server?.enabled,
            kind: server?.specUrl ? 'openapi' : 'mcp', endpoint, names: [...member.names].sort(),
            resourceUris: [...(member.resourceUris ?? [])].sort(), resourceTemplates: [...(member.resourceTemplates ?? [])].sort() };
    }).sort((a, b) => a.serverId.localeCompare(b.serverId));
    return createHash('sha256').update(JSON.stringify(version === 1 ? { id: target.group.id, members }
        : { id: target.group.id, version, members })).digest('hex');
}
function v2ToolName(serverId, rawName) {
    return `${serverId.replaceAll('_', '_0')}__${rawName}`;
}
async function toolsFor(target, version = 1, signal) {
    if (target.kind === 'agent') {
        const tools = await serverTools({ ...target.server, signal: signal ?? target.server.signal });
        return tools.filter((tool) => !target.server.tools || target.server.tools.mode === 'all'
            || target.server.tools.names.includes(tool.name));
    }
    const result = [];
    const names = new Set();
    for (const member of target.group.members) {
        if (!member.names.length)
            continue;
        const server = target.servers.find(item => item.id === member.serverId && item.enabled);
        if (!server)
            continue;
        const tools = await serverTools({ ...server, signal: signal ?? server.signal }).catch(error => {
            if (version === 2)
                throw error;
            return [];
        });
        for (const tool of tools) {
            if (member.names.includes(tool.name) && (version === 1 || server.tools?.mode !== 'selected' || server.tools.names.includes(tool.name))) {
                const name = version === 1 ? `mcp__${serverName(server)}__${tool.name}` : v2ToolName(server.id, tool.name);
                if (version === 2 && names.has(name))
                    throw new Error('MCP 分组工具名重复');
                names.add(name);
                result.push({ ...tool, name });
            }
        }
    }
    return result;
}
function toolOwner(target, name, version = 1) {
    if (target.kind === 'agent') {
        if (target.server.tools.mode === 'selected' && !target.server.tools.names.includes(name))
            return;
        return { server: target.server, rawName: name };
    }
    for (const member of target.group.members) {
        const server = target.servers.find(item => item.id === member.serverId && item.enabled);
        if (!server)
            continue;
        const prefix = version === 1 ? `mcp__${serverName(server)}__` : `${server.id.replaceAll('_', '_0')}__`;
        if (name.startsWith(prefix) && member.names.includes(name.slice(prefix.length))) {
            if (version === 2 && server.tools?.mode === 'selected' && !server.tools.names.includes(name.slice(prefix.length)))
                continue;
            return { server, rawName: name.slice(prefix.length) };
        }
    }
}
function groupResourceUri(groupId, serverId, kind, sourceUri) {
    return `mcp-group:/${groupId}/${serverId}/${kind}/${Buffer.from(sourceUri, 'utf8').toString('base64url')}`;
}
function sourceTemplate(value) {
    const expressions = value.match(/\{[^{}]*\}/g) ?? [];
    if (!expressions.length || value.replace(/\{[^{}]*\}/g, '').includes('{') || value.replace(/\{[^{}]*\}/g, '').includes('}')
        || expressions.some(expression => !/^\{[+#./?&]?[A-Za-z0-9_.-]+(?:,[A-Za-z0-9_.-]+)*\}$/.test(expression))) {
        throw new Error('不支持的 Resource URI 模板');
    }
    const template = new UriTemplate(value);
    const variableNames = template.variableNames;
    if (new Set(variableNames).size !== variableNames.length)
        throw new Error('Resource URI 模板变量重复');
    const requiredNames = template.parts.flatMap((part) => typeof part === 'string' || ['?', '&'].includes(part.operator) ? [] : part.names);
    return { template, variableNames, requiredNames };
}
async function resourceCatalog(server, kind) {
    if (server.specUrl) {
        const source = await loadOpenApi(server);
        return kind === 'r' ? source.resources : source.resourceTemplates;
    }
    return withClient(server, async (client) => kind === 'r'
        ? (await listAll(client, 'listResources', 'resources', server.signal)).resources
        : (await listAll(client, 'listResourceTemplates', 'resourceTemplates', server.signal)).resourceTemplates);
}
async function resourcesFor(target, kind, signal) {
    const result = [];
    const uris = new Set();
    for (const member of target.group.members) {
        const selected = kind === 'r' ? member.resourceUris ?? [] : member.resourceTemplates ?? [];
        const server = target.servers.find(item => item.id === member.serverId && item.enabled);
        if (!server || !selected.length)
            continue;
        for (const item of await resourceCatalog({ ...server, signal: signal ?? server.signal }, kind)) {
            const sourceUri = kind === 'r' ? item.uri : item.uriTemplate;
            if (!selected.includes(sourceUri))
                continue;
            const uri = groupResourceUri(target.group.id, server.id, kind, sourceUri);
            if (uris.has(uri))
                throw new Error('MCP 分组 Resource URI 重复');
            uris.add(uri);
            if (kind === 'r')
                result.push({ ...item, uri });
            else
                result.push({ ...item, uriTemplate: `${uri}{?${sourceTemplate(sourceUri).variableNames.join(',')}}` });
        }
    }
    return result;
}
function parseProxyResourceUri(uri) {
    const match = /^mcp-group:\/([A-Za-z0-9_-]{1,32})\/([A-Za-z0-9_-]{1,32})\/([rt])\/([A-Za-z0-9_-]+)(?:\?([^#]*))?$/.exec(uri);
    if (!match || match[3] === 'r' && match[5] !== undefined)
        throw new Error('Resource URI 不属于当前 MCP 分组');
    const encoded = match[4], decoded = Buffer.from(encoded, 'base64url');
    if (decoded.toString('base64url') !== encoded)
        throw new Error('Resource URI 编码无效');
    const sourceUri = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
    if (!sourceUri)
        throw new Error('Resource URI 编码无效');
    return { groupId: match[1], serverId: match[2], kind: match[3], sourceUri, query: match[5] };
}
function templateValues(query, variableNames) {
    const result = Object.create(null);
    if (query === undefined || !query)
        return result;
    for (const pair of query.split('&')) {
        const match = /^([A-Za-z0-9_.-]+)=(.*)$/.exec(pair);
        if (!match || !variableNames.includes(match[1]) || Object.hasOwn(result, match[1]) || /%(?![0-9A-Fa-f]{2})|\+/.test(match[2])) {
            throw new Error('Resource URI 模板参数无效或重复');
        }
        try {
            result[match[1]] = match[2].includes(',')
                ? match[2].split(',').map(value => decodeURIComponent(value)) : decodeURIComponent(match[2]);
        }
        catch {
            throw new Error('Resource URI 模板参数编码无效');
        }
    }
    return result;
}
async function readGroupResource(target, uri, signal) {
    const proxy = parseProxyResourceUri(uri);
    const member = target.group.members.find((item) => item.serverId === proxy.serverId);
    const selected = proxy.kind === 'r' ? member?.resourceUris ?? [] : member?.resourceTemplates ?? [];
    const server = target.servers.find(item => item.id === proxy.serverId && item.enabled);
    if (proxy.groupId !== target.group.id || !server || !selected.includes(proxy.sourceUri))
        throw new Error('Resource URI 不属于当前 MCP 分组');
    const sources = (await resourceCatalog({ ...server, signal: signal ?? server.signal }, proxy.kind)).filter(item => (proxy.kind === 'r' ? item.uri : item.uriTemplate) === proxy.sourceUri);
    if (sources.length !== 1)
        throw new Error(sources.length ? '来源 Resource URI 重复' : '已选 Resource 在来源中不可用');
    let upstreamUri = proxy.sourceUri;
    if (proxy.kind === 't') {
        const { template, variableNames, requiredNames } = sourceTemplate(proxy.sourceUri);
        const values = templateValues(proxy.query, variableNames);
        if (requiredNames.some(name => !Object.hasOwn(values, name)))
            throw new Error('Resource URI 模板缺少路径参数');
        upstreamUri = template.expand(values);
    }
    const response = await readManagedResource(server, upstreamUri, signal);
    return { ...response, contents: response.contents?.map((item) => ({ ...item, uri })) ?? [] };
}
function assertGroupTarget(target, currentTarget, version, request) {
    const digest = groupTargetDigest(target, version);
    const expected = request?.params?._meta?.[GROUP_TARGET_META_KEY]?.digest;
    const current = currentTarget?.();
    if (expected !== undefined && expected !== digest || currentTarget && (!current || current.kind !== 'group'
        || groupTargetDigest(current, version) !== digest))
        throw new Error('MCP 分组目标已变化');
}
async function serveMcp(req, res, target, currentTarget, version = 1, withGroupRequest) {
    const digest = target.kind === 'group' ? groupTargetDigest(target, version) : undefined;
    const runRequest = (method, rpcRequest, run) => version === 2 && withGroupRequest
        ? withGroupRequest(req, method, run, rpcRequest) : run();
    const agentDigest = (value) => JSON.stringify([value?.id, value?.enabled, value?.specUrl, value?.url, value?.tools]);
    const assertTarget = (request) => {
        const current = currentTarget?.();
        if (target.kind === 'group')
            assertGroupTarget(target, currentTarget, version, request);
        if (target.kind === 'agent' && currentTarget && (!current || current.kind !== 'agent' || current.server.enabled === false
            || agentDigest(current.server) !== agentDigest(target.server)))
            throw new Error('MCP 服务器目标已变化或已停用');
    };
    const handler = createMcpHandler(() => {
        const mcp = new McpServer({ name: target.kind === 'group' ? target.group.id : serverName(target.server),
            version: '0.1.0' }, { capabilities: target.kind === 'agent' || target.kind === 'group' && version === 2
                ? { tools: {}, resources: {} } : { tools: {} } });
        mcp.server.setRequestHandler('tools/list', async (request, context) => runRequest('tools/list', request, async () => {
            const tools = await toolsFor(target, version, context?.mcpReq?.signal ?? context?.signal);
            assertTarget();
            return { tools, ...(digest ? { _meta: { [GROUP_TARGET_META_KEY]: version === 1 ? { digest } : { digest, version } } } : {}) };
        }));
        mcp.server.setRequestHandler('tools/call', async (request, context) => runRequest('tools/call', request, async () => {
            assertTarget(request);
            const owner = toolOwner(target, request.params.name, version);
            if (!owner)
                throw new Error('工具不属于当前 MCP 范围');
            assertTarget(request);
            return callManagedTool(owner.server, owner.rawName, request.params.arguments ?? {}, request.params._meta, context?.mcpReq?.signal ?? context?.signal);
        }));
        if (target.kind === 'agent' || target.kind === 'group' && version === 2) {
            mcp.server.setRequestHandler('resources/list', async (request, context) => runRequest('resources/list', request, async () => {
                const signal = context?.mcpReq?.signal ?? context?.signal;
                const resources = target.kind === 'group' ? await resourcesFor(target, 'r', signal)
                    : (await resourceCatalog({ ...target.server, signal }, 'r'));
                assertTarget();
                return { resources,
                    ...(digest ? { _meta: { [GROUP_TARGET_META_KEY]: { digest, version } } } : {}) };
            }));
            mcp.server.setRequestHandler('resources/templates/list', async (request, context) => runRequest('resources/templates/list', request, async () => {
                const signal = context?.mcpReq?.signal ?? context?.signal;
                const resourceTemplates = target.kind === 'group' ? await resourcesFor(target, 't', signal)
                    : (await resourceCatalog({ ...target.server, signal }, 't'));
                assertTarget();
                return { resourceTemplates,
                    ...(digest ? { _meta: { [GROUP_TARGET_META_KEY]: { digest, version } } } : {}) };
            }));
            mcp.server.setRequestHandler('resources/read', async (request, context) => runRequest('resources/read', request, async () => {
                assertTarget(request);
                const response = target.kind === 'group' ? await readGroupResource(target, request.params.uri, context?.mcpReq?.signal ?? context?.signal)
                    : await readManagedResource(target.server, request.params.uri, context?.mcpReq?.signal ?? context?.signal);
                assertTarget(request);
                return response;
            }));
        }
        return mcp;
    });
    try {
        await toNodeHandler(handler)(req, res);
    }
    finally {
        await handler.close();
    }
}
async function upstream(server, method, path, data) {
    if (!server.managementUrl)
        throw new Error(`${server.id}: 未设置 OpenAPI 管理地址`);
    const root = validateUrl(server.managementUrl);
    const response = await fetch(new URL(path, root.endsWith('/') ? root : `${root}/`), {
        method,
        headers: data === undefined ? {} : { 'content-type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: AbortSignal.timeout(20_000),
    });
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE)
        throw new Error('上游响应超过 1 MiB');
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE)
        throw new Error('上游响应超过 1 MiB');
    let parsed;
    try {
        parsed = text ? JSON.parse(text) : {};
    }
    catch {
        throw new Error('上游返回非 JSON');
    }
    if (!response.ok)
        throw new Error(`上游 HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 500)}`);
    return parsed;
}
async function manage(server, request) {
    const { action, sourceId, toolName } = request;
    const source = typeof sourceId === 'string' && /^[0-9a-fA-F-]{36}$/.test(sourceId) ? sourceId : undefined;
    const tool = typeof toolName === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(toolName) ? toolName : undefined;
    const prefix = '/api/v1/mcp-resources';
    if (action === 'sources')
        return upstream(server, 'GET', prefix);
    if (action === 'create' && typeof request.name === 'string' && typeof request.specUrl === 'string') {
        return upstream(server, 'POST', prefix, { name: request.name, spec_url: validateUrl(request.specUrl) });
    }
    if (!source)
        throw new Error('OpenAPI 来源 ID 无效');
    if (action === 'refresh')
        return upstream(server, 'POST', `${prefix}/${source}/refresh`);
    if (action === 'toggle' && typeof request.enabled === 'boolean') {
        return upstream(server, 'PATCH', `${prefix}/${source}`, { enabled: request.enabled });
    }
    if (action === 'components')
        return upstream(server, 'GET', `${prefix}/${source}/components`);
    if (action === 'logs')
        return upstream(server, 'GET', `${prefix}/${source}/logs`);
    if ((action === 'preview' || action === 'invoke') && tool) {
        return upstream(server, 'POST', `${prefix}/${source}/tools/${tool}/${action}`, { arguments: request.arguments ?? {} });
    }
    throw new Error('不支持的 OpenAPI 管理操作');
}
export function apply(ctx, config) {
    const agents = new Map();
    const activeAgents = new Set();
    const agentToken = randomBytes(32).toString('hex');
    const mounted = new Map();
    snapshot(config);
    const currentGroup = (id) => {
        const current = snapshot(config), group = current.groups.find(item => item.id === id);
        return group ? { kind: 'group', group, servers: current.servers } : undefined;
    };
    ctx.provide('mcpSessionManager', { currentGroup(id, version = 1) {
            const target = currentGroup(id);
            return target ? { id, version, token: config.sharedToken.get(), targetDigest: groupTargetDigest(target, version) } : undefined;
        }, resolveTool(serverId, rawName) {
            const server = snapshot(config).servers.find(item => item.id === serverId && item.enabled !== false);
            if (!server || server.tools?.mode === 'selected' && !server.tools.names.includes(rawName))
                return undefined;
            const name = publicToolName(serverName(server), rawName);
            return [...activeAgents].some(agent => ctx.tools.get(name, agent) !== undefined) ? name : undefined;
        } });
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/mcp/groups', handler: async (req, res) => {
            const route = /^\/mcp\/groups\/([A-Za-z0-9_-]{1,32})(?:\/(v2))?$/.exec(new URL(req.url, 'http://localhost').pathname);
            if (!route)
                return send(res, 404, { error: 'group endpoint not found' });
            if (!bearerAccepted(req, config.sharedToken.get()))
                return send(res, 401, { error: 'Bearer token required' });
            const id = route[1], version = route[2] === 'v2' ? 2 : 1;
            try {
                const current = snapshot(config);
                const group = current.groups.find(item => item.id === id);
                if (!group)
                    return send(res, 404, { error: 'group not found' });
                await serveMcp(req, res, { kind: 'group', group, servers: current.servers }, () => currentGroup(id), version);
            }
            catch (error) {
                if (!res.headersSent)
                    send(res, 502, { error: String(error) });
                else
                    res.destroy();
            }
        } }), 'mcp-manager.groups');
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/mcp/agents', handler: async (req, res) => {
            if (!bearerAccepted(req, agentToken))
                return send(res, 401, { error: 'Bearer token required' });
            const id = new URL(req.url, 'http://localhost').pathname.split('/')[3];
            const target = agents.get(id);
            if (!target)
                return send(res, 404, { error: 'agent MCP endpoint not found' });
            try {
                await serveMcp(req, res, target);
            }
            catch (error) {
                if (!res.headersSent)
                    send(res, 502, { error: String(error) });
                else
                    res.destroy();
            }
        } }), 'mcp-manager.agents');
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/mcp-manager', handler: async (req, res) => {
            const rejected = ctx.connection.requestRejection(req);
            if (rejected)
                return send(res, rejected, { error: 'unauthorized' });
            try {
                const current = snapshot(config);
                if (req.method === 'GET')
                    return send(res, 200, {
                        servers: current.servers.map(server => ({ id: server.id, enabled: server.enabled,
                            addressConfigured: Boolean(server.specUrl || resolvedUrl(server)), managementConfigured: Boolean(server.managementUrl) })),
                        groupPaths: current.groups.map(group => ({ id: group.id, path: `/mcp/groups/${group.id}`,
                            v2Path: `/mcp/groups/${group.id}/v2` })),
                        tokenConfigured: Boolean(current.sharedToken),
                    });
                if (req.method !== 'POST')
                    return send(res, 405, { error: 'method not allowed' });
                const request = await bodyOf(req);
                const server = current.servers.find(item => item.id === request.serverId);
                if (!server)
                    return send(res, 404, { error: 'MCP server not found' });
                if (request.action === 'test') {
                    return send(res, 200, await discover(server));
                }
                if (request.action === 'resources' || request.action === 'resourceTemplates' || request.action === 'readResource') {
                    if (server.specUrl) {
                        const source = await loadOpenApi(server);
                        const result = request.action === 'resources' ? { resources: source.resources }
                            : request.action === 'resourceTemplates' ? { resourceTemplates: source.resourceTemplates }
                                : await readOpenApiResource(source, request.uri);
                        return send(res, 200, result);
                    }
                    const result = await withClient(server, client => request.action === 'resources' ? listAll(client, 'listResources', 'resources')
                        : request.action === 'resourceTemplates' ? listAll(client, 'listResourceTemplates', 'resourceTemplates')
                            : client.readResource({ uri: request.uri }));
                    return send(res, 200, result);
                }
                return send(res, 200, await manage(server, request));
            }
            catch (error) {
                send(res, 400, { error: error instanceof Error ? error.message : String(error) });
            }
        } }), 'mcp-manager.admin');
    ctx.on('agent/created', async ({ agent }) => {
        const preset = scopeParentOf(agent);
        if (!preset)
            return;
        const current = snapshot(config);
        const version = JSON.stringify([current.servers, current.sharedToken]);
        let entry = mounted.get(preset);
        if (!entry || entry.version !== version) {
            const previous = entry;
            entry = { version, users: 0, ready: (async () => {
                    if (previous)
                        await Promise.all((await previous.ready.catch(() => [])).map(scope => scope.dispose()));
                    const scopes = [];
                    try {
                        for (const server of current.servers) {
                            if (!server.enabled || !(server.specUrl || resolvedUrl(server)))
                                continue;
                            const id = randomUUID();
                            const scope = createScope(ctx, preset);
                            scopes.push(scope);
                            agents.set(id, { kind: 'agent', server });
                            scope.ctx.effect(() => () => { agents.delete(id); }, 'mcp-manager.agent-endpoint');
                            await scope.ctx.plugin(McpClient, McpClient.Config({
                                transport: 'streamable-http',
                                serverName: serverName(server),
                                url: `http://127.0.0.1:${ctx.webServer.port}${ctx.webServer.publicPath?.(`/mcp/agents/${id}`) ?? `/mcp/agents/${id}`}`,
                                headers: { Authorization: `Bearer ${agentToken}` },
                            }));
                        }
                        return scopes;
                    }
                    catch (error) {
                        await Promise.all(scopes.map(scope => scope.dispose()));
                        throw error;
                    }
                })() };
            mounted.set(preset, entry);
        }
        entry.users++;
        try {
            await entry.ready;
        }
        catch (error) {
            entry.users--;
            if (mounted.get(preset) === entry)
                mounted.delete(preset);
            throw error;
        }
        activeAgents.add(agent);
        agent.ctx.effect(() => async () => {
            activeAgents.delete(agent);
            entry.users--;
            if (entry.users === 0) {
                if (mounted.get(preset) === entry)
                    mounted.delete(preset);
                await Promise.all((await entry.ready).map(scope => scope.dispose()));
            }
        }, 'mcp-manager.agent');
    }, { prepend: true });
}
