// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.ts
import { createHash as createHash2, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";

// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/openapi.ts
import { createHash } from "node:crypto";

// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/connection.ts
function connectionIssue(server) {
  if (server.platformComposition) return;
  if (server.specUrl) {
    if (server.authType === "login" && (!server.loginUrl || !server.loginUsername || !server.loginPassword || !server.loginTokenPath)) return "\u767B\u5F55\u6388\u6743\u4FE1\u606F\u5F85\u8865\u5145";
    if (server.authType === "credential" && !server.apiKey) return "\u8BBF\u95EE\u51ED\u636E\u5F85\u8865\u5145";
  } else {
    if (!server.url) return "MCP \u5730\u5740\u5F85\u8865\u5145";
    if (server.headers?.some((header) => !header.value)) return "\u8BF7\u6C42 Header \u51ED\u636E\u5F85\u8865\u5145";
  }
}
function assertConnectionReady(server) {
  const issue = connectionIssue(server);
  if (issue) throw new Error(`${server.id}: ${issue}\uFF0C\u8BF7\u5728 MCP \u7BA1\u7406\u4E2D\u8865\u5168\u5E76\u4FDD\u5B58`);
}

// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/openapi.ts
var OPENAPI_RESPONSE_META_KEY = "io.deepseek.dsh/openapi-response";
var MAX_DOCUMENT = 2 * 1024 * 1024;
var MAX_RESULT = 1024 * 1024;
var methods = /* @__PURE__ */ new Set(["get", "post", "put", "patch", "delete"]);
function requestSignal(server) {
  const timeout = AbortSignal.timeout(server.platformTimeoutMs ?? 2e4);
  return server.platformSignal ? AbortSignal.any([server.platformSignal, timeout]) : timeout;
}
function validateSpecUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("OpenAPI \u89C4\u8303\u5730\u5740\u987B\u4E3A\u4E0D\u542B\u51ED\u636E\u548C\u7247\u6BB5\u7684 HTTP(S) URL");
  }
  return url.href;
}
async function limitedText(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) throw new Error("\u4E0A\u6E38\u54CD\u5E94\u8FC7\u5927");
  const body = await response.arrayBuffer();
  if (body.byteLength > limit) throw new Error("\u4E0A\u6E38\u54CD\u5E94\u8FC7\u5927");
  return new TextDecoder().decode(body);
}
function resolveObject(spec, value) {
  if (!value?.$ref) return value;
  const path = String(value.$ref).split("/");
  if (path[0] !== "#" || path[1] !== "components") throw new Error(`\u4E0D\u652F\u6301\u7684 OpenAPI \u5F15\u7528\uFF1A${value.$ref}`);
  const target = path.slice(1).reduce((item, part) => item?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
  if (!target) throw new Error(`OpenAPI \u5F15\u7528\u4E0D\u5B58\u5728\uFF1A${value.$ref}`);
  return target;
}
function schemaOf(spec, value, seen = /* @__PURE__ */ new Set()) {
  if (!value || typeof value !== "object") return {};
  if (value.$ref) {
    const prefix = "#/components/schemas/";
    if (!String(value.$ref).startsWith(prefix)) throw new Error(`\u4E0D\u652F\u6301\u7684 Schema \u5F15\u7528\uFF1A${value.$ref}`);
    const name2 = String(value.$ref).slice(prefix.length);
    const original = spec.components?.schemas?.[name2];
    if (!original) throw new Error(`Schema \u4E0D\u5B58\u5728\uFF1A${name2}`);
    if (seen.has(name2)) return {};
    return schemaOf(spec, original, /* @__PURE__ */ new Set([...seen, name2]));
  }
  const type = value.type ?? (value.properties ? "object" : value.items ? "array" : void 0);
  const result = {};
  for (const key2 of ["description", "title", "default", "examples"]) {
    if (value[key2] !== void 0) result[key2] = value[key2];
  }
  if (["object", "array", "string", "number", "integer", "boolean", "null"].includes(type)) result.type = type;
  if (result.type === "object") {
    result.properties = Object.fromEntries(Object.entries(value.properties ?? {}).map(([key2, item]) => [key2, schemaOf(spec, item, seen)]));
    if (Array.isArray(value.required)) result.required = value.required;
    if (typeof value.additionalProperties === "boolean") result.additionalProperties = value.additionalProperties;
  } else if (result.type === "array" && value.items) result.items = schemaOf(spec, value.items, seen);
  else if (["string", "number", "integer", "boolean", "null"].includes(result.type)) {
    const matches = (item) => result.type === "null" ? item === null : result.type === "integer" ? Number.isInteger(item) : typeof item === result.type;
    if (Array.isArray(value.enum) && value.enum.length && value.enum.every(matches)) result.enum = value.enum;
    if (value.const !== void 0 && matches(value.const) && (!result.enum || result.enum.includes(value.const))) result.const = value.const;
  }
  return result;
}
function operationUrl(base, path) {
  return new URL(`${base.pathname.replace(/\/$/, "")}${path}`, base.origin);
}
function operationSchema(spec, parameters, body) {
  const properties = {};
  const required = [];
  for (const parameter of parameters) {
    properties[parameter.name] = schemaOf(spec, parameter.schema ?? { type: "string" });
    if (parameter.description) properties[parameter.name].description = parameter.description;
    if (parameter.required || parameter.in === "path") required.push(parameter.name);
  }
  if (body) {
    const content = body.content?.["application/json"];
    if (!content) throw new Error("\u5F53\u524D\u4EC5\u652F\u6301 application/json \u8BF7\u6C42\u4F53");
    properties.body = schemaOf(spec, content.schema ?? { type: "object" });
    if (body.required) required.push("body");
  }
  return { type: "object", properties, ...required.length ? { required: [...new Set(required)] } : {} };
}
function authHeaders(spec, operation, apiKey) {
  if (!apiKey) return {};
  const names = Object.keys((operation.security ?? spec.security ?? [])[0] ?? {});
  if (!names.length) return { Authorization: `Bearer ${apiKey}` };
  const scheme = spec.components?.securitySchemes?.[names[0]];
  if (scheme?.type === "apiKey" && scheme.in === "header") return { [scheme.name]: apiKey };
  if (scheme?.type === "http" && scheme.scheme?.toLowerCase() === "bearer") return { Authorization: `Bearer ${apiKey}` };
  throw new Error("\u5F53\u524D\u4EC5\u652F\u6301 Header API Key \u6216 Bearer \u8BA4\u8BC1");
}
function validateAuthHeader(value) {
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)) throw new Error("\u51ED\u636E Header \u5B57\u6BB5\u540D\u65E0\u6548");
  return value;
}
var loginCache = /* @__PURE__ */ new Map();
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
  if (state.token) return state.token;
  if (!state.pending) state.pending = (async () => {
    const response = await fetch(validateSpecUrl(server.loginUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: server.loginUsername, password: server.loginPassword }),
      signal: requestSignal(server)
    });
    if (!response.ok) throw new Error(`\u767B\u5F55\u6388\u6743\u5931\u8D25\uFF1AHTTP ${response.status}`);
    const result = JSON.parse(await limitedText(response, MAX_RESULT));
    const token = String(server.loginTokenPath || "token").split(".").reduce((value, part) => value?.[part], result);
    if (typeof token !== "string" || !token) throw new Error("\u767B\u5F55\u54CD\u5E94\u7F3A\u5C11\u51ED\u636E\u5B57\u6BB5");
    state.token = token;
    return token;
  })().finally(() => {
    state.pending = void 0;
  });
  return state.pending;
}
async function authorizedFetch(server, url, init, spec, operation, controlled) {
  const request = async () => {
    const headers = new Headers(init.headers);
    let credential = server.apiKey || "";
    if (server.authType === "login") {
      credential = await loginToken(server);
      for (const [name2, value] of Object.entries(spec ? authHeaders(spec, operation, credential) : { Authorization: credential })) headers.set(name2, value);
    } else if (server.authType === "credential") {
      if (credential) headers.set(validateAuthHeader(server.authHeader ?? "Authorization"), credential);
    } else {
      for (const [name2, value] of Object.entries(spec ? authHeaders(spec, operation, credential) : credential ? { Authorization: `Bearer ${credential}` } : {})) headers.set(name2, value);
    }
    const dispatch = (signal) => {
      for (const [name2, value] of Object.entries(server.platformRequestHeaders?.(url.href) ?? {})) headers.set(name2, String(value));
      return fetch(url, { ...init, signal: signal ?? init.signal, headers, redirect: controlled ? "error" : init.redirect });
    };
    const response = controlled && server.platformExecute ? await server.platformExecute(controlled, dispatch, init.signal) : await dispatch();
    return { response, credential };
  };
  let result = await request();
  if (result.response.status === 401 && server.authType === "login" && !controlled) {
    const state = loginState(server);
    if (state.token === result.credential) state.token = void 0;
    result = await request();
  }
  return result;
}
async function loadOpenApi(server) {
  assertConnectionReady(server);
  const specUrl = validateSpecUrl(server.specUrl);
  let response = await fetch(specUrl, { signal: requestSignal(server) });
  let retriedWithAuth = false;
  if ([401, 403].includes(response.status) && (server.authType === "login" || server.apiKey)) {
    await response.body?.cancel();
    response = (await authorizedFetch(server, new URL(specUrl), { signal: requestSignal(server) })).response;
    retriedWithAuth = true;
  }
  if (!response.ok) throw new Error(`\u8BFB\u53D6 OpenAPI \u89C4\u8303\u5931\u8D25\uFF1AHTTP ${response.status}\uFF08${retriedWithAuth ? "\u51ED\u636E\u91CD\u8BD5" : "\u533F\u540D\u8BBF\u95EE"}\uFF09`);
  const spec = JSON.parse(await limitedText(response, MAX_DOCUMENT));
  if (!spec.openapi || !spec.paths || typeof spec.paths !== "object") throw new Error("OpenAPI \u89C4\u8303\u7F3A\u5C11 openapi \u6216 paths");
  const base = new URL(spec.servers?.[0]?.url ?? "/", specUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("OpenAPI servers[0].url \u65E0\u6548");
  }
  const tools = [];
  const resources = [];
  const resourceTemplates = [];
  const operations = /* @__PURE__ */ new Map();
  const readable = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, raw] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      const name2 = String(raw.operationId || `${method}_${path}`).replace(/[^A-Za-z0-9_.-]/g, "_");
      if (operations.has(name2)) throw new Error(`OpenAPI \u64CD\u4F5C\u540D\u91CD\u590D\uFF1A${name2}`);
      const parameters = [...pathItem.parameters ?? [], ...raw.parameters ?? []].map((item2) => resolveObject(spec, item2));
      const body = raw.requestBody ? resolveObject(spec, raw.requestBody) : void 0;
      const uri = operationUrl(base, path).href;
      const description = raw.summary || raw.description || `${method.toUpperCase()} ${path}`;
      const httpOperation = { method: method.toUpperCase(), path };
      const item = { name: name2, method, path, parameters, body, raw, uri, description };
      operations.set(name2, item);
      const queryReadable = method === "get" && parameters.some((parameter) => parameter.in === "query");
      if (method === "get" && !body && parameters.every((parameter) => ["path", "query"].includes(parameter.in) && (parameter.in !== "query" || parameter.schema?.type !== "array" && /^[A-Za-z0-9_.-]+$/.test(parameter.name)))) {
        readable.push(item);
        const info = {
          name: name2,
          title: raw.summary,
          description,
          httpOperation,
          mimeType: "application/json",
          inputSchema: { ...operationSchema(spec, parameters, body), additionalProperties: false }
        };
        if (parameters.length) {
          const queryNames = parameters.filter((parameter) => parameter.in === "query").map((parameter) => parameter.name);
          resourceTemplates.push({ ...info, uriTemplate: uri.replace(/%7B/gi, "{").replace(/%7D/gi, "}") + (queryNames.length ? `{?${queryNames.join(",")}}` : "") });
        } else resources.push({ ...info, uri });
        if (queryReadable) tools.push({ name: name2, title: raw.summary, description, httpOperation, inputSchema: operationSchema(spec, parameters, body) });
      } else {
        tools.push({ name: name2, title: raw.summary, description, httpOperation, inputSchema: operationSchema(spec, parameters, body) });
      }
    }
  }
  const businessTools = [...tools, ...readable.filter((item) => !tools.some((tool) => tool.name === item.name)).map((item) => ({
    name: item.name,
    title: item.raw.summary,
    description: item.description,
    httpOperation: { method: item.method.toUpperCase(), path: item.path },
    inputSchema: operationSchema(spec, item.parameters, item.body)
  }))];
  return { spec, base, tools, businessTools, resources, resourceTemplates, operations, readable, server };
}
async function execute(source, item, args) {
  const url = operationUrl(source.base, item.path);
  for (const parameter of item.parameters) {
    const value = args?.[parameter.name];
    if (value === void 0 || value === null) {
      if (parameter.required || parameter.in === "path") throw new Error(`\u7F3A\u5C11\u53C2\u6570\uFF1A${parameter.name}`);
      continue;
    }
    if (parameter.in === "path") url.pathname = url.pathname.replace(encodeURIComponent(`{${parameter.name}}`), encodeURIComponent(String(value)));
    if (parameter.in === "query") for (const entry of Array.isArray(value) ? value : [value]) url.searchParams.append(parameter.name, String(entry));
  }
  const headers = {};
  for (const parameter of item.parameters.filter((entry) => entry.in === "header")) {
    if (args?.[parameter.name] !== void 0) headers[parameter.name] = String(args[parameter.name]);
  }
  if (item.body) headers["content-type"] = "application/json";
  const controlled = {
    serverId: source.server.id,
    operationId: item.name,
    kind: "write",
    target: url.href,
    method: item.method.toUpperCase(),
    args,
    schemaDigest: createHash("sha256").update(JSON.stringify(item.raw)).digest("hex")
  };
  const { response, credential } = await authorizedFetch(source.server, url, {
    method: item.method.toUpperCase(),
    headers,
    body: item.body ? JSON.stringify(bodyArgument(source, item, args)) : void 0,
    signal: requestSignal(source.server)
  }, source.spec, item.raw, controlled);
  const raw = await limitedText(response, MAX_RESULT);
  let text = raw;
  for (const secret of [credential, source.server.apiKey, source.server.loginPassword]) {
    if (secret) text = text.replaceAll(secret, "[redacted]");
  }
  return { response, text, uri: url.href };
}
async function callOpenApiTool(source, name2, args) {
  const item = source.operations.get(name2);
  if (!item || source.readable.includes(item) && !source.server.platformToolResources && !source.tools.some((tool) => tool.name === name2)) throw new Error("\u5DE5\u5177\u4E0D\u5C5E\u4E8E\u5F53\u524D OpenAPI \u8303\u56F4");
  const { response, text } = await execute(source, item, args);
  return {
    _meta: { [OPENAPI_RESPONSE_META_KEY]: { status: response.status } },
    content: [{ type: "text", text: text || `HTTP ${response.status}` }],
    isError: !response.ok
  };
}
async function readResourceOperation(source, item, args, uri) {
  const { response, text } = await execute(source, item, args);
  if (!response.ok) throw new Error(`Resource \u8BFB\u53D6\u5931\u8D25\uFF1AHTTP ${response.status}`);
  return { contents: [{ uri, mimeType: response.headers.get("content-type")?.split(";")[0] || "application/json", text }] };
}
async function readOpenApiResource(source, uri, args) {
  if (args !== void 0) {
    const resource = [...source.resources, ...source.resourceTemplates].find((item) => (item.uri ?? item.uriTemplate) === uri);
    if (!resource) throw new Error("Resource URI \u4E0D\u5C5E\u4E8E\u5F53\u524D OpenAPI \u8303\u56F4");
    return readResourceOperation(source, source.operations.get(resource.name), args, uri);
  }
  const request = new URL(uri);
  if (request.hash) throw new Error("Resource URI \u4E0D\u5C5E\u4E8E\u5F53\u524D OpenAPI \u8303\u56F4");
  for (const item of source.readable) {
    const template = new URL(item.uri);
    if (request.origin !== template.origin) continue;
    const expected = template.pathname.split("/").map(decodeURIComponent);
    const actual = request.pathname.split("/");
    if (expected.length !== actual.length) continue;
    const args2 = /* @__PURE__ */ Object.create(null);
    if (!expected.every((part, index) => {
      const variable = /^\{([^{}]+)\}$/.exec(part);
      if (variable) {
        args2[variable[1]] = decodeURIComponent(actual[index]);
        return true;
      }
      return part === decodeURIComponent(actual[index]);
    })) continue;
    const queryNames = item.parameters.filter((parameter) => parameter.in === "query").map((parameter) => parameter.name);
    if ([...request.searchParams.keys()].some((name2) => !queryNames.includes(name2) || request.searchParams.getAll(name2).length !== 1)) continue;
    for (const name2 of queryNames) {
      const value = request.searchParams.get(name2);
      if (value !== null) args2[name2] = value;
    }
    return readResourceOperation(source, item, args2, uri);
  }
  throw new Error("Resource URI \u4E0D\u5C5E\u4E8E\u5F53\u524D OpenAPI \u8303\u56F4");
}
function normalizeJsonArgument(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}
function bodyArgument(source, item, args) {
  if (args && typeof args === "object" && args.body !== void 0) return normalizeJsonArgument(args.body);
  const schema = item?.body?.content?.["application/json"]?.schema;
  if (!schema || !args || typeof args !== "object") return void 0;
  const ref = typeof schema.$ref === "string" ? schema.$ref.split("/").pop() : void 0;
  const resolved = ref ? source?.spec?.components?.schemas?.[ref] : schema;
  const properties = resolved?.properties;
  if (!properties) return void 0;
  const picked = {};
  for (const key2 of Object.keys(properties)) if (args[key2] !== void 0) picked[key2] = args[key2];
  return Object.keys(picked).length ? picked : void 0;
}

// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.ts
var runtimeRequire = createRequire(process.env.DSH_MCP_CLIENT_ANCHOR || "/opt/dsh/packages/mcp/mcp-client/package.json");
var z = runtimeRequire("@deepseek-ai/schemastery");
var { Client, StreamableHTTPClientTransport, UriTemplate } = runtimeRequire("@modelcontextprotocol/client");
var { McpServer, createMcpHandler } = runtimeRequire("@modelcontextprotocol/server");
var { toNodeHandler } = runtimeRequire("@modelcontextprotocol/node");
var { createScope, scopeParentOf } = await import(runtimeRequire.resolve("@deepseek-ai/dsh-scope"));
var McpClient = await import(runtimeRequire.resolve("@deepseek-ai/dsh-mcp-client"));
var { validateJsonSchemaValue } = await import(runtimeRequire.resolve("@deepseek-ai/dsh-tools"));
var name = "mcp-session-manager";
var inject = ["agents", "webServer", "connection", "tools"];
var key = z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/);
var toolPolicy = z.object({
  mode: z.union([z.const("all"), z.const("selected")]).default("all"),
  names: z.array(z.string()).default([])
});
var serverSchema = z.object({
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
  tools: toolPolicy
});
var groupSchema = z.object({
  id: key,
  members: z.array(z.object({
    serverId: key,
    names: z.array(z.string()).default([]),
    resourceUris: z.array(z.string()).default([]),
    resourceTemplates: z.array(z.string()).default([])
  })).default([])
});
var Config = z.object({
  servers: z.array(serverSchema).default([]).volatile(),
  groups: z.array(groupSchema).default([]).volatile(),
  sharedToken: z.string().default("").volatile()
});
var namePattern = /^[A-Za-z0-9_-]{1,32}$/;
var headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
var MAX_BODY = 64 * 1024;
var MAX_RESPONSE = 1024 * 1024;
function serverFingerprint(server) {
  const { platformClient, ...connection } = server;
  return createHash2("sha256").update(JSON.stringify(connection)).digest("hex");
}
function validateUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("MCP \u5730\u5740\u987B\u4E3A\u4E0D\u542B\u51ED\u636E\u3001\u67E5\u8BE2\u53C2\u6570\u548C\u7247\u6BB5\u7684 HTTP(S) URL");
  }
  return url.href;
}
function snapshot(config) {
  const servers = structuredClone(config.servers.get());
  const groups = structuredClone(config.groups.get());
  const sharedToken = config.sharedToken.get();
  if (sharedToken && !/^[0-9a-f]{64}$/.test(sharedToken)) throw new Error("\u7EDF\u4E00 Token \u683C\u5F0F\u65E0\u6548\uFF1B\u8BF7\u5728\u5DE5\u5177\u5206\u7EC4\u9875\u91CD\u65B0\u751F\u6210");
  const ids = /* @__PURE__ */ new Set();
  const names = /* @__PURE__ */ new Set();
  for (const server of servers) {
    const serverName2 = server.serverName || server.id;
    if (!namePattern.test(server.id) || !namePattern.test(serverName2) || ids.has(server.id) || names.has(serverName2)) throw new Error("MCP \u670D\u52A1\u5668 ID \u6216\u540D\u79F0\u91CD\u590D/\u65E0\u6548");
    ids.add(server.id);
    names.add(serverName2);
    if (server.specUrl) {
      validateSpecUrl(server.specUrl);
      if (server.url || server.managementUrl || server.headers?.length) throw new Error(`${server.id}: OpenAPI \u4E0E\u73B0\u6210 MCP \u8FDE\u63A5\u4E0D\u80FD\u6DF7\u7528`);
      if (server.authType === "login") {
        if (server.loginUrl) validateSpecUrl(server.loginUrl);
        if (server.loginTokenPath && !server.loginTokenPath.split(".").every((part) => /^[A-Za-z_][\w-]*$/.test(part))) throw new Error(`${server.id}: \u51ED\u636E\u5B57\u6BB5\u8DEF\u5F84\u65E0\u6548`);
      } else if (server.authType === "credential") {
        validateAuthHeader(server.authHeader ?? "Authorization");
      } else if (server.authType) throw new Error(`${server.id}: \u4E0D\u652F\u6301\u7684\u6388\u6743\u65B9\u5F0F`);
      continue;
    }
    if (server.url) validateUrl(server.url);
    if (server.managementUrl) validateUrl(server.managementUrl);
    if (server.enabled && !server.url) throw new Error(`${server.id}: \u7F3A\u5C11 MCP URL`);
    const headerNames = /* @__PURE__ */ new Set();
    for (const header of server.headers ?? []) {
      const name2 = header.name?.toLowerCase();
      if (!headerNamePattern.test(header.name) || /[\r\n]/.test(header.value) || headerNames.has(name2)) {
        throw new Error(`${server.id}: \u8BF7\u6C42 Header \u65E0\u6548\u6216\u91CD\u590D`);
      }
      headerNames.add(name2);
    }
    if (server.tools.mode === "selected" && new Set(server.tools.names).size !== server.tools.names.length) {
      throw new Error(`${server.id}: \u5DE5\u5177\u540D\u91CD\u590D`);
    }
  }
  const groupIds = /* @__PURE__ */ new Set();
  for (const group of groups) {
    if (!namePattern.test(group.id) || groupIds.has(group.id)) throw new Error("MCP \u5206\u7EC4 ID \u91CD\u590D/\u65E0\u6548");
    groupIds.add(group.id);
    for (const member of group.members) {
      const selections = [member.names ?? [], member.resourceUris ?? [], member.resourceTemplates ?? []];
      if (!ids.has(member.serverId) || !selections.some((items) => items.length) || selections.some((items) => items.some((item) => typeof item !== "string" || !item) || new Set(items).size !== items.length)) {
        throw new Error(`${group.id}: \u5206\u7EC4\u6210\u5458\u3001\u5DE5\u5177\u6216\u8D44\u6E90\u9009\u62E9\u65E0\u6548/\u91CD\u590D`);
      }
    }
  }
  return { servers: servers.map((server) => {
    const expected = serverFingerprint(server);
    const groupTransport = config.platformTransportForServer?.(server);
    const assertCurrent = () => {
      const current = config.servers.get().find((item) => item.id === server.id);
      if (!current || current.enabled === false || serverFingerprint(current) !== expected) throw new Error("MCP \u5F53\u524D\u8FDE\u63A5\u6216\u5DE5\u5177\u8303\u56F4\u5DF2\u53D8\u5316");
    };
    return {
      ...server,
      ...groupTransport ? { platformFetch: groupTransport.fetch, platformGroup: true } : {},
      platformToolResources: Boolean(config.withToolContext),
      platformAssertCurrent: assertCurrent,
      platformRequestHeaders: config.platformExecute?.requestHeaders,
      platformExecute: config.platformExecute ? (operation, dispatch, signal) => config.platformExecute(operation, (controlledSignal) => {
        assertCurrent();
        return dispatch(controlledSignal);
      }, signal) : void 0
    };
  }), groups, sharedToken };
}
function validateConfiguration(value) {
  snapshot({
    servers: { get: () => value.servers },
    groups: { get: () => value.groups },
    sharedToken: { get: () => value.sharedToken },
    platformClient: {}
  });
}
function resolvedUrl(server) {
  return server.url ? validateUrl(server.url) : void 0;
}
function serverName(server) {
  return server.serverName || server.id;
}
function publicToolName(name2, rawName) {
  const joined = `mcp__${name2}__${rawName}`;
  const normalized = joined.replace(/[^A-Za-z0-9_-]/g, "_");
  if (normalized === joined && normalized.length <= 64) return normalized;
  const hash = createHash2("sha256").update(`${name2}\0${rawName}`).digest("hex").slice(0, 12);
  return `${normalized.slice(0, 51)}_${hash}`;
}
async function serverTools(server) {
  if (server.specUrl) {
    const source = await loadOpenApi(server);
    return server.platformToolResources ? source.businessTools : source.tools;
  }
  return withClient(server, (client) => listCatalog(client, "tools", server.platformSignal));
}
async function listAll(client, method, field, signal) {
  const items = [];
  const cursors = /* @__PURE__ */ new Set();
  let cursor;
  do {
    const page = await client[method](cursor ? { cursor } : void 0, { signal });
    items.push(...page[field]);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error("MCP \u5206\u9875\u6E38\u6807\u91CD\u590D");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return { [field]: items };
}
async function listCatalog(client, kind, signal) {
  const capability = kind === "tools" ? "tools" : "resources";
  if (typeof client.getServerCapabilities === "function" && !client.getServerCapabilities()?.[capability]) return [];
  const method = kind === "tools" ? "listTools" : kind === "resources" ? "listResources" : "listResourceTemplates";
  return (await listAll(client, method, kind, signal))[kind];
}
async function withClient(server, run) {
  assertConnectionReady(server);
  const url = resolvedUrl(server);
  if (!url) throw new Error(`${server.id}: MCP URL \u672A\u914D\u7F6E`);
  const client = new Client({ name: "dsh-web-mcp-manager", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    ...server.platformFetch ? { fetch: server.platformFetch } : {},
    requestInit: { signal: server.platformSignal, headers: {
      ...Object.fromEntries((server.headers ?? []).map(({ name: name2, value }) => [name2, value])),
      ...server.platformRequestHeaders?.(url)
    } }
  });
  try {
    await client.connect(transport, { signal: server.platformSignal });
    return await run(client);
  } finally {
    await client.close();
  }
}
async function callManagedTool(server, name2, args, meta) {
  if (server.enabled === false) throw new Error("MCP \u670D\u52A1\u5668\u5DF2\u505C\u7528");
  if (server.tools?.mode === "selected" && !server.tools.names.includes(name2)) throw new Error("\u5DE5\u5177\u4E0D\u5C5E\u4E8E\u5F53\u524D MCP \u8303\u56F4");
  if (server.specUrl) return callOpenApiTool(await loadOpenApi(server), name2, args);
  return withClient(server, async (client) => {
    const tool = (await listCatalog(client, "tools", server.platformSignal)).find((item) => item.name === name2);
    if (!tool) throw new Error("\u5DE5\u5177\u4E0D\u5C5E\u4E8E\u5F53\u524D MCP \u8303\u56F4");
    const dispatch = (signal) => client.callTool({ name: name2, arguments: args, ...meta ? { _meta: meta } : {} }, {
      signal: signal ?? server.platformSignal,
      timeout: server.platformComposition ? 36 * 6e4 : server.platformTimeoutMs ?? 6e4
    });
    if (server.platformComposition) {
      server.platformAssertCurrent?.();
      return dispatch();
    }
    if (server.platformGroup) {
      server.platformAssertCurrent?.();
      return dispatch();
    }
    return server.platformExecute ? server.platformExecute({
      serverId: server.id,
      operationId: name2,
      kind: "write",
      target: resolvedUrl(server),
      method: "tools/call",
      args,
      schemaDigest: createHash2("sha256").update(JSON.stringify(tool.inputSchema)).digest("hex")
    }, dispatch, server.platformSignal) : dispatch();
  });
}
async function readManagedResource(server, uri, args) {
  if (server.enabled === false) throw new Error("MCP \u670D\u52A1\u5668\u5DF2\u505C\u7528");
  if (server.specUrl) return readOpenApiResource(await loadOpenApi(server), uri, args);
  return withClient(server, (client) => {
    const dispatch = (signal) => client.readResource({ uri }, { signal: signal ?? server.platformSignal });
    if (server.platformGroup) {
      server.platformAssertCurrent?.();
      return dispatch();
    }
    return server.platformExecute ? server.platformExecute({
      serverId: server.id,
      operationId: "resources/read",
      kind: "resource",
      target: resolvedUrl(server),
      method: "resources/read",
      args: { uri }
    }, dispatch, server.platformSignal) : dispatch();
  });
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
async function bodyOf(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("\u8BF7\u6C42\u8D85\u8FC7 64 KiB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function bearerAccepted(req, sharedToken) {
  if (!sharedToken) return false;
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(sharedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
var GROUP_TARGET_META_KEY = "io.deepseek.dsh/mcp-group-target";
var GROUP_DISCOVERY_META_KEY = "io.deepseek.dsh/mcp-group-discovery";
var GROUP_TOOL_META_KEY = "io.deepseek.dsh/mcp-group-tool";
function groupTargetDigest(target, version = 1) {
  if (version === 2 && new Set(target.group.members.map((member) => member.serverId)).size !== target.group.members.length) {
    throw new Error("MCP v2 \u5206\u7EC4\u670D\u52A1 ID \u91CD\u590D");
  }
  const members = target.group.members.map((member) => {
    const server = target.servers.find((item) => item.id === member.serverId);
    let endpoint = server?.specUrl || server?.url || "";
    if (endpoint) {
      const url = new URL(endpoint);
      url.username = "";
      url.password = "";
      for (const key2 of [...url.searchParams.keys()]) if (/token|secret|password|credential|authorization|api[-_]?key/i.test(key2)) url.searchParams.delete(key2);
      url.searchParams.sort();
      endpoint = url.href;
    }
    if (version === 2) return {
      serverId: member.serverId,
      enabled: server?.enabled,
      kind: server?.specUrl ? "openapi" : "mcp",
      endpoint,
      tools: server?.tools,
      names: [...member.names].sort(),
      resourceUris: [...member.resourceUris ?? []].sort(),
      resourceTemplates: [...member.resourceTemplates ?? []].sort()
    };
    return {
      serverId: member.serverId,
      serverName: server && serverName(server),
      enabled: server?.enabled,
      kind: server?.specUrl ? "openapi" : "mcp",
      endpoint,
      names: [...member.names].sort(),
      resourceUris: [...member.resourceUris ?? []].sort(),
      resourceTemplates: [...member.resourceTemplates ?? []].sort()
    };
  }).sort((a, b) => a.serverId.localeCompare(b.serverId));
  return createHash2("sha256").update(JSON.stringify(version === 1 ? { id: target.group.id, members } : { id: target.group.id, version, naming: "group-boundary-v1", members })).digest("hex");
}
function v2ToolName(serverId, rawName) {
  return `${serverId.replaceAll("_", "_0")}__${rawName}`;
}
function resourceToolName(serverId, kind, item) {
  const type = kind === "r" ? "resource" : "template";
  const uri = kind === "r" ? item.uri : item.uriTemplate;
  const label = String(item.name || type).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32);
  const hash = createHash2("sha256").update(`${kind}\0${uri}`).digest("hex").slice(0, 12);
  return v2ToolName(serverId, `${type}_${label}_${hash}`);
}
function discoveryMetadata(server, kind, items, groups = []) {
  return items.map((item) => ({
    ...item,
    groupToolName: item.name,
    groupPublicNames: Object.fromEntries(groups.map((id) => [id, publicToolName(id, item.name)]))
  }));
}
var groupResourceBindings = /* @__PURE__ */ new Map();
async function groupToolBindings(target, signal, unavailable = [], requestedName) {
  const digest = groupTargetDigest(target, 2), cached = groupResourceBindings.get(target.group.id);
  const previous = cached?.digest === digest ? cached : void 0;
  const requestedServers = requestedName === void 0 ? void 0 : /* @__PURE__ */ new Set([
    ...target.group.members.filter((member) => member.names.some((name2) => name2 === requestedName || v2ToolName(member.serverId, name2) === requestedName)).map((member) => member.serverId),
    ...previous?.resources.filter((resource) => resource.item.name === requestedName || resourceToolName(resource.server.id, resource.kind, resource.item) === requestedName).map((resource) => resource.server.id) ?? []
  ]);
  if (requestedServers?.size && !previous && target.group.members.some((member) => !requestedServers.has(member.serverId) && (member.resourceUris?.length ?? 0) + (member.resourceTemplates?.length ?? 0) > 0)) {
    throw new Error("MCP \u5206\u7EC4\u8D44\u6E90\u540D\u79F0\u5C1A\u672A\u53D1\u73B0\uFF0C\u8BF7\u5148\u91CD\u65B0\u53D1\u73B0\u5DE5\u5177\u540E\u8C03\u7528");
  }
  const catalogs = await Promise.all(target.group.members.map(async (member) => {
    const server = target.servers.find((item) => item.id === member.serverId && item.enabled);
    if (!server) return [];
    const selected = member.names.filter((name2) => server.tools?.mode !== "selected" || server.tools.names.includes(name2));
    let tools = [];
    if (selected.length && (!requestedServers || requestedServers.has(server.id))) try {
      tools = await serverTools({ ...server, platformSignal: signal ?? server.platformSignal });
    } catch (error) {
      if (signal?.aborted) throw error;
      unavailable.push(server.id);
    }
    return selected.flatMap((name2) => {
      const matches = tools.filter((tool) => tool.name === name2);
      return (matches.length ? matches : [void 0]).map((tool) => ({
        server,
        sourceName: name2,
        tool,
        name: name2,
        kind: "tool",
        aliases: [v2ToolName(server.id, name2)]
      }));
    });
  }));
  const bindings = catalogs.flat();
  const resources = await resourceToolsFor(requestedServers ? {
    ...target,
    group: { ...target.group, members: target.group.members.filter((member) => requestedServers.has(member.serverId)) }
  } : target, signal, unavailable);
  if (previous) for (const resource of previous.resources) {
    if (!resources.some((item) => item.uri === resource.uri)) resources.push({ ...resource, tool: void 0 });
  }
  if (!requestedServers) groupResourceBindings.set(target.group.id, { digest, resources });
  for (const resource of resources) {
    const { server, kind, item, tool } = resource;
    const equivalent = server.specUrl && bindings.find((binding) => binding.server.id === server.id && binding.sourceName === item.name && (binding.tool?.httpOperation?.method === item.httpOperation?.method && binding.tool?.httpOperation?.path === item.httpOperation?.path));
    const alias = resourceToolName(server.id, kind, item);
    if (equivalent) {
      equivalent.aliases.push(alias);
      equivalent.aliasResources = { ...equivalent.aliasResources, [alias]: { ...resource, kind: kind === "r" ? "resource" : "template" } };
      continue;
    }
    bindings.push({ ...resource, name: item.name, sourceName: item.name, kind: kind === "r" ? "resource" : "template", aliases: [alias] });
  }
  const counts = /* @__PURE__ */ new Map();
  for (const binding of bindings) {
    const matches = counts.get(binding.name) ?? [];
    matches.push(binding);
    counts.set(binding.name, matches);
  }
  for (const [name2, matches] of counts) {
    const aliases = bindings.filter((binding) => binding.name !== name2 && binding.aliases.includes(name2));
    if (matches.length + aliases.length < 2) continue;
    unavailable.push(`\u5DE5\u5177\u540D\u51B2\u7A81\uFF1A${name2}\uFF08${[...matches, ...aliases].map((item) => `${item.server.id}/${item.kind}/${item.sourceName}`).join("\u3001")}\uFF09\uFF1B\u8BF7\u8C03\u6574\u5206\u7EC4\u9009\u62E9`);
    for (const binding of matches) binding.conflict = true;
  }
  for (const binding of bindings) if (binding.tool) {
    const sourceUri = binding.item && (binding.item.uri ?? binding.item.uriTemplate);
    binding.tool = { ...binding.tool, name: binding.name, _meta: { ...binding.tool._meta, [GROUP_TOOL_META_KEY]: {
      serverId: binding.server.id,
      kind: binding.kind,
      sourceName: binding.sourceName,
      ...sourceUri ? { sourceUri } : {}
    } } };
  }
  return bindings;
}
async function toolsFor(target, version = 1, signal, unavailable = []) {
  if (target.kind === "agent") {
    const tools = await serverTools({ ...target.server, platformSignal: signal ?? target.server.platformSignal });
    return tools.filter((tool) => !target.server.tools || target.server.tools.mode === "all" || target.server.tools.names.includes(tool.name));
  }
  if (version === 2) return (await groupToolBindings(target, signal, unavailable)).filter((binding) => !binding.conflict && binding.tool).map((binding) => binding.tool);
  const result = [];
  const catalogs = await Promise.all(target.group.members.filter((member) => member.names.length).map(async (member) => {
    const server = target.servers.find((item) => item.id === member.serverId && item.enabled);
    if (!server) return { member, server, tools: [] };
    try {
      const tools = await serverTools({ ...server, platformSignal: signal ?? server.platformSignal });
      return { member, server, tools };
    } catch (error) {
      if (signal?.aborted) throw error;
      unavailable.push(server.id);
      return { member, server, tools: [] };
    }
  }));
  for (const { member, server, tools } of catalogs) {
    for (const tool of tools) {
      if (member.names.includes(tool.name)) {
        const name2 = `mcp__${serverName(server)}__${tool.name}`;
        result.push({ ...tool, name: name2 });
      }
    }
  }
  return result;
}
function toolOwner(target, name2, version = 1) {
  if (target.kind === "agent") {
    if (target.server.tools.mode === "selected" && !target.server.tools.names.includes(name2)) return;
    return { server: target.server, rawName: name2 };
  }
  for (const member of target.group.members) {
    const server = target.servers.find((item) => item.id === member.serverId && item.enabled);
    if (!server) continue;
    const prefix = version === 1 ? `mcp__${serverName(server)}__` : `${server.id.replaceAll("_", "_0")}__`;
    if (name2.startsWith(prefix) && member.names.includes(name2.slice(prefix.length))) {
      if (version === 2 && server.tools?.mode === "selected" && !server.tools.names.includes(name2.slice(prefix.length))) continue;
      return { server, rawName: name2.slice(prefix.length) };
    }
  }
}
function groupResourceUri(groupId, serverId, kind, sourceUri) {
  return `mcp-group:/${groupId}/${serverId}/${kind}/${Buffer.from(sourceUri, "utf8").toString("base64url")}`;
}
function sourceTemplate(value) {
  const expressions = value.match(/\{[^{}]*\}/g) ?? [];
  if (!expressions.length || value.replace(/\{[^{}]*\}/g, "").includes("{") || value.replace(/\{[^{}]*\}/g, "").includes("}") || expressions.some((expression) => !/^\{[+#./?&]?[A-Za-z0-9_.-]+(?:,[A-Za-z0-9_.-]+)*\}$/.test(expression))) {
    throw new Error("\u4E0D\u652F\u6301\u7684 Resource URI \u6A21\u677F");
  }
  const template = new UriTemplate(value);
  const variableNames = template.variableNames;
  if (new Set(variableNames).size !== variableNames.length) throw new Error("Resource URI \u6A21\u677F\u53D8\u91CF\u91CD\u590D");
  const requiredNames = template.parts.flatMap((part) => typeof part === "string" || ["?", "&"].includes(part.operator) ? [] : part.names);
  return { template, variableNames, requiredNames };
}
async function resourceCatalog(server, kind) {
  if (server.specUrl) {
    const source = await loadOpenApi(server);
    return kind === "r" ? source.resources : source.resourceTemplates;
  }
  return withClient(server, (client) => listCatalog(client, kind === "r" ? "resources" : "resourceTemplates", server.platformSignal));
}
async function discoverServer(server, groups = []) {
  if (server.specUrl) {
    const source = await loadOpenApi(server);
    return {
      tools: discoveryMetadata(server, "tools", source.tools, groups),
      resources: { resources: discoveryMetadata(server, "r", source.resources, groups) },
      resourceTemplates: { resourceTemplates: discoveryMetadata(server, "t", source.resourceTemplates, groups) }
    };
  }
  return withClient(server, async (client) => {
    const [tools, resources, templates] = await Promise.allSettled(
      ["tools", "resources", "resourceTemplates"].map((kind) => listCatalog(client, kind, server.platformSignal))
    );
    if ([tools, resources, templates].every((result) => result.status === "rejected")) throw new Error("MCP \u5DE5\u5177\u4E0E\u8D44\u6E90\u53D1\u73B0\u5747\u672A\u5B8C\u6210");
    return {
      tools: tools.status === "fulfilled" ? discoveryMetadata(server, "tools", tools.value, groups) : [],
      ...tools.status === "rejected" ? { toolsUnavailable: true } : {},
      resources: {
        resources: resources.status === "fulfilled" ? discoveryMetadata(server, "r", resources.value, groups) : [],
        ...resources.status === "rejected" ? { unavailable: true } : {}
      },
      resourceTemplates: {
        resourceTemplates: templates.status === "fulfilled" ? discoveryMetadata(server, "t", templates.value, groups) : [],
        ...templates.status === "rejected" ? { unavailable: true } : {}
      }
    };
  });
}
async function selectedResources(target, kind, signal, unavailable = []) {
  const result = [];
  const uris = /* @__PURE__ */ new Set();
  const catalogs = await Promise.all(target.group.members.map(async (member) => {
    const selected = kind === "r" ? member.resourceUris ?? [] : member.resourceTemplates ?? [];
    const server = target.servers.find((item) => item.id === member.serverId && item.enabled);
    if (!server || !selected.length) return { member, server, selected, catalog: [] };
    let catalog;
    try {
      catalog = await resourceCatalog({ ...server, platformSignal: signal ?? server.platformSignal }, kind);
    } catch (error) {
      if (signal?.aborted) throw error;
      return { member, server, selected, catalog: [], failed: true };
    }
    return { member, server, selected, catalog };
  }));
  for (const { server, selected, catalog, failed } of catalogs) {
    if (!server) continue;
    if (failed) unavailable.push(server.id);
    for (const uri of selected) if (!catalog.some((item) => (kind === "r" ? item.uri : item.uriTemplate) === uri)) {
      unavailable.push(`${server.id}: ${uri}\uFF08\u5DF2\u9009\u8D44\u6E90\u5F53\u524D\u4E0D\u53EF\u7528\uFF09`);
    }
    for (const item of catalog) {
      const sourceUri = kind === "r" ? item.uri : item.uriTemplate;
      if (!selected.includes(sourceUri)) continue;
      const uri = groupResourceUri(target.group.id, server.id, kind, sourceUri);
      if (uris.has(uri)) throw new Error("MCP \u5206\u7EC4 Resource URI \u91CD\u590D");
      uris.add(uri);
      let parsed;
      if (kind === "t") {
        try {
          parsed = sourceTemplate(sourceUri);
        } catch {
          unavailable.push(`${server.id}: ${sourceUri}\uFF08\u4E0D\u652F\u6301\u7684\u8D44\u6E90\u6A21\u677F\uFF09`);
          continue;
        }
      }
      result.push({ server, kind, item, uri, parsed });
    }
  }
  return result;
}
async function resourcesFor(target, kind, signal, unavailable = []) {
  return (await selectedResources(target, kind, signal, unavailable)).map(({ item, uri, parsed }) => kind === "r" ? { ...item, uri } : { ...item, uriTemplate: `${uri}{?${parsed.variableNames.join(",")}}` });
}
async function resourceToolsFor(target, signal, unavailable = []) {
  const selected = (await Promise.all(["r", "t"].map((kind) => selectedResources(target, kind, signal, unavailable)))).flat();
  return selected.map((binding) => {
    const { server, kind, item, parsed } = binding;
    const inputSchema = kind === "r" ? { type: "object", properties: {}, additionalProperties: false } : server.specUrl ? item.inputSchema : {
      type: "object",
      properties: Object.fromEntries(parsed.variableNames.map((name2) => [name2, { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] }])),
      required: parsed.requiredNames,
      additionalProperties: false
    };
    return { ...binding, tool: {
      name: item.name,
      ...item.title ? { title: item.title } : {},
      description: [
        item.description || item.title || item.name,
        `\u8BFB\u53D6\u8D44\u6E90\uFF1A${kind === "r" ? item.uri : item.uriTemplate}`
      ].filter(Boolean).join("\n"),
      inputSchema,
      annotations: { readOnlyHint: true }
    } };
  });
}
async function callSelectedTool(target, version, name2, args, meta, signal, assertCurrent) {
  let owner = target.kind === "group" && version === 2 ? void 0 : toolOwner(target, name2, version);
  if (target.kind === "group" && version === 2) {
    const bindings = await groupToolBindings(target, signal, [], name2);
    const matches = bindings.filter((binding2) => binding2.name === name2 || binding2.aliases.includes(name2));
    if (matches.length > 1 || matches.some((binding2) => binding2.conflict)) throw new Error("MCP \u5206\u7EC4\u5DE5\u5177\u540D\u51B2\u7A81\uFF0C\u8BF7\u8C03\u6574\u5206\u7EC4\u9009\u62E9\u5E76\u91CD\u65B0\u53D1\u73B0");
    const binding = matches[0]?.aliasResources?.[name2] ?? matches[0];
    if (!binding?.tool) throw new Error("\u5DE5\u5177\u4E0D\u5C5E\u4E8E\u5F53\u524D MCP \u8303\u56F4\u6216\u6765\u6E90\u5F53\u524D\u4E0D\u53EF\u7528");
    owner = { server: binding.server, rawName: binding.sourceName };
    if (binding.kind !== "tool") {
      const { tool, uri, parsed, server } = binding;
      const violations = validateJsonSchemaValue(tool.inputSchema, args, "");
      if (violations.length) throw new Error(`\u8D44\u6E90\u5DE5\u5177\u53C2\u6570\u65E0\u6548\uFF1A${violations.join("; ")}`);
      const query = Object.entries(args).map(([key2, value]) => `${key2}=${(Array.isArray(value) ? value : [value]).map((item) => encodeURIComponent(String(item))).join(",")}`).join("&");
      const response = await readGroupResource(
        target,
        parsed && query && !server.specUrl ? `${uri}?${query}` : uri,
        signal,
        assertCurrent,
        server.specUrl ? args : void 0
      );
      return {
        content: response.contents.map((item) => ({ type: "text", text: typeof item.text === "string" ? item.text : `\u8D44\u6E90 ${item.uri} \u8FD4\u56DE\u4E8C\u8FDB\u5236\u5185\u5BB9\uFF08${item.mimeType || "\u672A\u77E5\u7C7B\u578B"}\uFF09\uFF0C\u8BF7\u901A\u8FC7\u8D44\u6E90\u8BFB\u53D6\u63A5\u53E3\u83B7\u53D6\u3002` })),
        structuredContent: response
      };
    }
  }
  if (!owner) throw new Error("\u5DE5\u5177\u4E0D\u5C5E\u4E8E\u5F53\u524D MCP \u8303\u56F4");
  assertCurrent?.();
  return callManagedTool({ ...owner.server, platformSignal: signal ?? owner.server.platformSignal }, owner.rawName, args, meta);
}
function parseProxyResourceUri(uri) {
  const match = /^mcp-group:\/([A-Za-z0-9_-]{1,32})\/([A-Za-z0-9_-]{1,32})\/([rt])\/([A-Za-z0-9_-]+)(?:\?([^#]*))?$/.exec(uri);
  if (!match || match[3] === "r" && match[5] !== void 0) throw new Error("Resource URI \u4E0D\u5C5E\u4E8E\u5F53\u524D MCP \u5206\u7EC4");
  const encoded = match[4], decoded = Buffer.from(encoded, "base64url");
  if (decoded.toString("base64url") !== encoded) throw new Error("Resource URI \u7F16\u7801\u65E0\u6548");
  const sourceUri = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  if (!sourceUri) throw new Error("Resource URI \u7F16\u7801\u65E0\u6548");
  return { groupId: match[1], serverId: match[2], kind: match[3], sourceUri, query: match[5] };
}
function templateValues(query, variableNames) {
  const result = /* @__PURE__ */ Object.create(null);
  if (query === void 0 || !query) return result;
  for (const pair of query.split("&")) {
    const match = /^([A-Za-z0-9_.-]+)=(.*)$/.exec(pair);
    if (!match || !variableNames.includes(match[1]) || Object.hasOwn(result, match[1]) || /%(?![0-9A-Fa-f]{2})|\+/.test(match[2])) {
      throw new Error("Resource URI \u6A21\u677F\u53C2\u6570\u65E0\u6548\u6216\u91CD\u590D");
    }
    try {
      result[match[1]] = match[2].includes(",") ? match[2].split(",").map((value) => decodeURIComponent(value)) : decodeURIComponent(match[2]);
    } catch {
      throw new Error("Resource URI \u6A21\u677F\u53C2\u6570\u7F16\u7801\u65E0\u6548");
    }
  }
  return result;
}
async function readGroupResource(target, uri, signal, assertCurrent, args) {
  const proxy = parseProxyResourceUri(uri);
  const member = target.group.members.find((item) => item.serverId === proxy.serverId);
  const selected = proxy.kind === "r" ? member?.resourceUris ?? [] : member?.resourceTemplates ?? [];
  const server = target.servers.find((item) => item.id === proxy.serverId && item.enabled);
  if (proxy.groupId !== target.group.id || !server || !selected.includes(proxy.sourceUri)) throw new Error("Resource URI \u4E0D\u5C5E\u4E8E\u5F53\u524D MCP \u5206\u7EC4");
  const sources = (await resourceCatalog({ ...server, platformSignal: signal ?? server.platformSignal }, proxy.kind)).filter((item) => (proxy.kind === "r" ? item.uri : item.uriTemplate) === proxy.sourceUri);
  if (sources.length !== 1) throw new Error(sources.length ? "\u6765\u6E90 Resource URI \u91CD\u590D" : "\u5DF2\u9009 Resource \u5728\u6765\u6E90\u4E2D\u4E0D\u53EF\u7528");
  let upstreamUri = proxy.sourceUri;
  if (proxy.kind === "t" && args === void 0) {
    const { template, variableNames, requiredNames } = sourceTemplate(proxy.sourceUri);
    const values = templateValues(proxy.query, variableNames);
    if (requiredNames.some((name2) => !Object.hasOwn(values, name2))) throw new Error("Resource URI \u6A21\u677F\u7F3A\u5C11\u8DEF\u5F84\u53C2\u6570");
    upstreamUri = template.expand(values);
  }
  assertCurrent?.();
  server.platformAssertCurrent?.();
  const response = await readManagedResource({ ...server, platformSignal: signal ?? server.platformSignal }, upstreamUri, args);
  return { ...response, contents: response.contents?.map((item) => ({ ...item, uri })) ?? [] };
}
function assertGroupTarget(target, currentTarget, version, request) {
  const digest = groupTargetDigest(target, version);
  const expected = request?.params?._meta?.[GROUP_TARGET_META_KEY]?.digest;
  const current = currentTarget?.();
  if (expected !== void 0 && expected !== digest || currentTarget && (!current || current.kind !== "group" || groupTargetDigest(current, version) !== digest)) throw new Error("MCP \u5206\u7EC4\u76EE\u6807\u5DF2\u53D8\u5316");
}
async function serveMcp(req, res, target, currentTarget, version = 1, withGroupRequest) {
  const digest = target.kind === "group" ? groupTargetDigest(target, version) : void 0;
  let wireRequest;
  const runRequest = (method, rpcRequest, run) => withGroupRequest ? withGroupRequest(req, method, run, wireRequest ?? rpcRequest) : run();
  const agentDigest = (value) => JSON.stringify([value?.id, value?.enabled, value?.specUrl, value?.url, value?.tools]);
  const assertTarget = (request) => {
    const current = currentTarget?.();
    if (target.kind === "group") assertGroupTarget(target, currentTarget, version, request);
    if (target.kind === "agent" && currentTarget && (!current || current.kind !== "agent" || current.server.enabled === false || agentDigest(current.server) !== agentDigest(target.server))) throw new Error("MCP \u670D\u52A1\u5668\u76EE\u6807\u5DF2\u53D8\u5316\u6216\u5DF2\u505C\u7528");
  };
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({
      name: target.kind === "group" ? target.group.id : serverName(target.server),
      version: "0.1.0"
    }, { capabilities: target.kind === "agent" || target.kind === "group" && version === 2 ? { tools: {}, resources: {} } : { tools: {} } });
    mcp.server.setRequestHandler("tools/list", async (request, extra) => runRequest("tools/list", request, async () => {
      const unavailable = [];
      const tools = await toolsFor(target, version, extra?.mcpReq?.signal ?? extra?.signal, unavailable);
      assertTarget();
      return { tools, ...digest ? { _meta: {
        [GROUP_TARGET_META_KEY]: version === 1 ? { digest } : { digest, version },
        ...unavailable.length ? { [GROUP_DISCOVERY_META_KEY]: { unavailable } } : {}
      } } : {} };
    }));
    mcp.server.setRequestHandler("tools/call", async (request, extra) => runRequest("tools/call", request, async () => {
      assertTarget(request);
      const response = await callSelectedTool(
        target,
        version,
        request.params.name,
        request.params.arguments ?? {},
        request.params._meta,
        extra?.mcpReq?.signal ?? extra?.signal,
        () => assertTarget(request)
      );
      assertTarget(request);
      return response;
    }));
    if (target.kind === "agent" || target.kind === "group" && version === 2) {
      mcp.server.setRequestHandler("resources/list", async (request, extra) => runRequest("resources/list", request, async () => {
        const signal = extra?.mcpReq?.signal ?? extra?.signal;
        const unavailable = [];
        const resources = target.kind === "group" ? await resourcesFor(target, "r", signal, unavailable) : await resourceCatalog({ ...target.server, platformSignal: signal }, "r");
        assertTarget();
        return { resources, ...digest ? { _meta: {
          [GROUP_TARGET_META_KEY]: { digest, version },
          ...unavailable.length ? { [GROUP_DISCOVERY_META_KEY]: { unavailable } } : {}
        } } : {} };
      }));
      mcp.server.setRequestHandler("resources/templates/list", async (request, extra) => runRequest("resources/templates/list", request, async () => {
        const signal = extra?.mcpReq?.signal ?? extra?.signal;
        const unavailable = [];
        const resourceTemplates = target.kind === "group" ? await resourcesFor(target, "t", signal, unavailable) : await resourceCatalog({ ...target.server, platformSignal: signal }, "t");
        assertTarget();
        return { resourceTemplates, ...digest ? { _meta: {
          [GROUP_TARGET_META_KEY]: { digest, version },
          ...unavailable.length ? { [GROUP_DISCOVERY_META_KEY]: { unavailable } } : {}
        } } : {} };
      }));
      mcp.server.setRequestHandler("resources/read", async (request, extra) => runRequest("resources/read", request, async () => {
        assertTarget(request);
        const response = target.kind === "group" ? await readGroupResource(target, request.params.uri, extra?.mcpReq?.signal ?? extra?.signal, () => assertTarget(request)) : await readManagedResource({ ...target.server, platformSignal: extra?.mcpReq?.signal ?? extra?.signal }, request.params.uri);
        assertTarget(request);
        return response;
      }));
    }
    return mcp;
  });
  try {
    await toNodeHandler({ fetch: async (request, options) => {
      if (withGroupRequest && request.method === "POST") {
        try {
          wireRequest = await request.clone().json();
        } catch {
        }
      }
      return handler.fetch(request, wireRequest === void 0 ? options : { ...options, parsedBody: wireRequest });
    } })(req, res);
  } finally {
    await handler.close();
  }
}
async function upstream(server, method, path, data) {
  if (!server.managementUrl) throw new Error(`${server.id}: \u672A\u8BBE\u7F6E OpenAPI \u7BA1\u7406\u5730\u5740`);
  const root = validateUrl(server.managementUrl);
  const target = new URL(path, root.endsWith("/") ? root : `${root}/`);
  const dispatch = (signal) => fetch(target, {
    method,
    headers: data === void 0 ? {} : { "content-type": "application/json" },
    body: data === void 0 ? void 0 : JSON.stringify(data),
    signal: signal ?? server.platformSignal ?? AbortSignal.timeout(2e4),
    redirect: "error"
  });
  const response = server.platformExecute && path.endsWith("/invoke") ? await server.platformExecute({
    serverId: server.id,
    operationId: path.split("/").at(-2),
    kind: "write",
    target: target.href,
    method,
    args: data
  }, dispatch, server.platformSignal) : await dispatch();
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE) throw new Error("\u4E0A\u6E38\u54CD\u5E94\u8D85\u8FC7 1 MiB");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE) throw new Error("\u4E0A\u6E38\u54CD\u5E94\u8D85\u8FC7 1 MiB");
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("\u4E0A\u6E38\u8FD4\u56DE\u975E JSON");
  }
  if (!response.ok) throw new Error(`\u4E0A\u6E38 HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 500)}`);
  return parsed;
}
async function manage(server, request) {
  assertConnectionReady(server);
  const { action, sourceId, toolName } = request;
  const source = typeof sourceId === "string" && /^[0-9a-fA-F-]{36}$/.test(sourceId) ? sourceId : void 0;
  const tool = typeof toolName === "string" && /^[A-Za-z0-9_.-]{1,160}$/.test(toolName) ? toolName : void 0;
  const prefix = "/api/v1/mcp-resources";
  if (action === "sources") return upstream(server, "GET", prefix);
  if (action === "create" && typeof request.name === "string" && typeof request.specUrl === "string") {
    return upstream(server, "POST", prefix, { name: request.name, spec_url: validateUrl(request.specUrl) });
  }
  if (!source) throw new Error("OpenAPI \u6765\u6E90 ID \u65E0\u6548");
  if (action === "refresh") return upstream(server, "POST", `${prefix}/${source}/refresh`);
  if (action === "toggle" && typeof request.enabled === "boolean") {
    return upstream(server, "PATCH", `${prefix}/${source}`, { enabled: request.enabled });
  }
  if (action === "components") return upstream(server, "GET", `${prefix}/${source}/components`);
  if (action === "logs") return upstream(server, "GET", `${prefix}/${source}/logs`);
  if ((action === "preview" || action === "invoke") && tool) {
    return upstream(server, "POST", `${prefix}/${source}/tools/${tool}/${action}`, { arguments: request.arguments ?? {} });
  }
  throw new Error("\u4E0D\u652F\u6301\u7684 OpenAPI \u7BA1\u7406\u64CD\u4F5C");
}
function apply(ctx, config) {
  const publicPath = (path) => ctx.webServer.publicPath?.(path) ?? path;
  const agents = /* @__PURE__ */ new Map();
  const activeAgents = /* @__PURE__ */ new Set();
  const agentToken = randomBytes(32).toString("hex");
  const mounted = /* @__PURE__ */ new Map();
  const registeredTools = /* @__PURE__ */ new Map();
  const registeredResourceServers = /* @__PURE__ */ new Map();
  snapshot(config);
  const currentGroup = (id) => {
    const current = snapshot(config), group = current.groups.find((item) => item.id === id);
    return group ? { kind: "group", group, servers: current.servers } : void 0;
  };
  ctx.provide("mcpSessionManager", {
    ...config.businessGroupUrl && config.businessGroupFetch ? {
      groupUrl: (id) => config.businessGroupUrl(id),
      groupFetch: (id, sessionId) => config.businessGroupFetch(id, sessionId)
    } : {},
    currentGroup(id, version = 1) {
      const target = currentGroup(id);
      return target ? { id, version, token: config.sharedToken.get(), targetDigest: groupTargetDigest(target, version) } : void 0;
    },
    sourceStatus(serverId) {
      const server = snapshot(config).servers.find((item) => item.id === serverId);
      return { configured: Boolean(server && server.enabled !== false && (server.specUrl || server.url)) };
    },
    resolveTool(serverId, rawName) {
      const server = snapshot(config).servers.find((item) => item.id === serverId && item.enabled !== false);
      if (!server || server.tools?.mode === "selected" && !server.tools.names.includes(rawName)) return void 0;
      const name2 = publicToolName(serverName(server), rawName);
      if (!config.withToolContext) {
        return [...activeAgents].some((agent) => ctx.tools.get(name2, agent) !== void 0) ? name2 : void 0;
      }
      return (registeredTools.get(`${serverId}\0${name2}`) ?? 0) > 0 ? name2 : void 0;
    },
    async listGroupTools(id, version = 2) {
      const target = currentGroup(id);
      if (!target) throw new Error("MCP \u5206\u7EC4\u4E0D\u5B58\u5728");
      const unavailable = [];
      const tools = await toolsFor(target, version, void 0, unavailable);
      assertGroupTarget(target, () => currentGroup(id), version);
      const digest = groupTargetDigest(target, version);
      return { tools, _meta: {
        [GROUP_TARGET_META_KEY]: version === 1 ? { digest } : { digest, version },
        ...unavailable.length ? { [GROUP_DISCOVERY_META_KEY]: { unavailable } } : {}
      } };
    },
    async callGroupTool(id, version, name2, args, meta, exec) {
      const dispatch = async () => {
        const target = currentGroup(id);
        if (!target) throw new Error("MCP \u5206\u7EC4\u4E0D\u5B58\u5728");
        const request = { params: { _meta: meta } };
        assertGroupTarget(target, () => currentGroup(id), version, request);
        const response = await callSelectedTool(
          target,
          version,
          name2,
          args,
          meta,
          exec?.signal,
          () => assertGroupTarget(target, () => currentGroup(id), version, request)
        );
        assertGroupTarget(target, () => currentGroup(id), version, request);
        return response;
      };
      if (version === 2 && config.withToolContext) {
        if (!exec?.agent?.session?.id || !exec?.callId) throw new Error("MCP \u5206\u7EC4\u8C03\u7528\u7F3A\u5C11\u539F\u751F Session \u8EAB\u4EFD");
        return config.withToolContext(exec, dispatch);
      }
      return dispatch();
    }
  });
  ctx.effect(() => ctx.webServer.register({ kind: "prefix", path: "/mcp/groups", handler: async (req, res) => {
    const route = /^\/mcp\/groups\/([A-Za-z0-9_-]{1,32})(?:\/(v2))?$/.exec(new URL(req.url, "http://localhost").pathname);
    if (!route) return send(res, 404, { error: "group endpoint not found" });
    const id = route[1], version = route[2] === "v2" ? 2 : 1;
    const business = version === 2 && (req.headers["x-harness-business-context"] !== void 0 || req.headers["x-harness-business-signature"] !== void 0);
    if (business) {
      try {
        if (!config.acceptGroupTransport || !await config.acceptGroupTransport(req)) return send(res, 401, { error: "business_registration_invalid", stage: "registration" });
      } catch (error) {
        const stage = ["token", "registration", "binding", "signature", "context"].includes(error?.stage) ? error.stage : "registration";
        return send(res, 401, { error: `business_${stage}_invalid`, stage });
      }
    } else if (!bearerAccepted(req, config.sharedToken.get())) return send(res, 401, { error: "Bearer token required" });
    const serveGroup = async () => {
      const current = snapshot(config);
      const group = current.groups.find((item) => item.id === id);
      if (!group) return send(res, 404, { error: "group not found" });
      await serveMcp(
        req,
        res,
        { kind: "group", group, servers: current.servers },
        () => currentGroup(id),
        version,
        config.withGroupRequest
      );
    };
    try {
      if (config.withGroupTransport) await config.withGroupTransport(req, serveGroup);
      else await serveGroup();
    } catch (error) {
      if (!res.headersSent) send(res, 502, { error: String(error) });
      else res.destroy();
    }
  } }), "mcp-manager.groups");
  ctx.effect(() => ctx.webServer.register({ kind: "prefix", path: "/mcp/agents", handler: async (req, res) => {
    if (!bearerAccepted(req, agentToken)) return send(res, 401, { error: "Bearer token required" });
    const id = new URL(req.url, "http://localhost").pathname.split("/")[3];
    const target = agents.get(id);
    if (!target) return send(res, 404, { error: "agent MCP endpoint not found" });
    try {
      await serveMcp(req, res, target, () => {
        const server = snapshot(config).servers.find((item) => item.id === target.server.id);
        return server ? { kind: "agent", server } : void 0;
      });
    } catch (error) {
      if (!res.headersSent) send(res, 502, { error: String(error) });
      else res.destroy();
    }
  } }), "mcp-manager.agents");
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: "/api/mcp-manager", handler: async (req, res) => {
    const rejected = ctx.connection.requestRejection(req);
    if (rejected) return send(res, rejected, { error: "unauthorized" });
    if (config.withManagement) {
      const admission = ctx.connection.admit(req);
      if ("rejection" in admission || admission.peer.principal.kind !== "owner") return send(res, 403, { error: "management owner required" });
    }
    try {
      const current = snapshot(config);
      if (req.method === "GET") return send(res, 200, {
        servers: current.servers.map((server2) => ({
          id: server2.id,
          enabled: server2.enabled,
          addressConfigured: Boolean(server2.specUrl || resolvedUrl(server2)),
          managementConfigured: Boolean(server2.managementUrl),
          configurationIssue: connectionIssue(server2)
        })),
        groupPaths: current.groups.map((group) => ({
          id: group.id,
          path: publicPath(`/mcp/groups/${group.id}`),
          v2Path: publicPath(`/mcp/groups/${group.id}/v2`)
        })),
        tokenConfigured: Boolean(current.sharedToken)
      });
      if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
      const request = await bodyOf(req);
      const server = current.servers.find((item) => item.id === request.serverId) ?? (request.groupId ? (() => {
        if (!current.groups.some((group) => group.id === request.groupId)) return void 0;
        if (!config.groupUrl) throw new Error("\u5F53\u524D\u73AF\u5883\u672A\u914D\u7F6E\u5206\u7EC4\u8C03\u8BD5\u5165\u53E3");
        if (!current.sharedToken) throw new Error("\u8BF7\u5148\u4FDD\u5B58\u5206\u7EC4\u8BBF\u95EE\u4EE4\u724C");
        return {
          id: request.groupId,
          enabled: true,
          url: config.groupUrl(request.groupId),
          headers: [{ name: "Authorization", value: `Bearer ${current.sharedToken}` }],
          tools: { mode: "all", names: [] }
        };
      })() : void 0);
      if (Boolean(request.serverId) === Boolean(request.groupId)) return send(res, 400, { error: "\u8BF7\u9009\u62E9\u4E00\u4E2A\u670D\u52A1\u5668\u6216\u5DF2\u4FDD\u5B58\u5206\u7EC4" });
      if (!server) return send(res, 404, { error: request.groupId ? "\u5DF2\u4FDD\u5B58\u5206\u7EC4\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" : "MCP server not found" });
      if (request.groupId && !["test", "callTool", "resources", "resourceTemplates", "readResource"].includes(request.action)) return send(res, 400, { error: "\u5206\u7EC4\u8C03\u8BD5\u4E0D\u63D0\u4F9B\u6765\u6E90\u7BA1\u7406\u64CD\u4F5C" });
      if (request.action === "callTool") {
        if (typeof request.toolName !== "string" || !request.arguments || typeof request.arguments !== "object" || Array.isArray(request.arguments)) return send(res, 400, { error: "\u5DE5\u5177\u540D\u79F0\u6216\u53C2\u6570\u65E0\u6548" });
        return send(res, 200, await callManagedTool(server, request.toolName, request.arguments));
      }
      if (request.action === "test") {
        return send(res, 200, await discoverServer(server, current.groups.filter((group) => group.members.some((member) => member.serverId === server.id)).map((group) => group.id)));
      }
      if (request.action === "resources" || request.action === "resourceTemplates" || request.action === "readResource") {
        if (request.action === "readResource") {
          let uri = request.uri;
          if (request.uriTemplate) {
            const templates = await resourceCatalog(server, "t");
            if (!templates.some((item) => item.uriTemplate === request.uriTemplate)) throw new Error("\u8D44\u6E90\u6A21\u677F\u4E0D\u5C5E\u4E8E\u5F53\u524D\u8C03\u8BD5\u76EE\u6807\uFF0C\u8BF7\u91CD\u65B0\u53D1\u73B0");
            if (!request.arguments || typeof request.arguments !== "object" || Array.isArray(request.arguments)) throw new Error("\u6A21\u677F\u53C2\u6570\u987B\u4E3A JSON \u5BF9\u8C61");
            const parsed = sourceTemplate(request.uriTemplate);
            if (parsed.requiredNames.some((name2) => request.arguments[name2] === void 0 || request.arguments[name2] === "")) throw new Error("\u7F3A\u5C11\u6A21\u677F\u5FC5\u586B\u53C2\u6570");
            uri = parsed.template.expand(request.arguments);
          }
          if (typeof uri !== "string" || !uri) throw new Error("\u8BF7\u586B\u5199\u8D44\u6E90 URI");
          return send(res, 200, await readManagedResource(server, uri));
        }
        const kind = request.action === "resources" ? "r" : "t";
        return send(res, 200, { [request.action]: discoveryMetadata(server, kind, await resourceCatalog(server, kind)) });
      }
      return send(res, 200, await manage(server, request));
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  } }), "mcp-manager.admin");
  const loadServers = async (selected, preset, scopes, unavailable) => {
    if (selected.length > 1) {
      const results = await Promise.allSettled(selected.map(async (server) => {
        const owned = [];
        try {
          await loadServers([server], preset, owned, unavailable);
        } finally {
          scopes.push(...owned);
        }
      }));
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
      return;
    }
    const enabled = selected.filter((server) => server.enabled && !connectionIssue(server) && (server.platformComposition || server.specUrl || resolvedUrl(server)));
    const discoveries = config.withToolContext ? await Promise.allSettled(enabled.map((server) => {
      const timeoutMs = Number.isSafeInteger(server.platformTimeoutMs) && server.platformTimeoutMs > 0 ? Math.min(server.platformTimeoutMs, 1e4) : 1e4;
      const timeout = AbortSignal.timeout(timeoutMs);
      return serverTools({ ...server, platformSignal: server.platformSignal ? AbortSignal.any([server.platformSignal, timeout]) : timeout });
    })) : [];
    for (const [index, server] of enabled.entries()) {
      let discoveredTools = [];
      if (config.withToolContext) {
        const result = discoveries[index];
        if (result.status === "rejected") {
          if (server.platformSignal?.aborted) throw result.reason;
          const status = result.reason instanceof Error ? result.reason.message.match(/\bHTTP\s+([1-5]\d\d)\b/)?.[1] : void 0;
          ctx.logger?.warn(`MCP \u670D\u52A1 ${server.id} \u5DE5\u5177\u53D1\u73B0\u5931\u8D25${status ? `\uFF08HTTP ${status}\uFF09` : ""}\uFF1B\u672C\u6B21 Session \u4E0D\u88C5\u8F7D\u8BE5\u670D\u52A1\uFF0C\u8BF7\u5728 MCP \u7BA1\u7406\u68C0\u67E5\u8FDE\u63A5`);
          unavailable.add(server.id);
          continue;
        }
        discoveredTools = result.value;
      }
      const id = randomUUID();
      const scope = createScope(ctx, preset);
      scopes.push(scope);
      try {
        agents.set(id, { kind: "agent", server });
        scope.ctx.effect(() => () => {
          agents.delete(id);
        }, "mcp-manager.agent-endpoint");
        if (config.withToolContext) {
          const currentServer = () => {
            server.platformAssertCurrent?.();
            const latest = snapshot(config).servers.find((item) => item.id === server.id && item.enabled !== false);
            if (!latest) throw new Error("MCP \u670D\u52A1\u5668\u5DF2\u505C\u7528\u6216\u79FB\u9664");
            return latest;
          };
          if (server.platformGroup) scope.ctx.inject(["mcpResources"], (inner) => {
            inner.mcpResources.register(server.id, { request: (request, execution) => config.withToolContext(execution, async () => {
              const active = { ...currentServer(), platformSignal: execution.signal };
              active.platformAssertCurrent?.();
              const result = await withClient(active, (client) => {
                if (request.method === "resources/list") return client.listResources(request.cursor ? { cursor: request.cursor } : void 0, { signal: execution.signal });
                if (request.method === "resources/templates/list") return client.listResourceTemplates(request.cursor ? { cursor: request.cursor } : void 0, { signal: execution.signal });
                if (request.method === "resources/read" && typeof request.uri === "string") return client.readResource({ uri: request.uri }, { signal: execution.signal });
                throw new Error("\u4E0D\u652F\u6301\u7684 MCP Resource \u64CD\u4F5C");
              });
              active.platformAssertCurrent?.();
              return result;
            }) });
            inner.effect(() => {
              const count = (registeredResourceServers.get(server.id) ?? 0) + 1;
              registeredResourceServers.set(server.id, count);
              if (count === 1) config.onManagedResourceServer?.(server.id, true);
              return () => {
                const remaining = (registeredResourceServers.get(server.id) ?? 1) - 1;
                if (remaining) registeredResourceServers.set(server.id, remaining);
                else {
                  registeredResourceServers.delete(server.id);
                  config.onManagedResourceServer?.(server.id, false);
                }
              };
            }, "mcp-manager.group-resources");
          });
          for (const tool of discoveredTools.filter((item) => server.tools.mode === "all" || server.tools.names.includes(item.name))) {
            const publicName = publicToolName(serverName(server), tool.name);
            scope.ctx.effect(() => {
              const unregister = scope.ctx.tools.register(McpClient.createMcpToolDefinition(scope.ctx, {
                name: publicName,
                rawName: tool.name,
                description: tool.description ?? "",
                inputSchema: tool.inputSchema,
                outputSchema: tool.outputSchema,
                call: (args, execution) => config.withToolContext(execution, async () => {
                  return callManagedTool({ ...currentServer(), platformSignal: execution.signal }, tool.name, args);
                })
              }));
              const registration = `${server.id}\0${publicName}`;
              const count = registeredTools.get(registration) ?? 0;
              registeredTools.set(registration, count + 1);
              if (count === 0) config.onManagedTool?.(publicName, true);
              return () => {
                const remaining = (registeredTools.get(registration) ?? 1) - 1;
                if (remaining) registeredTools.set(registration, remaining);
                else {
                  registeredTools.delete(registration);
                  config.onManagedTool?.(publicName, false);
                }
                return unregister();
              };
            });
          }
        } else await scope.ctx.plugin(McpClient, McpClient.Config({
          transport: "streamable-http",
          serverName: serverName(server),
          url: `http://127.0.0.1:${ctx.webServer.port}${publicPath(`/mcp/agents/${id}`)}`,
          headers: { Authorization: `Bearer ${agentToken}` }
        }));
        unavailable.delete(server.id);
      } catch (error) {
        scopes.pop();
        await scope.dispose();
        unavailable.add(server.id);
        ctx.logger?.warn(`MCP \u670D\u52A1 ${server.id} \u5DE5\u5177\u6CE8\u518C\u5931\u8D25\uFF1B\u672C\u6B21 Session \u4E0D\u88C5\u8F7D\u8BE5\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5\u5DE5\u5177\u5B9A\u4E49`);
      }
    }
  };
  if (config.autoMountServers !== false) ctx.on("agent/created", ({ agent }) => {
    const preset = scopeParentOf(agent);
    if (!preset) return;
    const current = snapshot(config);
    if (config.mountServers) current.servers = config.mountServers(current.servers);
    const version = JSON.stringify([current.servers, current.sharedToken]);
    let entry = mounted.get(preset);
    const reused = entry?.version === version;
    if (!reused) {
      const previous = entry;
      const unavailable = /* @__PURE__ */ new Set();
      const ready = (async () => {
        if (previous) {
          await previous.retry?.catch(() => {
          });
          await Promise.all((await previous.ready.catch(() => [])).map((scope) => scope.dispose()));
        }
        const scopes = [];
        try {
          await loadServers(current.servers, preset, scopes, unavailable);
          return scopes;
        } catch (error) {
          await Promise.all(scopes.map((scope) => scope.dispose()));
          throw error;
        }
      })();
      entry = { version, users: 0, ready, unavailable };
      mounted.set(preset, entry);
    }
    const active = entry;
    const release = async () => {
      active.users--;
      if (active.users === 0) {
        if (mounted.get(preset) === active) mounted.delete(preset);
        await active.retry?.catch(() => {
        });
        await Promise.all((await active.ready.catch(() => [])).map((scope) => scope.dispose()));
      }
    };
    active.users++;
    if (!config.withToolContext) activeAgents.add(agent);
    agent.ctx.effect(() => async () => {
      activeAgents.delete(agent);
      await release();
    }, "mcp-manager.agent");
    void (async () => {
      try {
        await active.ready;
        if (active.users === 0) return;
        if (reused && active.unavailable.size) {
          await active.retry;
          active.retry ??= (async () => {
            const scopes = await active.ready;
            const added = [];
            const pending = new Set(active.unavailable);
            try {
              await loadServers(current.servers.filter((server) => pending.has(server.id)), preset, added, active.unavailable);
              scopes.push(...added);
            } catch (error) {
              for (const id of pending) active.unavailable.add(id);
              await Promise.all(added.map((scope) => scope.dispose()));
              throw error;
            }
          })().finally(() => {
            active.retry = void 0;
          });
          await active.retry;
        }
      } catch (error) {
        ctx.logger?.warn("MCP \u5DE5\u5177\u88C5\u8F7D\u672A\u5B8C\u6210\uFF1B\u667A\u80FD\u4F53\u7EE7\u7EED\u8FD0\u884C\uFF0C\u8BF7\u5728 MCP \u7BA1\u7406\u68C0\u67E5\u8FDE\u63A5");
      }
    })();
  }, { prepend: true });
}
export {
  Config,
  GROUP_DISCOVERY_META_KEY,
  GROUP_TARGET_META_KEY,
  GROUP_TOOL_META_KEY,
  apply,
  assertConnectionReady,
  groupTargetDigest,
  inject,
  listAll,
  name,
  publicToolName,
  snapshot,
  validateConfiguration
};
