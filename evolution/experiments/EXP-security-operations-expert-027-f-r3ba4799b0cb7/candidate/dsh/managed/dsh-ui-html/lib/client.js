/**
 * dsh-ui-html — browser half.
 *
 * Registers the keyed `tool.call.toolview` view for the `show_ui` wire tool
 * name. The view is the only place untrusted HTML ever meets the page, and it
 * does so inside a `sandbox="allow-scripts"` iframe (an opaque origin with no
 * access to the host document), pinned by a generated Content-Security-Policy
 * and driven by a strictly validated `postMessage` bridge.
 *
 * The host half owns the policy: this bundle fetches one read-only description
 * (`/plugins/dsh-ui-html/status`) and applies exactly what the host advertises.
 *
 * @module dsh-ui-html/client
 */

window.__ModuleLoader__.load({
  id: '@eaglezlee/dsh-ui-html',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'ui-html'

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'row.title': '交互式 HTML 界面',
      'row.preparing': '正在准备界面',
      'row.running': '等待你的操作',
      'row.submitted': '已提交',
      'row.sending': '正在发送…',
      'row.settled': '已结束',
      'row.timeout': '等待超时',
      'row.cancelled': '已取消',
      'row.unsupported': '仅展示',
      'row.presented': '已展示',
      'row.static': '只读展示',
      'row.expand': '放大',
      'row.collapse': '缩小',
      'row.inspect': '查看',
      'hint.submitted': '交互已回传，模型会接着处理。',
      'hint.settled': '本次交互已结束，继续修改可直接用自然语言说明。',
      'hint.readonly': '本次界面已结束，仅作展示。',
      'err.bridgeOff': '本部署未开启交互回传，界面只能展示；请用自然语言说明你的选择。',
      'err.bridgeDown': '交互通道不可用（事件桥未注册或页面已刷新）。',
      'err.forbidden': '交互被宿主拒绝（来源校验未通过）。',
      'err.stale': '该界面已提交过，重复事件被忽略。',
      'err.unknown': '该界面已不在等待交互（可能已结束或插件已重载）。',
      'err.noAgent': '所属会话当前不在运行，交互未送达；请在该会话里发言后重试。',
      'err.tooLarge': '交互内容过大，已阻止发送。',
      'err.network': '交互发送失败，请重试。',
      'err.empty': '界面没有可显示的内容。',
    }

    /** English dictionary, checked complete against the zh key set. */
    const en = {
      'row.title': 'Interactive HTML',
      'row.preparing': 'Preparing interface',
      'row.running': 'Waiting for your input',
      'row.submitted': 'Submitted',
      'row.sending': 'Sending…',
      'row.settled': 'Finished',
      'row.timeout': 'Timed out',
      'row.cancelled': 'Cancelled',
      'row.unsupported': 'View only',
      'row.presented': 'Presented',
      'row.expand': 'Expand',
      'row.collapse': 'Shrink',
      'row.inspect': 'Inspect',
      'hint.submitted': 'Your interaction was sent back; the model continues from it.',
      'hint.settled': 'This interaction is over. To change the interface, describe it in natural language.',
      'hint.readonly': 'This interface is finished and shown read-only.',
      'err.bridgeOff': 'This deployment disabled interaction return; the interface is view-only. Describe your choice in text instead.',
      'err.bridgeDown': 'Interaction channel unavailable (bridge not registered, or the page was reloaded).',
      'err.forbidden': 'The host rejected the interaction (origin check failed).',
      'err.stale': 'This interface already submitted; the duplicate was ignored.',
      'err.unknown': 'This interface is no longer waiting (finished or the plugin reloaded).',
      'err.noAgent': 'The owning session is not running; the interaction was not delivered. Post a message there and retry.',
      'err.tooLarge': 'The interaction is too large and was not sent.',
      'err.network': 'Sending the interaction failed; please retry.',
      'err.empty': 'The interface has nothing to display.',
    }

    /** Theme tokens the host injects into the widget document. */
    const THEME_TOKENS = [
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-bg-overlay',
      '--dsw-alias-border-l1',
      '--dsw-alias-border-l2',
      '--dsw-alias-brand-primary',
      '--dsw-alias-label-primary',
      '--dsw-alias-label-secondary',
      '--dsw-alias-state-error-primary',
      '--dsw-alias-state-idle-primary',
      '--dsw-alias-state-success-primary',
      '--dsw-alias-state-warn-primary',
      '--dsw-specific-sidebar-fill',
    ]

    /** Widget viewport height bounds, in CSS pixels. */
    const MIN_HEIGHT = 140
    const MAX_HEIGHT = 900

    /** Event-name shape the host accepts; mirrored here to fail fast. */
    const EVENT_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/

    /** Last event each UI instance submitted, so a settled card keeps its detail without a reload. */
    const submittedByUi = new Map()

    /** One in-flight read of the host bridge description per page. */
    let bridgeStatePromise

    /**
     * Resolve the host bridge once per page.
     *
     * Two prefixes are tried: the root-absolute form used by a root-mounted GUI
     * and the document-relative form used by a sub-path mount. The prefix that
     * answered the status read also addresses the event route, so host and
     * browser cannot drift.
     *
     * @returns {Promise<{info: object, prefix: string} | null>} description plus the working prefix.
     */
    function loadBridgeInfo() {
      if (bridgeStatePromise === undefined) {
        // 根路径可能由网关返回 403，子路径才是业务实际挂载；成功才缓存。
        // 两个候选都瞬时失败时不缓存 null，后续点击/提交仍可重试。
        bridgeStatePromise = (async () => {
          const localPrefix = new URL('plugins/dsh-ui-html', window.location.href).pathname.replace(/\/$/, '')
          const prefixes = [...new Set([localPrefix, '/plugins/dsh-ui-html'])]
          for (const prefix of prefixes) {
            try {
              const url = `${prefix}/status`
              const response = await fetch(url, {
                headers: { accept: 'application/json' },
                credentials: 'same-origin',
              })
              if (!response.ok) continue
              const body = await response.json()
              if (body && typeof body === 'object' && body.ok === true) return { info: body, prefix }
            } catch {
              /* try the next candidate */
            }
          }
          return null
        })().then(result => {
          if (result === null) bridgeStatePromise = undefined
          return result
        })
      }
      return bridgeStatePromise
    }

    /**
     * Parse a raw argument string without throwing.
     *
     * @param {string} raw - raw JSON text.
     * @returns {Record<string, unknown>} the parsed object, or an empty object.
     */
    function parseObject(raw) {
      if (typeof raw !== 'string' || raw === '') return {}
      try {
        const value = JSON.parse(raw)
        return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
      } catch {
        return {}
      }
    }

    /**
     * Read the current host theme as token values plus a dark/light flag.
     *
     * @returns {{vars: Record<string, string>, dark: boolean}} the theme snapshot.
     */
    function readTheme() {
      const vars = {}
      let dark = false
      try {
        const root = document.documentElement
        const computed = getComputedStyle(root)
        for (const token of THEME_TOKENS) {
          const value = computed.getPropertyValue(token)
          if (typeof value === 'string' && value.trim() !== '') vars[token] = value.trim()
        }
        const scheme = computed.colorScheme || ''
        dark =
          scheme.includes('dark') ||
          root.classList.contains('dark') ||
          root.getAttribute('data-theme') === 'dark' ||
          (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      } catch {
        dark = false
      }
      return { vars, dark }
    }

    /**
     * Build the isolated widget document: the model's HTML wrapped so that the
     * CSP meta and the bridge are always in place before any widget script runs.
     *
     * @param {string} userHtml - untrusted model-authored HTML.
     * @param {string} csp - host-authored Content-Security-Policy.
     * @returns {string} the srcdoc document.
     */
    function buildDocument(userHtml, csp) {
      const head =
        `<meta charset="utf-8">` +
        `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<style>${BASE_CSS}</style>`
      const bridge = `<script>${BRIDGE_SCRIPT}<\/script>`
      const html = typeof userHtml === 'string' ? userHtml : ''

      // The policy meta is only honoured inside <head>, so every branch places
      // it there before any widget markup or script can run.
      if (/<head[^>]*>/i.test(html)) {
        return appendBridge(html.replace(/<head[^>]*>/i, (match) => match + head), bridge)
      }
      if (/<html[^>]*>/i.test(html)) {
        return appendBridge(html.replace(/<html[^>]*>/i, (match) => `${match}<head>${head}</head>`), bridge)
      }
      return `<!doctype html><html><head>${head}</head><body>${appendBridge(html, bridge)}</body></html>`
    }

    /**
     * Place the bridge script last in the document so widget markup exists
     * before it runs, appending it when there is no closing body tag.
     *
     * @param {string} html - document text.
     * @param {string} bridge - the bridge script element.
     * @returns {string} the document with the bridge in place.
     */
    function appendBridge(html, bridge) {
      if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, (match) => bridge + match)
      if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, (match) => bridge + match)
      return html + bridge
    }

    /**
     * Escape a string for a double-quoted HTML attribute.
     *
     * @param {string} value - raw text.
     * @returns {string} escaped text.
     */
    function escapeAttribute(value) {
      return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    }

    /** Baseline CSS injected into every widget, expressed in host theme tokens. */
    const BASE_CSS = [
      ':root{color-scheme:light dark;',
      'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
      'font-size:14px;line-height:1.5;',
      'color:var(--dsh-ui-label,var(--dsw-alias-label-primary,#111));',
      'background:transparent}',
      'body{margin:0;padding:12px;background:transparent}',
      '*,*::before,*::after{box-sizing:border-box}',
      'h1,h2,h3{margin:0 0 8px;font-weight:600;line-height:1.3}',
      'h1{font-size:18px}h2{font-size:16px}h3{font-size:15px}',
      'p{margin:0 0 8px}ul,ol{margin:0 0 8px;padding-left:20px}',
      'a{color:var(--dsw-alias-brand-primary,#247bbf)}',
      'button{font:inherit;cursor:pointer;border-radius:6px;border:1px solid var(--dsh-ui-border,var(--dsw-alias-border-l2,#d0d5dd));',
      'background:var(--dsh-ui-surface,var(--dsw-alias-bg-layer-1,#fff));color:inherit;padding:6px 12px}',
      'button:hover{border-color:var(--dsw-alias-brand-primary,#247bbf)}',
      'button[data-primary]{background:var(--dsw-alias-brand-primary,#247bbf);color:#fff;border-color:transparent}',
      'input,select,textarea{font:inherit;color:inherit;padding:6px 8px;border-radius:6px;',
      'border:1px solid var(--dsh-ui-border,var(--dsw-alias-border-l2,#d0d5dd));',
      'background:var(--dsh-ui-surface,var(--dsw-alias-bg-layer-1,#fff));max-width:100%}',
      'table{border-collapse:collapse;width:100%}th,td{padding:6px 8px;text-align:left;',
      'border-bottom:1px solid var(--dsh-ui-border,var(--dsw-alias-border-l1,#e5e7eb))}',
      'code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '::-webkit-scrollbar{width:10px;height:10px}',
      '::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#d0d5dd);border-radius:5px}',
    ].join('')

    /**
     * The widget-side bridge. Runs inside the sandboxed document: it can only
     * post a validated, size-capped message to its parent and receive theme
     * data back. It has no network, storage, or host access of its own.
     */
    const BRIDGE_SCRIPT = [
      '(function(){',
      '"use strict";',
      'var settled=false,ready=false,sending=false,error=null,seq=0,theme={};',
      'function state(next){if(next){if(next.settled)settled=true;if(typeof next.ready==="boolean")ready=next.ready;if(typeof next.sending==="boolean")sending=next.sending;if(next.error===null||typeof next.error==="string")error=next.error}if(settled){ready=false;sending=false}try{window.dispatchEvent(new CustomEvent("dsh:state",{detail:{ready:ready&&!settled&&!sending,sending:sending,settled:settled,error:error}}))}catch(e){}}',
      'function safe(value){try{return JSON.parse(JSON.stringify(value===undefined?null:value))}catch(e){return null}}',
      'function emit(name,payload,options){',
      'if(settled||!ready||sending)return false;',
      'var n=typeof name==="string"?name.slice(0,64):"";',
      'var message={__dshUiEvent:1,v:1,name:n,payload:safe(payload),seq:++seq};',
      'var text;try{text=JSON.stringify(message)}catch(e){return false}',
      'if(text.length>((options&&options.maxBytes)||1048576))return false;',
      'state({sending:true,error:null});',
      'try{parent.postMessage(message,"*")}catch(e){state({sending:false,error:"delivery-failed"});return false}',
      'return true}',
      'function reportSize(){try{var b=document.body;',
      'var rect=b&&b.getBoundingClientRect?b.getBoundingClientRect():null;',
      'var height=Math.ceil(rect?rect.height:(b?b.scrollHeight:0));',
      'if(!(height>0))height=80;',
      'parent.postMessage({__dshUiSize:1,v:1,height:height},"*")}catch(e){}}',
      'function applyTheme(next){if(!next)return;theme=next;var vars=next.vars||{};',
      'for(var key in vars){try{document.documentElement.style.setProperty(key,vars[key])}catch(e){}}',
      'try{if(typeof window.dsh.onTheme==="function")window.dsh.onTheme(next)}catch(e){}}',
      'window.dsh={version:1,emit:emit,submit:emit,resize:reportSize,get ready(){return ready&&!settled&&!sending},get theme(){return theme},onTheme:null};',
      'window.addEventListener("message",function(event){',
      'if(event.source!==parent)return;var data=event.data;',
      'if(!data||data.__dshUiHost!==1||data.v!==1)return;',
      'if(data.theme)applyTheme(data.theme);state(data)});',
      'window.addEventListener("load",reportSize);',
      'window.addEventListener("resize",reportSize);',
      'if(typeof ResizeObserver!=="undefined"){try{new ResizeObserver(reportSize).observe(document.documentElement)}catch(e){}}',
      'if(typeof MutationObserver!=="undefined"){try{new MutationObserver(reportSize).observe(document.documentElement,{childList:true,subtree:true,attributes:true})}catch(e){}}',
      'setTimeout(reportSize,0);setTimeout(reportSize,120);',
      'try{parent.postMessage({__dshUiReady:1,v:1},"*")}catch(e){}',
      '})();',
    ].join('')

    /**
     * Format the model-facing status as one short chrome label.
     *
     * @param {string} status - the result status.
     * @param {(key: string) => string} t - bound translator.
     * @returns {string} the label.
     */
    function statusLabel(status, t) {
      switch (status) {
        case 'interaction':
          return t('row.submitted')
        case 'timeout':
          return t('row.timeout')
        case 'cancelled':
          return t('row.cancelled')
        case 'unsupported':
          return t('row.unsupported')
        case 'presented':
          return t('row.presented')
        case 'static':
          return t('row.static')
        default:
          return t('row.settled')
      }
    }

    /**
     * Render one `show_ui` call as an isolated interactive document.
     *
     * @param {object} props - keyed toolview payload (`ToolCallOwnerProps`) plus the bound translator.
     * @returns {import('react').ReactElement} the tool card.
     */
    function UiHtmlRow(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const phase = props.phase
      const block = props.block
      const settled = phase === 'result'
      const preparing = phase === 'preparing'

      const argsRaw = settled
        ? (block && block.call && typeof block.call.argsRaw === 'string' ? block.call.argsRaw : '')
        : block && typeof block.argsRaw === 'string'
          ? block.argsRaw
          : ''

      const args = React.useMemo(() => parseObject(argsRaw), [argsRaw])
      const meta =
        settled && block && typeof block.meta === 'object' && block.meta !== null && !Array.isArray(block.meta)
          ? block.meta
          : null

      const [bridge, setBridge] = React.useState(null)
      const [bridgeChecked, setBridgeChecked] = React.useState(false)
      const [height, setHeight] = React.useState(MIN_HEIGHT)
      const [expanded, setExpanded] = React.useState(false)
      const [sending, setSending] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [bridgeClosed, setBridgeClosed] = React.useState(false)
      const [submitted, setSubmitted] = React.useState(() => submittedByUi.get(props.callId) ?? null)

      const frameRef = React.useRef(null)
      // React 状态更新前也必须拒绝同一 iframe 的重复投递。
      const deliveryRef = React.useRef(false)

      React.useEffect(() => {
        let alive = true
        loadBridgeInfo().then((state) => {
          if (!alive) return
          setBridge(state)
          setBridgeChecked(true)
        })
        return () => {
          alive = false
        }
      }, [])

      const html = typeof args.html === 'string' ? args.html : ''
      const title = typeof args.title === 'string' && args.title.trim() !== '' ? args.title.trim() : ''
      const description = typeof args.description === 'string' ? args.description.trim() : ''
      const hint = typeof args.interaction_hint === 'string' ? args.interaction_hint.trim() : ''
      const waits = args.wait_for_interaction === true

      const bridgeEnabled = bridge !== null && bridge.info?.bridgeEnabled === true
      const csp =
        typeof bridge?.info?.csp === 'string'
          ? bridge.info.csp
          : "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"

      const doc = React.useMemo(() => buildDocument(html, csp), [html, csp])

      /** Push the current host theme (and settle state) into the widget. */
      const pushTheme = React.useCallback(() => {
        const frame = frameRef.current
        if (frame === null || frame.contentWindow === null) return
        const theme = readTheme()
        try {
          frame.contentWindow.postMessage({ __dshUiHost: 1, v: 1, theme, ready: bridgeEnabled && !settled && submitted === null && !bridgeClosed, sending, error, settled: settled || submitted !== null || bridgeClosed }, '*')
        } catch {
          /* the frame may have been torn down */
        }
      }, [settled, submitted, bridgeEnabled, bridgeClosed, sending, error])

      React.useEffect(() => {
        pushTheme()
        const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
        if (media === null) return undefined
        const listener = () => pushTheme()
        if (typeof media.addEventListener === 'function') media.addEventListener('change', listener)
        else if (typeof media.addListener === 'function') media.addListener(listener)
        return () => {
          if (typeof media.removeEventListener === 'function') media.removeEventListener('change', listener)
          else if (typeof media.removeListener === 'function') media.removeListener(listener)
        }
      }, [pushTheme, doc])

      /** Forward one validated widget event to the host bridge. */
      const sendToHost = React.useCallback(
        async (message) => {
          const uiId = typeof props.callId === 'string' ? props.callId : ''
          if (uiId === '') {
            setError(t('err.bridgeDown'))
            return
          }
          const body = { v: 1, uiId, name: message.name, payload: message.payload ?? null }
          let text
          try {
            text = JSON.stringify(body)
          } catch {
            setError(t('err.tooLarge'))
            return
          }
          const maxEventBytes = Number(bridge?.info?.maxEventBytes) || 0
          if (maxEventBytes > 0 && text.length > maxEventBytes) {
            setError(t('err.tooLarge'))
            return
          }
          if (deliveryRef.current) return
          deliveryRef.current = true
          const eventUrl = `${bridge?.prefix ?? '/plugins/dsh-ui-html'}/event`
          setSending(true)
          setError(null)
          let closed = false
          try {
            const response = await fetch(eventUrl, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json', 'x-dsh-ui-html': '1' },
              body: text,
            })
            const parsed = await response.json().catch(() => null)
            if (response.ok && parsed !== null && parsed.ok === true) {
              closed = true
              const record = { name: body.name, payload: body.payload }
              submittedByUi.set(uiId, record)
              setSubmitted(record)
              return
            }
            const code = parsed !== null && typeof parsed.code === 'string' ? parsed.code : ''
            if (code === 'already-settled') { closed = true; setBridgeClosed(true); setError(t('err.stale')) }
            else if (code === 'no-agent') setError(t('err.noAgent'))
            else if (code === 'unknown-ui') { closed = true; setBridgeClosed(true); setError(t('err.unknown')) }
            else if (code === 'forbidden') setError(t('err.forbidden'))
            else if (code === 'too-large' || code === 'invalid') setError(t('err.tooLarge'))
            else setError(t('err.network'))
          } catch {
            setError(t('err.network'))
          } finally {
            deliveryRef.current = closed
            setSending(false)
          }
        },
        [bridge, props.callId, t],
      )

      React.useEffect(() => {
        const frame = frameRef.current
        if (frame === null) return undefined
        const onMessage = (event) => {
          if (frame.contentWindow === null || event.source !== frame.contentWindow) return
          const data = event.data
          if (typeof data !== 'object' || data === null) return

          if (data.__dshUiReady === 1) {
            pushTheme()
            return
          }
          if (data.__dshUiSize === 1) {
            const next = Number(data.height)
            if (Number.isFinite(next) && next > 0) {
              setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(next))))
            }
            return
          }
          if (data.__dshUiEvent !== 1) return
          if (data.v !== 1) return
          if (submitted !== null || settled || bridgeClosed || !bridgeEnabled || sending) return
          const name = typeof data.name === 'string' ? data.name : ''
          if (!EVENT_NAME_PATTERN.test(name)) return
          const payload = data.payload === undefined ? null : data.payload
          void sendToHost({ name, payload })
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
      }, [pushTheme, sendToHost, submitted, settled, bridgeClosed, bridgeEnabled, sending])

      const status = settled
        ? typeof meta?.status === 'string'
          ? meta.status
          : 'settled'
        : submitted !== null
          ? 'interaction'
          : 'running'

      const summary = preparing
        ? t('row.preparing')
        : statusLabel(status, t)

      const settledRecord =
        submitted ??
        (meta !== null && meta.status === 'interaction' && meta.payload !== null
          ? { name: typeof meta.eventName === 'string' ? meta.eventName : '', payload: meta.payload }
          : null)

      const fallbackLines = []
      if (description !== '') fallbackLines.push(description)
      if (preparing) fallbackLines.push(t('row.preparing'))
      else if (html.trim() === '') fallbackLines.push(t('err.empty'))
      if (settledRecord !== null) {
        fallbackLines.push(`${t('row.submitted')}：${safeText(settledRecord.name)}`)
        fallbackLines.push(safeText(JSON.stringify(settledRecord.payload)))
      }
      if (settled && typeof meta?.note === 'string' && meta.note !== '') fallbackLines.push(meta.note)

      const frameHeight = expanded ? `min(78vh, ${MAX_HEIGHT}px)` : `${height}px`

      return h(
        'div',
        { className: 'dsh-ui-html-card', 'data-tool': 'show_ui', 'data-state': status },
        h('style', { key: 'style' }, CHROME_CSS),
        h(
          'div',
          { className: 'dsh-ui-html-head' },
          h('span', { className: 'dsh-ui-html-title' }, title === '' ? t('row.title') : title),
          h('span', { className: 'dsh-ui-html-dot', 'data-state': status, 'aria-hidden': true }),
          h('span', { className: 'dsh-ui-html-summary' }, summary),
          sending ? h('span', { className: 'dsh-ui-html-pending' }, '…') : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-ui-html-toggle',
              onClick: () => setExpanded((value) => !value),
              'aria-expanded': expanded,
            },
            expanded ? t('row.collapse') : t('row.expand'),
          ),
          typeof props.inspect === 'function'
            ? h(
                'button',
                { type: 'button', className: 'dsh-ui-html-toggle', onClick: props.inspect },
                t('row.inspect'),
              )
            : null,
        ),
        description !== '' ? h('div', { className: 'dsh-ui-html-desc' }, description) : null,
        hint !== '' && !settled ? h('div', { className: 'dsh-ui-html-hint' }, hint) : null,
        h(
          'div',
          { className: 'dsh-ui-html-frame', style: { height: frameHeight } },
          html.trim() === ''
            ? h('div', { className: 'dsh-ui-html-fallback' }, t('err.empty'))
            : h('iframe', {
                ref: frameRef,
                className: 'dsh-ui-html-iframe',
                sandbox: 'allow-scripts',
                referrerPolicy: 'no-referrer',
                title: title === '' ? t('row.title') : title,
                srcDoc: doc,
                onLoad: pushTheme,
              }),
        ),
        settledRecord !== null
          ? h(
              'div',
              { className: 'dsh-ui-html-note' },
              `${t('row.submitted')}：${safeText(settledRecord.name)}\n${safeText(JSON.stringify(settledRecord.payload))}`,
            )
          : null,
        settled && settledRecord === null
          ? h('div', { className: 'dsh-ui-html-note' }, t('hint.readonly'))
          : null,
        !settled && submitted !== null
          ? h('div', { className: 'dsh-ui-html-note' }, t('hint.submitted'))
          : null,
        !settled && bridgeChecked && !bridgeEnabled
          ? h('div', { className: 'dsh-ui-html-note' }, t('err.bridgeOff'))
          : null,
        !preparing && !settled && waits && bridgeChecked && !bridgeEnabled
          ? h('div', { className: 'dsh-ui-html-fallback' }, fallbackLines.join('\n'))
          : null,
        error !== null ? h('div', { className: 'dsh-ui-html-error' }, `${error}\n${fallbackLines.join('\n')}`) : null,
      )
    }

    /**
     * Serialize a value to text for the fallback body without throwing.
     *
     * @param {unknown} value - value to render.
     * @returns {string} text.
     */
    function safeText(value) {
      if (typeof value === 'string') return value
      try {
        const text = JSON.stringify(value)
        return typeof text === 'string' ? text : String(value)
      } catch {
        return String(value)
      }
    }

    /** Chrome styles, kept on host theme tokens so the card matches the host. */
    const CHROME_CSS = [
      '.dsh-ui-html-card{display:flex;flex-direction:column;gap:6px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);min-width:0}',
      '.dsh-ui-html-head{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}',
      '.dsh-ui-html-title{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-ui-html-summary{color:var(--dsw-alias-label-secondary);font-size:12px;margin-left:auto}',
      '.dsh-ui-html-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}',
      '.dsh-ui-html-dot[data-state=interaction]{background:var(--dsw-alias-state-success-primary)}',
      '.dsh-ui-html-dot[data-state=running]{background:var(--dsw-alias-brand-primary)}',
      '.dsh-ui-html-dot[data-state=timeout],.dsh-ui-html-dot[data-state=unsupported]{background:var(--dsw-alias-state-warn-primary)}',
      '.dsh-ui-html-dot[data-state=cancelled]{background:var(--dsw-alias-state-error-primary)}',
      '.dsh-ui-html-toggle{font:inherit;font-size:12px;padding:2px 8px;border-radius:6px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-ui-html-toggle:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-ui-html-desc{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}',
      '.dsh-ui-html-hint{font-size:12px;color:var(--dsw-alias-brand-primary)}',
      '.dsh-ui-html-frame{position:relative;overflow:hidden;border-radius:6px;background:var(--dsw-alias-bg-base);min-height:0}',
      '.dsh-ui-html-iframe{width:100%;height:100%;border:0;display:block;background:transparent}',
      '.dsh-ui-html-fallback,.dsh-ui-html-error,.dsh-ui-html-note{font-size:12px;white-space:pre-wrap;',
      'color:var(--dsw-alias-label-secondary);border:1px dashed var(--dsw-alias-border-l2);border-radius:6px;padding:8px}',
      '.dsh-ui-html-error{color:var(--dsw-alias-state-error-primary);border-style:solid}',
      '.dsh-ui-html-pending{font-size:12px;color:var(--dsw-alias-label-secondary)}',
    ].join('')

    /** Required Client services: the slot registry and the locale registry. */
    const inject = ['slots', 'locale']

    /** Definition kind and Turn data key; namespaced by package to stay unique. */
    const TURN_CARDS_KEY = 'dsh-ui-html'

    /**
     * Turn-local accumulator for settled `show_ui` results, mirroring the
     * `conversation.chat.turnTail` pattern used by the official deliverables and
     * by dsh-visualize: it folds each successful `show_ui` into Turn data so the
     * conversation body can render a settled card without scanning the raw tool
     * arguments. The HTML travels in the persisted presentation meta.
     *
     * @type {object} a conversation event definition.
     */
    const turnCardsDefinition = {
      kind: TURN_CARDS_KEY,
      match: (event) => {
        if (event.type === 'turn/start') {
          return { id: String(event.data.turn), role: 'start' }
        }
        if (event.type !== 'tool/result') return null
        const meta = event.data && typeof event.data === 'object' ? event.data.meta : null
        if (
          typeof meta !== 'object' ||
          meta === null ||
          typeof meta.html !== 'string' ||
          meta.html.trim() === ''
        ) {
          return null
        }
        return { id: String(event.data.turn), role: 'update' }
      },
      start: (context, match) => {
        if (match.event.type !== 'turn/start') {
          throw new Error('dsh-ui-html: turn cards start requires turn/start')
        }
        return { turn: match.event.data.turn, cards: [] }
      },
      update: (context, match) => {
        if (match.event.type !== 'tool/result') return context.state
        const meta = match.event.data && typeof match.event.data === 'object' ? match.event.data.meta : null
        if (typeof meta !== 'object' || meta === null || typeof meta.html !== 'string' || meta.html.trim() === '') {
          return context.state
        }
        const card = {
          callId: String(
            match.event.data && typeof match.event.data.message === 'object' && match.event.data.message !== null
              ? match.event.data.message.source?.callId ?? ''
              : '',
          ),
          seq: match.event.seq,
          meta,
        }
        if (card.callId === '') return context.state
        if (context.state.cards.some((existing) => existing.callId === card.callId)) return context.state
        return {
          ...context.state,
          cards: [...context.state.cards, card],
        }
      },
      buildLocationData: (context, scope, previous) => {
        if (scope !== 'turn' || context.state === undefined) return null
        const { turn, cards } = context.state
        if (
          previous?.kind === 'turn' &&
          previous.turn === turn &&
          previous.key === TURN_CARDS_KEY &&
          previous.value?.cards === cards
        ) {
          return previous
        }
        return { kind: 'turn', turn, key: TURN_CARDS_KEY, value: { cards } }
      },
    }

    /** Cards settled before the turn's closing reply. */
    function cardsBefore(turn, seq) {
      const cards = turn?.data?.get?.(TURN_CARDS_KEY)?.cards ?? []
      return (Array.isArray(cards) ? cards : []).filter((card) => card.seq < seq)
    }

    /** List turn-tail selector: hand the turn's cards to the host, or decline. */
    function selectTurnCards(owner) {
      const cards = cardsBefore(owner.turn, owner.seq)
      return cards.length === 0 ? null : cards
    }

    const turnListStyle = { display: 'grid', gap: 12, margin: '8px 0 4px' }

    /**
     * Render one `show_ui` result as a body card in the conversation turn tail,
     * mirroring how dsh-visualize surfaces charts. A card whose result is still
     * `presented` stays interactive: the user's submission is posted to the
     * bridge and comes back as a fresh user message, so the conversation
     * continues in the body. Every other status is a stable read-only record.
     *
     * @param {object} props - card descriptor `{ meta, callId, uiId, t }`.
     * @returns {import('react').ReactElement} the card, or null.
     */
    function SettledCard({ meta, callId, uiId, t: tProp }) {
      const t = typeof tProp === 'function' ? tProp : (key) => key
      const cardUiId = typeof uiId === 'string' && uiId !== '' ? uiId : typeof callId === 'string' ? callId : ''
      const awaiting = meta !== null && meta !== undefined && meta.status === 'presented'

      const [bridge, setBridge] = React.useState(null)
      const [bridgeChecked, setBridgeChecked] = React.useState(false)
      const [height, setHeight] = React.useState(MIN_HEIGHT)
      const [expanded, setExpanded] = React.useState(false)
      const [submitted, setSubmitted] = React.useState(() =>
        cardUiId === '' ? null : submittedByUi.get(cardUiId) ?? null,
      )
      const [sending, setSending] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [bridgeClosed, setBridgeClosed] = React.useState(false)
      const frameRef = React.useRef(null)
      // React 状态更新前也必须拒绝同一 iframe 的重复投递。
      const deliveryRef = React.useRef(false)

      /** The widget may emit only while its submission has not been delivered. */
      const live = awaiting && submitted === null && !bridgeClosed

      React.useEffect(() => {
        let alive = true
        loadBridgeInfo().then((state) => {
          if (!alive) return
          setBridge(state)
          setBridgeChecked(true)
        })
        return () => {
          alive = false
        }
      }, [])

      const title = typeof meta?.title === 'string' && meta.title.trim() !== '' ? meta.title.trim() : ''
      const description = typeof meta?.description === 'string' ? meta.description.trim() : ''
      const html = typeof meta?.html === 'string' ? meta.html : ''
      const csp =
        typeof bridge?.info?.csp === 'string'
          ? bridge.info.csp
          : "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
      const doc = React.useMemo(() => buildDocument(html, csp), [html, csp])
      const frameHeight = expanded ? `min(78vh, ${MAX_HEIGHT}px)` : `${height}px`

      const pushTheme = React.useCallback(() => {
        const frame = frameRef.current
        if (frame === null || frame.contentWindow === null) return
        const theme = readTheme()
        try {
          frame.contentWindow.postMessage({ __dshUiHost: 1, v: 1, theme, ready: bridge?.info?.bridgeEnabled === true && live, sending, error, settled: !live }, '*')
        } catch {
          /* the frame may have been torn down */
        }
      }, [live, bridge, sending, error])

      /** Forward one validated widget event to the host bridge. */
      const sendToHost = React.useCallback(
        async (message) => {
          if (cardUiId === '') {
            setError(t('err.bridgeDown'))
            return
          }
          const body = { v: 1, uiId: cardUiId, name: message.name, payload: message.payload ?? null }
          let text
          try {
            text = JSON.stringify(body)
          } catch {
            setError(t('err.tooLarge'))
            return
          }
          const maxEventBytes = Number(bridge?.info?.maxEventBytes) || 0
          if (maxEventBytes > 0 && text.length > maxEventBytes) {
            setError(t('err.tooLarge'))
            return
          }
          if (deliveryRef.current) return
          deliveryRef.current = true
          const eventUrl = `${bridge?.prefix ?? '/plugins/dsh-ui-html'}/event`
          setSending(true)
          setError(null)
          let closed = false
          try {
            const response = await fetch(eventUrl, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json', 'x-dsh-ui-html': '1' },
              body: text,
            })
            const parsed = await response.json().catch(() => null)
            if (response.ok && parsed !== null && parsed.ok === true) {
              closed = true
              const record = { name: body.name, payload: body.payload }
              submittedByUi.set(cardUiId, record)
              setSubmitted(record)
              return
            }
            const code = parsed !== null && typeof parsed.code === 'string' ? parsed.code : ''
            if (code === 'already-settled') { closed = true; setBridgeClosed(true); setError(t('err.stale')) }
            else if (code === 'no-agent') setError(t('err.noAgent'))
            else if (code === 'unknown-ui') { closed = true; setBridgeClosed(true); setError(t('err.unknown')) }
            else if (code === 'forbidden') setError(t('err.forbidden'))
            else setError(t('err.network'))
          } catch {
            setError(t('err.network'))
          } finally {
            deliveryRef.current = closed
            setSending(false)
          }
        },
        [bridge, cardUiId, t],
      )

      React.useEffect(() => {
        pushTheme()
      }, [pushTheme, doc])

      React.useEffect(() => {
        const frame = frameRef.current
        if (frame === null) return undefined
        const onMessage = (event) => {
          if (frame.contentWindow === null || event.source !== frame.contentWindow) return
          const data = event.data
          if (typeof data !== 'object' || data === null) return
          if (data.__dshUiReady === 1) {
            pushTheme()
            return
          }
          if (data.__dshUiSize === 1) {
            const next = Number(data.height)
            if (Number.isFinite(next) && next > 0) {
              setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(next))))
            }
            return
          }
          if (!live || bridge?.info?.bridgeEnabled !== true || sending) return
          if (data.__dshUiEvent !== 1) return
          if (data.v !== 1) return
          if (submitted !== null) return
          const name = typeof data.name === 'string' ? data.name : ''
          if (!EVENT_NAME_PATTERN.test(name)) return
          const payload = data.payload === undefined ? null : data.payload
          void sendToHost({ name, payload })
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
      }, [pushTheme, sendToHost, live, submitted, bridge, sending])

      const status = live ? 'running' : 'settled'
      const summary = live ? t('row.running') : submitted !== null ? t('row.submitted') : t('row.settled')

      return h(
        'div',
        { className: 'dsh-ui-html-card', 'data-tool': 'show_ui', 'data-state': status },
        h('style', { key: 'style' }, CHROME_CSS),
        h(
          'div',
          { className: 'dsh-ui-html-head' },
          h('span', { className: 'dsh-ui-html-title' }, title === '' ? t('row.title') : title),
          h('span', { className: 'dsh-ui-html-dot', 'data-state': status, 'aria-hidden': true }),
          h('span', { className: 'dsh-ui-html-summary' }, summary),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-ui-html-toggle',
              onClick: () => setExpanded((value) => !value),
              'aria-expanded': expanded,
            },
            expanded ? t('row.collapse') : t('row.expand'),
          ),
        ),
        description !== '' ? h('div', { className: 'dsh-ui-html-desc' }, description) : null,
        h(
          'div',
          { className: 'dsh-ui-html-frame', style: { height: frameHeight } },
          html.trim() === ''
            ? h('div', { className: 'dsh-ui-html-fallback' }, t('err.empty'))
            : h('iframe', {
                ref: frameRef,
                className: 'dsh-ui-html-iframe',
                sandbox: 'allow-scripts',
                referrerPolicy: 'no-referrer',
                title: title === '' ? t('row.title') : title,
                srcDoc: doc,
                onLoad: pushTheme,
              }),
        ),
        error !== null ? h('div', { className: 'dsh-ui-html-note' }, error) : null,
        live && sending ? h('div', { className: 'dsh-ui-html-note' }, t('row.sending')) : null,
        !live && submitted !== null ? h('div', { className: 'dsh-ui-html-note' }, t('hint.submitted')) : null,
        bridgeChecked && bridge?.info?.bridgeEnabled !== true
          ? h(
              'div',
              { className: 'dsh-ui-html-note' },
              live ? t(bridge === null ? 'err.bridgeDown' : 'err.bridgeOff') : '交互通道不可用；以下为已结束的界面快照。',
            )
          : null,
        !live && submitted === null && meta !== null && meta !== undefined && meta.status !== undefined
          ? h('div', { className: 'dsh-ui-html-note' }, t('hint.readonly'))
          : null,
      )
    }

    /**
     * Turn-tail entry rendering the `show_ui` cards of a turn. A list turn tail
     * mounts it on every turn, so it declines turns without cards. Each card
     * receives the raw UI id so its submission reaches the bridge.
     *
     * @param {object} props - turn owner props (`turn`, `seq`, `t`).
     * @returns {import('react').ReactElement | null} the turn's cards, or null.
     */
    function TurnCards({ turn, seq, t }) {
      const cards = cardsBefore(turn, seq)
      if (cards.length === 0) return null
      return h(
        'div',
        { style: turnListStyle },
        cards.map((card) =>
          h(SettledCard, {
            key: card.callId,
            meta: card.meta,
            uiId: card.callId,
            callId: `turn-tail:${card.callId}`,
            t,
          }),
        ),
      )
    }

    /** Turn-tail registration, list-shaped with a chain fallback. */
    function turnTailOptions() {
      return {
        name: 'conversation.chat.turnTail',
        id: 'dsh-ui-html-cards',
        order: 100,
        priority: 100,
        locale: NS,
        select: selectTurnCards,
      }
    }

    /** Look up the Conversation event registry without declaring the service. */
    function conversationEvents(ctx) {
      const service = ctx.get && typeof ctx.get === 'function' ? ctx.get('uiConversation') : undefined
      return typeof service?.events?.register === 'function' ? service.events : undefined
    }

    /**
     * Client plugin body: dictionaries plus the keyed tool row and the settled
     * conversation-body cards.
     *
     * @param {object} ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.locale.register(NS, {
            zh,
            en,
          }),
        'dsh-ui-html: dictionaries',
      )
      ctx.slots.inject('tool.call.toolview', () =>
        ctx.slots.register(
          {
            name: 'tool.call.toolview',
            key: 'show_ui',
            locale: NS,
          },
          UiHtmlRow,
        ),
      )
      ctx.slots.inject('conversation.chat.turnTail', () => {
        const events = conversationEvents(ctx)
        const disposeTail = ctx.slots.register(turnTailOptions(), TurnCards)
        if (events === undefined) return disposeTail
        const disposeDefinition = events.register(turnCardsDefinition)
        return () => {
          disposeTail()
          disposeDefinition()
        }
      })
    }

    return { inject, apply, UiHtmlRow, TurnCards, SettledCard }
  },
})
