/**
 * EXP027 客户端纯策略。待完整 Client 经受控入口纳入并构建后接入；当前未使用。
 * 不读文件、凭据或浏览器全局，不联网、不注册工具，不替代 Host 托管校验。
 * URL 构造遵循固定 DSH b830ec950faba0a46dda564be3e2d854afed94f1
 * 的文档相对 HTTP 路径与 document.baseURI 合同；实际页面基址仍需验收。
 */
const KEY_FIELDS = new Set([
  "apiKey", "apiKeyEnv", "customApiKey", "customApiKeyEnv",
  "systemoneApiKey", "systemoneApiKeyEnv", "bamboonodeApiKey", "bamboonodeApiKeyEnv",
  "siliconflowApiKey", "siliconflowApiKeyEnv", "siliconflowIntlApiKey", "siliconflowIntlApiKeyEnv",
  "keyStorage",
]);
const TELEMETRY_LEVELS = new Set(["off", "install", "daily"]);
const RESERVED_FIELDS = new Set(["__proto__", "constructor", "prototype"]);
const API_SUFFIX = /^\/(?:status|config|decisions|models|test|stats|logs)(?:\?[^#\r\n]*)?$/u;

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

/** 状态未成功加载时不允许写入；匿名必须由同一 Provider 的显式状态证明。 */
export function deriveClientPolicy(status, providerDraft = {}) {
  const telemetryLevel = TELEMETRY_LEVELS.has(status?.telemetryLevel)
    ? status.telemetryLevel : undefined;
  const ready = typeof status?.provider === "string" && status.provider.length > 0
    && typeof status.keyRequired === "boolean"
    && typeof status.managedDeployment === "boolean"
    && telemetryLevel !== undefined;
  const managed = status?.managedDeployment === true;
  const draftProvider = providerDraft?.provider ?? status?.provider;
  const draftAuthMode = providerDraft?.customAuthMode ?? status?.customAuthMode;
  const anonymous = ready && status.keyRequired === false
    && status.provider === "custom" && draftProvider === status.provider
    && status.customAuthMode === "none" && draftAuthMode === "none";
  const writable = ready && !managed;
  return Object.freeze({
    ready, managed, anonymous, writable,
    keyRequired: !anonymous,
    credentialWritable: writable && !anonymous,
    telemetryLevel,
    notice: !ready ? "status-unavailable" : managed ? "managed"
      : anonymous ? "anonymous" : "key-required",
  });
}

/**
 * 完整 Client 的 scheduleSave / commitKey / flush / retrySave 应先检查 writable。
 * 此处再次从最新状态派生策略，防止仅隐藏控件却仍发送旧的自动保存请求。
 * 匿名时只访问保留字段的值，不把空密钥字段或 keyStorage 送到 Host。
 * 不修改调用方对象；不把缺少 Key 等同于匿名，也不伪造 keyConfigured。
 */
export function filterConfigPatch(patch, status, providerDraft) {
  const policy = deriveClientPolicy(status, providerDraft);
  if (!policy.ready) reject("decision_engine/client_status_unavailable");
  if (policy.managed) reject("decision_engine/managed_configuration_read_only");
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    reject("decision_engine/invalid_configuration_patch");
  }
  return Object.fromEntries(Object.keys(patch)
    .filter((key) => !RESERVED_FIELDS.has(key) && (!policy.anonymous || !KEY_FIELDS.has(key)))
    .map((key) => [key, patch[key]]));
}

/**
 * 调用方传入 document.baseURI 与 location.origin，不猜 boot 字段或截取 pathname。
 * 仅构造同源插件 API URL；不改变现有 init、HTTP 方法或认证，不发起请求。
 */
export function resolveDecisionApiUrl(path, baseURI, pageOrigin) {
  if (typeof path !== "string" || !API_SUFFIX.test(path)
    || typeof baseURI !== "string" || typeof pageOrigin !== "string") {
    reject("decision_engine/invalid_api_location");
  }
  const base = new URL(baseURI);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
    || base.origin !== pageOrigin) {
    reject("decision_engine/cross_origin_api_location");
  }
  const url = new URL(`api/decision-engine${path}`, base);
  if (url.origin !== pageOrigin) reject("decision_engine/cross_origin_api_location");
  return url.href;
}
