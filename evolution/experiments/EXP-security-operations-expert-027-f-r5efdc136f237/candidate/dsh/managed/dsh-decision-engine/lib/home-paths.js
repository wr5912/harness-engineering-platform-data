/**
 * DSH 家目录解析 —— 与宿主 `@deepseek-ai/dsh-home-paths` 保持同一语义。
 *
 * 为什么自己实现而不直接依赖宿主那个包：
 *
 *   `@deepseek-ai/dsh-home-paths` 是宿主的 peer 依赖，装上它本插件就无法在
 *   没有 DSH node_modules 的裸仓库里被加载——而本项目刻意保持零运行时依赖
 *   （`lib/providers.js` 甚至能在裸 Node 下单测）。因此这里复刻它的**行为**，
 *   而不是引入它的代码。
 *
 * 与宿主 `resolveDshHome()` 必须一致的三条规则：
 *
 *   1. **优先级**：显式配置 > `$DSH_HOME` > `~/.dsh`
 *   2. **空白即未设置**：空串或纯空白的 `$DSH_HOME` 当作没有，
 *      否则空值会把数据目录解析到当前工作目录（宿主的注释专门强调过这点）
 *   3. **波浪号展开**：`~`、`~/`、`~\` 都按操作系统家目录展开。
 *      其中 `~\` 是 Windows 形式，宿主为此专门加了这一条
 *
 * 另外补上宿主也做、而早期实现漏掉的一步：**规范化成绝对路径**
 * （`path.resolve`）。相对路径（`DSH_HOME=./home`）若不规范化，实际落盘位置
 * 会随进程工作目录漂移，表现为「同一个配置有时读得到有时读不到」。
 *
 * 跨平台说明：`~/.dsh` 里的 `.dsh` 只是**目录名**，不是路径分隔符，Windows
 * 完全允许点开头的目录。真正与平台相关的是分隔符与家目录位置，这两件事都由
 * `node:path` / `node:os` 处理，所以 Windows 上会得到
 * `C:\Users\<name>\.dsh\...`。
 *
 * @module dsh-decision-engine/home-paths
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** 默认的 Harness 家目录名（宿主同名常量）。 */
export const DSH_HOME_DIR_NAME = ".dsh";

/** 覆盖默认家目录的环境变量（宿主同名常量）。 */
export const DSH_HOME_ENV = "DSH_HOME";

/**
 * 展开 `~`、`~/`、`~\` 前缀。
 *
 * 只处理「单独的家目录」与「当前用户」两种形式；`~alice/...` 这类命名用户
 * 形式原样返回——与宿主 `expandHomePath` 的行为一致，避免自作聪明地改坏
 * 用户写的路径。
 *
 * @param path - 可能带波浪号前缀的路径。
 * @returns 展开后的路径；没有可识别前缀时原样返回。
 */
export function expandHomePath(path) {
  const text = typeof path === "string" ? path : "";
  if (text === "~") return homedir();
  if (text.startsWith("~/") || text.startsWith("~\\")) return join(homedir(), text.slice(2));
  return text;
}

/**
 * 解析 DSH 家目录。
 *
 * @param options.configured - 显式配置的路径，优先级最高（当前插件没有此入口，
 *   保留参数是为了与宿主签名一致，便于将来接入 profile 配置）。
 * @param options.env - 环境变量表，默认 `process.env`；注入便于单测。
 * @returns 规范化后的绝对路径。
 */
export function resolveDshHome(options = {}) {
  const env = options.env ?? process.env;
  const raw = env?.[DSH_HOME_ENV];
  const fromEnv = typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
  const configured = typeof options.configured === "string" && options.configured.trim().length > 0
    ? options.configured
    : undefined;
  const chosen = configured ?? fromEnv ?? join(homedir(), DSH_HOME_DIR_NAME);
  // resolve() 同时完成「展开相对路径」与「消除 . / .. 」，
  // 保证不同工作目录下得到同一个绝对路径。
  return resolve(expandHomePath(chosen));
}

/**
 * 把若干路径段拼到解析出的家目录上。
 *
 * @param segments - 追加的路径段；为空时返回家目录本身。
 * @returns 绝对路径。
 */
export function dshHomePath(...segments) {
  return join(resolveDshHome(), ...segments);
}
