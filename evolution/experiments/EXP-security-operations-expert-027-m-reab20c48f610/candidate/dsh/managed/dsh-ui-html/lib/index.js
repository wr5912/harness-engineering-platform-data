/**
 * dsh-ui-html — host half.
 *
 * Registers three things in the Host process:
 *   1. the `show_ui` tool (typed schema, blocking interaction, text fallback),
 *   2. the package-private HTTP interaction bridge (`/plugins/dsh-ui-html/*`),
 *   3. an optional system-prompt section that teaches the model when to use it.
 *
 * The browser half ships separately through `package.json`'s `dsh.client`
 * declaration (exports `./client`) and registers the keyed
 * `tool.call.toolview` view for the `show_ui` wire name.
 *
 * The tool definition is a plain `ToolDefinition` object with raw JSON Schema,
 * and configuration is read through live accessors, so the module graph stays
 * inside the profile and every volatile settings edit applies without a
 * remount.
 *
 * @module dsh-ui-html
 */

import { Config, createSettings } from './config.js'
import { createBridge } from './bridge.js'
import { createTool } from './tool.js'
import { TOOL_NAME, validateResourceOrigins } from './protocol.js'

/** Stable plugin id. */
export const name = 'dsh-ui-html'

/** Required Host services: the tool registry, the browser carrier, the prompt registry. */
const INJECT = ['tools', 'webServer', 'systemPrompt']
export const inject = INJECT

export { Config }

/** Placement of the announcement section inside the tool-guidance band. */
const SECTION_ORDER = 210

/** Prompt section name; stable so a higher-priority layer can override it. */
const SECTION_NAME = 'dsh-ui-html'

const ANNOUNCEMENT = [
  '## 交互式 HTML 界面（show_ui）',
  '',
  '本机已安装 dsh-ui-html 插件：可用 `show_ui` 在对话消息里直接展示一个可交互的 HTML 界面。',
  '',
  '- 需要用户做选择、筛选或填写表单时，直接调用 `show_ui`（`wait_for_interaction` 省略或 `false`，这是推荐模式）：调用立即返回、界面展示在对话正文中；用户在界面里提交后，其内容会作为一条新的用户消息回到你，你在新一轮里据此继续。适用于「帮我设计一个表单，先让我选择几个选项再继续」。',
  '- `wait_for_interaction: true` 是旧的阻塞模式：调用会在本轮内一直等到用户提交，再从工具结果里拿到该交互。交互挂在思考链中、体验较差，除非确有需要，否则不要使用。',
  '- 只做展示（驾驶舱、图表、看板、报告）时同样省略 `wait_for_interaction`；调用立即返回，用户后续的自然语言发言就是后续输入。',
  '- 提交后请直接用新一轮的输入继续工作，不要为同一件事重复调用 `show_ui`；也不要自己轮询等待用户提交。',
  '- 界面内用 `window.dsh.emit(name, payload)` 回传交互；payload 必须是小的结构化 JSON，只包含推进对话所需的字段，不要回传页面上的全部文本。',
  '- 界面运行在 sandbox iframe 中，默认不能访问网络、宿主页面、Cookie、localStorage、剪贴板或本机文件；不要写依赖这些能力的界面。',
  '- 主题变量 `--dsw-alias-*` 已注入界面，可直接用于 CSS，使界面与宿主明暗主题一致。',
  '- 当前界面在后续发言里可以直接指代（例如用户说「改成红色」「展开待办」）：重新调用 `show_ui` 并给出修改后的完整 HTML 即可。',
].join('\n')

/**
 * Host plugin body. Every registration is owned by this context: `ctx.effect`
 * for the tool and the prompt section, the bridge for its own routes.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - Loader-resolved row config. The schema already ran,
 *   so volatile fields arrive as stable references; they are read through
 *   live accessors rather than re-validated here.
 * @returns {() => void} the exact disposer closing the bridge and releasing waits.
 */
export const apply = (ctx, config) => {
  const settings = createSettings(config)

  const originProblems = validateResourceOrigins(settings.allowedResourceOrigins())
  if (originProblems.length > 0) {
    throw new Error(`[dsh-ui-html] 配置错误：${originProblems.join('；')}`)
  }
  if (!Number.isFinite(settings.maxHtmlBytes()) || settings.maxHtmlBytes() <= 0) {
    throw new Error('[dsh-ui-html] 配置错误：maxHtmlBytes 必须是正数')
  }
  if (!Number.isFinite(settings.maxEventBytes()) || settings.maxEventBytes() <= 0) {
    throw new Error('[dsh-ui-html] 配置错误：maxEventBytes 必须是正数')
  }

  const bridge = createBridge({ ctx, settings, logger: ctx.logger })

  /** @type {(() => void) | undefined} */
  let disposeTool
  /** @type {(() => void) | undefined} */
  let disposeSection
  /** @type {{enabled: boolean, announceToAgent: boolean} | undefined} */
  let applied

  /**
   * Apply the live master switch and announcement flag. Called once at
   * activation and again after the Loader commits a volatile settings edit.
   */
  const sync = () => {
    const next = { enabled: settings.enabled(), announceToAgent: settings.announceToAgent() }
    if (applied !== undefined && applied.enabled === next.enabled && applied.announceToAgent === next.announceToAgent) {
      return
    }
    applied = next

    bridge.setEnabled(next.enabled)

    if (next.enabled && disposeTool === undefined) {
      disposeTool = ctx.tools.register(createTool({ bridge, settings }))
    } else if (!next.enabled && disposeTool !== undefined) {
      disposeTool()
      disposeTool = undefined
    }

    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (next.enabled && next.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text: ANNOUNCEMENT,
      })
    }

    ctx.logger?.info?.(
      `[dsh-ui-html] ${next.enabled ? '已启用' : '已停用'}：工具 ${TOOL_NAME}，交互回传=${settings.eventBridgeEnabled()}`,
    )
  }

  ctx.on('loader/volatile-update', () => {
    sync()
  })
  sync()

  return () => {
    bridge.dispose()
    if (disposeTool !== undefined) {
      disposeTool()
      disposeTool = undefined
    }
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
  }
}

// 关键修复：@deepseek-ai/dsh-app-boot 的插件加载器取 `module.default || module`，
// 本插件有 `export default apply`，故加载器会拿到这个裸函数；`inject` 若只作为
// 同名导出则不会挂到函数上，导致 `data.inject` 为空、取 `ctx.webServer` 时抛
// “cannot get property 'webServer' without inject”。把 inject 同时挂到 apply
// 函数上，覆盖默认导出路径（命名空间路径的 `export const inject` 仍保留兜底）。
apply.inject = INJECT

export default apply
