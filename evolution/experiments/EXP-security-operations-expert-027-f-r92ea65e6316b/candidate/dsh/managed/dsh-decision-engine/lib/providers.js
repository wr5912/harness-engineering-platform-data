/**
 * Provider 配置模型 —— 所有决策请求的唯一构造入口。
 *
 * 为什么要单独一层：
 *
 * 早期版本把 `https://api.bamboonode.dev/v1/decisions` 硬编码在请求路径、
 * 配置页默认值和探测脚本三处。这带来两个问题：
 *
 *   1. 想接 TypeSafe 的 `/v1/systemone`、自建 llama.cpp 决策服务、
 *      或者任何提供同类决策端点的网关时，只能改源码。
 *   2. 三处硬编码会各自漂移：改了一处，配置页仍显示旧地址，用户以为没生效。
 *
 * 现在所有 provider 差异（base URL、端点风格、环境变量名、默认模型）都收在
 * 本模块的预设表里，`index.js` / `client.js` / 探测脚本只消费解析结果。
 * 本模块**零依赖、零 I/O**：不读文件、不读环境变量、不发请求，因此可以
 * 在裸 Node 下直接单测（见 test/providers.test.js）。
 *
 * 决策端点的约定（本模块据此固定请求形状，不随 provider 变化）：
 *
 *   POST <base>/decisions   或   POST <base>/systemone
 *   headers: authorization（由调用方按协议注入） / content-type: application/json
 *   body:    { model?, state, questions, think_mode }
 *   resp:    { answers, model?, usage? }
 *
 * 也就是说 provider 只决定「往哪发、用谁的 key、默认哪个模型」，
 * 请求体与响应结构对所有 provider 完全一致——这样换 provider 不会改变
 * 上层各决策点的解析逻辑。
 *
 * 本地差异：读取视图中的两处认证文本被遮罩；不恢复遮罩内容。
 * buildHeaders 按公开协议从参数构造，不包含任何固定凭据；托管匿名路径不调用它。
 * 原始提交和摘要见 PROVENANCE.md，此文件不声明与原版字节一致。
 * @module dsh-decision-engine/providers
 */

/**
 * 可选的 provider 标识。
 *
 * `systemone` / `bamboonode` / `siliconflow` / `siliconflow-intl` 是内置预设
 *（默认地址与参数由本模块提供）；`custom` 使用用户在设置界面填写的
 * base URL 与鉴权信息。
 *
 * 顺序即设置界面下拉的顺序：常用项在前，`custom` 收尾（它要填的东西最多）。
 */
export const PROVIDER_IDS = ["systemone", "bamboonode", "siliconflow", "siliconflow-intl", "custom"];

/** 默认 provider。刻意选 bamboonode：老用户的 `startlux.yml` 里没有 provider 键，
 *  必须继续走原来的地址与端点风格，升级不能改变既有行为。 */
export const DEFAULT_PROVIDER = "bamboonode";

/**
 * 自定义 base URL 的端点风格。
 *
 *   auto       已指向 /decisions 或 /systemone 就原样用，否则先试 decisions
 *   decisions  POST <base>/decisions
 *   systemone  POST <base>/systemone
 *
 * 注意：这是**首选**路径，不是唯一路径。路径后缀由服务商决定（实测
 * SiliconFlow 的 Kev-4B 只通 /v1/systemone，bamboonode 两条都通），
 * 因此 404 时会换另一条再试——见 endpointCandidates()。
 */
export const ENDPOINT_STYLES = ["auto", "decisions", "systemone"];

/** 端点风格 → 追加的路径段。 */
const STYLE_SEGMENT = { decisions: "decisions", systemone: "systemone" };

/**
 * 两条路径风格互为「另一条」。
 *
 * 用于 404 回退：路径不存在时换另一条再试一次。
 */
const ALTERNATE_STYLE = { decisions: "systemone", systemone: "decisions" };

/**
 * 合法的思考模式（与 startlux 服务的 `think_mode` 取值一致）。
 *
 *   never   不思考——最省延迟（实测约 1.9s vs 7.2s），默认值
 *   auto    仅在模型自己判断需要时思考
 *   always  总是思考——判断更充分，但热路径上每次多等约 5s
 *
 * 单独导出是为了让校验、前端下拉、文档三处只有一份取值来源。
 */
export const THINK_MODES = ["never", "auto", "always"];

/** 思考模式的默认值：热路径上优先保证不拖慢每次工具调用。 */
export const DEFAULT_THINK_MODE = "never";

/**
 * 把配置里的 thinkMode 归一成合法取值。
 *
 * 为什么需要它：本插件的配置来自**自研的极简 YAML 解析器**，完全绕过
 * Schemastery 的 `z.union([...])` 校验（那是 profile 层的 config 才走的路径）。
 * 于是 `thinkMode: sometimes` 这种手写错误会被原样发到服务端，得到 400 后
 * 静默降级放行——正是本插件最忌讳的「配了没反应」。
 *
 * 特别注意**空字符串**：`parseConfigText` 刻意把 `key:` 解析成 `""`
 *（那是 `model:` 表示「自动」的语义），但 `""` 对 think_mode 是非法的。
 * 因此这里不能用 `??` 兜底（它只挡 null/undefined），必须显式判空。
 *
 * @param raw - 配置里的原始值（可能是任意类型）。
 * @returns 合法取值；非法一律回退默认值。
 */
export function normalizeThinkMode(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return THINK_MODES.includes(value) ? value : DEFAULT_THINK_MODE;
}

/**
 * 内置预设。
 *
 * 每个预设必须给出：显示名称、默认 base URL、端点风格、环境变量名、
 * 默认模型与三个配置字段名。用户选了预设就用这里的值，不需要在设置界面
 * 重复填写。
 *
 * 两个可选标记（都是「按服务商实测」得出的，不是风格偏好）：
 *
 *   - `requiresModel: true`：该端点**不接受**省略 model 的请求（实测
 *     SiliconFlow 的 /v1/systemone 省略或空串都回 400
 *     `Model field is required.`）。这类预设在模型留空时回落到
 *     `defaultModel`，而不是沿用「留空 = 省略字段」的通用规则——
 *     那会导致一次注定 400 的请求，而守卫是 fail-open 的，表现为静默失效。
 *     其余服务商（bamboonode / system one）省略 model 会由服务端回填默认
 *     模型，保留省略语义才能在它们改名时不失效。
 *   - `knownModels`：该服务 `/v1/models` 会一并返回大量**非决策**模型且不带
 *     `supported_endpoint_types`（实测 SiliconFlow 返回 98 个，其中 chat
 *     模型打到 /v1/systemone 是 400 `Model does not exist.`）。
 *     列了这份清单就按它筛，不让下拉里出现「选了就失败」的选项。
 */
export const PROVIDER_PRESETS = {
  systemone: {
    id: "systemone",
    label: "system one",
    labelEn: "system one",
    baseUrl: "https://api.typesafe.ai/v1",
    endpointStyle: "systemone",
    // 每个 provider 用**自己的** key 名：同一台机器上很可能同时配好了
    // TypeSafe 与 bamboonode，共用一格会互相覆盖，切换时还得重填。
    apiKeyEnv: "TYPESAFE_API_KEY",
    legacyApiKeyEnvs: [],
    keyField: "systemoneApiKey",
    defaultModel: "jev-latest",
    modelField: "systemoneModel",
    keyEnvField: "systemoneApiKeyEnv",
    hint: "TypeSafe / Jev 的 System One 协议（POST /v1/systemone），"
      + "也是 llama.cpp、vLLM 等自建决策服务通用的线协议",
    hintEn: "TypeSafe / Jev System One protocol (POST /v1/systemone); "
      + "the same wire format used by llama.cpp and vLLM decision servers",
  },
  bamboonode: {
    id: "bamboonode",
    label: "bamboonode",
    labelEn: "bamboonode",
    baseUrl: "https://api.bamboonode.dev/v1",
    endpointStyle: "decisions",
    // bamboonode 保留它一直以来的名字（不是"统一成一个新名"）：
    // 一个 key 名对应一个服务，这才是用户能自主管理多套凭据的方式。
    // DECISION_ENGINE_KEY 只作为**回退**：上一版曾短暂改用它，
    // 用户可能已经把 key 存在那里，升级后不该让 key 突然读不到。
    apiKeyEnv: "BAMBOO_API_KEY",
    legacyApiKeyEnvs: ["DECISION_ENGINE_KEY"],
    keyField: "bamboonodeApiKey",
    defaultModel: "startlux-decision-27b-autothink",
    modelField: "model",
    keyEnvField: "bamboonodeApiKeyEnv",
    hint: "StartLux 官方端点（POST /v1/decisions），本插件的原有默认值",
    hintEn: "StartLux official endpoint (POST /v1/decisions); the original default",
  },
  siliconflow: {
    id: "siliconflow",
    label: "硅基流动",
    labelEn: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    // 实测（2026-10-25，真实 key）：该站只认 /systemone，/v1/decisions 回 404。
    // 因此这里直接给 systemone，不必让 404 回退先烧一次请求。
    endpointStyle: "systemone",
    // 两个 SiliconFlow 站点是**两套账号**，key 互不通用，因此各占一格。
    apiKeyEnv: "SILICONFLOW_API_KEY",
    legacyApiKeyEnvs: [],
    keyField: "siliconflowApiKey",
    // 实测省略 model 会 400 `Model field is required.`，而 bamboonode 省略会
    // 由服务端回填默认模型。因此这个 provider 必须**总带着一个模型名**——
    // 留空时回落到下面的 defaultModel，而不是省略字段（见 resolveProvider）。
    // 这正是「只填一个 API key 就能用」的前提：模型名是预设给好的。
    requiresModel: true,
    // /v1/models 里这条就叫 Kev-4B（官方文档两处分别写作 Kev-4b 与 Kev-4B，
    // 实测三种大小写都 200），取服务返回的写法，免得下拉里出现两条同模型。
    defaultModel: "Kev-4B",
    // 官方只支持这两个决策模型；/v1/models 却会一并返回 98 个 chat 模型且
    // 不带 supported_endpoint_types（实测把 chat 模型打过来是 400
    // `Model does not exist.`），所以按这份清单筛，不让下拉里出现选了就坏的项。
    knownModels: ["Kev-4B", "SemIf"],
    modelField: "siliconflowModel",
    keyEnvField: "siliconflowApiKeyEnv",
    hint: "硅基流动（国内站）的 System One 端点（POST /v1/systemone）；可用模型 Kev-4B / SemIf，默认 Kev-4B，只填一个 API key 即可使用",
    hintEn: "SiliconFlow China (POST /v1/systemone); models Kev-4B / SemIf, default Kev-4B — just add an API key",
  },
  "siliconflow-intl": {
    id: "siliconflow-intl",
    label: "Silicon Flow",
    labelEn: "Silicon Flow",
    baseUrl: "https://api.siliconflow.com/v1",
    // 同样只认 /systemone：实测打 /v1/decisions 回 404 Not Found。
    endpointStyle: "systemone",
    // 与国内站分开：两套账号的 key 不能共用一格，否则切过去就 401，
    // 而用户看不出是「拿错了 key」还是「key 失效」。
    apiKeyEnv: "SILICONFLOW_INTL_API_KEY",
    legacyApiKeyEnvs: [],
    keyField: "siliconflowIntlApiKey",
    requiresModel: true,
    defaultModel: "Kev-4B",
    knownModels: ["Kev-4B", "SemIf"],
    modelField: "siliconflowIntlModel",
    keyEnvField: "siliconflowIntlApiKeyEnv",
    hint: "Silicon Flow（国际站）的 System One 端点（POST /v1/systemone）；与国内站账号不通用，可用模型 Kev-4B / SemIf，默认 Kev-4B，只填一个 API key 即可使用",
    hintEn: "Silicon Flow global (POST /v1/systemone); separate account from the CN site, models Kev-4B / SemIf, default Kev-4B — just add an API key",
  },
  custom: {
    id: "custom",
    label: "custom",
    labelEn: "custom",
    baseUrl: "",
    endpointStyle: "auto",
    // custom 的变量名由用户填（customApiKeyEnv）；这里给出兜底默认名，
    // 用户不填时也能在 .credentials.yaml 里用这个键存 key。
    apiKeyEnv: "DECISION_ENGINE_CUSTOM_KEY",
    legacyApiKeyEnvs: [],
    keyField: "customApiKey",
    defaultModel: "",
    modelField: "customModel",
    keyEnvField: "customApiKeyEnv",
    hint: "任意提供决策端点的服务：自建 llama.cpp / vLLM、企业网关、第三方中转",
    hintEn: "Any service exposing a decision endpoint: self-hosted llama.cpp / vLLM, a gateway, or a relay",
  },
};

/**
 * 去掉首尾空白与结尾斜杠，统一成可安全拼接的 base URL。
 *
 * 只做规范化，不做合法性判断——判断交给 `validateBaseUrl`，因为两者
 * 的失败语义不同：规范化永远返回字符串（可能仍非法），校验才决定能不能存。
 *
 * @param raw - 用户填写的地址。
 * @returns 去掉结尾斜杠的地址；输入为空时返回 ""。
 */
export function normalizeBaseUrl(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length === 0) return "";
  // 多个结尾斜杠一并去掉，避免拼出 `//decisions` 这种空段路径。
  return text.replace(/\/+$/, "");
}

/**
 * 校验 base URL 是否可用。
 *
 * 规则刻意严格，因为「地址写错」是本插件最难自查的故障：请求会打到一个
 * 不存在的路径，服务端多半回 404，而降级是静默的——用户只看到「守卫没反应」。
 *
 * @param raw - 用户填写的地址。
 * @returns `{ ok: true, value }` 或 `{ ok: false, error }`（error 为可直接展示的中文）。
 */
export function validateBaseUrl(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length === 0) return { ok: false, error: "base URL 不能为空" };
  if (/\s/.test(text)) return { ok: false, error: "base URL 不能包含空格或换行" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return { ok: false, error: "base URL 必须以 http:// 或 https:// 开头" };
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "base URL 不是合法地址（示例：https://api.example.com/v1）" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `base URL 只支持 http/https，当前是 ${url.protocol}` };
  }
  if (url.hostname.length === 0) return { ok: false, error: "base URL 缺少主机名" };
  // 只允许「地址 + 路径」，带查询串会让端点拼接结果不可预测。
  if (url.search.length > 0) return { ok: false, error: "base URL 不要带查询串（? 之后的部分）" };
  return { ok: true, value: normalizeBaseUrl(text) };
}

/**
 * 判断某个路径是否已经是完整决策端点。
 *
 * @param path - URL 的 pathname（可含结尾斜杠）。
 * @returns "decisions" / "systemone" / undefined。
 */
export function endpointStyleOfPath(path) {
  const tail = String(path ?? "")
    .replace(/\/+$/, "")
    .split("/")
    .filter((part) => part.length > 0)
    .pop();
  if (tail === "decisions" || tail === "systemone") return tail;
  return undefined;
}

/**
 * 把 base URL 拼成可直接 POST 的完整端点。
 *
 * 这是本插件的核心可用性修复点：旧实现把配置原样 POST，用户按各家 SDK 的
 * 习惯填 `.../v1` 就必然 404（`Invalid URL (POST /v1)`）。现在的规则：
 *
 *   - 已经以 `/decisions` 或 `/systemone` 结尾 → 原样使用（用户填了完整端点）
 *   - 只有 origin（没有路径）→ 补 `/v1/<段>`（对齐各家的 `/v1/...` 约定）
 *   - 其它路径（`/v1`、`/api/v1`、`/openai/v1`）→ 追加 `/<段>`，不重复、不丢段
 *
 * 结尾斜杠在拼接前统一去掉，因此 `.../v1/` 与 `.../v1` 得到同一结果。
 *
 * @param baseUrl - base URL（可含结尾斜杠，可缺 scheme 的旧配置由调用方补齐）。
 * @param style - `decisions` / `systemone` / `auto`。
 * @returns 完整端点；输入为空时返回 ""。
 */
export function buildEndpoint(baseUrl, style = "decisions") {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.length === 0) return "";
  let url;
  try {
    url = new URL(normalized);
  } catch {
    // 不是合法 URL：原样返回，让调用方拿到明确的 fetch 失败而不是猜。
    return normalized;
  }
  const path = url.pathname.replace(/\/+$/, "");
  // 1) 已经指向决策端点：原样使用，不再叠加。
  const existing = endpointStyleOfPath(path);
  if (existing !== undefined) {
    url.pathname = path;
    return url.toString();
  }
  // auto 在没有线索时按 decisions 处理（与历史行为一致）。
  const segment = STYLE_SEGMENT[style === "auto" ? "decisions" : style] ?? "decisions";
  // 2) 只有 origin：补 /v1/<段>，这是各家的公共约定。
  if (path.length === 0) {
    url.pathname = `/v1/${segment}`;
    return url.toString();
  }
  // 3) 已有路径（/v1、/api/v1 ...）：只追加最后一段，避免 /v1/v1/decisions。
  url.pathname = `${path}/${segment}`;
  return url.toString();
}

/**
 * 列出「同一个 base URL 下所有值得一试的端点」，按优先级排列。
 *
 * 背景（2026-10-25 实测）：路径后缀由**服务商**决定，不由模型决定——
 * SiliconFlow 的 Kev-4B 只认 `/v1/systemone`（`/v1/decisions` 回 404），
 * 而 bamboonode 的决策模型两条路径都能用。因此「只拼一条路径」在换服务商
 * 时必然踩空，而守卫是 fail-open 的，踩空表现为**静默失效**。
 *
 * 候选规则：
 *
 *   - 地址**已自带**端点段（`.../v1/decisions` 或 `.../v1/systemone`）→
 *     只返回它自己。用户填了完整端点就是明确决定，不该被自动改写。
 *   - `auto` → 先试 `decisions`（与历史行为一致），再试 `systemone`。
 *   - 显式 `decisions` / `systemone` → 先试它自己，**再试另一条**。
 *
 * 最后一条是关键：显式指定只是「首选」，不是「唯一」。显式指定错路径时
 * 同样会 404，届时仍应回退到另一条——否则「选错了就只能手动改」这种
 * 死胡同会被用户当成插件的 bug。
 *
 * @param baseUrl - base URL。
 * @param style - `decisions` / `systemone` / `auto`。
 * @returns 候选端点数组（去重，优先级从高到低）。
 */
export function endpointCandidates(baseUrl, style = "auto") {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.length === 0) return [];
  // 用户填了完整端点：原样用，不追加任何候选。
  let path = "";
  try {
    path = new URL(normalized).pathname.replace(/\/+$/, "");
  } catch {
    // 非法 URL：交给调用方去报错，这里不构造候选。
    return [];
  }
  if (endpointStyleOfPath(path) !== undefined) {
    return [buildEndpoint(normalized, style)];
  }
  const primary = style === "auto" ? "decisions" : style === "systemone" ? "systemone" : "decisions";
  const secondary = ALTERNATE_STYLE[primary];
  const out = [buildEndpoint(normalized, primary)];
  const other = buildEndpoint(normalized, secondary);
  if (!out.includes(other)) out.push(other);
  return out;
}

/**
 * 端点风格 → 它对应的路径段（用于回显「当前用的是哪条路径」）。
 *
 * @param style - 风格取值。
 * @returns `decisions` / `systemone`；无法识别时返回 "decisions"。
 */
export function styleSegment(style) {
  return STYLE_SEGMENT[style] ?? "decisions";
}

/**
 * 解析 `customHeaders` 配置。
 *
 * 存储形态是 `Name: Value; Name2: Value2` 的单行字符串——本插件的配置读取器
 * 是极简 YAML 子集（只认标量与 `[a, b]` 数组），嵌套映射读不出来；用分号
 * 分隔既能在 `config.yml` 里手写，也能被面板原样回显。
 *
 * 受保护的头（`authorization` / `content-type` / `host`）会被忽略：鉴权方式
 * 必须与决策端点约定保持一致，否则换 provider 就可能悄悄换掉认证协议。
 *
 * @param raw - 字符串或字符串数组。
 * @returns 可直接并入 fetch headers 的对象（可能为空对象）。
 */
export function parseCustomHeaders(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  const entries = Array.isArray(raw) ? raw.map((item) => String(item ?? "")) : String(raw ?? "").split(/[;\n]/);
  for (const entry of entries) {
    const line = entry.trim();
    if (line.length === 0) continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const name = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (name.length === 0 || value.length === 0) continue;
    // 头名只接受 RFC 7230 的 token 字符，避免把说明文字当成头。
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) continue;
    const lower = name.toLowerCase();
    if (lower === "authorization" || lower === "content-type" || lower === "host") continue;
    out[name] = value;
  }
  return out;
}

/**
 * 解析某个 provider 此刻生效的完整配置。
 *
 * 这是全插件唯一的「provider → 请求参数」解析点。`classify()`、探测、
 * 模型列表、状态接口都调它，因此三处不可能再各写一套地址规则。
 *
 * 解析顺序（内置预设）：预设默认值打底，`config.yml` 里显式写的值覆盖。
 * 对 bamboonode 额外保留 `baseUrl` 的覆盖语义——那是老版本唯一的地址字段，
 * 用户可能已经指向自建的 bamboonode 兼容服务，升级不能把它改回官方地址。
 *
 * @param cfg - 已合并的配置对象（可能缺字段）。
 * @returns 生效配置；`valid=false` 时 `error` 是可展示的中文原因。
 */
export function resolveProvider(cfg = {}) {
  const requested = typeof cfg.provider === "string" ? cfg.provider.trim() : "";
  const id = PROVIDER_IDS.includes(requested) ? requested : DEFAULT_PROVIDER;
  const preset = PROVIDER_PRESETS[id];

  if (id === "custom") {
    const rawBase = typeof cfg.customBaseUrl === "string" ? cfg.customBaseUrl : "";
    const checked = validateBaseUrl(rawBase);
    const style = ENDPOINT_STYLES.includes(cfg.customEndpointStyle) ? cfg.customEndpointStyle : "auto";
    const baseUrl = checked.ok ? checked.value : normalizeBaseUrl(rawBase);
    const model = typeof cfg.customModel === "string" ? cfg.customModel.trim() : "";
    return {
      id,
      label: preset.label,
      preset,
      source: "custom",
      baseUrl,
      endpoint: checked.ok ? buildEndpoint(baseUrl, style) : "",
      // 候选端点（按优先级）：404 时按顺序换下一条再试。
      candidates: checked.ok ? endpointCandidates(baseUrl, style) : [],
      endpointStyle: style,
      model,
      defaultModel: "",
      thinkMode: normalizeThinkMode(cfg.thinkMode),
      apiKeyEnv: firstNonEmpty(cfg.customApiKeyEnv, preset.apiKeyEnv),
      legacyApiKeyEnvs: [...(preset.legacyApiKeyEnvs ?? [])],
      explicitKey: typeof cfg[preset.keyField] === "string" ? cfg[preset.keyField].trim() : "",
      headers: parseCustomHeaders(cfg.customHeaders),
      valid: checked.ok,
      error: checked.ok ? undefined : `自定义 provider 的 base URL 不可用：${checked.error}`,
    };
  }

  // 内置预设：预设默认打底，配置覆盖。
  const presetBase = preset.baseUrl;
  const legacyBase =
    id === "bamboonode" && typeof cfg.baseUrl === "string" ? normalizeBaseUrl(cfg.baseUrl) : "";
  let baseUrl = legacyBase.length > 0 ? legacyBase : presetBase;
  // 老配置允许省略 scheme（`api.x.dev/v1`），预设值自带 scheme，这里只补缺。
  if (baseUrl.length > 0 && !/^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  const checked = validateBaseUrl(baseUrl);
  // 模型按 provider 分开读：`model` 属于 bamboonode（老版本唯一的模型字段），
  // `systemoneModel` 属于 system one。共用一格会把 bamboonode 的模型名发给
  // TypeSafe，得到 400 `model not served`——「切 provider 就坏」的典型来源。
  const modelField = preset.modelField;
  const rawModel = typeof cfg[modelField] === "string" ? cfg[modelField].trim() : "";
  // 模型留空有两种含义，取决于该服务商的端点接不接受「不带 model」的请求：
  //
  //   - requiresModel（SiliconFlow 实测）：省略或空串都回 400
  //     `Model field is required.`，因此留空必须回落到预设的 defaultModel
  //     ——不发一个注定失败的请求，守卫才不会又一次静默失效。
  //   - 其余服务商：留空 = 省略字段，由服务端回填默认模型。保留省略语义，
  //     服务商将来给模型改名时本配置不会失效（反过来把模型名钉死在这里
  //     才是最脆的那种配法）。
  const model =
    rawModel.length > 0 ? rawModel : preset.requiresModel === true ? preset.defaultModel : "";
  // 密钥变量名：`apiKeyEnv` 是**历史字段**，只对 bamboonode 有覆盖意义
  //（老版本只有这一个 provider，用户可能已经在里面写了自己的变量名）。
  // 若让它参与 system one 的解析，会盖掉 TYPESAFE_API_KEY——切到 system one
  // 却拿 bamboonode 的 key 去请求，得到 401 而用户完全看不出为什么。
  //
  // 历史字段里若写的是「旧默认名」或「旧环境变量」，不算用户自定义，
  // 由 `normalizeKeyEnvOverride` 过滤掉——否则改名永远不生效。
  const legacyKeyEnv = id === "bamboonode" ? normalizeKeyEnvOverride(cfg.apiKeyEnv, preset) : undefined;
  // 新名优先，旧名仅作回退。旧名不能出现在 apiKeyEnv 里
  //（那是「当前生效变量」的展示来源）。
  const configuredKeyEnv = firstNonEmpty(cfg[preset.keyEnvField], legacyKeyEnv, preset.apiKeyEnv);
  const fallbackKeyEnvs = [...(preset.legacyApiKeyEnvs ?? [])].filter(
    (name) => name !== configuredKeyEnv,
  );
  return {
    id,
    label: preset.label,
    preset,
    source: legacyBase.length > 0 ? "legacy" : "preset",
    baseUrl: checked.ok ? checked.value : baseUrl,
    endpoint: checked.ok ? buildEndpoint(baseUrl, preset.endpointStyle) : "",
    // 候选端点（按优先级）：预设自己的路径优先，404 时换另一条再试。
    // 实测 bamboonode 两条路径都通，SiliconFlow 只通 /systemone。
    candidates: checked.ok ? endpointCandidates(baseUrl, preset.endpointStyle) : [],
    endpointStyle: preset.endpointStyle,
    model,
    defaultModel: preset.defaultModel,
    thinkMode: normalizeThinkMode(cfg.thinkMode),
    apiKeyEnv: configuredKeyEnv,
    legacyApiKeyEnvs: fallbackKeyEnvs,
    // 显式 key 也按 provider 分开存：切到 system one 时不会拿 bamboonode 的
    // 明文 key 去请求。历史共享字段 `apiKey` 仅对 bamboonode 做一次兼容读取
    //（老版本的 yml 里只有这一个 key 字段）。
    explicitKey: firstNonEmpty(
      cfg[preset.keyField],
      id === "bamboonode" ? cfg.apiKey : undefined,
    ),
    headers: {},
    valid: checked.ok,
    error: checked.ok ? undefined : `provider ${id} 的 base URL 不可用：${checked.error}`,
  };
}

/**
 * 按 provider 解析生效的 API key。
 *
 * 优先级与旧版本一致，只是「显式 key / 环境变量名」现在由 provider 决定：
 *
 *   1. 该 provider 的显式 key（`apiKey` 或 `customApiKey`）
 *   2. `~/.dsh/.credentials.yaml` 的 `refs:` 段（推荐，与其他服务统一托管）
 *   3. 环境变量
 *
 * 凭据读取由调用方注入，因此本模块不碰文件系统，可在裸 Node 下单测。
 *
 * @param provider - `resolveProvider()` 的结果。
 * @param options.credentialReader - `(ref) => string | undefined`。
 * @param options.env - 环境变量表，默认 `process.env`。
 * @returns 密钥，或 undefined。
 */
export function resolveKeyFor(provider, options = {}) {
  if (provider.explicitKey.length > 0) return provider.explicitKey;
  const reader = options.credentialReader;
  const env = options.env ?? process.env;

  // 变量名按「新名 → 旧名」依次尝试。旧名只做回退：用户把 key 存在
  // BAMBOO_API_KEY 里的旧安装，升级后不必重填就能继续工作。
  const names = [provider.apiKeyEnv, ...(provider.legacyApiKeyEnvs ?? [])].filter(
    (name) => typeof name === "string" && name.length > 0,
  );
  for (const envName of names) {
    if (typeof reader === "function") {
      const fromCredentials = reader(envName);
      if (typeof fromCredentials === "string" && fromCredentials.length > 0) return fromCredentials;
    }
    const fromEnv = env?.[envName];
    if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return fromEnv.trim();
  }
  return undefined;
}

/**
 * 从调用方参数构造标准认证头；不含任何来源遮罩内容或固定凭据。
 * 受保护的认证和内容类型字段最后写入，自定义头不能覆盖。
 * 托管匿名模式由主入口 requestHeaders 提前旁路，不进入此函数。
 */
export function buildHeaders(provider, key) {
  return {
    ...provider.headers,
    authorization: "Bearer".concat(" ", String(key)),
    "content-type": "application/json",
  };
}

/**
 * 构造请求体（决策端点线协议，对所有 provider 相同）。
 *
 * `model` 为空时**省略字段**而不是发空串：实测端点对 `"model": ""` 回
 * 400 `model must be a nonempty string`，而省略字段会回填服务端默认模型。
 *
 * @param provider - `resolveProvider()` 的结果。
 * @param payload.state - 决策上下文。
 * @param payload.questions - 问题集。
 * @param payload.thinkMode - 覆盖 provider 上的 thinkMode（探测用）。
 * @returns 可直接 JSON.stringify 的对象。
 */
export function buildRequestBody(provider, payload) {
  const model = (provider.model ?? "").trim();
  return {
    ...(model.length > 0 ? { model } : {}),
    state: payload.state,
    questions: payload.questions,
    think_mode: normalizeThinkMode(payload.thinkMode ?? provider.thinkMode),
  };
}

/**
 * 供设置界面展示的 provider 清单。
 *
 * 由服务端下发而不是前端硬编码：新增预设只改本文件一处，界面自动多一个选项。
 * `keyField` / `modelField` 也一并下发——界面写回配置时必须知道「这一格在
 * config.yml 里叫什么」，而这个名字只有预设表知道；让前端自己再抄一份，
 * 就是「界面显示存到 A、实际写进 B」这种最难自查的偏差。
 *
 * @returns 每个预设的 id / 显示名 / 默认地址 / 字段名 / 说明。
 */
export function providerCatalog() {
  return PROVIDER_IDS.map((id) => {
    const preset = PROVIDER_PRESETS[id];
    return {
      id,
      label: preset.label,
      labelEn: preset.labelEn,
      baseUrl: preset.baseUrl,
      endpointStyle: preset.endpointStyle,
      defaultModel: preset.defaultModel,
      apiKeyEnv: preset.apiKeyEnv,
      // 该 provider 的显式 key 字段名（`bamboonodeApiKey` 等）。
      // 界面用它说明「key 存在配置文件的哪一格」——只报变量名会让人
      // 以为 key 在 .credentials.yaml 里，而实际生效的可能是配置文件。
      keyField: preset.keyField,
      // 该 provider 的模型字段名（`model` / `systemoneModel` / …）。
      // 模型输入框按它写回配置，切 provider 不会把 A 的模型名写进 B 那一格。
      modelField: preset.modelField,
      // 「模型」那一行的语义全靠这两项：端点是否强制要 model（决定留空的
      // 写法是「预设默认」还是「服务端默认」），以及能选的模型有哪些。
      // 都由预设表下发，前端不必知道任何一家服务商的脾气。
      requiresModel: preset.requiresModel === true,
      knownModels: [...(preset.knownModels ?? [])],
      hint: preset.hint,
      hintEn: preset.hintEn,
      customizable: id === "custom",
    };
  });
}

/**
 * 判断历史字段 `apiKeyEnv` 的值算不算「用户自定义」。
 *
 * 老版本只有 bamboonode 一个 provider，yam 里写的是旧默认名
 * （`BAMBOO_API_KEY`）或对应的**旧环境变量**。这两种都不算用户自定义——
 * 前者是默认值残留，后者是改名前的变量名——因此一律返回 undefined，
 * 让预设自己的默认名接管。
 *
 * 只有用户填了**别的**变量名（例如 `MY_KEY`）才认为是他主动指定的，予以保留。
 *
 * @param raw - 配置里的 apiKeyEnv。
 * @param preset - 该 provider 的预设。
 * @returns 需要尊重的自定义变量名，或 undefined。
 */
function normalizeKeyEnvOverride(raw, preset) {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length === 0) return undefined;
  // 等于预设的当前默认名：不是自定义。
  if (name === preset.apiKeyEnv) return undefined;
  // 等于该预设的旧名：是老默认值，不算自定义（改名要能生效）。
  if ((preset.legacyApiKeyEnvs ?? []).includes(name)) return undefined;
  return name;
}

/** 取第一个非空字符串。 */
function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}
