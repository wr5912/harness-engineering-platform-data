import { createHash } from 'node:crypto';
import { assertConnectionReady } from './connection.mjs';
export const OPENAPI_RESPONSE_META_KEY = 'io.deepseek.dsh/openapi-response';
const MAX_DOCUMENT = 2 * 1024 * 1024;
const MAX_RESULT = 1024 * 1024;
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
function requestSignal(server) {
    const timeout = AbortSignal.timeout(server.platformTimeoutMs ?? 20_000);
    return server.platformSignal ? AbortSignal.any([server.platformSignal, timeout]) : timeout;
}
export function validateSpecUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
        throw new Error('OpenAPI 规范地址须为不含凭据和片段的 HTTP(S) URL');
    }
    return url.href;
}
async function limitedText(response, limit) {
    if (Number(response.headers.get('content-length')) > limit)
        throw new Error('上游响应过大');
    const body = await response.arrayBuffer();
    if (body.byteLength > limit)
        throw new Error('上游响应过大');
    return new TextDecoder().decode(body);
}
function resolveObject(spec, value) {
    if (!value?.$ref)
        return value;
    const path = String(value.$ref).split('/');
    if (path[0] !== '#' || path[1] !== 'components')
        throw new Error(`不支持的 OpenAPI 引用：${value.$ref}`);
    const target = path.slice(1).reduce((item, part) => item?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
    if (!target)
        throw new Error(`OpenAPI 引用不存在：${value.$ref}`);
    return target;
}
function schemaOf(spec, value, seen = new Set()) {
    // shortcut: 仅保留 DSH 支持的约束；需要严格校验完整 OpenAPI Schema 时扩展 Runtime 子集。
    if (!value || typeof value !== 'object')
        return {};
    if (value.$ref) {
        const prefix = '#/components/schemas/';
        if (!String(value.$ref).startsWith(prefix))
            throw new Error(`不支持的 Schema 引用：${value.$ref}`);
        const name = String(value.$ref).slice(prefix.length);
        const original = spec.components?.schemas?.[name];
        if (!original)
            throw new Error(`Schema 不存在：${name}`);
        // shortcut: 递归引用退化为任意 JSON；需要保留递归约束时再扩展 DSH Schema 支持。
        if (seen.has(name))
            return {};
        return schemaOf(spec, original, new Set([...seen, name]));
    }
    const type = value.type ?? (value.properties ? 'object' : value.items ? 'array' : undefined);
    const result = {};
    for (const key of ['description', 'title', 'default', 'examples']) {
        if (value[key] !== undefined)
            result[key] = value[key];
    }
    if (['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type))
        result.type = type;
    if (result.type === 'object') {
        result.properties = Object.fromEntries(Object.entries(value.properties ?? {}).map(([key, item]) => [key, schemaOf(spec, item, seen)]));
        if (Array.isArray(value.required))
            result.required = value.required;
        if (typeof value.additionalProperties === 'boolean')
            result.additionalProperties = value.additionalProperties;
    }
    else if (result.type === 'array' && value.items)
        result.items = schemaOf(spec, value.items, seen);
    else if (['string', 'number', 'integer', 'boolean', 'null'].includes(result.type)) {
        const matches = (item) => result.type === 'null' ? item === null :
            result.type === 'integer' ? Number.isInteger(item) : typeof item === result.type;
        if (Array.isArray(value.enum) && value.enum.length && value.enum.every(matches))
            result.enum = value.enum;
        if (value.const !== undefined && matches(value.const) && (!result.enum || result.enum.includes(value.const)))
            result.const = value.const;
    }
    return result;
}
function operationUrl(base, path) {
    return new URL(`${base.pathname.replace(/\/$/, '')}${path}`, base.origin);
}
function operationSchema(spec, parameters, body) {
    const properties = {};
    const required = [];
    for (const parameter of parameters) {
        properties[parameter.name] = schemaOf(spec, parameter.schema ?? { type: 'string' });
        if (parameter.description)
            properties[parameter.name].description = parameter.description;
        if (parameter.required || parameter.in === 'path')
            required.push(parameter.name);
    }
    if (body) {
        const content = body.content?.['application/json'];
        if (!content)
            throw new Error('当前仅支持 application/json 请求体');
        properties.body = schemaOf(spec, content.schema ?? { type: 'object' });
        if (body.required)
            required.push('body');
    }
    return { type: 'object', properties, ...(required.length ? { required: [...new Set(required)] } : {}) };
}
function authHeaders(spec, operation, apiKey) {
    if (!apiKey)
        return {};
    const names = Object.keys((operation.security ?? spec.security ?? [])[0] ?? {});
    if (!names.length)
        return { Authorization: `Bearer ${apiKey}` };
    const scheme = spec.components?.securitySchemes?.[names[0]];
    if (scheme?.type === 'apiKey' && scheme.in === 'header')
        return { [scheme.name]: apiKey };
    if (scheme?.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer')
        return { Authorization: `Bearer ${apiKey}` };
    throw new Error('当前仅支持 Header API Key 或 Bearer 认证');
}
export function validateAuthHeader(value) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value))
        throw new Error('凭据 Header 字段名无效');
    return value;
}
const loginCache = new Map();
function loginState(server) {
    const id = String(server.id || server.specUrl);
    const config = JSON.stringify([server.specUrl, server.loginUrl, server.loginUsername, server.loginPassword, server.loginTokenPath]);
    let state = loginCache.get(id);
    if (!state || state.config !== config) {
        state = { config };
        loginCache.set(id, state);
    }
    return state;
}
async function loginToken(server) {
    const state = loginState(server);
    if (state.token)
        return state.token;
    if (!state.pending)
        state.pending = (async () => {
            const response = await fetch(validateSpecUrl(server.loginUrl), {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ username: server.loginUsername, password: server.loginPassword }),
                signal: requestSignal(server),
            });
            if (!response.ok)
                throw new Error(`登录授权失败：HTTP ${response.status}`);
            const result = JSON.parse(await limitedText(response, MAX_RESULT));
            const token = String(server.loginTokenPath || 'token').split('.').reduce((value, part) => value?.[part], result);
            if (typeof token !== 'string' || !token)
                throw new Error('登录响应缺少凭据字段');
            state.token = token;
            return token;
        })().finally(() => { state.pending = undefined; });
    return state.pending;
}
async function authorizedFetch(server, url, init, spec, operation, controlled) {
    const request = async () => {
        const headers = new Headers(init.headers);
        let credential = server.apiKey || '';
        if (server.authType === 'login') {
            credential = await loginToken(server);
            for (const [name, value] of Object.entries(spec ? authHeaders(spec, operation, credential) :
                { Authorization: credential }))
                headers.set(name, value);
        }
        else if (server.authType === 'credential') {
            if (credential)
                headers.set(validateAuthHeader(server.authHeader ?? 'Authorization'), credential);
        }
        else {
            for (const [name, value] of Object.entries(spec ? authHeaders(spec, operation, credential) :
                credential ? { Authorization: `Bearer ${credential}` } : {}))
                headers.set(name, value);
        }
        const dispatch = (signal) => {
            for (const [name, value] of Object.entries(server.platformRequestHeaders?.(url.href) ?? {}))
                headers.set(name, String(value));
            return fetch(url, { ...init, signal: signal ?? init.signal, headers, redirect: controlled ? 'error' : init.redirect });
        };
        const response = controlled && server.platformExecute
            ? await server.platformExecute(controlled, dispatch, init.signal)
            : await dispatch();
        return { response, credential };
    };
    let result = await request();
    // 已派发的业务写请求不因 401 自动重放；规格发现仍可刷新凭据重试。
    if (result.response.status === 401 && server.authType === 'login' && !controlled) {
        const state = loginState(server);
        if (state.token === result.credential)
            state.token = undefined;
        result = await request();
    }
    return result;
}
export async function loadOpenApi(server) {
    assertConnectionReady(server);
    const specUrl = validateSpecUrl(server.specUrl);
    let response = await fetch(specUrl, { signal: requestSignal(server) });
    let retriedWithAuth = false;
    if ([401, 403].includes(response.status) && (server.authType === 'login' || server.apiKey)) {
        await response.body?.cancel();
        response = (await authorizedFetch(server, new URL(specUrl), { signal: requestSignal(server) })).response;
        retriedWithAuth = true;
    }
    if (!response.ok)
        throw new Error(`读取 OpenAPI 规范失败：HTTP ${response.status}（${retriedWithAuth ? '凭据重试' : '匿名访问'}）`);
    const spec = JSON.parse(await limitedText(response, MAX_DOCUMENT));
    if (!spec.openapi || !spec.paths || typeof spec.paths !== 'object')
        throw new Error('OpenAPI 规范缺少 openapi 或 paths');
    const base = new URL(spec.servers?.[0]?.url ?? '/', specUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
        throw new Error('OpenAPI servers[0].url 无效');
    }
    const tools = [];
    const resources = [];
    const resourceTemplates = [];
    const operations = new Map();
    const readable = [];
    for (const [path, pathItem] of Object.entries(spec.paths)) {
        for (const [method, raw] of Object.entries(pathItem)) {
            if (!methods.has(method))
                continue;
            const name = String(raw.operationId || `${method}_${path}`).replace(/[^A-Za-z0-9_.-]/g, '_');
            if (operations.has(name))
                throw new Error(`OpenAPI 操作名重复：${name}`);
            const parameters = [...(pathItem.parameters ?? []), ...(raw.parameters ?? [])].map(item => resolveObject(spec, item));
            const body = raw.requestBody ? resolveObject(spec, raw.requestBody) : undefined;
            const uri = operationUrl(base, path).href;
            const description = raw.summary || raw.description || `${method.toUpperCase()} ${path}`;
            const httpOperation = { method: method.toUpperCase(), path };
            const item = { name, method, path, parameters, body, raw, uri, description };
            operations.set(name, item);
            const queryReadable = method === 'get' && parameters.some(parameter => parameter.in === 'query');
            if (method === 'get' && !body && parameters.every(parameter => ['path', 'query'].includes(parameter.in)
                && (parameter.in !== 'query' || parameter.schema?.type !== 'array' && /^[A-Za-z0-9_.-]+$/.test(parameter.name)))) {
                readable.push(item);
                const info = { name, title: raw.summary, description, httpOperation, mimeType: 'application/json',
                    inputSchema: { ...operationSchema(spec, parameters, body), additionalProperties: false } };
                if (parameters.length) {
                    const queryNames = parameters.filter(parameter => parameter.in === 'query').map(parameter => parameter.name);
                    resourceTemplates.push({ ...info, uriTemplate: uri.replace(/%7B/gi, '{').replace(/%7D/gi, '}')
                            + (queryNames.length ? `{?${queryNames.join(',')}}` : '') });
                }
                else
                    resources.push({ ...info, uri });
                if (queryReadable)
                    tools.push({ name, title: raw.summary, description, httpOperation, inputSchema: operationSchema(spec, parameters, body) });
            }
            else {
                tools.push({ name, title: raw.summary, description, httpOperation, inputSchema: operationSchema(spec, parameters, body) });
            }
        }
    }
    const businessTools = [...tools, ...readable.filter(item => !tools.some(tool => tool.name === item.name)).map(item => ({ name: item.name, title: item.raw.summary,
            description: item.description, httpOperation: { method: item.method.toUpperCase(), path: item.path },
            inputSchema: operationSchema(spec, item.parameters, item.body) }))];
    return { spec, base, tools, businessTools, resources, resourceTemplates, operations, readable, server };
}
async function execute(source, item, args) {
    const url = operationUrl(source.base, item.path);
    for (const parameter of item.parameters) {
        const value = args?.[parameter.name];
        if (value === undefined || value === null) {
            if (parameter.required || parameter.in === 'path')
                throw new Error(`缺少参数：${parameter.name}`);
            continue;
        }
        if (parameter.in === 'path')
            url.pathname = url.pathname.replace(encodeURIComponent(`{${parameter.name}}`), encodeURIComponent(String(value)));
        if (parameter.in === 'query')
            for (const entry of Array.isArray(value) ? value : [value])
                url.searchParams.append(parameter.name, String(entry));
    }
    const headers = {};
    for (const parameter of item.parameters.filter((entry) => entry.in === 'header')) {
        if (args?.[parameter.name] !== undefined)
            headers[parameter.name] = String(args[parameter.name]);
    }
    if (item.body)
        headers['content-type'] = 'application/json';
    const controlled = { serverId: source.server.id, operationId: item.name, kind: 'write',
        target: url.href, method: item.method.toUpperCase(), args,
        schemaDigest: createHash('sha256').update(JSON.stringify(item.raw)).digest('hex') };
    const { response, credential } = await authorizedFetch(source.server, url, { method: item.method.toUpperCase(), headers,
        body: item.body ? JSON.stringify(bodyArgument(source, item, args)) : undefined,
        signal: requestSignal(source.server) }, source.spec, item.raw, controlled);
    const raw = await limitedText(response, MAX_RESULT);
    let text = raw;
    for (const secret of [credential, source.server.apiKey, source.server.loginPassword]) {
        if (secret)
            text = text.replaceAll(secret, '[redacted]');
    }
    return { response, text, uri: url.href };
}
export async function callOpenApiTool(source, name, args) {
    const item = source.operations.get(name);
    if (!item || source.readable.includes(item) && !source.server.platformToolResources
        && !source.tools.some((tool) => tool.name === name))
        throw new Error('工具不属于当前 OpenAPI 范围');
    const { response, text } = await execute(source, item, args);
    return {
        _meta: { [OPENAPI_RESPONSE_META_KEY]: { status: response.status } },
        content: [{ type: 'text', text: text || `HTTP ${response.status}` }],
        isError: !response.ok,
    };
}
async function readResourceOperation(source, item, args, uri) {
    const { response, text } = await execute(source, item, args);
    if (!response.ok)
        throw new Error(`Resource 读取失败：HTTP ${response.status}`);
    return { contents: [{ uri, mimeType: response.headers.get('content-type')?.split(';')[0] || 'application/json', text }] };
}
export async function readOpenApiResource(source, uri, args) {
    if (args !== undefined) {
        const resource = [...source.resources, ...source.resourceTemplates].find(item => (item.uri ?? item.uriTemplate) === uri);
        if (!resource)
            throw new Error('Resource URI 不属于当前 OpenAPI 范围');
        return readResourceOperation(source, source.operations.get(resource.name), args, uri);
    }
    const request = new URL(uri);
    if (request.hash)
        throw new Error('Resource URI 不属于当前 OpenAPI 范围');
    for (const item of source.readable) {
        const template = new URL(item.uri);
        if (request.origin !== template.origin)
            continue;
        const expected = template.pathname.split('/').map(decodeURIComponent);
        const actual = request.pathname.split('/');
        if (expected.length !== actual.length)
            continue;
        const args = Object.create(null);
        if (!expected.every((part, index) => {
            const variable = /^\{([^{}]+)\}$/.exec(part);
            if (variable) {
                args[variable[1]] = decodeURIComponent(actual[index]);
                return true;
            }
            return part === decodeURIComponent(actual[index]);
        }))
            continue;
        const queryNames = item.parameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name);
        if ([...request.searchParams.keys()].some(name => !queryNames.includes(name) || request.searchParams.getAll(name).length !== 1))
            continue;
        for (const name of queryNames) {
            const value = request.searchParams.get(name);
            if (value !== null)
                args[name] = value;
        }
        return readResourceOperation(source, item, args, uri);
    }
    throw new Error('Resource URI 不属于当前 OpenAPI 范围');
}
// Candidate compatibility: reconstruct only the existing JSON body shapes.
// Resource arguments still pass the upstream validateJsonSchemaValue boundary unchanged.
function normalizeJsonArgument(value) {
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('['))
        return value;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return value;
    }
}
function bodyArgument(source, item, args) {
    if (args && typeof args === 'object' && args.body !== undefined)
        return normalizeJsonArgument(args.body);
    const schema = item?.body?.content?.['application/json']?.schema;
    if (!schema || !args || typeof args !== 'object')
        return undefined;
    const ref = typeof schema.$ref === 'string' ? schema.$ref.split('/').pop() : undefined;
    const resolved = ref ? source?.spec?.components?.schemas?.[ref] : schema;
    const properties = resolved?.properties;
    if (!properties)
        return undefined;
    const picked = {};
    for (const key of Object.keys(properties))
        if (args[key] !== undefined)
            picked[key] = args[key];
    return Object.keys(picked).length ? picked : undefined;
}
