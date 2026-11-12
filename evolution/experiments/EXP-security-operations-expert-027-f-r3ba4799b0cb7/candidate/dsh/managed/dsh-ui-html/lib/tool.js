/**
 * The model-facing `show_ui` tool.
 *
 * HTML is a *tool argument* and travels through the ordinary session log, so
 * replay, fork, and resume reconstruct the interface without a new event type.
 * By default the call returns immediately after presenting the interface, and a
 * later submission is delivered as a *fresh user message* on the owning session
 * (`agent.followup`), so the agent continues in the conversation body. The
 * legacy `wait_for_interaction: true` mode instead blocks the call until the
 * browser half posts a validated event, returning it as the tool result.
 *
 * @module dsh-ui-html/tool
 */

import { checkHtmlSize } from './bridge.js'
import { TOOL_NAME, EVENT_VERSION, textBlock } from './protocol.js'

const DESCRIPTION = [
  '在对话消息里展示一个可交互的 HTML 界面，并在用户操作后把结果回传给你。',
  '',
  '用法：',
  '1. 默认模式（wait_for_interaction 省略或 false，推荐）：调用立即返回、界面立刻展示在对话正文里。用户在界面中提交后，其内容会作为一条新的用户消息回到你，你在新一轮里据此继续。需要用户选择、筛选、填写表单时都用这种模式。',
  '2. wait_for_interaction=true 是旧的阻塞模式：本次调用会在本轮内一直等到用户提交，再从工具结果里返回该交互。交互会挂在思考链中，体验较差，除非确有需要，否则不要使用。',
  '',
  'html 参数：',
  '- 直接给出要展示的 HTML。可以包含 <style> 和 <script>，也可以用 ES 模块之外的普通脚本。',
  '- 不要包含 <html>/<head>/<body> 之外的宿主假设；片段会被包进一个隔离文档。',
  '- 界面里调用 window.dsh.emit(name, payload) 即可把一次结构化交互交回给你（payload 必须是 JSON，尽量小，只包含推进对话所需的信息）。',
  '- 界面运行在 sandbox iframe 里：不能访问宿主页面、Cookie、localStorage、剪贴板或本机文件；默认不能访问任何网络地址。',
  '- 主题：宿主会把 --dsw-alias-* 主题变量注入界面，可直接在 CSS 里使用（例如 var(--dsw-alias-label-primary)）。',
  '',
  '用户会同时看到你提供的 description 文本；请用它说明界面用途和需要用户做什么，这也是界面无法渲染时的可读回退。',
].join('\n')

export const PARAMETERS = {
  type: 'object',
  properties: {
    html: {
      type: 'string',
      description:
        '要展示的 HTML 内容（片段或完整文档）。可用内联 <style>/<script>；通过 window.dsh.emit(name, payload) 回传交互。',
    },
    title: {
      type: 'string',
      description: '界面的短标题（显示在对话卡片上，建议 20 字以内）。',
    },
    description: {
      type: 'string',
      description:
        '放在界面之上的文字说明，也是界面无法渲染时的回退文本。请写清界面用途与需要用户做的操作。',
    },
    wait_for_interaction: {
      type: 'boolean',
      description:
        '默认 false（推荐）：界面立即展示，用户在界面中提交后会作为一条新的用户消息回到你，你在新一轮里继续处理。true = 本次调用在本轮内阻塞等待提交（旧模式，交互挂在思考链里，不推荐）。',
    },
    interaction_hint: {
      type: 'string',
      description: '提示用户该如何操作（例如「请选择要保留的字段后点击提交」）。',
    },
    readonly: {
      type: 'boolean',
      description: '明确只读静态展示：不注册交互、不等待提交；默认 false 保留原有交互行为。',
    },
  },
  required: ['html'],
  additionalProperties: false,
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['static', 'presented', 'interaction', 'timeout', 'cancelled', 'unsupported'],
      description:
        'static=只读静态展示，无需提交；presented=已展示并等待用户在界面中提交；interaction=本轮内已收到用户交互（阻塞模式）；timeout=等待超时；cancelled=交互前本轮被取消；unsupported=交互回传不可用。',
    },
    ui_id: { type: 'string', description: '本次界面实例的稳定标识（等于工具调用 id）。' },
    event_name: { type: 'string', description: '用户界面提交的事件名。' },
    payload: {
      oneOf: [
        { type: 'object' },
        { type: 'array' },
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
      ],
      description:
        '界面显式 emit 的内容（阻塞模式下返回），可以是任意无损 JSON 值，与界面提交的内容一致。',
    },
    note: { type: 'string', description: '状态补充说明。' },
  },
  required: ['status', 'ui_id'],
  additionalProperties: false,
}

/**
 * Create the `show_ui` tool definition.
 *
 * @param {object} options - tool wiring.
 * @param {ReturnType<import('./bridge.js').createBridge>} options.bridge - interaction bridge.
 * @param {object} options.settings - live settings accessors from `createSettings`.
 * @returns {object} a registry-ready tool definition.
 */
export function createTool({ bridge, settings }) {
  return {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: renderResult,
      presentationMeta: (args, value) => ({
        v: EVENT_VERSION,
        status: typeof value?.status === 'string' ? value.status : 'presented',
        eventName: typeof value?.event_name === 'string' ? value.event_name : null,
        payload: value?.payload ?? null,
        note: typeof value?.note === 'string' ? value.note : null,
        // The HTML and its presentation fields ride along in the meta so the
        // conversation body (`conversation.chat.turnTail`) can rebuild the card
        // from the settled `tool/result` event without holding raw tool args.
        html: typeof args?.html === 'string' ? args.html : '',
        title: typeof args?.title === 'string' ? args.title : '',
        description: typeof args?.description === 'string' ? args.description : '',
        waitForInteraction: args?.wait_for_interaction === true,
      }),
    },
    // One pending wait owns the turn until the user answers; never schedule it
    // beside another call.
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const html = typeof args?.html === 'string' ? args.html : ''
      if (html.trim() === '') throw new Error(`${TOOL_NAME}: html 不能为空`)

      const size = checkHtmlSize(html, settings.maxHtmlBytes())
      if (!size.ok) throw new Error(`${TOOL_NAME}: ${size.message}`)

      const uiId = typeof exec?.callId === 'string' ? exec.callId : ''
      if (uiId === '') throw new Error(`${TOOL_NAME}: 缺少工具调用 id，无法为界面建立稳定标识`)

      const title = typeof args?.title === 'string' ? args.title.trim() : ''
      const description = typeof args?.description === 'string' ? args.description.trim() : ''
      const hint = typeof args?.interaction_hint === 'string' ? args.interaction_hint.trim() : ''
      const wait = args?.wait_for_interaction === true
      if (args?.readonly === true) {
        // 明确只读：不按 HTML 内容猜测，不注册交互，也不进入 presented 的等待状态。
        return {
          status: 'static',
          ui_id: uiId,
          note: '只读界面已展示；无需用户提交，详情可在界面内展开或读取同 Run 产物。',
        }
      }

      if (!wait) {
        if (settings.eventBridgeEnabled() !== true) {
          return {
            status: 'unsupported',
            ui_id: uiId,
            note: '交互事件回传已被配置关闭；界面只展示，提交不会回传。请勿声称正在等待用户提交。',
          }
        }
        // Default delivery: the interface is displayed immediately and its
        // later submission becomes a fresh user message on this session, so the
        // agent continues in the conversation body instead of holding the call.
        bridge.registerInteractive({
          uiId,
          sessionId: typeof exec?.agent?.id === 'string' ? exec.agent.id : undefined,
          title,
          hint,
        })
        return {
          status: 'presented',
          ui_id: uiId,
          note: '界面已展示，正在等待用户在界面中提交；提交内容会作为一条新的用户消息回到你。',
        }
      }
      if (settings.eventBridgeEnabled() !== true) {
        return {
          status: 'unsupported',
          ui_id: uiId,
          note: '交互事件回传已被配置关闭，界面只能展示。请改为 wait_for_interaction=false，或请管理员开启 eventBridgeEnabled。',
        }
      }

      const outcome = await bridge.waitForEvent({
        uiId,
        sessionId: typeof exec?.agent?.id === 'string' ? exec.agent.id : undefined,
        signal: exec.signal,
      })

      if (outcome.status === 'interaction') {
        return {
          status: 'interaction',
          ui_id: uiId,
          event_name: outcome.eventName,
          payload: outcome.payload,
          note: `用户在“${title === '' ? '交互界面' : title}”中提交了事件 ${outcome.eventName}${hint === '' ? '' : `（界面提示：${hint}）`}`,
        }
      }
      if (outcome.status === 'timeout') {
        return {
          status: 'timeout',
          ui_id: uiId,
          note: `等待用户交互超过 ${settings.interactionTimeoutMs() || 0} ms 未提交。`,
        }
      }
      return {
        status: 'cancelled',
        ui_id: uiId,
        note: '用户在界面中提交交互之前，本轮已被取消。',
      }
    },
  }
}

/**
 * Project the result into the model-facing text block. The same text is the
 * generic card's fallback when the client view cannot render.
 *
 * @param {unknown} args - model-emitted arguments.
 * @param {unknown} value - the tool's returned JSON value.
 * @returns {{type: 'text', text: string}[]} one content block.
 */
export function renderResult(args, value) {
  const record = /** @type {Record<string, unknown>} */ (args ?? {})
  const title = typeof record.title === 'string' && record.title.trim() !== '' ? record.title.trim() : '交互界面'
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const hint = typeof record.interaction_hint === 'string' ? record.interaction_hint.trim() : ''
  const result = /** @type {Record<string, unknown>} */ (value ?? {})
  const status = typeof result.status === 'string' ? result.status : 'unknown'

  const lines = [`[交互式 HTML 界面] ${title}`]
  if (description !== '') lines.push(description)
  if (hint !== '') lines.push(`界面提示：${hint}`)

  switch (status) {
    case 'presented':
      lines.push('状态：界面已展示，正在等待用户在界面中提交。用户提交后会作为一条新的用户消息回到你；本轮到此结束即可，不需要再次调用 show_ui。')
      break
    case 'interaction':
      lines.push('状态：已收到用户在界面中的交互。')
      lines.push(`事件名：${typeof result.event_name === 'string' ? result.event_name : '(未命名)'}`)
      lines.push(`交互内容：${safeJson(result.payload)}`)
      break
    case 'timeout':
      lines.push('状态：等待用户交互超时，用户没有提交任何内容。')
      break
    case 'cancelled':
      lines.push('状态：用户提交交互前本轮已被取消，没有交互内容。')
      break
    case 'unsupported':
      lines.push('状态：本部署未开启交互事件回传，界面只能展示。')
      break
    default:
      lines.push(`状态：${status}`)
      break
  }
  if (typeof result.note === 'string' && result.note !== '') lines.push(`说明：${result.note}`)
  return textBlock(lines.join('\n'))
}

/**
 * Serialize a value for the model without ever throwing.
 *
 * @param {unknown} value - value to serialize.
 * @returns {string} compact JSON, or a placeholder.
 */
function safeJson(value) {
  try {
    const text = JSON.stringify(value)
    return typeof text === 'string' ? text : 'null'
  } catch {
    return '(无法序列化)'
  }
}
