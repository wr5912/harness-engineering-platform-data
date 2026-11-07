/**
 * 端点回退：404 表示「这条路径不存在」，换另一条再试。
 *
 * 为什么需要它（2026-10-25 真实端点实测）：
 *
 *   路径后缀（`/decisions` 还是 `/systemone`）由**服务商**决定，**不由模型决定**：
 *
 *     SiliconFlow    Kev-4B                   /v1/decisions → 404    /v1/systemone → 200 ✅
 *     bamboonode     startlux-decision-27b-…  两者都 200
 *
 *   旧实现只有一条路径：`customEndpointStyle: auto` 的真实含义是「按
 *   decisions 拼」。配到只认 `/systemone` 的服务上就得到 404，而守卫是
 *   fail-open 的——于是它**静默地什么也没做**（现场证据：telemetry.jsonl
 *   里 2026-10-25 13:16–13:41 有 8 次 `http-404` 降级）。
 *
 *   404 与 400 必须区分：实测 404 = 路径不存在（换路径有用），400 = 请求
 *   内容或模型不合法（换路径没用）。因此**只有 404 触发回退**。
 *
 * 本模块**零依赖**：只做「依次尝试候选端点」这一件事，因此可以在裸 Node
 * 下直接单测（见 test/endpoint-fallback.test.js）。
 *
 * @module dsh-decision-engine/endpoint-fallback
 */

/**
 * 「路径不存在」的状态码。
 *
 * 实测两类网关一致：SiliconFlow 与 bamboonode 对不存在的路径都回 404
 * （SiliconFlow 甚至回纯文本 `Not Found` 而非 JSON 错误体），而路径存在
 * 但内容/模型不合法时回 400。
 */
export const PATH_MISS_STATUS = 404;

/**
 * 依次尝试候选端点，直到出现一个「不是路径不存在」的响应。
 *
 * 只有 404 会触发换下一条：其它状态码（400 模型/内容不合法、401 key 不对、
 * 5xx 服务端故障）都与路径无关，换路径只会多烧一次请求。
 *
 * 网络异常（fetch 抛错）**直接上抛**，不换路径重试：DNS/连接失败对所有候选
 * 是一样的，重试只是把一次失败变成两次。调用方据此降级。
 *
 * @param candidates - 候选端点，按优先级排列。
 * @param send - `(endpoint) => Promise<Response>`：发一次请求。
 * @returns `{ endpoint, response, attempts }`：
 *   - `endpoint`：实际使用的端点（最后一次尝试的）。
 *   - `response`：该端点的响应（候选为空时为 undefined）。
 *   - `attempts`：每次尝试的 `{ endpoint, status }`，供遥测解释「换过路径」。
 */
export async function sendWithEndpointFallback(candidates, send) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(
    (item) => typeof item === "string" && item.length > 0,
  );
  const attempts = [];
  if (list.length === 0) return { endpoint: "", response: undefined, attempts };
  for (let index = 0; index < list.length; index += 1) {
    const endpoint = list[index];
    // 网络异常在此上抛：调用方按「network-error / timeout」降级。
    const response = await send(endpoint);
    const status = typeof response?.status === "number" ? response.status : 0;
    attempts.push({ endpoint, status });
    const hasNext = index + 1 < list.length;
    if (status === PATH_MISS_STATUS && hasNext) {
      // 换下一条前先丢弃这次的响应体：不消费它会让连接被挂住，
      // 高频决策下会逐渐耗尽连接池。
      try {
        await response?.body?.cancel?.();
      } catch {
        /* 取消失败无所谓：响应体最终会被 GC */
      }
      continue;
    }
    return { endpoint, response, attempts };
  }
  // 理论上到不了这里（最后一轮必定 return），但保持返回结构完整。
  return { endpoint: list[list.length - 1], response: undefined, attempts };
}

/**
 * 记住「哪条路径真的能用」。
 *
 * 为什么要记：auto 风格下每次都先打一条错路径、再打对路径，等于每次请求
 * 多一次往返（决策热路径上这是实打实的延迟）。记住之后，下次直接打对的那条。
 *
 * 作用域限**单个 base URL**：换了地址就重新探测——否则「A 服务商的结论」
 * 会被套用到 B 服务商上，那正是本插件最忌讳的「配置漂移」。
 */
export class EndpointMemory {
  constructor() {
    /** @type {Map<string, { endpoint: string, style: string }>} */
    this.entries = new Map();
  }

  /**
   * 记下某条路径可用。
   *
   * @param baseUrl - base URL（探测的适用范围）。
   * @param endpoint - 实际可用的端点。
   * @param style - 该端点的路径风格（`decisions` / `systemone`）。
   */
  record(baseUrl, endpoint, style) {
    if (typeof baseUrl !== "string" || baseUrl.length === 0) return;
    if (typeof endpoint !== "string" || endpoint.length === 0) return;
    this.entries.set(baseUrl, { endpoint, style });
  }

  /**
   * 取某个 base URL 记住的端点。
   *
   * @param baseUrl - base URL。
   * @returns `{ endpoint, style }` 或 undefined。
   */
  get(baseUrl) {
    if (typeof baseUrl !== "string" || baseUrl.length === 0) return undefined;
    return this.entries.get(baseUrl);
  }

  /**
   * 把记住的端点提到候选列表最前面。
   *
   * 只在它**确实还在候选里**时才提升：候选由配置决定，配置改了（比如换端点
   * 风格）就说明用户有了新决定，此时旧的探测结果不该再插队。
   *
   * @param baseUrl - base URL。
   * @param candidates - 候选端点列表。
   * @returns 调整顺序后的新数组（不改原数组）。
   */
  order(baseUrl, candidates) {
    const list = [...(Array.isArray(candidates) ? candidates : [])];
    const remembered = this.get(baseUrl);
    if (remembered === undefined) return list;
    const index = list.indexOf(remembered.endpoint);
    if (index <= 0) return list;
    list.splice(index, 1);
    list.unshift(remembered.endpoint);
    return list;
  }

  /** 清空记忆（配置变了、或探测结果不再适用时）。 */
  clear() {
    this.entries.clear();
  }
}
