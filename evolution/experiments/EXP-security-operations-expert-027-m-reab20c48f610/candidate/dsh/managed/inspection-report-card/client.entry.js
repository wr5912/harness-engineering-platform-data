import { buildInspectionCard, eventFor, renderOverviewHtml, dispatchEventToInput, inspectionPayloadOf, toolViewKeys, codeLabel, EXECUTION_BOUNDARY } from './model.mjs'
import { safeEvidenceJson } from './advice.mjs'

window.__ModuleLoader__.load({
  id: 'dsh-inspection-report-card',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'inspectionReportCard'
    // 同时注册实际 MCP wire 全名与短名别名；键生成由 model.mjs 统一测试。
    const TOOLS = toolViewKeys()

    function emit(model, action, target) {
      const event = eventFor(model, action, target)
      window.dispatchEvent(new CustomEvent('dsh-inspection-report-event', { detail: event }))
      return event
    }
    function style() {
      if (document.getElementById('dsh-inspection-report-card-style')) return
      const node = document.createElement('style')
      node.id = 'dsh-inspection-report-card-style'
      node.textContent = `
.dsh-inspection-card{border:1px solid var(--dsw-alias-border-secondary,#dbe7f5);border-radius:12px;background:var(--dsw-alias-bg-primary,#fff);padding:14px 16px;margin:8px 0;font-size:13px;color:var(--dsw-alias-text-primary,#172b45)}
.dsh-inspection-card h3{margin:0;font-size:15px}
.dsh-inspection-card .head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.dsh-inspection-card .tag{font-size:11px;padding:2px 7px;border-radius:6px;background:#edf3fb;color:#31557d}
.dsh-inspection-card .metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:10px 0}
.dsh-inspection-card .metric{border:1px solid #e2e9f2;border-radius:8px;padding:7px 9px;background:#f8fbff}
.dsh-inspection-card .metric b{display:block;font-size:18px;line-height:1.3}
.dsh-inspection-card .metric span{font-size:11px;color:#5d7692}
.dsh-inspection-card .groups{display:grid;gap:6px;margin:10px 0}
.dsh-inspection-card button{font:inherit;cursor:pointer}
.dsh-inspection-card .group{text-align:left;border:1px solid #e2e9f2;border-radius:8px;background:#fff;padding:7px 9px;display:grid;grid-template-columns:1fr auto;gap:2px 8px}
.dsh-inspection-card .group small{grid-column:1/-1;color:#657a92;font-size:11px;line-height:1.5}
.dsh-inspection-card .group.danger strong{color:#b12839}
.dsh-inspection-card .group.warning strong{color:#925c0a}
.dsh-inspection-card .actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.dsh-inspection-card .actions button{border:1px solid #cbd9e9;border-radius:7px;background:#fff;color:#29496d;padding:6px 9px;font-size:12px}
.dsh-inspection-card .actions button.primary{background:#2468ce;border-color:#2468ce;color:#fff}
.dsh-inspection-card .detail{margin-top:12px;border-top:1px solid #e7eef7;padding-top:10px}
.dsh-inspection-card .detail h4{margin:8px 0 6px;font-size:13px}
.dsh-inspection-card .row{border:1px solid #e6edf6;border-radius:8px;padding:7px 9px;margin:5px 0;background:#fbfdff}
.dsh-inspection-card .row summary{cursor:pointer;font-weight:600}
.dsh-inspection-card .row p{margin:5px 0;line-height:1.6}
.dsh-inspection-card .muted{color:#6a8099}
.dsh-inspection-card .danger{color:#b12839;font-weight:700}
.dsh-inspection-card .warning{color:#925c0a}
.dsh-inspection-card input[type=search]{width:100%;border:1px solid #cbd9e9;border-radius:7px;padding:6px 8px;margin:4px 0 8px;font:inherit}
.dsh-inspection-card pre{white-space:pre-wrap;word-break:break-word;background:#122641;color:#dbe7fa;border-radius:7px;padding:8px;max-height:260px;overflow:auto;font-size:11px}
.dsh-inspection-card .empty{padding:8px;color:#657a92;border:1px dashed #cbd7e7;border-radius:7px}
@media(max-width:720px){.dsh-inspection-card .metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
`
      document.head.appendChild(node)
    }

    function metric(label, value) {
      return h('div', { className: 'metric', key: label }, h('b', null, String(value ?? '—')), h('span', null, label))
    }
    function evidenceBlock(rows) {
      return h('details', null,
        h('summary', null, '展开证据'),
        h('pre', null, safeEvidenceJson(rows)),
      )
    }
    function checks(view) {
      return view.checks.map((check, index) => h('p', { key: index, className: check.status === 'abnormal' ? 'danger' : '' },
        `${kindLabel(check.kind)}：${check.message}${check.observedAt ? `（${check.observedAt}）` : ''}`))
    }

    function InspectionTool({ toolName, phase, block }) {
      style()
      const payload = React.useMemo(() => inspectionPayloadOf(block), [block])
      const model = React.useMemo(() => { try { return payload ? buildInspectionCard(payload) : null } catch { return null } }, [payload])
      const [view, setView] = React.useState('overview')
      const [query, setQuery] = React.useState('')
      const cardRef = React.useRef(null)
      React.useEffect(() => {
        // 工具卡位于聊天“执行过程”的 until-found 折叠层内；首次挂载时只展开该层，卡片内部仍默认概览。
        let parent = cardRef.current && cardRef.current.parentElement
        while (parent) {
          if (parent.getAttribute && parent.getAttribute('hidden') === 'until-found') {
            parent.removeAttribute('hidden')
            // 折叠层原高度为 0；只让包含本卡的容器参与布局，避免与后续消息重叠。
            parent.style.height = 'auto'
            parent.style.maxHeight = 'none'
            parent.style.overflow = 'visible'
          }
          parent = parent.parentElement
        }
      }, [])
      if (phase !== 'result') return h('div', { className: 'dsh-inspection-card' }, h('p', null, `正在执行${toolName.endsWith('inspection_deep') ? '全面巡检' : '巡检'}…`))
      if (!model) return h('details', { className: 'dsh-inspection-card' },
        h('summary', null, '巡检结果暂未识别为报告卡，展开原始回执'),
        h('pre', null, safeEvidenceJson(block?.content ?? block?.meta ?? null)))
      const open = action => { emit(model, action); setView('overview') }
      const devices = model.devices.filter(device => !query.trim() || device.label.toLowerCase().includes(query.trim().toLowerCase()))
      const detail = () => {
        if (view === 'problems') return h('div', { className: 'detail' }, h('h4', null, '主要问题分组'),
          model.groups.map(group => h('div', { className: `row ${group.tone}`, key: group.key },
            h('p', null, `${group.title}：${group.count} 项`),
            h('p', { className: 'muted' }, `建议：${group.advice}`),
            h('p', { className: 'muted' }, `验证：${group.verification || '未提供'}`),
            h('p', { className: 'muted' }, EXECUTION_BOUNDARY),
            group.items.length ? h('p', { className: 'muted' }, group.items.map(item => item.label).join('；')) : h('p', { className: 'muted' }, '无'))))
        if (view === 'devices') return h('div', { className: 'detail' }, h('h4', null, `设备明细（${model.devices.length} 台）`),
          h('input', { type: 'search', placeholder: '按设备、IP 或资产筛选', value: query, onChange: event => setQuery(event.target.value) }),
          devices.length ? devices.map(device => h('details', { className: 'row', key: device.assetId || device.label },
            h('summary', null, `${device.label} · ${device.online === 'offline' ? '离线' : device.online === 'online' ? '在线' : 'SOC未采集到状态数据'}`),
            device.checks.length ? device.checks.map((check, index) => h('div', { key: index, className: 'row' },
              h('p', null, `${kindLabel(check.kind)}：${check.message}${check.reason ? ` · ${codeLabel(check.reason)}` : ''}`),
              check.advice ? h('p', { className: 'muted' }, `建议：${check.advice}`) : null,
              check.verification ? h('p', { className: 'muted' }, `验证：${check.verification}`) : null,
              check.evidenceSummary ? h('p', { className: 'muted' }, `证据摘要：${check.evidenceSummary}`) : null,
              check.executionBoundary ? h('p', { className: 'muted' }, check.executionBoundary) : null)) : h('p', { className: 'muted' }, '无检查记录'),
            device.vulnerabilities ? h('p', null, `历史漏洞记录：${device.vulnerabilities} 条，当前待复核`) : null,
            h('div', { className: 'actions' }, h('button', { type: 'button', onClick: () => emit(model, 'show_markdown', { assetId: device.assetId }) }, '查看同Run Markdown')),
            evidenceBlock(device.checks))) : h('p', { className: 'empty' }, '没有匹配设备'))
        if (view === 'rules') return h('div', { className: 'detail' }, h('h4', null, `互联规则（${model.rules.length} 条）`),
          model.rules.length ? model.rules.map(rule => h('details', { className: 'row', key: rule.ruleId },
            h('summary', null, `${rule.name} · 规则 ${rule.ruleId} · ${rule.noMatch ? '无适用检查对' : rule.abnormal ? '异常' : statusText(rule.status)}`),
            h('p', null, `${rule.requirement}；检查 ${rule.checks.length} 项`),
            rule.checks.map((check, index) => h('div', { key: index, className: 'row' },
              h('p', { className: check.status === 'abnormal' ? 'danger' : '' }, `${check.message}${check.reason ? ` · ${codeLabel(check.reason)}` : ''}${check.observedAt ? `（${check.observedAt}）` : ''}`),
              check.advice ? h('p', { className: 'muted' }, `建议：${check.advice}`) : null,
              check.verification ? h('p', { className: 'muted' }, `验证：${check.verification}`) : null,
              check.evidenceSummary ? h('p', { className: 'muted' }, `证据摘要：${check.evidenceSummary}`) : null,
              check.executionBoundary ? h('p', { className: 'muted' }, check.executionBoundary) : null)),
            evidenceBlock(rule.checks))) : h('p', { className: 'empty' }, '本次没有规则结果'))
        if (view === 'vulnerabilities') return h('div', { className: 'detail' }, h('h4', null, `漏洞结果（${model.counts.vulnerabilityDevices} 台 / ${model.counts.vulnerabilities} 条）`),
          model.groups.find(group => group.key === 'vulnerabilities')?.items.length
            ? model.groups.find(group => group.key === 'vulnerabilities').items.map(item => h('p', { className: 'row', key: item.key }, item.label))
            : h('p', { className: 'empty' }, '本次没有已读漏洞记录'))
        if (view === 'evidence') return h('div', { className: 'detail' }, h('h4', null, '三层证据与同 Run 交付'),
          h('p', null, '原子证据在各设备、规则展开项中；以下是同 Run 级操作。'),
          h('div', { className: 'actions' },
            h('button', { type: 'button', onClick: () => emit(model, 'show_markdown') }, '查看同Run Markdown'),
            h('button', { type: 'button', onClick: () => emit(model, 'download_report') }, '下载同Run报告')),
          h('p', { className: 'muted' }, `运行：${model.runId || '未提供'}；所有操作沿用此运行，不重新巡检。`))
        return null
      }
      const overview = React.useMemo(() => renderOverviewHtml(model), [model])
      React.useEffect(() => {
        const node = cardRef.current
        if (!node) return undefined
        const handler = event => {
          const target = event.target && event.target.closest ? event.target.closest('[data-action],[data-view]') : null
          if (!target) return
          const action = target.getAttribute('data-action')
          if (action === 'download_report' || action === 'follow_up') { emit(model, action); return }
          const next = target.getAttribute('data-view')
          if (next) setView(['problems', 'devices', 'rules', 'vulnerabilities', 'evidence'].includes(next) ? next : 'problems')
        }
        node.addEventListener('click', handler)
        return () => node.removeEventListener('click', handler)
      }, [model])
      return h('section', { className: 'dsh-inspection-card', 'data-run-id': model.runId || '', ref: cardRef },
        h('div', { dangerouslySetInnerHTML: { __html: overview } }),
        view !== 'overview' ? detail() : null,
      )
    }
    function statusText(value) { return codeLabel(value) || '待核实' }
    function kindLabel(value) { return ({ status: '设备在线状态', baseline: '基线核查', vulnerabilities: '漏洞观测', reachability: '互联规则' })[value] || codeLabel(value) || '检查项' }

    function EventBridge({ inputActions }) {
      React.useEffect(() => {
        const listener = event => {
          const detail = event?.detail
          if (!detail || detail.type !== 'inspection_report_event') return
          try { dispatchEventToInput(inputActions, detail) } catch { /* 输入机忙时保留当前草稿，不伪造发送。 */ }
        }
        window.addEventListener('dsh-inspection-report-event', listener)
        return () => window.removeEventListener('dsh-inspection-report-event', listener)
      }, [inputActions])
      return null
    }

    const inject = ['slots']
    function apply(ctx) {
      for (const toolName of TOOLS) {
        ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
          { name: 'tool.call.toolview', key: toolName }, InspectionTool,
        )), `inspection-report-card: ${toolName} view`)
      }
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: 'inspection-report-card-bridge', order: 110 }, EventBridge,
      )), 'inspection-report-card: event bridge')
    }
    return { apply, inject }
  },
})
