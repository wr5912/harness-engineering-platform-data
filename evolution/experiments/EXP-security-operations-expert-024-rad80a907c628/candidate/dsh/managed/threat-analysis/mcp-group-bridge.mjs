import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const MAX_BODY = 4 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const OPENAPI_RESPONSE_META_KEY = 'io.deepseek.dsh/openapi-response';
const GROUP_TARGET_META_KEY = 'io.deepseek.dsh/mcp-group-target';
const runtimeRequire = createRequire(process.env.DSH_MCP_CLIENT_ANCHOR
    || '/opt/dsh/packages/mcp/mcp-client/package.json');
const { UriTemplate } = runtimeRequire('@modelcontextprotocol/client');
const mapping = (resource, tool, target) => ({ resource, tool, target });
const mcpTool = (sourceId, rawName) => ({ kind: 'tool', sourceId, rawName });
const resource = (sourceId, name) => ({ kind: 'resource', sourceId, name });
const template = (sourceId, name, ...variables) => ({ kind: 'template', sourceId, name, variables });
// 固定流程继续使用原有 logical resource/tool；这里是唯一的 MCP 分组路由表。
export const LOGICAL_MAPPINGS = [
    mapping('ai_soc_correlate', 'ai_soc_correlate__get_correlate_incident_judge_pending', mcpTool('ai-soc-correlate', 'get_correlate_incident_judge_pending')),
    mapping('ai_soc_correlate', 'ai_soc_correlate__create_incident_judgement_claim', mcpTool('ai-soc-correlate', 'create_incident_judgement_claim')),
    mapping('ai_soc_correlate', 'ai_soc_correlate__update_incident_judgement_result', mcpTool('ai-soc-correlate', 'update_incident_judgement_result')),
    mapping('ai_soc_correlate', 'ai_soc_correlate__create_correlate_incident_judgement_fail', mcpTool('ai-soc-correlate', 'create_correlate_incident_judgement_fail')),
    mapping('ai_soc_correlate', 'ai_soc_correlate__get_correlate_threat_intel', mcpTool('ai-soc-correlate', 'get_correlate_threat_intel')),
    mapping('ai_soc_correlate', 'ai_soc_correlate__get_correlate_intel_check', mcpTool('ai-soc-correlate', 'get_correlate_intel_check')),
    mapping('ai_soc_correlate', 'ai_soc_correlate__get_correlate_incident_by_incident_id', template('ai-soc-correlate', 'get_correlate_incident_by_incident_id', 'incidentId')),
    mapping('ai_soc_correlate', 'ai_soc_correlate__get_correlate_reasoning_rules_by_rule_id', template('ai-soc-correlate', 'get_correlate_reasoning_rules_by_rule_id', 'ruleId')),
    mapping('ai_soc_detect', 'ai_soc_detect__get_detect_alert_by_alert_id', template('ai-soc-detect', 'get_detect_alert_by_alert_id', 'alertId')),
    mapping('ai_soc_detect', 'ai_soc_detect__list_detect_whitelist', resource('ai-soc-detect', 'list_detect_whitelist')),
    mapping('ai_soc_event', 'ai_soc_event__search_event', mcpTool('ai-soc-event', 'search_event')),
    mapping('ai_soc_master', 'ai_soc_master__get_soc_asset_by_asset_id', template('ai-soc-master', 'get_soc_asset_by_asset_id', 'assetId')),
    mapping('ai_soc_master', 'ai_soc_master__get_soc_asset_importance', template('ai-soc-master', 'get_soc_asset_importance', 'assetId')),
    mapping('ai_soc_master', 'ai_soc_master__get_soc_asset_biz_systems', template('ai-soc-master', 'get_soc_asset_biz_systems', 'assetId')),
    mapping('ai_soc_ingest', 'ai_soc_ingest__get_ingest_devices_by_asset_by_asset_id', template('ai-soc-ingest', 'get_ingest_devices_by_asset_by_asset_id', 'assetId')),
    mapping('ai_soc_graph', 'ai_soc_graph__get_graph_enrich_topology_by_asset_id', template('ai-soc-graph', 'get_graph_enrich_topology_by_asset_id', 'assetId')),
    mapping('ai_soc_graph', 'ai_soc_graph__get_graph_identity_asset_accounts', template('ai-soc-graph', 'get_graph_identity_asset_accounts', 'assetId')),
    mapping('ai_soc_graph', 'ai_soc_graph__get_graph_lm_login_sequence', mcpTool('ai-soc-graph', 'get_graph_lm_login_sequence')),
    mapping('ai_soc_graph', 'ai_soc_graph__get_graph_flow_host_pair_ports', mcpTool('ai-soc-graph', 'get_graph_flow_host_pair_ports')),
    mapping('report-write', 'save_persistence_result', mcpTool('report-write', 'save_persistence_result')),
];
const keyOf = (resourceName, tool) => `${resourceName}\u0000${tool}`;
const mappingByKey = new Map(LOGICAL_MAPPINGS.map(item => [keyOf(item.resource, item.tool), item]));
export const PENDING_REQUIRED = [
    keyOf('ai_soc_correlate', 'ai_soc_correlate__get_correlate_incident_judge_pending'),
];
export const MANUAL_REQUIRED = LOGICAL_MAPPINGS
    .filter(item => item.resource !== 'report-write' && !PENDING_REQUIRED.includes(keyOf(item.resource, item.tool)))
    .map(item => keyOf(item.resource, item.tool));
function proxyOwner(uri, groupId, sourceId, kind) {
    return typeof uri === 'string'
        && uri.startsWith(`mcp-group:/${groupId}/${sourceId}/${kind}/`)
        && (kind === 'r' ? /^[-_A-Za-z0-9]+$/ : /^[-_A-Za-z0-9]+\{\?[A-Za-z0-9_,.-]+\}$/)
            .test(uri.slice(`mcp-group:/${groupId}/${sourceId}/${kind}/`.length));
}
export function resolveMappings(discovery, groupId = 'threat-analysis-runtime') {
    const tools = Array.isArray(discovery?.tools) ? discovery.tools : [];
    const resources = Array.isArray(discovery?.resources) ? discovery.resources : [];
    const templates = Array.isArray(discovery?.resourceTemplates) ? discovery.resourceTemplates : [];
    const resolved = new Map();
    for (const item of LOGICAL_MAPPINGS) {
        let discovered;
        if (item.target.kind === 'tool') {
            const wire = `${item.target.sourceId.replaceAll('_', '_0')}__${item.target.rawName}`;
            const matches = tools.filter(tool => tool?.name === wire);
            if (matches.length > 1)
                throw new Error(`threat-analysis MCP mapping ambiguous: ${item.target.sourceId}/${item.target.rawName}`);
            discovered = matches[0];
        }
        else if (item.target.kind === 'resource') {
            const matches = resources.filter(value => value?.name === item.target.name
                && proxyOwner(value?.uri, groupId, item.target.sourceId, 'r'));
            if (matches.length > 1)
                throw new Error(`threat-analysis MCP mapping ambiguous: ${item.target.sourceId}/${item.target.name}`);
            discovered = matches[0];
        }
        else {
            const matches = templates.filter(value => value?.name === item.target.name
                && proxyOwner(value?.uriTemplate, groupId, item.target.sourceId, 't'));
            if (matches.length > 1)
                throw new Error(`threat-analysis MCP mapping ambiguous: ${item.target.sourceId}/${item.target.name}`);
            discovered = matches[0];
            if (discovered) {
                const actual = new UriTemplate(discovered.uriTemplate).variableNames;
                if (JSON.stringify(actual) !== JSON.stringify(item.target.variables)) {
                    throw new Error(`threat-analysis MCP template variables changed: ${item.target.sourceId}/${item.target.name}`);
                }
            }
        }
        if (discovered)
            resolved.set(keyOf(item.resource, item.tool), { mapping: item, discovered });
    }
    return resolved;
}
export function assertPreflight(resolved, mode, discovery, groupId = 'threat-analysis-runtime') {
    const required = mode === 'pending' ? PENDING_REQUIRED : MANUAL_REQUIRED;
    const missing = required.filter(key => !resolved.has(key));
    if (missing.length) {
        const labels = missing.map(key => mappingByKey.get(key)?.tool ?? key);
        const counts = discovery ? ` tools=${discovery.tools.length} resources=${discovery.resources.length} templates=${discovery.resourceTemplates.length}` : '';
        throw new Error(`threat-analysis runtime group=${groupId} version=2 digest=${discovery?.targetDigest ?? 'unknown'}${counts} missing required SOC mappings: ${labels.join(', ')}`);
    }
}
async function defaultClientFactory(options) {
    const { Client, StreamableHTTPClientTransport } = runtimeRequire('@modelcontextprotocol/client');
    const client = new Client({ name: 'threat-analysis-runtime', version: '0.1.0' }, {
        versionNegotiation: { mode: 'auto' },
    });
    const transport = new StreamableHTTPClientTransport(new URL(options.groupUrl), {
        ...(options.token ? { requestInit: { headers: { authorization: `Bearer ${options.token}` } } } : {}),
        fetch: options.fetch,
    });
    try {
        await client.connect(transport, { signal: options.signal, timeout: options.requestTimeoutMs });
        return client;
    }
    catch (error) {
        await client.close().catch(() => undefined);
        throw error;
    }
}
async function discover(client, signal, timeout, mode) {
    const request = { signal, timeout };
    const listed = [await client.listTools(undefined, request)];
    if (mode !== 'pending')
        listed.push(await client.listResources(undefined, request), await client.listResourceTemplates(undefined, request));
    const target = listed[0]?._meta?.[GROUP_TARGET_META_KEY];
    const digest = target?.digest;
    if (!/^[a-f0-9]{64}$/.test(digest ?? '') || target?.version !== 2
        || listed.some(value => value?._meta?.[GROUP_TARGET_META_KEY]?.digest !== digest
            || value?._meta?.[GROUP_TARGET_META_KEY]?.version !== 2))
        throw new Error('threat_connection_conflict');
    return { tools: listed[0].tools, resources: listed[1]?.resources ?? [], resourceTemplates: listed[2]?.resourceTemplates ?? [], targetDigest: digest };
}
function parseText(text) {
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function resultPayload(result) {
    if (result?.structuredContent !== undefined)
        return result.structuredContent;
    const text = result?.content?.find((item) => item?.type === 'text')?.text;
    return typeof text === 'string' ? parseText(text) : result?.content ?? {};
}
function resourcePayload(result) {
    const text = result?.contents?.find((item) => typeof item?.text === 'string')?.text;
    return typeof text === 'string' ? parseText(text) : result?.contents ?? {};
}
function statusCode(value) {
    const candidates = [value?.status, value?.status_code, value?.statusCode, value?.code];
    for (const candidate of candidates) {
        const parsed = typeof candidate === 'string' ? Number(candidate) : candidate;
        if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599)
            return parsed;
    }
    const text = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
    const match = /(?:HTTP|status(?: code)?)\s*[:=]?\s*([1-5]\d\d)/i.exec(text);
    return match ? Number(match[1]) : undefined;
}
function targetConflict(error) {
    return /threat_connection_conflict|MCP 分组目标已变化/.test(error?.message ?? '');
}
function failure(error, result) {
    if (targetConflict(error))
        return { status: 'error', status_code: 409, error_type: 'ConnectionConflict' };
    const payload = result === undefined ? undefined : resultPayload(result);
    return {
        status: 'error',
        status_code: statusCode(result?._meta?.[OPENAPI_RESPONSE_META_KEY])
            ?? statusCode(payload) ?? statusCode(error) ?? 502,
        ...(payload === undefined ? {} : { result: payload }),
        error_type: error?.constructor?.name ?? 'McpInvocationError',
    };
}
function expandTemplate(uriTemplate, variables, args) {
    const values = {};
    for (const variable of variables) {
        const value = args?.[variable];
        if (value === undefined || value === null)
            throw new Error(`missing MCP resource argument: ${variable}`);
        values[variable] = String(value);
    }
    return new UriTemplate(uriTemplate).expand(values);
}
async function invoke(client, resolved, payload, signal, timeout, targetDigest) {
    const selected = resolved.get(keyOf(payload.resource, payload.tool));
    if (!selected)
        return { status: 'error', status_code: 503, error_type: 'McpMappingUnavailable' };
    const args = payload.args;
    const _meta = { [GROUP_TARGET_META_KEY]: { digest: targetDigest } };
    try {
        if (selected.mapping.target.kind === 'tool') {
            const result = await client.callTool({ name: selected.discovered.name, arguments: args, _meta }, { signal, timeout });
            if (result?.isError)
                return failure(new Error('MCP tool returned an error'), result);
            return { status: 'success', status_code: 200, result: resultPayload(result) };
        }
        const uri = selected.mapping.target.kind === 'resource'
            ? selected.discovered.uri
            : expandTemplate(selected.discovered.uriTemplate, selected.mapping.target.variables, args);
        const result = await client.readResource({ uri, _meta }, { signal, timeout });
        return { status: 'success', status_code: 200, result: resourcePayload(result) };
    }
    catch (error) {
        return failure(error);
    }
}
function accepted(request, key) {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer '))
        return false;
    const actual = Buffer.from(header.slice(7));
    const expected = Buffer.from(key);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function bodyOf(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY)
            throw new Error('threat-analysis bridge request exceeds 4 MiB');
        chunks.push(chunk);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || typeof value.resource !== 'string' || typeof value.tool !== 'string'
        || !value.args || typeof value.args !== 'object' || Array.isArray(value.args)) {
        throw new Error('invalid threat-analysis bridge request');
    }
    return value;
}
function send(response, status, value) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(value));
}
export async function startMcpGroupBridge(options) {
    if (!['manual', 'pending'].includes(options.mode))
        throw new Error('invalid threat-analysis bridge mode');
    if (options.token !== undefined && (typeof options.token !== 'string' || !options.token))
        throw new Error('invalid threat-analysis MCP group token');
    const groupUrl = new URL(options.groupUrl);
    const path = /(?:^|\/)mcp\/groups\/([A-Za-z0-9_-]{1,32})\/v2\/?$/.exec(groupUrl.pathname);
    if (!['http:', 'https:'].includes(groupUrl.protocol) || groupUrl.username || groupUrl.password
        || groupUrl.search || groupUrl.hash || !path)
        throw new Error('invalid platform MCP group v2 URL');
    const groupId = path[1];
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const timeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const factory = options.clientFactory ?? defaultClientFactory;
    const client = await factory({ groupUrl: groupUrl.href, token: options.token, signal,
        requestTimeoutMs: timeout, fetch: options.fetch });
    let server;
    try {
        const discovery = await discover(client, signal, timeout, options.mode);
        if (options.expectedTargetDigest !== undefined && options.expectedTargetDigest !== discovery.targetDigest)
            throw new Error('threat_connection_conflict');
        const resolved = resolveMappings(discovery, groupId);
        assertPreflight(resolved, options.mode, discovery, groupId);
        const key = randomBytes(32).toString('hex');
        server = createServer(async (request, response) => {
            if (request.method !== 'POST' || new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== '/invoke') {
                send(response, 404, { status: 'error', status_code: 404, error_type: 'NotFound' });
                return;
            }
            if (!accepted(request, key)) {
                send(response, 403, { status: 'error', status_code: 403, error_type: 'Unauthorized' });
                return;
            }
            try {
                const value = await invoke(client, resolved, await bodyOf(request), signal, timeout, discovery.targetDigest);
                send(response, 200, value);
            }
            catch (error) {
                send(response, 400, { status: 'error', status_code: 400,
                    error_type: error?.constructor?.name ?? 'InvalidRequest' });
            }
        });
        await new Promise((resolve, reject) => {
            const failed = (error) => reject(error);
            server.once('error', failed);
            server.listen(0, '127.0.0.1', () => {
                server.off('error', failed);
                resolve();
            });
        });
        let closed = false;
        return {
            key,
            targetDigest: discovery.targetDigest,
            url: `http://127.0.0.1:${server.address().port}`,
            async close() {
                if (closed)
                    return;
                closed = true;
                controller.abort();
                server.closeAllConnections();
                await new Promise(resolve => server.close(() => resolve()));
                await client.close().catch(() => undefined);
            },
        };
    }
    catch (error) {
        controller.abort();
        if (server)
            server.close();
        await client.close().catch(() => undefined);
        throw targetConflict(error) ? new Error('threat_connection_conflict') : error;
    }
}
