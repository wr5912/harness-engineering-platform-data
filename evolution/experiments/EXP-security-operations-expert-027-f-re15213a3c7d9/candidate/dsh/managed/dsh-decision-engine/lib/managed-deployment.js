/**
 * EXP027 托管部署约束。仅在可信 Profile 显式 managedDeployment:true 时启用。
 * 不读凭据，不自行联网，不注册工具；非托管使用保留上游配置合并语义。
 * 默认 bearer 不能因缺少 Key 自动降级为匿名。MIT；本地适配见 PROVENANCE.md。
 */
export const MANAGED_ORIGIN = "http://i-1.gpushare.com:62770";
export const MANAGED_DATA_NAMESPACE = "managed-security-operations-exp027";
export const MANAGED_CONFIG = Object.freeze({
  managedDeployment: true,
  enabled: true,
  mode: "shadow",
  provider: "custom",
  customBaseUrl: `${MANAGED_ORIGIN}/v1/systemone`,
  customEndpointStyle: "systemone",
  customAuthMode: "none",
  customModel: "",
  customHeaders: "",
  customApiKey: "",
  customApiKeyEnv: "",
  apiKey: "",
  apiKeyEnv: "",
  telemetryLevel: "off",
  telemetryEndpoint: "",
  guardEnabled: true,
  pointAuthorize: "observe",
  pointRoute: "off",
  pointDelegate: "off",
  pointCompact: "off",
  pointTurnStop: "off",
  pointRetrieval: "off",
  pointSkillPick: "off",
  pointCotTranslate: "off",
});

const KEY_FIELDS = new Set([
  "apiKey", "apiKeyEnv", "customApiKey", "customApiKeyEnv",
  "systemoneApiKey", "systemoneApiKeyEnv", "bamboonodeApiKey", "bamboonodeApiKeyEnv",
  "siliconflowApiKey", "siliconflowApiKeyEnv", "siliconflowIntlApiKey", "siliconflowIntlApiKeyEnv",
]);

export function isAnonymousCustom(cfg, provider) {
  return cfg?.provider === "custom" && cfg?.customAuthMode === "none"
    && (provider === undefined || provider?.id === "custom");
}

export function mergeRuntimeConfig(defaults, profile, own = {}) {
  const merged = { ...defaults };
  for (const source of [profile ?? {}, own ?? {}]) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  if (profile?.managedDeployment === true) {
    Object.assign(merged, MANAGED_CONFIG);
    for (const key of KEY_FIELDS) merged[key] = "";
  }
  return merged;
}

export function validateDeploymentPatch(profile, patch, current) {
  if (profile?.managedDeployment === true) {
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (KEY_FIELDS.has(key)) {
        return { ok: false, error: "当前托管部署使用显式匿名服务，不接受密钥或凭据来源配置" };
      }
      if (Object.hasOwn(MANAGED_CONFIG, key) && value !== MANAGED_CONFIG[key]) {
        return { ok: false, error: `${key} 由目标 Candidate 固定；当前仅允许已授权服务的影子观察` };
      }
    }
  }
  const merged = { ...(current ?? {}), ...(patch ?? {}) };
  if (isAnonymousCustom(merged)) {
    for (const key of KEY_FIELDS) {
      if (Object.hasOwn(patch ?? {}, key)) {
        return { ok: false, error: "显式匿名 custom 模式不接受密钥字段；没有执行凭据写入" };
      }
    }
  }
  return { ok: true };
}

export function requestHeaders(cfg, provider, key, authenticatedBuilder) {
  if (isAnonymousCustom(cfg, provider)) return { "Content-Type": "application/json" };
  return authenticatedBuilder(provider, key);
}

export function decisionFetch(cfg, target, init = {}, fetchFn = globalThis.fetch) {
  if (cfg?.managedDeployment === true) {
    const url = new URL(target);
    if (url.origin !== MANAGED_ORIGIN || url.username || url.password || url.search || url.hash
      || !["/v1/systemone", "/v1/models"].includes(url.pathname)) {
      throw new Error("托管决策请求超出已授权服务范围");
    }
  }
  // 不跟随任何服务重定向，避免请求及工具摘要转发到其他来源。
  return fetchFn(target, { ...init, redirect: "error" });
}
