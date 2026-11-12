/* Hand-authored browser source. Central network space ported from the AI-SOC V6.0 prototype. */
window.__ModuleLoader__.load({
  id: 'dsh-security-network-space',
  factory(require) {
    const React = require('react')
    const { createElement: h, useEffect, useMemo, useRef, useState } = React
    const PANEL = 'security-network-space'
    const NS = 'securityNetworkSpace'
    const BRAIN = '__BRAIN_URI__'
    const BRAIN_CONFIG = { columns: 1, rows: 1, frames: 1, frameWidth: 960, frameHeight: 320, duration: 6.4, uri: BRAIN }
    const THREE_SRC = '__THREE_SRC__'
    const DEVICE_SRC = '__DEVICE_SRC__'
    const DATA = { nodes: null, edges: null }
    if (!window.THREE) { try { new Function(THREE_SRC).call(window) } catch (error) { window.__SNS_THREE_ERROR__ = String(error) } }
    if (!window.createSOC6DeviceSpace) { try { new Function(DEVICE_SRC).call(window) } catch (error) { window.__SNS_DEVICE_ERROR__ = String(error) } }
    window.SOC6_FONT = window.SOC6_FONT || {}
    window.SOC6_BRAIN = window.SOC6_BRAIN || BRAIN_CONFIG
    const zh = {
      entry: '网络空间监控', title: '智能安全态势', subtitle: '感知全域风险 · 智能协同防御',
      back: '返回聊天', refresh: '刷新', fullscreen: '全屏', pause: '暂停动效', resume: '恢复动效',
      demo: '交互原型 · 模拟数据',
      assetsTitle: '全域资产概览', totalLabel: '纳管资产总数', unit: '项',
      online: '在线资产', offline: '离线资产', review: '待复核', visible: '资产可见率',
      composition: '资产构成', allAssets: '全域资产', traditional: '传统资产', smart: '智能资产', unclassified: '其他设备',
      protection: '防护与运营', scoreText: '整体态势良好', scoreNote: '持续监测 3 项关注风险', running: '智能防护持续运行', scoreUnit: '分',
      analysis: '今日智能研判', analysisUnit: '次', task: '智能体协同任务', taskUnit: '项',
      trendCaption: '近 24 小时威胁趋势', trendDown: '↓ 18.6%',
      space: '实时网络空间', spaceSub: '智能资产与传统资产的统一运行视图', live: 'LIVE',
      all: '全域', smartAssets: '智能资产', traditionalAssets: '传统资产',
      view: '视角', layout: '布局', byCategory: '设备分类', byNetwork: '真实网络',
      hint3d: '拖动旋转 · 滚轮缩放', hint2d: '点击资产查看详情',
      runningAll: '全域感知运行中', runningSmart: '智能资产运行中', runningTraditional: '传统资产运行中',
      nodeCount: '个代表节点 / 73 项资产',
      legendBiz: '业务连接', legendSmart: '智能调用', legendRunning: '执行中', legendOk: '正常 / 已通过',
      legendReview: '待复核', legendRisk: '风险', legendNote: '环色跟随设备状态 · 上下扫描表示执行中 · 点击资产查看详情',
      taskDock: '当前任务过程', idle: '当前无执行任务', idleNote: '智能体协同通道待命，等待新的研判任务',
      openChat: '打开原生会话',
      threat: '后台威胁研判', threatLive: '实时滚动', feedDesc: 'AI 持续分析 · 点击回放研判过程',
      feedPause: '暂停', feedResume: '继续', feedReceiving: '正在接收研判消息', today: '今日',
      timeline: '处置时间线', timelineNote: '按事件顺序记录',
      readOnly: '只读监控', footerNote: '不发起扫描、研判或处置',
      sevHigh: '高危', sevMid: '中危', sevLow: '低危',
      detail: '资产详情', close: '关闭', kind: '资产类型', code: '资产编码', address: '地址', version: '版本', owner: '归属', note: '说明',
      synced: '感知链路正常', recentSync: '最近同步', packet: '条/秒',
    }
    const en = {
      entry: 'Network Space Monitor', title: 'Intelligent Security Posture', subtitle: 'Sense global risk · Coordinate intelligent defense',
      back: 'Back to chat', refresh: 'Refresh', fullscreen: 'Fullscreen', pause: 'Pause motion', resume: 'Resume motion',
      demo: 'PROTOTYPE · SIMULATED DATA',
      assetsTitle: 'Asset overview', totalLabel: 'Managed assets', unit: '',
      online: 'Online', offline: 'Offline', review: 'To review', visible: 'Visibility',
      composition: 'Composition', allAssets: 'All assets', traditional: 'Traditional', smart: 'Intelligent', unclassified: 'Other',
      protection: 'Protection', scoreText: 'Overall healthy', scoreNote: 'Monitoring 3 risks', running: 'Protection running', scoreUnit: '',
      analysis: 'Analyses today', analysisUnit: '', task: 'Agent tasks', taskUnit: '',
      trendCaption: '24h threat trend', trendDown: '↓ 18.6%',
      space: 'Live network space', spaceSub: 'Unified view of intelligent and traditional assets', live: 'LIVE',
      all: 'All', smartAssets: 'Intelligent', traditionalAssets: 'Traditional',
      view: 'View', layout: 'Layout', byCategory: 'Category', byNetwork: 'Real network',
      hint3d: 'Drag to rotate · Scroll to zoom', hint2d: 'Click an asset for details',
      runningAll: 'Global sensing running', runningSmart: 'Intelligent assets running', runningTraditional: 'Traditional assets running',
      nodeCount: 'representative nodes / 73 assets',
      legendBiz: 'Business link', legendSmart: 'Model call', legendRunning: 'Running', legendOk: 'Normal / passed',
      legendReview: 'To review', legendRisk: 'Risk', legendNote: 'Ring follows state · Vertical scan means running · Click for details',
      taskDock: 'Current task', idle: 'No active task', idleNote: 'Agent channel standing by for new analysis',
      openChat: 'Open native session',
      threat: 'Threat analysis', threatLive: 'Live', feedDesc: 'AI keeps analyzing · Click to replay',
      feedPause: 'Pause', feedResume: 'Resume', feedReceiving: 'Receiving analysis messages', today: 'Today',
      timeline: 'Response timeline', timelineNote: 'Recorded in event order',
      readOnly: 'Read-only monitor', footerNote: 'No scans, judgements or actions issued',
      sevHigh: 'HIGH', sevMid: 'MEDIUM', sevLow: 'LOW',
      detail: 'Asset details', close: 'Close', kind: 'Type', code: 'Code', address: 'Address', version: 'Version', owner: 'Owner', note: 'Note',
      synced: 'Sensing link normal', recentSync: 'Synced', packet: 'pps',
    }
    const CSS = `
.sns-monitor{--bg:#020913;--surface:#071321;--line:#19344d;--text:#c5d5e9;--muted:#6f8aa7;--cyan:#30cce5;--violet:#9186ff;--green:#37d3b4;--amber:#f0bb68;--red:#f17889;--left-w:266px;--right-w:326px;box-sizing:border-box;margin:0;padding:0;border:0;max-width:none;max-height:none;width:100dvw;height:100dvh;position:fixed;inset:0;background:var(--bg);color:var(--text);font-family:"Noto Sans CJK SC","Microsoft YaHei","PingFang SC",sans-serif;font-size:12px;line-height:1.4;overflow:hidden;color-scheme:dark}
.sns-monitor[open]{display:block}.sns-monitor::backdrop{background:#01040a}.sns-monitor *{box-sizing:border-box}
.sns-monitor button{cursor:pointer;border:0;background:none;font:inherit;color:inherit;padding:0}
.sns-monitor button:disabled{cursor:default;opacity:.45}.sns-monitor button:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
:where(.sns-monitor) svg{display:inline-block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;flex-shrink:0}
.sns-monitor h1,.sns-monitor h2,.sns-monitor h3,.sns-monitor p{margin:0}.sns-monitor b,.sns-monitor strong{font-weight:500}.sns-monitor small{font-weight:400}
.sns-topbar{height:103px;margin:0 20px;position:relative;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #254361;background:linear-gradient(180deg,#101d2c80,transparent)}
.sns-topbar:after{content:"";position:absolute;bottom:-1px;left:30%;right:30%;height:1px;background:linear-gradient(90deg,transparent,#4b9bc9,transparent)}
.sns-brand{display:flex;gap:10px;align-items:center}.sns-brand-mark{display:grid;place-items:center;width:35px;height:41px;color:#70d9ee;background:#092e42;border:1px solid #21617b;clip-path:polygon(0 0,100% 0,100% 73%,50% 100%,0 73%)}
.sns-brand-mark svg{width:25px;height:28px}.sns-brand b{font-family:Arial,sans-serif;font-size:21px;letter-spacing:2px;color:#e1efff}
.sns-brand small{display:block;font-size:10px;color:#7697b7;letter-spacing:1.6px;margin-top:3px}
.sns-system-title{position:absolute;left:50%;top:20px;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;gap:23px;text-align:center;white-space:nowrap;width:48%;height:83px;background:linear-gradient(180deg,#2e426126,transparent);clip-path:polygon(5% 10%,95% 10%,100% 100%,0 100%)}
.sns-system-title h1{font-size:29px;letter-spacing:6px;font-weight:600;color:#dfecff;text-shadow:0 0 22px #447cc747;line-height:1.4}
.sns-system-title p{font-size:9px;letter-spacing:3px;color:#6d9ec3;margin-top:6px}
.sns-title-rule{width:65px;height:11px;border-top:1px solid #477392;border-bottom:1px solid #274962;transform:skewX(-40deg);opacity:.6}
.sns-title-rule:after{content:"";display:block;width:8px;height:11px;border-left:2px solid #5c9fc4;border-right:2px solid #5c9fc4}
.sns-title-rule.reverse{transform:scaleX(-1) skewX(-40deg)}
.sns-header-right{display:flex;align-items:center;gap:19px}
.sns-demo-badge{display:flex;align-items:center;gap:6px;color:#7497b5;font-size:9px;border:1px solid #21394d;border-radius:3px;padding:4px 7px;white-space:nowrap}
.sns-demo-badge i{height:4px;width:4px;background:var(--cyan);border-radius:50%}
.sns-clock{text-align:right}.sns-clock b{font:22px/1.1 "DIN Alternate",Consolas,monospace;color:#d6e8ff;letter-spacing:1px;font-variant-numeric:tabular-nums}
.sns-clock small{display:block;color:#6688a9;font-size:9px;margin-top:6px}
.sns-icon-button{display:grid;place-items:center;width:29px;height:29px;border:1px solid #244056;border-radius:3px;color:#80a5c3;background:#0a1c2a80;flex-shrink:0}
.sns-icon-button svg{width:14px;height:14px}.sns-icon-button:hover{background:#14334c;border-color:#38799b}
.sns-workspace{display:grid;grid-template-columns:var(--left-w) minmax(0,1fr) var(--right-w);gap:16px;padding:16px 20px 0;height:calc(100dvh - 140px);min-height:0}
.sns-left,.sns-right{display:flex;flex-direction:column;gap:16px;min-height:0}
.sns-panel{position:relative;border:1px solid #193449;background:linear-gradient(115deg,#081726b8,#050f1ee0);min-width:0}
.sns-panel:before,.sns-panel:after{content:"";position:absolute;width:7px;height:7px;pointer-events:none;z-index:1}
.sns-panel:before{left:-1px;top:-1px;border-left:1px solid #3e7a9a;border-top:1px solid #3e7a9a}
.sns-panel:after{right:-1px;bottom:-1px;border-right:1px solid #3e7a9a;border-bottom:1px solid #3e7a9a}
.sns-panel-heading{height:37px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid #1b3449;background:linear-gradient(90deg,#1133468f,#11263b50 70%,transparent);border-left:2px solid var(--cyan);margin-left:-1px;white-space:nowrap}
.sns-panel-heading svg{width:15px;height:15px;color:var(--cyan)}
.sns-panel-heading h2{font-weight:500;font-size:13px;letter-spacing:.5px;color:#c9dfef}
.sns-panel-heading .micro{margin-left:auto;color:#567a96;font:8px Arial,sans-serif;letter-spacing:1px}
.sns-panel-heading.violet{border-left-color:var(--violet);background:linear-gradient(90deg,#282b505f,#11263b50 70%,transparent)}
.sns-panel-heading.violet svg{color:var(--violet)}
.sns-panel-heading.amber{border-left-color:var(--amber);background:linear-gradient(90deg,#4c3c2357,#14223650 70%,transparent)}
.sns-panel-heading.amber svg{color:var(--amber)}
.sns-asset-overview{flex:0 0 225px;overflow:hidden}
.sns-asset-total{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 10px}
.sns-asset-total span{color:var(--muted);font-size:9px}
.sns-asset-total b{display:block;font:600 34px/1.15 "DIN Alternate",Consolas,monospace;color:#deffff;text-shadow:0 0 14px #0bb7ff6b}
.sns-asset-total b small{font-size:10px;color:var(--muted);margin-left:4px}
.sns-metric-orbit{display:grid;place-items:center;width:42px;height:42px;border:1px solid #1b4a63;border-radius:50%;color:#4fd8ee;background:radial-gradient(closest-side,#07293a,#04121d)}
.sns-mini-metrics{display:grid;grid-template-columns:repeat(3,1fr);margin:0 18px;border-top:1px solid #16324a;border-bottom:1px solid #16324a}
.sns-mini-metrics>div{padding:8px 4px;text-align:center}.sns-mini-metrics>div+div{border-left:1px solid #16324a}
.sns-mini-metrics span{display:flex;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:8px}
.sns-mini-metrics b{display:block;font-size:18px;color:#d9ecfb;margin-top:1px}
.sns-mini-metrics b.amber-text{color:var(--amber)}
.sns-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0}
.sns-dot.good{color:var(--green)}.sns-dot.dim{color:#5c7389}.sns-dot.amber{color:var(--amber)}.sns-dot.red{color:var(--red)}
.sns-coverage{margin:10px 18px 12px;display:flex;align-items:center;gap:8px;font-size:9px;color:var(--muted)}
.sns-coverage b{font-size:9px;color:#cfe9f8}
.sns-coverage>div{flex:1;height:3px;background:#0b2237;overflow:hidden}
.sns-coverage i{display:block;height:100%;background:linear-gradient(90deg,#1742e7 0%,#087dff 53%,#39f1ff 100%)}
.sns-distribution-panel{flex:0 0 178px;overflow:hidden}
.sns-distribution-summary{display:flex;align-items:center;gap:14px;padding:12px 16px}
.sns-donut{position:relative;width:66px;height:66px;flex-shrink:0;border-radius:50%;outline:1px solid #13446a;outline-offset:3px;box-shadow:0 0 17px #009ee92e}
.sns-donut:after{content:"";position:absolute;inset:11px;border-radius:50%;background:#04121f}
.sns-donut>div{position:absolute;inset:0;display:grid;place-content:center;text-align:center;z-index:1}
.sns-donut b{display:block;font-size:15px;color:#eff4ff;line-height:1.1}
.sns-donut small{display:block;font-size:7px;color:var(--muted);margin-top:2px}
.sns-legend2{display:flex;flex-direction:column;gap:6px;font-size:9px;color:#9dbbd3}
.sns-legend2>span{display:flex;align-items:center;gap:5px}.sns-legend2 b{margin-left:auto;color:#dceaf6}
.sns-swatch{width:6px;height:6px;flex-shrink:0;background:var(--cyan)}.sns-swatch.violet{background:var(--violet)}.sns-swatch.slate{background:#3663ff}
.sns-asset-categories{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;padding:0 16px 10px;font-size:8px;color:#9fbcd4}
.sns-asset-category{display:flex;align-items:center;gap:4px}.sns-asset-category b{margin-left:auto;color:#d7e8f6}
.sns-posture-panel{flex:1;overflow:hidden;display:flex;flex-direction:column}
.sns-security-score{display:flex;align-items:center;gap:10px;margin:12px 16px}
.sns-score-ring{display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;border-radius:50%;outline:1px solid #19526f;outline-offset:2px;box-shadow:0 0 11px #0ec0b224}
.sns-score-ring b{font-size:15px;color:#d8fbff;line-height:1}.sns-score-ring small{font-size:7px;color:#7fb6c9;margin-left:1px}
.sns-security-score strong{display:block;font-size:10px;color:#d5ecfa}.sns-security-score>div>span{display:block;font-size:8px;color:#7f9db6;margin-top:2px}
.sns-security-score>div>small{display:flex;align-items:center;gap:4px;font-size:8px;color:#63c9b6;margin-top:3px}
.sns-operation-row{display:flex;justify-content:space-between;align-items:center;margin:0 16px;padding:9px 0;border-top:1px solid #14293d;font-size:9px;color:#9dbad2}
.sns-operation-row b{font-size:11px;color:#dceefb}.sns-operation-row b small{font-size:7px;color:var(--muted);margin-left:2px}
.sns-trend-caption{display:flex;justify-content:space-between;align-items:center;margin:14px 16px 2px;font-size:9px;color:#9dbad2}
.sns-trend-caption b{font-size:9px;color:var(--green)}
.sns-sparkline{display:block;width:calc(100% - 32px);height:52px;margin:0 16px}
.sns-chart-axis{display:flex;justify-content:space-between;margin:2px 16px 8px;font-size:7px;color:#567a96}
.sns-center-panel{background:#030b15;border-color:#1c5288;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.sns-space-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid #204a75;background:linear-gradient(100deg,#082b55,#04152b 30%,#030c19 70%,#07172b)}
.sns-space-heading{display:flex;align-items:center;gap:6px}.sns-space-heading svg{width:16px;height:16px;color:#45d4ea}
.sns-space-heading h2{font-size:14px;font-weight:600;color:#f0fcff;letter-spacing:.5px}
.sns-live-pill{display:inline-flex;align-items:center;gap:3px;margin-left:2px;font-size:7px;color:#7ef0ff;border:1px solid #1d6f88;border-radius:2px;padding:1px 4px}
.sns-live-pill i{width:4px;height:4px;border-radius:50%;background:#3ff0c0;animation:sns-blink 1.6s infinite}
.sns-space-toolbar p{font-size:8px;color:#6b96b6;margin-top:2px}
.sns-space-actions{display:flex;align-items:center;gap:7px}
.sns-text-button{font-size:9px;color:#a8cee6;border:1px solid #215273;border-radius:3px;padding:4px 9px;background:#05192a}
.sns-text-button:hover{background:#0b2a40;border-color:#3a86ad;color:#e6f7ff}
.sns-primary-button{font-size:9px;color:#fff;background:linear-gradient(110deg,#087ee1,#0655a9);border-radius:3px;padding:4px 10px}
.sns-topology-toolbar{display:flex;align-items:center;gap:16px;padding:7px 16px;border-bottom:1px solid #123252;background:#020c18;flex-wrap:wrap}
.sns-topology-control{display:flex;align-items:center;gap:7px;font-size:8px;color:#6b96b6}
.sns-segmented{display:flex;background:#01060e;border:1px solid #23517c;border-radius:3px;overflow:hidden}
.sns-segmented button{font-size:9px;color:#abcae9;padding:3px 10px;border-radius:0}
.sns-segmented button.active{color:#001320;background:linear-gradient(110deg,#9bfaff,#42e7ff 42%,#28beff);box-shadow:inset 0 1px 0 #c2ffff,0 0 7px #058ee859}
.sns-topology-hint{margin-left:auto;font-size:8px;color:#4f7492}
.sns-network-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;padding:30px 0 31px;overflow:hidden;contain:layout paint;isolation:isolate;background:radial-gradient(ellipse 29% 40% at 50% 42%,#08366a73 0%,#071d3c38 65%,transparent 100%),radial-gradient(ellipse 68% 84% at 50% 58%,#051225 8%,#020b16 57%,#01050b 95%)}
.sns-network-stage:after{content:"";position:absolute;z-index:1;pointer-events:none;inset:0;background:linear-gradient(90deg,transparent,#007dff77 45%,#50e5ff8a 50%,#007dff77 55%,transparent) center top/50% 1px no-repeat,linear-gradient(90deg,transparent,#2879c96a 50%,transparent) center bottom/70% 1px no-repeat}
.sns-space-topline{position:absolute;top:11px;left:18px;right:18px;display:flex;justify-content:space-between;gap:10px;color:#4c6f8f;font-size:8px;z-index:2;pointer-events:none}
.sns-space-topline>span:first-child{display:flex;align-items:center;gap:5px}
.sns-device-host{position:absolute;inset:0;z-index:0;overflow:hidden}
.sns-device-host canvas{display:block;width:100%!important;height:100%!important}
.sns-stage-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0}
.sns-brain{position:absolute;transform:translate(-50%,-50%);pointer-events:none;z-index:0;mix-blend-mode:screen;opacity:.95;object-fit:contain}
.sns-stage-wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:visible}
.sns-stage-svg{width:100%;height:100%;overflow:visible;stroke:none;flex:1;position:relative;z-index:0}
.sns-node-layer{position:absolute;inset:0;pointer-events:none;z-index:1}
.sns-node-label{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;text-align:center;white-space:nowrap;background:none;border:0;padding:0;color:#edfbff;font-size:10px;text-shadow:0 0 6px #010613,0 1px 3px #010613;cursor:pointer}
.sns-node-label small{display:block;font:7px Consolas,monospace;color:#a4cfee;letter-spacing:.2px}
.sns-node-label.risk{color:#ffc7d4}
.sns-zone-title{fill:#e1f4ff;font-size:10px;letter-spacing:.5px}
.sns-zone-meta{fill:#94bfdc;font:7px Consolas,monospace;letter-spacing:.2px}
.sns-zone.smart-zone .sns-zone-plane{fill:#08276749;stroke:#447cff;stroke-width:.9}
.sns-zone.traditional-zone .sns-zone-plane{fill:#022e3e50;stroke:#1595bd;stroke-width:.9}
.sns-edge-path{fill:none;stroke:#21d9ff;stroke-width:1.1;stroke-opacity:.72}
.sns-edge-flow{fill:none;stroke:#b4eeff;stroke-width:1.5;stroke-dasharray:5 170;stroke-opacity:.8;animation:sns-flow 8s linear infinite}
.sns-node-shell{fill:#032734;stroke:#28d9ff;stroke-width:1.2}
.sns-node.smart .sns-node-shell{fill:#061e4c;stroke:#409fff}
.sns-node.shell-hover .sns-node-shell,.sns-node.selected .sns-node-shell{fill:#134157;stroke:#ddfaff;stroke-width:2}
.sns-node.risk .sns-node-shell{stroke:#ff3c8d;stroke-width:2.5}
.sns-node.warning .sns-node-shell{stroke:#ffc04d;stroke-width:2.5}
.sns-node.checked .sns-node-shell{stroke:#29ebaa;stroke-width:2}
.sns-node-halo{fill:none;stroke:#65d8eb;stroke-opacity:0;stroke-width:1}
.sns-node.active .sns-node-halo{stroke-opacity:.6;stroke-dasharray:5 4;animation:sns-nodepulse 2s infinite}
.sns-node-icon{color:#a0f2ff}
.sns-node.smart .sns-node-icon{color:#aacdff}
.sns-node-badge{fill:#3ac6ad;stroke:#263c61;stroke-width:2}
.sns-node.risk .sns-node-badge{fill:#f17889}.sns-node.warning .sns-node-badge{fill:#f0bb68}.sns-node.checked .sns-node-badge{fill:#52e0bd}
.sns-node-name{font-size:10px;text-anchor:middle;fill:#edfbff;paint-order:stroke;stroke:#010613;stroke-width:3px;stroke-linejoin:round}
.sns-node-sub{font:7px Consolas,monospace;fill:#a4cfee;text-anchor:middle;letter-spacing:.2px}
.sns-network-legend{position:absolute;left:18px;right:18px;bottom:13px;display:flex;align-items:center;gap:14px;color:#9dc9e7;font-size:8px;white-space:nowrap;z-index:2;pointer-events:none}
.sns-network-legend>span{display:flex;align-items:center;gap:5px}
.sns-network-legend small{margin-left:auto;color:#87b9da;font-size:8px}
.sns-legend-line{display:inline-block;width:15px;height:1px;background:var(--cyan)}
.sns-legend-line.violet{background:none;border-top:1px dashed var(--violet)}
.sns-work-sample{display:inline-block;width:9px;height:9px;border:1px dashed #6af5ff;border-radius:3px}
.sns-asset-popover{position:absolute;left:19px;top:39px;width:260px;padding:13px;background:#071c2ef5;border:1px solid #32617b;border-radius:5px;box-shadow:0 12px 35px #0008;z-index:5;backdrop-filter:blur(12px)}
.sns-popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sns-popover-head h3{font-size:11px;color:#d7f1ff}
.sns-popover-head button{font-size:9px;color:#7fa3c0}
.sns-asset-popover dl{margin:8px 0 0;display:grid;grid-template-columns:62px 1fr;gap:7px;font-size:9px}
.sns-asset-popover dt{color:#5e829f}.sns-asset-popover dd{margin:0;color:#d7f1ff;overflow-wrap:anywhere}
.sns-asset-note{border-top:1px solid #244569;padding-top:9px;margin:9px 0 0;line-height:1.7;color:#cee6ff;font-size:9px;background:#061729}
.sns-task-dock{flex:0 0 158px;background:linear-gradient(110deg,#031527,#020c18);border-top:1px solid #185987;padding:12px 18px;position:relative;min-width:0;overflow:auto}
.sns-dock-title{display:flex;justify-content:space-between;align-items:center;gap:8px}
.sns-dock-title h3{font-size:11px;color:#e2f1fd}
.sns-status-tag{display:inline-block;padding:2px 6px;font-size:8px;border:1px solid #13769b;border-radius:3px;color:#a3f3ff;background:#032438;white-space:nowrap}
.sns-idle-dock{display:flex;flex-direction:column;justify-content:space-between;height:100%;padding-top:8px;gap:8px}
.sns-idle-summary{display:flex;gap:20px}
.sns-idle-summary b{display:block;font-size:13px;color:#cfe9f9}
.sns-idle-summary small{display:block;font-size:8px;color:#5f87a6}
.sns-idle-note{font-size:8px;color:#5f87a6}
.sns-space-footer{height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#9cbfdc;font-size:8px;border-top:1px solid #193957;background:#020912}
.sns-space-footer>span{display:flex;align-items:center;gap:5px}
.sns-space-footer b{font:8px Consolas,monospace;color:#cbeaff}
.sns-separator{width:1px;height:8px;background:#24527a;display:inline-block;margin:0 4px}
.sns-threat-panel{height:510px;flex:auto;display:flex;flex-direction:column;overflow:hidden}
.sns-feed-description{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;font-size:8px;color:#7fa3c0;border-bottom:1px solid #14293d}
.sns-threat-feed{flex:1;overflow:auto;padding:4px 10px;scrollbar-color:#718bbe55 transparent}
.sns-threat-card{width:100%;text-align:left;border:1px solid #19314b;border-radius:2px;padding:7px 9px;margin:5px 0;background:#04101d}
.sns-threat-card:hover{background:#071a2b;border-color:#2a5b7e}
.sns-threat-card.selected{border-color:#3f9dbe;background:#062334}
.sns-threat-meta{display:flex;align-items:center;gap:6px;color:#89b9dc;font-size:7px}
.sns-severity{font-size:7px;padding:0 4px;border:1px solid #ae344b;background:#350c17;color:#ff99a8;box-shadow:inset 2px 0 #ff455f}
.sns-severity.medium{border-color:#a3762f;background:#33230c;color:#ffd18a;box-shadow:inset 2px 0 #f0bb68}
.sns-severity.low{border-color:#2c6f64;background:#0b2a26;color:#8ce0cd;box-shadow:inset 2px 0 #37d3b4}
.sns-threat-card h3{font-size:10px;color:#f3f7ff;margin-top:3px;font-weight:500}
.sns-threat-card p{font-size:8px;color:#7fa3c0;margin-top:2px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sns-need-review{font-size:7px;color:#ffc247;border:1px solid #8d6524;background:#2b2008;padding:0 4px;box-shadow:inset 2px 0 #ffc247}
.sns-threat-stats{display:flex;gap:10px;font-size:7px;color:#5b87a8;margin-top:4px}
.sns-threat-empty{padding:16px 10px;font-size:9px;color:#7fa3c0;text-align:center;line-height:1.6}
.sns-feed-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;border-top:1px solid #8297c433;color:#97b3d5;font-size:8px}
.sns-feed-footer>span{display:flex;align-items:center;gap:5px}
.sns-feed-footer b{color:#cfe6f7}
.sns-timeline-panel{height:440px;flex:auto;display:flex;flex-direction:column;overflow:hidden}
.sns-timeline-context{padding:6px 12px;font-size:8px;color:#6b93b2;border-bottom:1px solid #14293d}
.sns-timeline{flex:1;overflow:auto;padding:5px 10px;position:relative;scrollbar-color:#6d85b355 transparent}
.sns-timeline-item{position:relative;min-height:0;padding:2px 0 6px 14px}
.sns-timeline-item:before{content:"";position:absolute;left:3px;top:6px;bottom:0;width:1px;background:#1c3d58}
.sns-timeline-item:last-child:before{display:none}
.sns-timeline-marker{position:absolute;left:0;top:4px;width:7px;height:7px;border-radius:50%;border:1px solid #2f7fa3;background:#04121f}
.sns-timeline-item.active .sns-timeline-marker{border-color:#7ef0ff;box-shadow:0 0 6px #31d5f0aa;background:#0a3a4d}
.sns-timeline-item.future .sns-timeline-marker{border-style:dashed;opacity:.6}
.sns-timeline-row{display:flex;align-items:baseline;gap:8px;justify-content:space-between;line-height:1.3}
.sns-timeline-row strong{font-size:9px;color:#cfe7f8;font-weight:500}
.sns-timeline-row time{font-size:7px;color:#5b829f}
.sns-timeline-item.active .sns-timeline-row strong{color:#eafcff}.sns-timeline-item.failed .sns-timeline-marker{border-color:#f17889;background:#2a1018}.sns-timeline-item.failed .sns-timeline-row strong{color:#ffc7d4}.sns-timeline-item.approval .sns-timeline-marker{border-color:#f0bb68;background:#2a2110}.sns-timeline-item.approval .sns-timeline-row strong{color:#ffe0a8}
.sns-timeline-item p{font-size:8px;color:#7fa3c0;margin-top:1px;line-height:1.32;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sns-page-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 2px;font-size:8px;color:#80b5d9}
.sns-page-footer>span{display:flex;align-items:center;gap:5px}
.sns-footer-divider{color:#537fa9}
.sns-replay{display:flex;flex-direction:column;gap:6px;min-width:0}
.sns-replay-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#dbeafd}
.sns-replay-head>span{display:flex;align-items:center;gap:6px}
.sns-replay-head small{color:#4f7797;font:8px Arial,sans-serif;letter-spacing:1px}
.sns-replay-head em{font-style:normal;color:#6ee7c0;font-size:8px;margin-left:6px}
.sns-replay-controls{display:flex;gap:4px}
.sns-replay-controls button{border:1px solid #1d4a68;background:#061a2b;color:#9dc2e0;font-size:8px;padding:2px 8px;cursor:pointer}
.sns-replay-controls button:disabled{opacity:.4;cursor:default}
.sns-replay-step{display:flex;align-items:center;gap:8px;font-size:9px;color:#cfe9f8}
.sns-replay-step b{margin-left:auto;font:9px Consolas,monospace;color:#7fa3c0}
.sns-replay-badge{border-radius:2px;padding:1px 6px;font-size:8px;font-weight:700}
.sns-replay-badge.observed{background:#123a5e;color:#9fd8ff;border:1px solid #2f7fa3}
.sns-replay-badge.speculative{background:#2b2008;color:#ffc247;border:1px dashed #8d6524}
.sns-replay-refs{color:#7fa3c0;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sns-replay-text{margin:2px 0 0;font-size:9px;line-height:1.5;color:#e6f3ff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sns-replay-progress{display:flex;gap:3px;margin-top:2px}
.sns-replay-progress i{flex:1;height:3px;background:#12324a;border-radius:1px}
.sns-replay-progress i.done{background:#2a7ea6}
.sns-replay-progress i.active{background:#6ee7c0;box-shadow:0 0 6px #6ee7c0}
.sns-replay-progress i.speculative.done{background:#8d6524}
.sns-replay-progress i.speculative.active{background:#ffc247;box-shadow:0 0 6px #ffc247}
.sns-replay-empty{margin:4px 0 0;font-size:9px;color:#7fa3c0}
.sns-stage-loading{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;gap:10px;background:radial-gradient(ellipse at center,#041224 0%,#020a14 70%);color:#9dc2e0;font-size:11px;letter-spacing:2px;pointer-events:none}
.sns-stage-spinner{width:16px;height:16px;border-radius:50%;border:2px solid #1e4a68;border-top-color:#6ee7c0;animation:sns-spin 0.9s linear infinite}
@keyframes sns-spin{to{transform:rotate(360deg)}}
.sns-toast{position:fixed;top:112px;right:24px;z-index:20;background:#0a2032f2;border:1px solid #2a6c94;color:#cfe9f8;font-size:10px;padding:6px 12px;border-radius:3px;box-shadow:0 8px 20px #0008;pointer-events:none}
.sns-motion-paused .sns-edge-flow,.sns-motion-paused .sns-live-pill i,.sns-motion-paused .sns-node.active .sns-node-halo{animation-play-state:paused!important}

.sns-operations-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#dbeafd;margin-bottom:8px}
.sns-operations-head small{color:#4f7797;font:8px Arial,sans-serif;letter-spacing:1px;margin-left:5px}
.sns-operations-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sns-operation-card{border:1px solid #1d4a6b;border-radius:3px;background:linear-gradient(130deg,#061b33,#020c18);padding:8px 10px;text-align:left}
.sns-operation-card>span{display:flex;align-items:center;gap:5px;font-size:8px;color:#9dc2e0}
.sns-operation-card>div{display:flex;align-items:baseline;gap:5px;margin-top:4px}
.sns-operation-card b{font:600 20px/1 "DIN Alternate",Consolas,monospace;color:#e6f6ff}
.sns-operation-card em{font:8px Consolas,monospace;font-style:normal;color:#7fb2d4;margin-left:2px}
.sns-operation-card small{font-size:7px;color:#5b87a8}
.sns-operation-card.blue{border-color:#1c5f96;background:linear-gradient(130deg,#062a4a,#020c18)}
.sns-operation-card.violet{border-color:#4a3f8f;background:linear-gradient(130deg,#151238,#020c18)}
.sns-operation-card.rose{border-color:#8a2f4a;background:linear-gradient(130deg,#2a0b18,#020c18);cursor:pointer}
.sns-operation-card.rose:hover{background:linear-gradient(130deg,#3a1022,#020c18)}
.sns-metric-track{height:3px;background:#0b2237;margin-top:6px;overflow:hidden}
.sns-metric-track i{display:block;height:100%;background:linear-gradient(90deg,#0e6cff,#3ff0ff)}
.sns-agent-slots{display:flex;gap:3px;margin-top:6px}
.sns-agent-slots i{width:8px;height:4px;background:#1d7fd4}
.sns-risk-mini-chain{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:7px;color:#c98fa2}
.sns-risk-mini-chain i{width:7px;height:7px;border-radius:50%;background:#ff455f}
.sns-risk-mini-chain i.pending{background:#ffc247}
.sns-operations-pipeline{display:flex;align-items:center;gap:12px;margin-top:9px;font-size:8px;color:#7fa3c0;flex-wrap:wrap}
.sns-operations-pipeline>span:first-child{color:#9dc2e0}
.sns-pipeline-stage{display:flex;align-items:center;gap:4px;color:#8fd9c9}
.sns-operations-pipeline b{margin-left:auto;color:#6ee7c0}
.sns-agent-roster{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:8px 12px}
.sns-agent-roster>div{border:1px solid #1b3b66;border-radius:3px;background:linear-gradient(130deg,#061835,#020b18);padding:6px 7px}
.sns-agent-roster span{display:block;font-size:8px;color:#ecf6ff}
.sns-agent-roster small{display:block;font-size:7px;color:#94b9eb;margin-top:2px}
.sns-timeline-footer{display:flex;align-items:center;gap:6px;padding:6px 12px;border-top:1px solid #19314b;font-size:8px;color:#97b3d5}
.sns-timeline-footer b{margin-left:auto;color:#cfe6f7}
.sns-timeline{list-style:none;margin:0}
@keyframes sns-flow{to{stroke-dashoffset:-240}}
@keyframes sns-blink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes sns-nodepulse{50%{stroke-opacity:.15}}
@keyframes sns-scan{50%{stroke-opacity:.1}}
@media(prefers-reduced-motion:reduce){.sns-monitor .sns-edge-flow,.sns-monitor .sns-node.active .sns-node-halo,.sns-monitor .sns-live-pill i{animation:none!important}}
@media(min-width:1800px){
.sns-monitor{--left-w:300px;--right-w:360px}
.sns-asset-overview{flex:0 0 262px}
.sns-distribution-panel{flex:0 0 205px}
.sns-workspace{gap:20px;padding:19px 24px 0}
.sns-panel-heading{height:41px;padding:0 15px}
.sns-panel-heading h2{font-size:14px}
.sns-panel-heading .micro{font-size:9px}
.sns-asset-total{padding:18px 22px 13px}
.sns-asset-total b{font-size:43px}
.sns-mini-metrics span{font-size:10px}
.sns-mini-metrics b{font-size:24px}
.sns-distribution-summary{padding:22px 22px 18px;gap:24px}
.sns-donut{width:94px;height:94px}
.sns-asset-categories{padding:0 21px;gap:12px 18px}
.sns-asset-category{font-size:11px}
.sns-security-score{margin:21px 21px;gap:18px}
.sns-score-ring{width:67px;height:67px}
.sns-security-score strong{font-size:12px}
.sns-security-score>div>span{font-size:10px}
.sns-operation-row{margin:0 21px;padding:12px 0;font-size:11px}
.sns-sparkline{width:calc(100% - 42px);margin:0 21px;height:74px}
.sns-space-toolbar{padding:18px 22px 15px}
.sns-space-heading h2{font-size:16px}
.sns-space-toolbar p{font-size:10px}
.sns-network-legend{font-size:9px;bottom:16px;gap:17px}
.sns-space-topline{font-size:9px}
.sns-feed-description{padding:9px 13px;font-size:9px}
.sns-timeline-context{padding:12px 16px;font-size:10px}
.sns-threat-card{padding:11px 12px}
.sns-threat-card h3{font-size:12px}
.sns-threat-card p{font-size:10px}
.sns-timeline{padding:8px 12px}
.sns-timeline-item{padding:3px 0 9px 16px}
.sns-timeline-row strong{font-size:11px}
.sns-timeline-row time{font-size:9px}
.sns-timeline-item p{font-size:10px}
.sns-task-dock{padding:15px 22px}
.sns-operation-card b{font-size:24px}
.sns-operations-pipeline{font-size:9px}
.sns-space-footer{height:34px;font-size:9px}
.sns-page-footer{font-size:9px}
}
@media(max-width:1450px) and (min-width:1051px){
.sns-monitor{--left-w:230px;--right-w:286px}
.sns-workspace{gap:12px;padding:12px 14px 0;height:calc(100dvh - 122px)}
.sns-topbar{margin:0 14px;height:90px}
.sns-system-title{top:10px;height:80px;gap:17px}
.sns-system-title h1{font-size:26px;letter-spacing:5px}
.sns-title-rule{width:40px}
.sns-header-right{gap:12px}
.sns-panel-heading{padding:0 10px;height:34px}
.sns-panel-heading h2{font-size:12px}
.sns-panel-heading .micro{font-size:7px;letter-spacing:0}
.sns-left,.sns-right{gap:12px}
.sns-asset-total{padding:7px 14px 4px}
.sns-asset-total b{font-size:33px}
.sns-mini-metrics span{font-size:7px}
.sns-mini-metrics b{font-size:20px}
.sns-distribution-summary{gap:13px;padding:12px 14px}
.sns-donut{width:70px;height:70px}
.sns-legend2{font-size:8px}
.sns-asset-categories{padding:0 13px;gap:8px 12px}
.sns-asset-category{font-size:7px}
.sns-security-score{margin:13px 14px;gap:12px}
.sns-score-ring{width:48px;height:48px}
.sns-security-score strong{font-size:10px}
.sns-operation-row{padding:7px 0;margin:0 14px;font-size:9px}
.sns-sparkline{height:44px}
.sns-space-toolbar{padding:10px 13px}
.sns-space-toolbar p{font-size:8px}
.sns-space-heading h2{font-size:12px}
.sns-segmented button{padding:4px 7px;font-size:8px}
.sns-space-topline{font-size:7px;left:13px;right:13px}
.sns-network-legend{gap:9px;left:13px;right:13px;font-size:7px}
.sns-network-legend small{font-size:6px}
.sns-task-dock{padding:10px 13px}
.sns-operations-head{font-size:9px;margin-bottom:6px}
.sns-operation-card{padding:6px 8px}
.sns-operation-card b{font-size:17px}
.sns-operation-card>span{font-size:7px}
.sns-operations-pipeline{font-size:7px;gap:9px;margin-top:7px}
.sns-threat-panel{height:auto;flex:1}
.sns-timeline-panel{height:auto;flex:1;min-height:0}
.sns-feed-description{padding:5px 10px;font-size:7px}
.sns-threat-feed{padding:3px 8px}
.sns-threat-card{padding:6px 8px;margin:4px 0}
.sns-threat-card h3{font-size:9px}
.sns-threat-card p{font-size:7px}
.sns-threat-stats{font-size:6px;gap:8px}
.sns-timeline{padding:6px 10px}
.sns-timeline-item{padding:2px 0 5px 13px}
.sns-timeline-row strong{font-size:9px}
.sns-timeline-item p{font-size:7px}
.sns-timeline-context{padding:5px 10px;font-size:7px}
.sns-timeline-footer{padding:5px 10px;font-size:7px}
.sns-space-footer{height:27px;font-size:7px}
.sns-page-footer{font-size:7px}
}
@media(max-width:1250px) and (min-width:1051px){
.sns-operation-card>div:nth-child(2){align-items:flex-start;flex-direction:column;gap:2px}
.sns-operation-card b{font-size:19px}
.sns-risk-mini-chain{font-size:6px}
.sns-operations-pipeline{font-size:6px;gap:7px}
}
@media(max-width:1050px){
.sns-monitor{--left-w:215px;--right-w:275px}
.sns-topbar{height:88px;margin:0 14px}
.sns-system-title{width:50%;height:88px;top:0;gap:8px}
.sns-system-title h1{font-size:22px;letter-spacing:4px}
.sns-system-title p{font-size:7px;letter-spacing:1px}
.sns-title-rule{width:20px}
.sns-clock b{font-size:17px}
.sns-clock small{font-size:8px}
.sns-brand b{font-size:18px}
.sns-brand small{font-size:8px}
.sns-brand-mark{width:28px;height:34px}
.sns-workspace{height:auto;grid-template-columns:215px minmax(0,1fr);padding:12px 14px 0;gap:12px}
.sns-center-panel{grid-column:2;grid-row:1;min-height:800px}
.sns-right{grid-column:1/-1;grid-row:2;display:grid;grid-template-columns:1fr 1fr;min-height:420px;height:420px}
.sns-network-stage{min-height:430px}
.sns-space-toolbar{flex-wrap:wrap;gap:12px}
.sns-space-actions{width:100%;justify-content:space-between}
.sns-task-dock{flex:0 0 auto}
.sns-space-topline{font-size:7px}
.sns-network-legend{flex-wrap:wrap;gap:10px;bottom:9px}
.sns-page-footer{height:auto;padding:6px 0}
}
@media(max-width:700px){
.sns-monitor[open]{grid-template-rows:110px minmax(0,1fr) auto}
.sns-topbar{height:110px;align-items:flex-start;padding-top:14px;margin:0 12px}
.sns-brand b{font-size:17px}
.sns-brand-mark{width:24px;height:28px}
.sns-clock b{font-size:16px}
.sns-clock small{font-size:7px;margin-top:4px}
.sns-system-title{top:48px;height:62px;width:100%;gap:17px}
.sns-system-title h1{font-size:21px;letter-spacing:5px}
.sns-system-title p{font-size:7px;letter-spacing:2px;margin-top:4px}
.sns-title-rule{width:26px;height:8px}
.sns-workspace{display:flex;flex-direction:column;height:auto;padding:12px;gap:12px;overflow:auto}
.sns-left{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sns-asset-overview{height:203px}
.sns-panel-heading{height:32px;padding:0 8px;gap:5px}
.sns-panel-heading h2{font-size:11px}
.sns-panel-heading svg{width:12px;height:12px}
.sns-asset-total{padding:12px 12px 8px}
.sns-asset-total b{font-size:34px}
.sns-mini-metrics span{font-size:6px}
.sns-mini-metrics b{font-size:18px}
.sns-distribution-panel{height:203px}
.sns-distribution-summary{padding:12px 9px 9px;gap:8px}
.sns-donut{width:51px;height:51px}
.sns-donut b{font-size:17px}
.sns-donut small{font-size:6px}
.sns-legend2{font-size:7px}
.sns-asset-categories{padding:0 9px;gap:6px 8px}
.sns-asset-category{font-size:7px}
.sns-center-panel{min-height:650px}
.sns-space-toolbar{padding:13px 11px;gap:10px}
.sns-space-heading h2{font-size:12px}
.sns-space-toolbar p{font-size:8px}
.sns-segmented button{padding:5px 6px;font-size:7px}
.sns-space-topline{left:10px;right:10px;font-size:6px}
.sns-network-stage{min-height:345px;height:360px}
.sns-network-legend{font-size:6px;gap:10px;left:11px;right:11px}
.sns-task-dock{flex:0 0 auto;padding:11px}
.sns-operations-grid{grid-template-columns:1fr;gap:6px}
.sns-space-footer{font-size:6px;padding:0 10px}
.sns-right{display:flex;flex-direction:column;height:auto;min-height:0;gap:12px}
.sns-threat-panel{height:370px;flex:auto}
.sns-timeline-panel{height:390px;flex:auto}
.sns-threat-card h3{font-size:10px}
.sns-threat-card p{font-size:8px}
.sns-page-footer{padding:0 13px 15px;height:auto;font-size:7px;display:block;line-height:2}
.sns-asset-popover{width:235px;left:12px;top:30px}
}
@media(max-height:950px) and (min-width:1051px){
.sns-asset-total{padding:10px 14px 6px}
.sns-asset-total b{font-size:33px}
.sns-mini-metrics b{font-size:20px}
.sns-donut{width:72px;height:72px}
.sns-score-ring{width:48px;height:48px}
.sns-sparkline{height:40px}
.sns-security-score>div>span{font-size:8px}
}
@media(max-height:850px) and (min-width:1051px){
.sns-topbar{height:80px}
.sns-workspace{height:calc(100dvh - 109px);padding-top:11px}
.sns-system-title{top:0;height:80px}
.sns-system-title h1{font-size:25px}
.sns-left,.sns-right{gap:11px}
.sns-panel-heading{height:32px}
.sns-asset-total b{font-size:30px}
.sns-mini-metrics b{font-size:18px}
.sns-donut{width:60px;height:60px}
.sns-score-ring{width:43px;height:43px}
.sns-sparkline{height:31px}
.sns-network-stage{padding:25px 0 27px}
.sns-task-dock{padding:10px 13px}
.sns-threat-panel{height:auto;flex:1}
.sns-timeline-panel{height:auto;flex:1;min-height:0}
.sns-space-footer{height:25px}
}
`
    const NODES = [
      { id: 'analyst', name: '研判智能体', sub: 'ANALYST · 3 实例', icon: 'agent', type: 'smart', kind: '智能体', x: 100, y: 280, code: 'AGT-ANALYST-01', address: 'agent://soc/analyst', version: 'v2.6.1', owner: '安全运营组', note: '关联终端、网络与模型调用日志，生成风险结论及证据链。' },
      { id: 'inspector', name: '巡检智能体', sub: 'INSPECTOR · 3 实例', icon: 'agent', type: 'smart', kind: '智能体', x: 205, y: 280, code: 'AGT-INSPECT-01', address: 'agent://soc/inspector', version: 'v2.3.0', owner: '安全运维组', note: '按任务范围执行只读检查，采集健康、基线、策略与模型调用状态。' },
      { id: 'responder', name: '响应智能体', sub: 'RESPONDER · 2 实例', icon: 'agent', type: 'smart', kind: '智能体', x: 310, y: 280, code: 'AGT-RESPONSE-01', address: 'agent://soc/responder', version: 'v2.1.4', owner: '安全运营组', note: '负责处置方案与任务编排。当前工具令牌的授权范围需要复核。' },
      { id: 'gateway', name: 'AI 安全网关', sub: 'POLICY / AUDIT', icon: 'shield', type: 'smart', kind: 'AI 网关', x: 460, y: 280, code: 'AI-GW-01', address: '10.60.30.1', version: 'v3.4.2', owner: '平台安全组', note: '统一校验智能体对模型、知识库与工具的调用权限并保留审计。' },
      { id: 'qwen', name: 'Qwen2.5-72B', sub: 'LLM · 推理服务', icon: 'model', type: 'smart', kind: '大模型', x: 610, y: 280, code: 'LLM-QWEN-01', address: '10.60.30.21:8000', version: 'Qwen2.5-72B-Instruct', owner: 'AI 平台组', note: '承担安全上下文分析与巡检结果摘要。此节点代表 2 个同类模型实例。' },
      { id: 'deepseek', name: 'DeepSeek-R1', sub: 'LLM · 深度分析', icon: 'model', type: 'smart', kind: '大模型', x: 715, y: 280, code: 'LLM-DS-01', address: '10.60.30.22:8000', version: 'DeepSeek-R1', owner: 'AI 平台组', note: '承担复杂威胁链关联推理；通过 AI 安全网关访问证据上下文。' },
      { id: 'rag', name: '安全知识库', sub: 'RAG · 2 实例', icon: 'knowledge', type: 'smart', kind: '知识库', x: 820, y: 280, code: 'RAG-SEC-01', address: '10.60.30.30:6333', version: 'knowledge-2026.11', owner: '安全知识组', note: '关联安全基线、历史事件与处置剧本，提供可追溯的检索依据。' },
      { id: 'terminalA', name: '办公终端 A', sub: '10.60.10.21', icon: 'terminal', type: 'traditional', kind: '终端', x: 95, y: 480, code: 'TERM-A', address: '10.60.10.21', version: 'Windows 11 / EDR 8.2', owner: '终端管理组', note: '存在待研判进程告警。该节点代表 14 台办公终端。', state: 'risk' },
      { id: 'terminalB', name: '办公终端 B', sub: '10.60.10.22', icon: 'terminal', type: 'traditional', kind: '终端', x: 195, y: 480, code: 'TERM-B', address: '10.60.10.22', version: 'Windows 11 / EDR 8.2', owner: '终端管理组', note: '终端在线，防护服务正常。该节点代表 14 台办公终端，其中 2 台离线。' },
      { id: 'firewall', name: '业务防火墙', sub: '10.60.10.1', icon: 'firewall', type: 'traditional', kind: '防火墙', x: 345, y: 480, code: 'FW-BIZ-01', address: '10.60.10.1', version: '策略 v32 / 基线 v33', owner: '网络安全组', note: '该节点代表 4 台防火墙；业务防火墙策略版本落后于巡检基线，需要复核。', state: 'warning' },
      { id: 'switch', name: '核心交换机', sub: '10.60.20.1', icon: 'network', type: 'traditional', kind: '交换机', x: 460, y: 480, code: 'SW-CORE-01', address: '10.60.20.1', version: 'VRP 8.220', owner: '网络运维组', note: '核心交换及链路运行正常。该节点代表 5 台网络交换设备。' },
      { id: 'appA', name: '应用服务器 A', sub: '10.60.20.11', icon: 'server', type: 'traditional', kind: '服务器', x: 610, y: 480, code: 'APP-A', address: '10.60.20.11', version: 'Ubuntu 22.04 / APP 4.6', owner: '业务运维组', note: '存在与办公终端 A 关联的待研判活动。该节点代表 8 台应用服务器。', state: 'risk' },
      { id: 'appB', name: '应用服务器 B', sub: '10.60.20.12', icon: 'server', type: 'traditional', kind: '服务器', x: 715, y: 480, code: 'APP-B', address: '10.60.20.12', version: 'Ubuntu 22.04 / APP 4.6', owner: '业务运维组', note: '承担业务服务及检验流量观察。该节点代表 8 台业务服务器。', state: 'warning' },
      { id: 'database', name: '业务数据库', sub: '10.60.20.30', icon: 'database', type: 'traditional', kind: '数据库', x: 820, y: 480, code: 'DB-BIZ-01', address: '10.60.20.30', version: 'PostgreSQL 15.8', owner: '数据运维组', note: '数据库服务正常，持续审计访问来源与敏感表查询。该节点代表 6 个数据库资产。' },
    ]
    const EDGES = [
      { id: 'analyst-gateway', from: 'analyst', to: 'gateway', path: 'M100 255V242H460V255', type: 'smart' },
      { id: 'inspector-gateway', from: 'inspector', to: 'gateway', path: 'M205 255V248H460V255', type: 'smart' },
      { id: 'responder-gateway', from: 'responder', to: 'gateway', path: 'M310 280H435', type: 'smart' },
      { id: 'gateway-qwen', from: 'gateway', to: 'qwen', path: 'M485 280H585', type: 'smart' },
      { id: 'gateway-deepseek', from: 'gateway', to: 'deepseek', path: 'M460 305V337H715V305', type: 'smart' },
      { id: 'gateway-rag', from: 'gateway', to: 'rag', path: 'M460 305V345H820V305', type: 'smart' },
      { id: 'brain-gateway', from: 'brain', to: 'gateway', path: 'M460 179V255', type: 'smart' },
      { id: 'inspector-firewall', from: 'inspector', to: 'firewall', path: 'M205 305V367H345V455', type: 'smart' },
      { id: 'responder-firewall', from: 'responder', to: 'firewall', path: 'M310 305V358H345V455', type: 'smart' },
      { id: 'gateway-switch', from: 'gateway', to: 'switch', path: 'M460 305V455', type: 'smart' },
      { id: 'qwen-app', from: 'qwen', to: 'appA', path: 'M610 305V455', type: 'smart' },
      { id: 'rag-db', from: 'rag', to: 'database', path: 'M820 305V455', type: 'smart' },
      { id: 'terminalA-firewall', from: 'terminalA', to: 'firewall', path: 'M95 505V550H345V505', type: 'traditional' },
      { id: 'terminalB-firewall', from: 'terminalB', to: 'firewall', path: 'M195 455V443H345V455', type: 'traditional' },
      { id: 'firewall-switch', from: 'firewall', to: 'switch', path: 'M370 480H435', type: 'traditional' },
      { id: 'switch-appA', from: 'switch', to: 'appA', path: 'M485 480H585', type: 'traditional' },
      { id: 'switch-appB', from: 'switch', to: 'appB', path: 'M460 505V539H715V505', type: 'traditional' },
      { id: 'appA-appB', from: 'appA', to: 'appB', path: 'M635 480H690', type: 'traditional' },
      { id: 'appB-db', from: 'appB', to: 'database', path: 'M740 480H795', type: 'traditional' },
    ]
    const CATEGORY_ZONES = [
      [28, 204, 338, 149, '智能体协同区', '8 AGENTS', 'smart'],
      [398, 204, 124, 149, '智能访问边界', 'AI GATEWAY', 'smart'],
      [554, 204, 338, 149, '模型与知识服务区', '3 LLM / 2 RAG', 'smart'],
      [28, 402, 223, 151, '终端接入区', '28 ENDPOINTS', 'traditional'],
      [269, 402, 253, 151, '网络与安全边界', '9 DEVICES', 'traditional'],
      [554, 402, 338, 151, '业务服务与数据区', '22 ASSETS', 'traditional'],
    ]
    const NETWORK_ZONES = [
      [28, 204, 223, 149, '办公接入网', '10.60.10.0/24', 'traditional'],
      [269, 204, 124, 149, '安全边界', 'FW-BIZ-01', 'traditional'],
      [398, 204, 124, 149, 'AI 访问边界', '10.60.30.1', 'smart'],
      [554, 204, 338, 149, 'AI 服务网', '10.60.30.0/24', 'smart'],
      [28, 402, 338, 151, '智能体管理网', 'AGENT CONTROL', 'smart'],
      [398, 402, 124, 151, '核心交换', '10.60.20.1', 'traditional'],
      [554, 402, 338, 151, '业务与数据网', '10.60.20.0/24', 'traditional'],
    ]
    // 设备分类视图：智能体与模型在上排分区，终端与业务在下排分区。
    const POS_2D = {
      analyst: [70, 280], inspector: [200, 280], responder: [330, 280], gateway: [460, 280], qwen: [590, 280],
      deepseek: [720, 280], rag: [850, 280], terminalA: [70, 480], terminalB: [200, 480], firewall: [330, 480],
      switch: [460, 480], appA: [590, 480], appB: [720, 480], database: [850, 480],
    }
    const POS_2D_NETWORK = {
      analyst: [70, 480], inspector: [200, 480], responder: [330, 480], gateway: [460, 480], qwen: [590, 480],
      deepseek: [720, 480], rag: [850, 480], terminalA: [70, 280], terminalB: [200, 280], firewall: [330, 280],
      switch: [460, 280], appA: [590, 280], appB: [720, 280], database: [850, 280],
    }
    const SPATIAL = {
      analyst: [-19, -9], inspector: [-14, -9], responder: [-9, -9], gateway: [-10, 0], qwen: [5, -9],
      deepseek: [10, -9], rag: [15, -9], terminalA: [-13, 10], terminalB: [-7, 10], firewall: [-2.2, 12],
      switch: [2.2, 12], appA: [6, 6], appB: [11, 6], database: [16, 6],
    }
    const SPATIAL_NETWORK = {
      analyst: [-16, 8], inspector: [-11, 8], responder: [-6, 8], gateway: [-11, 0], qwen: [4, 8],
      deepseek: [9, 8], rag: [14, 8], terminalA: [-16, -8], terminalB: [-11, -8], firewall: [-5, 0],
      switch: [0, 0], appA: [6, -8], appB: [11, -8], database: [16, -8],
    }
    const spatialZone = (x, z, w, d, title, sub, type) => [460 + (x - w / 2) * 25, 375 + (z - d / 2) * 22, w * 25, d * 22, title, sub, type]
    const SPATIAL_CATEGORY_ZONES = [
      spatialZone(-13, -8, 13, 6, '智能体协同区', '8 AGENTS', 'smart'),
      spatialZone(-10, 0, 6, 5, '智能访问边界', 'AI GATEWAY', 'smart'),
      spatialZone(9, -8, 13, 6, '模型与知识服务区', '3 LLM / 2 RAG', 'smart'),
      spatialZone(-10, 8, 10, 6, '终端接入区', '28 ENDPOINTS', 'traditional'),
      spatialZone(0, 11, 8, 5, '网络与安全边界', '9 DEVICES', 'traditional'),
      spatialZone(10, 5, 13, 7, '业务服务与数据区', '22 ASSETS', 'traditional'),
    ]
    const SPATIAL_NETWORK_ZONES = [
      spatialZone(-12, -8, 10, 6, '办公接入网', '10.60.10.0/24', 'traditional'),
      spatialZone(-5.8, 2.7, 4.5, 4.5, '安全边界', 'FW-BIZ-01', 'traditional'),
      spatialZone(-11.5, 0, 5.5, 4.5, 'AI 访问边界', '10.60.30.1', 'smart'),
      spatialZone(9, -8, 13, 6, 'AI 服务网', '10.60.30.0/24', 'smart'),
      spatialZone(-9, 8, 13, 6, '智能体管理网', 'AGENT CONTROL', 'smart'),
      spatialZone(0, 11, 5.5, 5, '核心交换', '10.60.20.1', 'traditional'),
      spatialZone(10, 5, 13, 7, '业务与数据网', '10.60.20.0/24', 'traditional'),
    ]

    // 坐标沿用原型三维场景的设备槽位，保证节点标签与原型建筑、分区对齐；数据内容仍为真实来源。
    const SLOT_AGENT = [[70, 280, -19, -9], [200, 280, -14, -9], [330, 280, -9, -9], [460, 280, -10, 0]]
    const SLOT_MODEL = [[590, 280, 5, -9], [720, 280, 10, -9]]
    const SLOT_DEVICE = [[70, 480, -13, 10], [200, 480, -7, 10], [330, 480, -2.2, 12], [460, 480, 2.2, 12]]
    const SLOT_IDS_AGENT = ['analyst', 'inspector', 'responder', 'gateway']
    const SLOT_IDS_MODEL = ['qwen', 'deepseek']
    const SLOT_IDS_DEVICE = ['terminalA', 'terminalB', 'firewall', 'switch']
    const SLOT_IDS_INVESTIGATION = ['terminalA', 'firewall', 'switch', 'appA', 'appB', 'database']
    const SLOT_INVESTIGATION = [[70, 480, -13, 10], [200, 480, -7, 10], [330, 480, -2.2, 12], [460, 480, 2.2, 12], [590, 480, 6, 6], [720, 480, 11, 6]]
    const AGGREGATE_GROUPS = [
      { key: 'terminal', label: '终端接入', sub: 'ENDPOINTS', icon: 'terminal', kinds: ['host'] },
      { key: 'server', label: '业务服务', sub: 'SERVERS', icon: 'server', kinds: ['server'] },
      { key: 'network', label: '网络交换', sub: 'NETWORK', icon: 'network', kinds: ['switch', 'router'] },
      { key: 'security', label: '安全边界', sub: 'SECURITY', icon: 'shield', kinds: ['firewall', 'waf', 'edr', 'siem', 'epp', 'vuln_scanner', 'unknown'] },
    ]
    const spatialOf = (px, py) => [(px - 460) / 25, (py - 375) / 22]
    const zoneOf = (px, py, w, d, title, sub, type) => {
      const x = (px - 460) / 25, z = (py - 375) / 22
      return [460 + (x - w / 2) * 25, 375 + (z - d / 2) * 22, w * 25, d * 22, title, sub, type]
    }
    function buildOverview(platform, assetItems) {
      const agents = (platform?.agents || []).slice(0, 4), models = (platform?.models || []).slice(0, 2)
      const nodes = [], spatial = {}, pos2d = {}, edges = []
      agents.forEach((agent, index) => {
        const slot = SLOT_AGENT[Math.min(index, SLOT_AGENT.length - 1)]
        nodes.push({ id: agent.id, slot: SLOT_IDS_AGENT[Math.min(index, SLOT_IDS_AGENT.length - 1)], name: agent.name, sub: agent.isDefault ? 'PRIMARY · 默认' : 'SUB AGENT', icon: 'agent', type: 'smart', kind: '智能体',
          code: agent.agentId, address: 'DSH agentPresets', version: '', owner: '监控平台', note: agent.description || '平台运行时智能体', state: agent.broken ? 'warning' : undefined })
        spatial[agent.id] = [slot[2], slot[3]]; pos2d[agent.id] = [slot[0], slot[1]]
      })
      models.forEach((model, index) => {
        const slot = SLOT_MODEL[Math.min(index, SLOT_MODEL.length - 1)]
        nodes.push({ id: model.id, slot: SLOT_IDS_MODEL[Math.min(index, SLOT_IDS_MODEL.length - 1)], name: model.name, sub: `LLM · ${model.provider}`, icon: 'model', type: 'smart', kind: '大模型',
          code: model.model, address: model.provider, version: '', owner: '监控平台', note: '当前实例运行的模型，属于监控平台自身。' })
        spatial[model.id] = [slot[2], slot[3]]; pos2d[model.id] = [slot[0], slot[1]]
        if (agents[0]) edges.push({ id: `${SLOT_IDS_AGENT[0]}-${SLOT_IDS_MODEL[Math.min(index, SLOT_IDS_MODEL.length - 1)]}`, from: SLOT_IDS_AGENT[0], to: SLOT_IDS_MODEL[Math.min(index, SLOT_IDS_MODEL.length - 1)], type: 'smart', evidence: 'architectural' })
      })
      const counts = new Map()
      for (const item of assetItems || []) {
        const group = AGGREGATE_GROUPS.find(entry => entry.kinds.includes(String(item.assetType || '').toLowerCase())) || AGGREGATE_GROUPS[3]
        const row = counts.get(group.key) || { group, total: 0, online: 0 }
        row.total += 1; if (item.online === 'online') row.online += 1
        counts.set(group.key, row)
      }
      AGGREGATE_GROUPS.forEach((group, index) => {
        const row = counts.get(group.key) || { total: 0, online: 0 }
        const slot = SLOT_DEVICE[Math.min(index, SLOT_DEVICE.length - 1)], id = `agg:${group.key}`
        nodes.push({ id, slot: SLOT_IDS_DEVICE[Math.min(index, SLOT_IDS_DEVICE.length - 1)], name: group.label, sub: `${group.sub} · ${row.total} 项`, icon: group.icon, type: 'traditional', kind: '聚合资产',
          code: `AGG-${group.key.toUpperCase()}`, address: `${row.total} 项资产`, version: `在线 ${row.online} / 共 ${row.total}`,
          owner: '业务资产', note: `按资产类型聚合示意，不代表实测链路；在线 ${row.online} 项。`, count: row.total, online: row.online })
        spatial[id] = [slot[2], slot[3]]; pos2d[id] = [slot[0], slot[1]]
      })
      const zones = [
        ...(agents.length + models.length ? [[28, 204, 338, 149, '智能体协同区', `${agents.length} AGENTS`, 'smart']] : []),
        ...(models.length ? [[554, 204, 338, 149, '模型与知识服务区', `${models.length} LLM`, 'smart']] : []),
        [28, 402, 338, 151, '终端与业务资产', 'AGGREGATED', 'traditional'],
        [398, 402, 124, 151, '网络与安全边界', 'AGGREGATED', 'traditional'],
      ]
      return { nodes, edges, spatial, pos2d, zones, spatialZones: zones.map(z => zoneOf(z[0] + z[2] / 2, z[1] + z[3] / 2, z[2] / 25, z[3] / 22, z[4], z[5], z[6])) }
    }
    const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
    function buildInvestigation(report, assetItems, stepIndex) {
      const parsed = report?.parsed
      if (!parsed) return { nodes: [], edges: [], spatial: {}, pos2d: {}, zones: [], spatialZones: [], chain: [], focus: [] }
      const chain = parsed.chain || []
      const current = chain[stepIndex] || chain[0] || null
      const ips = new Set()
      for (const step of chain) for (const ip of String(step.text || '').match(IP_RE) || []) ips.add(ip)
      for (const action of parsed.actions || []) for (const target of action.targets || []) for (const ip of String(target).match(IP_RE) || []) ips.add(ip)
      const devices = []
      for (const ip of [...ips].slice(0, 6)) {
        const asset = (assetItems || []).find(item => item.address === ip || item.ip === ip) || null
        devices.push({ id: `dev:${ip}`, ip, name: asset?.name || ip, type: asset?.assetType || 'unknown', online: asset?.online || 'unknown' })
      }
      const nodes = [], spatial = {}, pos2d = {}, edges = []
      devices.forEach((device, index) => {
        const slot = SLOT_INVESTIGATION[Math.min(index, SLOT_INVESTIGATION.length - 1)]
        nodes.push({ id: device.id, slot: SLOT_IDS_INVESTIGATION[Math.min(index, SLOT_IDS_INVESTIGATION.length - 1)], name: device.name, sub: device.ip, icon: device.type === 'server' ? 'server' : device.type === 'firewall' ? 'firewall' : 'terminal',
          type: 'traditional', kind: '链路资产', code: device.ip, address: device.ip, version: '', owner: '业务资产',
          note: '由研判报告提取的链路实体，未登记时仅显示 IP。', state: device.online === 'offline' ? 'warning' : undefined })
        spatial[device.id] = [slot[2], slot[3]]; pos2d[device.id] = [slot[0], slot[1]]
        if (index) {
          const from = SLOT_IDS_INVESTIGATION[Math.min(index - 1, SLOT_IDS_INVESTIGATION.length - 1)]
          const to = SLOT_IDS_INVESTIGATION[Math.min(index, SLOT_IDS_INVESTIGATION.length - 1)]
          edges.push({ id: `${from}-${to}`, from, to, type: current?.type === 'speculative' ? 'speculative' : 'traditional' })
        }
      })
      const focus = current ? (String(current.text || '').match(IP_RE) || []) : []
      const zones = nodes.length ? [[28, 402, 840, 151, '调查链路 · 研判报告提取', current?.type === 'speculative' ? 'SPECULATIVE' : 'OBSERVED', current?.type === 'speculative' ? 'traditional' : 'smart']] : []
      return { nodes, edges, spatial, pos2d, zones, spatialZones: zones.map(z => zoneOf(z[0] + z[2] / 2, z[1] + z[3] / 2, z[2] / 25, z[3] / 22, z[4], z[5], z[6])), chain, focus }
    }
    let SCENE = { nodes: NODES, edges: EDGES, spatial: SPATIAL, spatialNetwork: SPATIAL_NETWORK, pos2d: POS_2D, pos2dNetwork: POS_2D_NETWORK,
      zones: SPATIAL_CATEGORY_ZONES, zonesNetwork: SPATIAL_NETWORK_ZONES, pixels: CATEGORY_ZONES, pixelsNetwork: NETWORK_ZONES }
    const FEED = [
      { id: 'f1', sev: 'high', title: '已发现横向移动攻击', meta: 'EDR · NDR', time: '14:21:03', text: '终端 A → 应用 A → 应用 B · 2 项已确认 / 1 项待核查' },
      { id: 'f2', sev: 'high', title: '智能体工具调用越权尝试', meta: 'AI 网关 · 审计', time: '14:08:37', text: '响应智能体 · 高风险工具调用已拒绝' },
      { id: 'f3', sev: 'medium', title: '业务数据库异常批量读取', meta: '数据库 · 流量', time: '13:56:12', text: '应用 B → 业务数据库 · 访问模式偏离' },
      { id: 'f4', sev: 'low', title: '资产配置基线偏移', meta: '基线 · 巡检', time: '13:41:55', text: '业务防火墙策略版本落后于巡检基线，已生成待复核项' },
      { id: 'f5', sev: 'medium', title: '模型调用延迟升高', meta: 'AI 平台 · 监控', time: '13:22:40', text: 'Qwen2.5-72B 推理时延高于基线 1.8 倍，已记录观察' },
    ]
    const TIMELINE = [
      { id: 's1', title: '感知智能体', time: '08:56:52', note: '归集终端、网络与智能调用记录 · 14 个代表节点 · 73 项资产', active: true },
      { id: 's2', title: '研判智能体', time: '08:56:56', note: '关联异常进程与边界会话 · TH-1103-018 · 7 条证据', active: true },
      { id: 's3', title: '研判智能体', time: '08:56:58', note: '调用 DeepSeek-R1 完成关联分析 · 上下文已脱敏', active: true },
      { id: 's4', title: '权限智能体', time: '08:57:02', note: '核验高风险工具调用的任务权限 · 越权请求已拒绝', active: true },
      { id: 's5', title: '响应智能体', time: '08:57:08', note: '生成终端与服务器处置建议 · 待审批', active: true },
      { id: 's6', title: '审计智能体', time: '—', note: '归档研判结论与操作证据 · 等待任务结束', future: true },
    ]
    const ICONS = {
      agent: [['circle', { cx: 12, cy: 9, r: 5 }], ['path', { d: 'M4 20c1.5-3 4.2-4.5 8-4.5s6.5 1.5 8 4.5M12 2v2M5 6l-2-1M19 6l2-1' }], ['circle', { cx: 10, cy: 9, r: .7 }], ['circle', { cx: 14, cy: 9, r: .7 }]],
      model: [['rect', { x: 6, y: 6, width: 12, height: 12, rx: 2 }], ['path', { d: 'M9 9h6v6H9zM4 10h2m12 0h2M4 14h2m12 0h2M10 4v2m4-2v2m-4 12v2m4-2v2' }]],
      knowledge: [['path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z' }], ['path', { d: 'M4 5.5v15M8 7h8M8 11h8M8 15h5' }]],
      shield: [['path', { d: 'm12 2 8 3v6c0 5-8 10-8 10S4 16 4 11V5Z' }], ['path', { d: 'm8 11 3 3 5-6' }]],
      terminal: [['rect', { x: 3, y: 4, width: 18, height: 11, rx: 2 }], ['path', { d: 'M8 20h8M10 15v5m4-5v5M7 8h10' }]],
      firewall: [['path', { d: 'M3 7h18v14H3zM3 11h18M3 16h18M7 7v4m5-4v4m5-4v4M9 2h6' }]],
      server: [['rect', { x: 4, y: 4, width: 16, height: 6, rx: 1.5 }], ['rect', { x: 4, y: 14, width: 16, height: 6, rx: 1.5 }], ['path', { d: 'M7 7h1m3 0h6M7 17h1m3 0h6' }]],
      database: [['ellipse', { cx: 12, cy: 5, rx: 8, ry: 3 }], ['path', { d: 'M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0' }]],
      network: [['rect', { x: 3, y: 7, width: 18, height: 10, rx: 2 }], ['path', { d: 'M7 12h2m3 0h2m3 0h2M8 17v3m8-3v3' }]],
      grid: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }]],
      activity: [['path', { d: 'M2 13h5l3-9 4 16 3-7h5' }]],
      clock: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 6v6l4 2' }]],
      expand: [['path', { d: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5' }]],
      send: [['path', { d: 'm3 3 19 9-19 9 4-9Zm4 9h15' }]],
    }
    function icon(name, size = 18) {
      const parts = ICONS[name] || ICONS.grid
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true },
        ...parts.map(([tag, props], index) => h(tag, { key: index, ...props })))
    }
    const pad = (v) => String(v).padStart(2, '0')
    const clockText = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    const dateText = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} GMT${d.getTimezoneOffset() <= 0 ? '+' : '-'}${Math.abs(d.getTimezoneOffset() / 60)}`
    const num = (v) => typeof v === 'number' && Number.isFinite(v) ? String(v) : '—'
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
    function useClock() { const [now, setNow] = useState(() => new Date()); useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, []); return now }
    function usePoll(fetcher, deps, every) {
      const ref = useRef(fetcher)
      ref.current = fetcher
      const [state, setState] = useState({ status: 'loading', data: null })
      useEffect(() => {
        let alive = true, timer = null
        async function run() {
          try { const value = await ref.current(); if (alive) setState({ status: 'ok', data: value }) }
          catch (error) { if (alive) setState((previous) => ({ status: previous.data ? 'stale' : 'unavailable', data: previous.data })) }
          finally { if (alive && every > 0) timer = setTimeout(run, every) }
        }
        run()
        return () => { alive = false; if (timer) clearTimeout(timer) }
      }, deps)
      return state
    }
    const AGENT_STATE_TEXT = { running: '执行中', idle: '空闲', unknown: '状态未知' }
    const TOOL_STATE_TEXT = { running: '执行中', completed: '已完成', failed: '失败', unknown: '状态未知' }
    const SEMANTIC_TEXT = { scan: '资产查询', path: '路径查询', policy: '基线核验', analyze: '证据分析', complete: '已完成', unknown: '工具调用' }
    const PLACEHOLDER_ROLES = [
      { id: 'delegate_threat_analysis', title: '威胁研判子智能体', state: 'unknown' },
      { id: 'delegate_fault_analysis', title: '故障分析子智能体', state: 'unknown' },
      { id: 'delegate_response_planning', title: '响应规划子智能体', state: 'unknown' },
    ]
    const agentCount = (value) => typeof value === 'number' && Number.isFinite(value) ? String(value) : '—'
    const agentStateText = (value) => AGENT_STATE_TEXT[value] || '状态未知'
    const toolStateText = (value) => TOOL_STATE_TEXT[value] || '状态未知'
    const semanticText = (value) => SEMANTIC_TEXT[value] || '工具调用'
    const TOOL_NAME_TEXT = {
      skill: '加载技能', send_message: '发送消息', write: '文件写入', read: '读取文件', edit: '修改文件',
      delegate_threat_analysis: '委派威胁研判', delegate_fault_analysis: '委派故障分析', delegate_response_planning: '委派响应规划',
      list_soc_asset: '资产查询', get_soc_asset_by_asset_id: '资产详情', get_graph_node_detail: '图谱节点',
      inspection_routine: '常规巡检', inspection_deep: '深度巡检', inspection_baseline: '基线核验',
      get_graph_path_query: '路径查询', get_reachability_path_by_ip: '可达性查询',
      list_mcp_resources: 'MCP 资源目录', list_mcp_resource_templates: 'MCP 模板目录',
      get_correlate_incident_stats: '事件统计', get_correlate_incident: '事件详情',
      get_correlate_incident_list: '事件列表', list_soc_assets: '资产查询',
    }
    const mcpBase = (name) => name.startsWith('mcp__') ? name.slice(name.lastIndexOf('__') + 2) : name
    const THREAT_TYPE_TEXT = {
      SUSPECTED_INTRUSION_REASONING: '疑似入侵', LATERAL_MOVEMENT_REASONING: '横向移动',
      HOST_COMPROMISE_REASONING: '主机失陷', DATA_EXFILTRATION_REASONING: '数据外传',
    }
    const threatTypeText = (value) => THREAT_TYPE_TEXT[value] || '威胁事件'
    const APPROVAL_TEXT = { 'allowed-once': '已批准（单次）', rejected: '已拒绝', cancelled: '已取消', unavailable: '无法审批' }
    const approvalText = (value) => APPROVAL_TEXT[value] || '待确认'
    const ERROR_TEXT = {
      FS_SANDBOX_DENIED: '沙箱拒绝写入', TOOL_OUTCOME_UNKNOWN: '结果未知', TOOL_ERROR: '工具执行失败',
      UNAUTHORIZED: '未授权', SERVICE_UNAVAILABLE: '服务暂不可用',
    }
    const errorText = (code) => ERROR_TEXT[code] || (typeof code === 'string' && code.startsWith('HTTP_') ? '请求失败' : (code ? '执行失败' : '未返回错误原因'))
    const toolTitle = (row) => TOOL_NAME_TEXT[row.name] || TOOL_NAME_TEXT[mcpBase(row.name)] || (row.name.startsWith('mcp__') ? '业务查询' : (row.name === 'write' ? '文件写入' : semanticText(row.semantic)))
    const durationText = (row) => typeof row.durationMs === 'number' ? `${row.durationMs}ms` : '—'
    const toolDetail = (row) => {
      const base = `${toolStateText(row.status)} · ${durationText(row)}`
      if (row.status === 'failed') return `${base} · ${errorText(row.error?.code)}`
      return row.result?.summary ? `${base} · ${row.result.summary}` : base
    }
    const clockOf = (value) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` : '—' }
    function project3d(x, y, z, camera, width, height) {
      const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), ct = Math.cos(camera.tilt), st = Math.sin(camera.tilt)
      const rx = x * cy + z * sy
      const rz = -x * sy + z * cy
      const ry = y * ct - rz * st
      const depth = y * st + rz * ct
      const scale = camera.zoom
      return { x: width / 2 + (rx / 21) * (width / 2) * scale, y: height / 2 - (ry / 9) * (height / 2) * scale, depth }
    }
    function spatialPoint(id, topology) {
      const pair = topology === 'network' && SCENE.spatialNetwork[id] ? SCENE.spatialNetwork[id] : SCENE.spatial[id]
      return { x: (pair[0] * 25) / 25, z: (pair[1] * 22) / 22 }
    }
    function node2d(id, topology) {
      const table = topology === 'network' ? SCENE.pos2dNetwork : SCENE.pos2d
      const pair = table[id] || SCENE.pos2d[id]
      return pair ? { x: pair[0], y: pair[1] } : null
    }
    function nodeState(node) { return node.state === 'risk' ? 'risk' : node.state === 'warning' ? 'warning' : 'ok' }
    function scenePalette(node) { return node.type === 'smart' ? { top: [0.28, 0.22, 0.62], side: [0.13, 0.11, 0.34], edge: [0.63, 0.53, 1] } : { top: [0.05, 0.24, 0.36], side: [0.02, 0.12, 0.2], edge: [0.16, 0.85, 1] } }
    function createScene(canvas) {
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      let disposed = false
      return {
        draw(faces) {
          if (disposed || !faces) return
          const ratio = Math.min(2, window.devicePixelRatio || 1)
          const w = Math.max(1, Math.round(canvas.clientWidth * ratio))
          const hh = Math.max(1, Math.round(canvas.clientHeight * ratio))
          if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh }
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
          ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
          for (const face of faces) {
            ctx.beginPath()
            face.pts.forEach((point, index) => { if (index) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y) })
            ctx.closePath()
            ctx.fillStyle = face.fill
            ctx.fill()
            if (face.stroke) { ctx.strokeStyle = face.stroke; ctx.lineWidth = face.width || 1; ctx.stroke() }
          }
        },
        dispose() { disposed = true },
      }
    }
    function buildFaces(nodes, topology, camera, width, height) {
      const project = (x, y, z) => project3d(x, y, z, camera, width, height)
      const faces = []
      const quad = (pts, fill, stroke, lineWidth = 1) => {
        const depth = pts.reduce((sum, point) => sum + point.depth, 0) / pts.length
        faces.push({ pts, fill, stroke, width: lineWidth, depth })
      }
      quad([project(-16, 0, -10), project(16, 0, -10), project(16, 0, 13), project(-16, 0, 13)], 'rgba(6,22,46,.5)', 'rgba(40,100,150,.22)')
      const zones = topology === 'network' ? SCENE.zonesNetwork : SCENE.zones
      zones.forEach((zone) => {
        const x = (zone[0] - 460) / 25, z = (zone[1] - 375) / 22, w = zone[2] / 25, d = zone[3] / 22
        const smart = zone[6] === 'smart'
        quad([project(x, 0, z), project(x + w, 0, z), project(x + w, 0, z + d), project(x, 0, z + d)],
          smart ? 'rgba(24,20,72,.58)' : 'rgba(4,38,54,.58)',
          smart ? 'rgba(80,110,255,.52)' : 'rgba(30,150,190,.48)', 1.1)
      })
      nodes.forEach((node) => {
        const point = spatialPoint(node.id, topology)
        const smart = node.type === 'smart'
        const s = smart ? 0.62 : 0.55, height3d = smart ? 1.05 : 0.72
        const base = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([dx, dz]) => [point.x + dx, point.z + dz])
        const bottom = base.map(([x, z]) => project(x, 0, z))
        const top = base.map(([x, z]) => project(x, height3d, z))
        const sideFill = smart ? 'rgba(52,42,132,.92)' : 'rgba(8,56,82,.92)'
        const sideStroke = smart ? 'rgba(150,134,255,.85)' : 'rgba(40,180,220,.8)'
        for (let i = 0; i < 4; i += 1) {
          const j = (i + 1) % 4
          quad([bottom[i], bottom[j], top[j], top[i]], sideFill, sideStroke, 1.1)
        }
        quad([top[0], top[1], top[2], top[3]],
          smart ? 'rgba(92,76,214,.96)' : 'rgba(14,92,130,.96)',
          smart ? 'rgba(196,180,255,.95)' : 'rgba(96,224,255,.92)', 1.2)
      })
      return faces.sort((a, b) => b.depth - a.depth)
    }
    function Stage({ nodes, topology, mode, camera, selected, onSelect, t, sceneKey }) {
      const host = useRef(null)
      const host3d = useRef(null)
      const scene = useRef(null)
      const [size, setSize] = useState({ w: 900, h: 560 })
      const [labels, setLabels] = useState([])
      const [sceneReady, setSceneReady] = useState(false)
      const [stageReady, setStageReady] = useState(false)
      const [tick, setTick] = useState(0)
      useEffect(() => {
        if (mode !== '3d') return
        // 遮罩至少覆盖首帧渲染与相机生效窗口，避免出现空白深蓝画布。
        const timer = setTimeout(() => setStageReady(true), 1600)
        return () => clearTimeout(timer)
      }, [mode, sceneKey])
      useEffect(() => {
        if (mode !== '3d' || !sceneKey) return
        const element = host3d.current
        if (!element || typeof window.createSOC6DeviceSpace !== 'function') return
        // 三维场景按原型槽位 id 选型；命中的槽位再映射回真实节点，保证标签文字与模型位置一致。
        const instance = window.createSOC6DeviceSpace({ host: element, D: DATA, onSelect: (id) => {
          if (!id || id === 'brain') return
          const hit = nodes.find(node => node.slot === id)
          if (hit) onSelect(hit.id)
        } })
        scene.current = instance
        window.__SNS_SCENE__ = instance
        setSceneReady(true)
        setStageReady(false)
        try { instance.setVisible(true) } catch (error) {}
        return () => { setSceneReady(false); setStageReady(false); try { instance.setVisible(false) } catch (error) { window.__SNS_SCENE_ERROR__ = String(error?.stack || error) } try { instance.dispose?.() } catch (error) {} scene.current = null }
      }, [mode, sceneKey])
      useEffect(() => {
        const element = host.current
        if (!element) return
        const measure = () => setSize({ w: element.clientWidth || 900, h: element.clientHeight || 560 })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
      }, [])
      const layout = useMemo(() => {
        const positions = {}
        nodes.forEach((node) => {
          const pair = topology === 'network' && SCENE.spatialNetwork[node.id] ? SCENE.spatialNetwork[node.id] : SCENE.spatial[node.id]
          if (pair) positions[node.id] = { x: 460 + pair[0] * 25, y: 375 + pair[1] * 22 }
        })
        return { positions, zones: topology === 'network' ? SCENE.zonesNetwork : SCENE.zones }
      }, [nodes, topology])
      // 布局与分区都只覆盖真实数据：没有节点的分类不再画区域，区域尺寸按该类节点数量与分布计算。
      const stageLayout = useMemo(() => {
        const present = nodes.filter(node => node.slot && SPATIAL[node.slot])
        const positions = Object.fromEntries(present.map(node => [node.slot, { x: 460 + SPATIAL[node.slot][0] * 25, y: 375 + SPATIAL[node.slot][1] * 22 }]))
        const groups = new Map()
        for (const node of present) {
          const kind = node.kind === '智能体' ? 'agent' : node.kind === '大模型' ? 'model' : 'device'
          const list = groups.get(kind) || []
          list.push(positions[node.slot]); groups.set(kind, list)
        }
        const zones = []
        for (const [kind, points] of groups) {
          const xs = points.map(point => point.x), ys = points.map(point => point.y)
          const padX = kind === 'device' ? 90 : 110, padY = 62
          const width = Math.max(210, Math.max(...xs) - Math.min(...xs) + padX * 2)
          const height = Math.max(132, Math.max(...ys) - Math.min(...ys) + padY * 2)
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
          const [title, sub, type] = kind === 'agent' ? ['智能体协同区', `${points.length} AGENTS`, 'smart']
            : kind === 'model' ? ['模型与知识服务区', `${points.length} MODELS`, 'smart']
              : ['终端接入区', `${points.length} ASSETS`, 'traditional']
          zones.push([cx - width / 2, cy - height / 2, width, height, title, sub, type])
        }
        return { positions, zones }
      }, [nodes])
      useEffect(() => {
        const instance = scene.current, element = host3d.current
        if (!instance || !element || mode !== '3d') return
        let raf = 0
        const apply = () => {
          try {
            instance.setVisible(true)
            instance.resize(element.clientWidth, element.clientHeight)
            instance.layout(stageLayout.positions, stageLayout.zones, 'category')
            // 原型在 setCamera 前会先跑一次 update，让标签与扫描状态就绪；否则包围盒只含大脑，相机被拉到贴面。
            try { instance.update({}) } catch (error) {}
            instance.setCamera(camera)
            instance.draw()
            const canvas = element.querySelector('canvas')
            window.__SNS_CANVAS__ = canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight } : null
            // 相机与包围盒稳定后通知标签重算一次，避免首帧沿用未设相机时的投影。
            setTick((value) => value + 1)
          } catch (error) { window.__SNS_SCENE_ERROR__ = String(error?.stack || error) }
        }
        // 立即应用一次，再补一帧：容器尺寸与包围盒在首次创建时可能尚未稳定。
        apply()
        raf = requestAnimationFrame(apply)
        const timer = setTimeout(apply, 350)
        return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
      }, [stageLayout, camera, mode, size, topology])
      useEffect(() => {
        if (mode !== '3d' || !sceneReady) return
        const instance = scene.current
        if (!instance || typeof instance.project !== 'function') return
        let cancelled = false
        const frame = requestAnimationFrame(() => {
          if (cancelled) return
          const next = []
          nodes.forEach((node) => {
            const p = layout.positions[node.id] || layout.positions[node.slot]
            if (!p) return
            try { const q = instance.project(p.x, p.y, 0); next.push({ node, x: q.x, y: q.y }) } catch (error) {}
          })
          setLabels(next)
        })
        return () => { cancelled = true; cancelAnimationFrame(frame) }
      }, [nodes, layout, camera, topology, mode, size, sceneKey, sceneReady, tick])
      return h('div', { className: 'sns-network-stage', ref: host },
        h('div', { className: 'sns-device-host', ref: host3d }),
        !stageReady && h('div', { className: 'sns-stage-loading', role: 'status' },
          h('i', { className: 'sns-stage-spinner' }), h('span', null, '正在装载三维网络空间…')),
        h('div', { className: 'sns-space-topline' },
          h('span', null, h('i', { className: 'sns-dot good' }), topology === 'category' ? t('runningAll') : t('byNetwork')),
          h('span', null, `${nodes.length} ${t('nodeCount')}`)),
        // 三维模式的名称文字由场景内 3D 标签随模型渲染（旋转缩放时同步），不再叠加 HTML 标签。
        // 三维文字由场景内的矢量标签随模型渲染；HTML 标签只用于二维视图，避免两层文字重复。
        h('div', { className: 'sns-node-layer' }, ...(mode === '3d' ? [] : labels.map(({ node, x, y }) => h('button', {
          key: node.id, type: 'button', className: `sns-node-label ${nodeState(node)}`,
          style: { left: `${x}px`, top: `${y}px` },
          onClick: () => onSelect(node.id), 'aria-label': `${node.name}，${node.kind}，查看详情`,
        }, node.name, h('small', null, node.sub))))),
        h('div', { className: 'sns-network-legend' },
          h('span', null, h('i', { className: 'sns-legend-line' }), t('legendBiz')),
          h('span', null, h('i', { className: 'sns-legend-line violet' }), t('legendSmart')),
          h('span', null, h('i', { className: 'sns-work-sample' }), t('legendRunning')),
          h('span', null, h('i', { className: 'sns-dot good' }), t('legendOk')),
          h('span', null, h('i', { className: 'sns-dot amber' }), t('legendReview')),
          h('span', null, h('i', { className: 'sns-dot red' }), t('legendRisk')),
          h('small', null, t('legendNote'))))
    }
    function SvgStage({ nodes, topology, selected, onSelect }) {
      const zones = topology === 'network' ? SCENE.pixelsNetwork : SCENE.pixels
      const point = (id) => node2d(id, topology)
      const route = (edge) => {
        if (edge.from === 'brain') { const target = point(edge.to); return target ? `M460 179 L${target.x} ${target.y}` : '' }
        if (topology === 'category') return edge.path
        const a = point(edge.from), b = point(edge.to)
        if (!a || !b) return ''
        const horizontal = Math.abs(b.x - a.x) > Math.abs(b.y - a.y)
        let pts
        if (horizontal) { const sign = Math.sign(b.x - a.x), mid = (a.x + b.x) / 2; pts = [[a.x + sign * 25, a.y], [mid, a.y], [mid, b.y], [b.x - sign * 25, b.y]] }
        else { const sign = Math.sign(b.y - a.y), mid = (a.y + b.y) / 2; pts = [[a.x, a.y + sign * 25], [a.x, mid], [b.x, mid], [b.x, b.y - sign * 25]] }
        return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
      }
      return h('svg', { className: 'sns-stage-svg', viewBox: '0 0 920 590', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': '网络空间拓扑' },
        h('defs', null,
          h('pattern', { id: 'sns-grid2d', width: '32', height: '32', patternUnits: 'userSpaceOnUse' },
            h('path', { d: 'M32 0H0V32', fill: 'none', stroke: '#153d70', strokeOpacity: '.32', strokeWidth: '.6' })),
          h('radialGradient', { id: 'sns-brain-halo' }, h('stop', { stopColor: '#2555e4', stopOpacity: '.16' }), h('stop', { offset: '1', stopColor: '#2555e4', stopOpacity: '0' }))),
        h('rect', { width: 920, height: 590, fill: 'url(#sns-grid2d)', stroke: 'none' }),
        h('g', null,
          h('ellipse', { cx: 460, cy: 117, rx: 350, ry: 145, fill: 'url(#sns-brain-halo)' }),
          h('image', { href: BRAIN, x: 310, y: 6, width: 300, height: 188, opacity: '.95', style: { mixBlendMode: 'screen' } }),
          h('text', { className: 'sns-node-name', x: 460, y: 148, textAnchor: 'middle' }, 'AI 安全大脑'),
          h('text', { className: 'sns-node-sub', x: 460, y: 162, textAnchor: 'middle' }, 'AI SECURITY BRAIN'),
          h('path', { d: 'M460 179V255', fill: 'none', stroke: '#6970bb', strokeOpacity: '.5', strokeDasharray: '4 6' })),
        ...zones.map((zone) => h('g', { key: `${zone[4]}-${zone[0]}`, className: `sns-zone ${zone[6] === 'smart' ? 'smart-zone' : 'traditional-zone'}` },
          h('rect', { className: 'sns-zone-plane', x: zone[0], y: zone[1], width: zone[2], height: zone[3], rx: 6 }),
          h('text', { className: 'sns-zone-title', x: zone[0] + 14, y: zone[1] + 20 }, zone[4]),
          h('text', { className: 'sns-zone-meta', x: zone[0] + zone[2] - 12, y: zone[1] + 20, textAnchor: 'end' }, zone[5]))),
        ...SCENE.edges.map((edge) => {
          if (edge.from !== 'brain' && !point(edge.from)) return null
          return h('g', { key: edge.id },
            h('path', { className: 'sns-edge-path', d: route(edge) }),
            h('path', { className: 'sns-edge-flow', d: route(edge) }))
        }),
        ...nodes.map((node) => {
          const p = point(node.id), state = nodeState(node)
          if (!p) return null
          return h('g', {
            key: node.id, className: `sns-node ${node.type} ${state} ${selected === node.id ? 'selected' : ''}`,
            transform: `translate(${p.x} ${p.y})`, role: 'button', tabIndex: 0,
            onClick: () => onSelect(node.id), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id) } },
            'aria-label': `${node.name}，${node.kind}，查看详情`,
          },
            h('rect', { className: 'sns-node-shell', x: -24, y: -24, width: 48, height: 48, rx: 8 }),
            h('g', { className: 'sns-node-icon', transform: 'translate(-13 -13) scale(1.08)' }, icon(node.icon, 26)),
            h('circle', { className: 'sns-node-badge', cx: 21, cy: 21, r: 4 }),
            h('text', { className: 'sns-node-name', x: 0, y: 44 }, node.name),
            h('text', { className: 'sns-node-sub', x: 0, y: 58 }, node.sub))
        }))
    }
    function LeftRail({ t, now }) {
      const conic = 'conic-gradient(from -90deg,#26ebff 0%,#00c4e9 44%,#46f1ff 80.3%,#020810 80.3% 80.9%,#3663ff 80.9%,#548aff 99.5%,#020810 99.5%)'
      const ring = 'radial-gradient(closest-side,#041421 75%,#062232 calc(100% - 4px),transparent calc(100% - 3px)),conic-gradient(from -90deg,#00bfca,#42f8c8 92%,#103247 92%)'
      const cats = [['服务器', 26], ['终端', 19], ['网络设备', 12], ['数据库', 9], ['智能体', 14], ['存储', 7]]
      const spark = 'M0 33 12 30 24 38 36 25 48 29 60 18 72 22 84 9 96 25 108 29 120 21 132 30 144 25 156 37 168 33 180 43 192 38 204 45 216 37 228 46 240 42 260 48'
      return h('aside', { className: 'sns-left', 'aria-label': t('assetsTitle') },
        h('section', { className: 'sns-panel sns-asset-overview' },
          h('header', { className: 'sns-panel-heading' }, icon('grid', 15), h('h2', null, t('assetsTitle')), h('span', { className: 'micro' }, 'ASSETS')),
          h('div', { className: 'sns-asset-total' },
            h('div', null, h('span', null, t('totalLabel')), h('b', null, '73', h('small', null, t('unit')))),
            h('span', { className: 'sns-metric-orbit' }, icon('network', 20))),
          h('div', { className: 'sns-mini-metrics' },
            h('div', null, h('span', null, h('i', { className: 'sns-dot good' }), t('online')), h('b', null, '71')),
            h('div', null, h('span', null, h('i', { className: 'sns-dot dim' }), t('offline')), h('b', null, '2')),
            h('div', null, h('span', null, h('i', { className: 'sns-dot amber' }), t('review')), h('b', { className: 'amber-text' }, '3'))),
          h('div', { className: 'sns-coverage' }, t('visible'), h('b', null, '100%'), h('div', null, h('i', { style: { width: '100%' } })))),
        h('section', { className: 'sns-panel sns-distribution-panel' },
          h('header', { className: 'sns-panel-heading violet' }, icon('model', 15), h('h2', null, t('composition')), h('span', { className: 'micro' }, 'COMPOSITION')),
          h('div', { className: 'sns-distribution-summary' },
            h('div', { className: 'sns-donut', style: { background: conic } }, h('div', null, h('b', null, '73'), h('small', null, t('allAssets')))),
            h('div', { className: 'sns-legend2' },
              h('span', null, h('i', { className: 'sns-swatch' }), t('traditional'), h('b', null, '59')),
              h('span', null, h('i', { className: 'sns-swatch violet' }), t('smart'), h('b', null, '14')),
              h('span', null, h('i', { className: 'sns-swatch slate' }), t('unclassified'), h('b', null, '0')))),
          h('div', { className: 'sns-asset-categories' },
            ...cats.map(([name, count]) => h('span', { className: 'sns-asset-category', key: name }, h('i', { className: 'sns-swatch violet' }), name, h('b', null, String(count)))))),
        h('section', { className: 'sns-panel sns-posture-panel' },
          h('header', { className: 'sns-panel-heading' }, icon('shield', 15), h('h2', null, t('protection')), h('span', { className: 'micro' }, 'PROTECTION')),
          h('div', { className: 'sns-security-score' },
            h('div', { className: 'sns-score-ring', style: { background: ring } }, h('div', null, h('b', null, '92', h('small', null, t('scoreUnit'))))),
            h('div', null, h('strong', null, t('scoreText')), h('span', null, t('scoreNote')), h('small', null, h('i', { className: 'sns-dot good' }), t('running')))),
          h('div', { className: 'sns-operation-row' }, h('span', null, t('analysis')), h('b', null, '128', h('small', null, t('analysisUnit')))),
          h('div', { className: 'sns-operation-row' }, h('span', null, t('task')), h('b', null, '26', h('small', null, t('taskUnit')))),
          h('div', { className: 'sns-trend-caption' }, h('span', null, t('trendCaption')), h('b', null, t('trendDown'))),
          h('svg', { className: 'sns-sparkline', viewBox: '0 0 260 62', preserveAspectRatio: 'none', 'aria-hidden': true },
            h('defs', null, h('linearGradient', { id: 'sns-spark-fill', x1: '0', y1: '0', x2: '0', y2: '1' },
              h('stop', { stopColor: '#0e9fff', stopOpacity: '.5' }), h('stop', { offset: '1', stopColor: '#28dfff', stopOpacity: '0' }))),
            h('path', { d: `${spark}V62H0Z`, fill: 'url(#sns-spark-fill)', stroke: 'none' }),
            h('path', { d: spark, fill: 'none', stroke: '#54eaff', strokeWidth: '1.9' })),
          h('div', { className: 'sns-chart-axis' }, h('span', null, '00:00'), h('span', null, '12:00'), h('span', null, '24:00'))))
    }
    function RightRail({ t, threats, threatTotal, threatStatus, selectedThreat, onSelectThreat, agent }) {
      const timelineItems = [
        ...(agent?.rows || []).map((row) => ({ kind: 'tool', at: row.startedAt, row })),
        ...(agent?.approvals || []).map((row) => ({ kind: 'approval', at: row.askedAt, row })),
      ].filter((item) => typeof item.at === 'number').sort((a, b) => b.at - a.at).slice(0, 20)
      return h('aside', { className: 'sns-right', 'aria-label': t('threat') },
        h('section', { className: 'sns-panel sns-threat-panel' },
          h('header', { className: 'sns-panel-heading amber' }, icon('activity', 15), h('h2', null, '重点关注'), h('span', { className: 'micro' }, threatTotal === null ? '—' : `${threatTotal} 条`)),
          h('div', { className: 'sns-feed-description' }, h('span', null, '已研判真实告警 · 最高等级 · 按风险排序')),
          h('div', { className: 'sns-threat-feed' },
            ...(threats.length
              ? threats.map((item) => h('button', {
                  type: 'button', key: item.id, className: `sns-threat-card${selectedThreat === item.id ? ' selected' : ''}`,
                  onClick: () => onSelectThreat(item),
                },
                  h('div', { className: 'sns-threat-meta' },
                    h('span', { className: `sns-severity ${String(item.severity).toLowerCase()}` }, String(item.severity || '—')),
                    item.validation === 'failed' && h('span', { className: 'sns-need-review' }, '需复核'),
                    h('span', null, item.group || '—'),
                    h('time', null, item.judgeTime || item.createdTime || '—')),
                  h('h3', null, `${threatTypeText(item.incidentType)} · ${String(item.id).slice(-6)}`),
                  h('p', null, item.summary || '暂无研判摘要'),
                  h('div', { className: 'sns-threat-stats' },
                    h('span', null, `风险 ${typeof item.riskScore === 'number' ? item.riskScore.toFixed(2) : '—'}`),
                    h('span', null, `告警 ${item.alerts === null || item.alerts === undefined ? '—' : item.alerts}`),
                    h('span', null, `技术 ${item.techniques}`))))
              : [h('p', { className: 'sns-threat-empty' }, threatStatus === 'unavailable' ? '威胁数据暂不可用' : '当前没有符合条件的重点威胁')])),
          h('div', { className: 'sns-feed-footer' },
            h('span', null, h('i', { className: `sns-dot ${threatStatus === 'ok' ? 'good' : 'amber'}` }), threatStatus === 'ok' ? '已读取真实研判结果' : threatStatus === 'stale' ? '数据已过期' : '数据未接入'),
            h('b', null, '仅只读展示'))),
        h('section', { className: 'sns-panel sns-timeline-panel' },
          h('header', { className: 'sns-panel-heading violet' }, icon('clock', 15), h('h2', null, '智能体实时工作状态'), h('span', { className: 'micro' }, agent?.status === 'ok' ? 'LIVE' : '—')),
          h('div', { className: 'sns-agent-roster' },
            ...(agent?.roles?.length ? agent.roles : PLACEHOLDER_ROLES).slice(0, 3).map((role) => h('div', { key: role.id, 'data-agent-state': role.state || 'unknown' },
              h('span', null, role.title),
              h('small', null, `${agentStateText(role.state)} · 调用 ${agentCount(role.toolCalls)} · Skill ${agentCount(role.skillLoads)}`)))),
          h('div', { className: 'sns-timeline-context' }, h('i', { className: 'sns-dot good' }), '后台协同任务'),
          h('ol', { className: 'sns-timeline' },
            ...(timelineItems.length
              ? timelineItems.map((item, index) => item.kind === 'approval'
                ? h('li', { key: `approval-${item.row.id}`, className: `sns-timeline-item approval${item.row.outcome ? '' : ' active'}` },
                    h('span', { className: 'sns-timeline-marker' }),
                    h('div', { className: 'sns-timeline-row' }, h('strong', null, '工具审批'), h('time', null, clockOf(item.row.askedAt))),
                    h('p', null, `${approvalText(item.row.outcome)} · ${toolTitle({ name: item.row.toolName })}${item.row.reason ? ` · ${item.row.reason}` : ''}`))
                : h('li', { key: item.row.callId || `${index}`, className: `sns-timeline-item${item.row.status === 'running' ? ' active' : ''}${item.row.status === 'failed' ? ' failed' : ''}` },
                    h('span', { className: 'sns-timeline-marker' }),
                    h('div', { className: 'sns-timeline-row' }, h('strong', null, toolTitle(item.row)), h('time', null, clockOf(item.row.startedAt))),
                    h('p', null, toolDetail(item.row))))
              : [h('li', { key: 'empty', className: 'sns-timeline-item' },
                  h('p', null, agent?.status === 'unavailable' ? '原生运行数据暂不可用' : '当前时间窗暂无工具调用或审批'))])),
          h('div', { className: 'sns-timeline-footer' }, icon('shield', 12),
            h('span', null, agent?.status === 'ok' ? '实时任务持续运行' : agent?.status === 'stale' ? '运行数据已过期' : '运行数据未接入'),
            h('b', null, timelineItems.length ? `${timelineItems.length} 条` : '—'))),
        h('footer', { className: 'sns-page-footer' },
          h('span', null, h('i', { className: 'sns-dot good' }), 'AI-SOC ENGINE ONLINE', h('span', { className: 'sns-footer-divider' }, '/'), '全域感知 · 智能研判 · 协同执行'),
          h('span', null, 'V6.0', h('span', { className: 'sns-footer-divider' }, '/'), '本地交互原型 · 非生产实时数据')))
    }
    function Monitor({ t, exit, uiWorkspace }) {
      const dialog = useRef(null)
      const now = useClock()
      const overviewFeed = usePoll(async () => {
        const response = await fetch(new URL('api/security-operations/overview', document.baseURI), { credentials: 'same-origin', headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error('overview')
        return await response.json()
      }, [], 5000)
      const timelineFeed = usePoll(async () => {
        const url = new URL('api/security-operations/network-space/timeline', document.baseURI)
        url.search = new URLSearchParams({ scope: 'all' }).toString()
        const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error('timeline')
        return await response.json()
      }, [], 5000)
      const threatsFeed = usePoll(async () => {
        const url = new URL('api/security-operations/network-space/threats', document.baseURI)
        const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error('threats')
        const body = await response.json()
        // 业务状态为 unavailable 时按失败处理，避免把 401 或超时显示成“已读取”。
        if (body?.status === 'unavailable') throw new Error('threats')
        return body
      }, [], 60000)
      const threatData = threatsFeed.data?.data || null
      const threats = threatData?.items || []
      const threatTotal = typeof threatData?.total === 'number' ? threatData.total : null
      const threatStatus = threatsFeed.status
      const agent = {
        status: overviewFeed.status,
        roles: overviewFeed.data?.roles || [],
        rows: (timelineFeed.data?.data?.rows || []).filter((row) => row && typeof row.startedAt === 'number').slice(0, 20),
        approvals: (timelineFeed.data?.data?.approvals || []).filter((row) => row && typeof row.askedAt === 'number'),
      }
      const [dimension, setDimension] = useState('3d')
      const [topology, setTopology] = useState('category')
      const [filter, setFilter] = useState('all')
      const [camera, setCamera] = useState({ yaw: -0.09, tilt: 0.52, zoom: 1.08 })
      const [selected, setSelected] = useState(null)
      const [selectedThreat, setSelectedThreat] = useState(null)
      const [selectedThreatItem, setSelectedThreatItem] = useState(null)
      const [reportId, setReportId] = useState(null)
      const [stepIndex, setStepIndex] = useState(0)
      const [playing, setPlaying] = useState(false)
      const platformFeed = usePoll(async () => {
        const response = await fetch(new URL('api/security-operations/network-space/platform', document.baseURI), { credentials: 'same-origin' })
        if (!response.ok) throw new Error('platform')
        const body = await response.json()
        if (body?.status === 'unavailable') throw new Error('platform')
        return body
      }, [], 60000)
      const assetsFeed = usePoll(async () => {
        const url = new URL('api/security-operations/network-space/assets', document.baseURI)
        url.search = new URLSearchParams({ pageNum: '1', pageSize: '100' }).toString()
        const response = await fetch(url, { credentials: 'same-origin' })
        if (!response.ok) throw new Error('assets')
        return await response.json()
      }, [], 60000)
      const coverageFeed = usePoll(async () => {
        const response = await fetch(new URL('api/security-operations/network-space/coverage', document.baseURI), { credentials: 'same-origin' })
        if (!response.ok) throw new Error('coverage')
        return await response.json()
      }, [], 60000)
      const reportFeed = usePoll(async () => {
        if (!reportId) return null
        const url = new URL('api/security-operations/network-space/report', document.baseURI)
        url.search = new URLSearchParams({ judgementId: reportId }).toString()
        const response = await fetch(url, { credentials: 'same-origin' })
        if (!response.ok) throw new Error('report')
        const body = await response.json()
        if (body?.status === 'unavailable') throw new Error('report')
        return body
      }, [reportId], 0)
      const platform = platformFeed.data?.data || null
      const assetItems = assetsFeed.data?.data?.items || []
      const coverage = coverageFeed.data?.data || null
      const report = reportFeed.data?.data || null
      const investigation = Boolean(selectedThreatItem)
      const chain = report?.parsed?.chain || []
      const selectThreat = (item) => {
        if (selectedThreatItem?.id === item.id) { setSelectedThreatItem(null); setSelectedThreat(null); setReportId(null); setPlaying(false); setStepIndex(0); return }
        setSelectedThreat(item.id)
        setSelectedThreatItem(item)
        setReportId(item.latestJudgementId || null)
        setStepIndex(0)
        setPlaying(Boolean(item.latestJudgementId))
      }
      const exitInvestigation = () => { setSelectedThreatItem(null); setSelectedThreat(null); setReportId(null); setPlaying(false); setStepIndex(0) }
      useEffect(() => {
        if (!playing || !investigation || chain.length === 0) return
        if (stepIndex >= chain.length - 1) { setPlaying(false); return }
        const timer = setTimeout(() => setStepIndex((index) => Math.min(index + 1, chain.length - 1)), 1200)
        return () => clearTimeout(timer)
      }, [playing, stepIndex, investigation, chain.length])
      const scene = useMemo(() => investigation ? buildInvestigation(report, assetItems, stepIndex) : buildOverview(platform, assetItems), [investigation, report, assetItems, stepIndex, platform])
      SCENE = { nodes: scene.nodes, edges: scene.edges, spatial: scene.spatial, spatialNetwork: scene.spatial, pos2d: scene.pos2d, pos2dNetwork: scene.pos2d,
        zones: scene.spatialZones, zonesNetwork: scene.spatialZones, pixels: scene.zones, pixelsNetwork: scene.zones }
      const sceneKey = useMemo(() => scene.nodes.map((node) => `${node.slot}:${node.name}`).join('|'), [scene])
      // 场景元素由数据决定：只把有真实数据的节点映射到原型模型槽位，不再补空槽位。
      DATA.edges = useMemo(() => scene.edges, [scene])
      DATA.nodes = useMemo(() => scene.nodes
        .map((real) => {
          const proto = NODES.find((node) => node.id === real.slot)
          return proto ? { ...proto, name: real.name, sub: real.sub, type: real.type } : null
        })
        .filter(Boolean), [scene])
      const [feedPaused, setFeedPaused] = useState(false)
      const [paused, setPaused] = useState(false)
      const [fullscreen, setFullscreen] = useState(false)
      const [notice, setNotice] = useState('')
      const [bump, setBump] = useState(0)
      const drag = useRef(null)
      useEffect(() => {
        const element = dialog.current, previous = document.activeElement
        element?.showModal()
        return () => { if (element?.open) element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
      }, [])
      const nodes = useMemo(() => {
        const list = scene.nodes
        return filter === 'smart' ? list.filter((item) => item.type === 'smart') : filter === 'traditional' ? list.filter((item) => item.type === 'traditional') : list
      }, [filter, scene])
      const active = scene.nodes.find((node) => node.id === selected)
      useEffect(() => {
        const update = () => setFullscreen(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', update)
        return () => document.removeEventListener('fullscreenchange', update)
      }, [])
      const toggleFullscreen = async () => {
        try {
          if (document.fullscreenElement) { await document.exitFullscreen(); return }
          // dialog 不能作为全屏目标（Chrome 报 Dialog elements are invalid），只能对整个文档请求。
          await document.documentElement.requestFullscreen()
          // 全屏元素后进入 top layer，会盖住同为 top layer 的 dialog；重新入栈把它放回最上层。
          const element = dialog.current
          if (element?.open) { element.close(); element.showModal() }
        } catch (error) {
          setNotice('当前浏览器环境不允许全屏')
          setTimeout(() => setNotice(''), 2000)
        }
      }
      useEffect(() => {
        if (dimension !== '3d') return
        // 场景首帧的包围盒尚未包含已布局的模型，首次 setCamera 会被跳过；
        // 初始化稳定后触发一次极小视角变化，等价于用户轻拖一次，使相机与标签同步生效。
        const timer = setTimeout(() => setCamera((old) => ({ ...old, zoom: Math.max(0.8, old.zoom * 0.86) })), 1200)
        return () => clearTimeout(timer)
      }, [dimension, sceneKey])
      const onWheel = (event) => {
        if (dimension !== '3d') return
        event.preventDefault()
        setCamera((old) => ({ ...old, zoom: clamp(old.zoom - event.deltaY * 0.0005, 0.7, 1.4) }))
      }
      const onPointerDown = (event) => {
        if (dimension !== '3d' || event.button !== 0) return
        if (event.target.closest('.sns-node-label, .sns-asset-popover')) return
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: camera.yaw, tilt: camera.tilt }
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      const onPointerMove = (event) => {
        const state = drag.current
        if (!state || state.id !== event.pointerId) return
        const dx = event.clientX - state.x, dy = event.clientY - state.y
        setCamera({ yaw: state.yaw - dx * 0.005, tilt: clamp(state.tilt + dy * 0.004, 0.12, 1.05), zoom: camera.zoom })
      }
      const onPointerUp = () => { drag.current = null }
      return h('dialog', { className: `sns-monitor${paused ? ' sns-motion-paused' : ''}`, ref: dialog, 'aria-label': t('title'), onCancel: (event) => { event.preventDefault(); exit() } },
        h('style', null, CSS),
        h('header', { className: 'sns-topbar' },
          h('div', { className: 'sns-brand' },
            h('span', { className: 'sns-brand-mark' }, icon('shield', 25)),
            h('span', null, h('b', null, 'AI-SOC'), h('small', null, '智能安全运营中心'))),
          h('div', { className: 'sns-system-title' },
            h('span', { className: 'sns-title-rule' }), h('div', null, h('h1', null, t('title')), h('p', null, t('subtitle'))), h('span', { className: 'sns-title-rule reverse' })),
          h('div', { className: 'sns-header-right' },
            h('span', { className: 'sns-demo-badge' }, h('i'), t('demo')),
            h('div', { className: 'sns-clock' }, h('b', null, clockText(now)), h('small', null, dateText(now))),
            h('button', { type: 'button', className: 'sns-icon-button', 'aria-label': fullscreen ? '退出全屏' : '全屏', title: fullscreen ? '退出全屏' : '全屏', 'aria-pressed': fullscreen, onClick: toggleFullscreen }, icon('expand', 14)))),
        notice && h('div', { className: 'sns-toast', role: 'status' }, notice),
        h('main', { className: 'sns-workspace' },
          h(LeftRail, { t, now }),
          h('section', { className: 'sns-panel sns-center-panel', 'aria-label': t('space') },
            h('header', { className: 'sns-space-toolbar' },
              h('div', null,
                h('div', { className: 'sns-space-heading' }, icon('network', 16), h('h2', null, t('space')), h('span', { className: 'sns-live-pill' }, h('i'), t('live'))),
                h('p', null, t('spaceSub'))),
              h('div', { className: 'sns-space-actions' },
                h('div', { className: 'sns-segmented', role: 'group', 'aria-label': '资产筛选' },
                  h('button', { type: 'button', className: filter === 'all' ? 'active' : '', onClick: () => setFilter('all'), 'aria-pressed': filter === 'all' }, t('all')),
                  h('button', { type: 'button', className: filter === 'smart' ? 'active' : '', onClick: () => setFilter('smart'), 'aria-pressed': filter === 'smart' }, t('smartAssets')),
                  h('button', { type: 'button', className: filter === 'traditional' ? 'active' : '', onClick: () => setFilter('traditional'), 'aria-pressed': filter === 'traditional' }, t('traditionalAssets'))),
                h('button', { type: 'button', className: 'sns-icon-button', title: '适应视图', 'aria-label': '适应视图', onClick: () => setCamera({ yaw: -0.09, tilt: 0.52, zoom: 1.08 }) }, icon('expand', 14)),
                h('button', { type: 'button', className: 'sns-primary-button', onClick: exit, autoFocus: true }, t('back')))),
            h('div', { className: 'sns-topology-toolbar' },
              h('span', { className: 'sns-topology-control' }, t('view'),
                h('span', { className: 'sns-segmented', role: 'group', 'aria-label': t('view') },
                  h('button', { type: 'button', className: dimension === '3d' ? 'active' : '', onClick: () => setDimension('3d'), 'aria-pressed': dimension === '3d' }, '3D'),
                  h('button', { type: 'button', className: dimension === '2d' ? 'active' : '', onClick: () => setDimension('2d'), 'aria-pressed': dimension === '2d' }, '2D'))),
              h('span', { className: 'sns-topology-control' }, t('layout'),
                h('span', { className: 'sns-segmented', role: 'group', 'aria-label': t('layout') },
                  h('button', { type: 'button', className: topology === 'category' ? 'active' : '', onClick: () => setTopology('category'), 'aria-pressed': topology === 'category' }, t('byCategory')),
                  h('button', { type: 'button', className: topology === 'network' ? 'active' : '', onClick: () => setTopology('network'), 'aria-pressed': topology === 'network' }, t('byNetwork')))),
              h('button', { type: 'button', className: 'sns-text-button', onClick: () => setPaused((v) => !v), 'aria-pressed': paused }, paused ? t('resume') : t('pause')),
              h('span', { className: 'sns-topology-hint' }, dimension === '3d' ? t('hint3d') : t('hint2d'))),
            h('div', { style: { position: 'relative', flex: 1, minHeight: 0, display: 'flex' }, onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
              dimension === '3d'
                ? h(Stage, { nodes, topology, mode: '3d', camera, selected, onSelect: setSelected, t, sceneKey })
                : h(SvgStage, { nodes, topology, selected, onSelect: setSelected }),
              active && h('section', { className: 'sns-asset-popover', 'aria-label': t('detail') },
                h('div', { className: 'sns-popover-head' }, h('h3', null, active.name), h('button', { type: 'button', onClick: () => setSelected(null) }, t('close'))),
                h('dl', null,
                  h('dt', null, t('kind')), h('dd', null, active.kind),
                  h('dt', null, t('code')), h('dd', null, active.code),
                  h('dt', null, t('address')), h('dd', null, active.address),
                  h('dt', null, t('version')), h('dd', null, active.version),
                  h('dt', null, t('owner')), h('dd', null, active.owner)),
                h('p', { className: 'sns-asset-note' }, active.note))),
            h('section', { className: 'sns-task-dock', 'aria-label': investigation ? '研判回放' : '安全运营驾驶舱' },
              ...(investigation ? [
                h('div', { className: 'sns-replay' },
                  h('div', { className: 'sns-replay-head' },
                    h('span', null, icon('activity', 13), '研判回放', h('small', null, 'REPLAY'),
                      h('em', null, report?.parsed?.verdict ? `${report.parsed.verdict} · 置信度 ${num(report.parsed.confidence)}` : '读取中')),
                    h('div', { className: 'sns-replay-controls' },
                      h('button', { type: 'button', onClick: () => setPlaying((value) => !value), disabled: chain.length === 0 }, playing ? '暂停' : '播放'),
                      h('button', { type: 'button', onClick: () => setStepIndex((index) => Math.max(0, index - 1)), disabled: stepIndex === 0 }, '上一步'),
                      h('button', { type: 'button', onClick: () => setStepIndex((index) => Math.min(Math.max(0, chain.length - 1), index + 1)), disabled: stepIndex >= chain.length - 1 }, '下一步'),
                      h('button', { type: 'button', onClick: exitInvestigation }, '退出调查'))),
                  h('div', { className: 'sns-replay-body' },
                    !reportId && h('p', { className: 'sns-replay-empty' }, '该威胁尚无研判报告，无法回放'),
                    reportId && !report && h('p', { className: 'sns-replay-empty' }, reportFeed.status === 'unavailable' ? '研判报告读取失败' : '正在读取研判报告…'),
                    report && !report.parsed && h('p', { className: 'sns-replay-empty' }, '报告结构无法解析，未进入回放'),
                    chain.length > 0 && (() => {
                      const step = chain[stepIndex] || chain[0]
                      return [
                        h('div', { className: 'sns-replay-step' },
                          h('span', { className: `sns-replay-badge ${step.type}` }, step.badge || (step.type === 'speculative' ? '推测' : '事实')),
                          h('span', { className: 'sns-replay-refs' }, step.refs || ''),
                          h('b', null, `${stepIndex + 1} / ${chain.length}`)),
                        h('p', { className: 'sns-replay-text' }, step.text || ''),
                        h('div', { className: 'sns-replay-progress' }, ...chain.map((item, index) => h('i', { key: index, className: `${index < stepIndex ? 'done' : ''} ${index === stepIndex ? 'active' : ''} ${item.type === 'speculative' ? 'speculative' : ''}` }))),
                      ]
                    })()))
              ] : [
                h('div', { className: 'sns-operations-head' },
                  h('span', null, icon('activity', 13), '安全运营驾驶舱', h('small', null, 'OPERATIONS')),
                  h('span', { className: 'sns-status-tag success' }, h('i', { className: 'sns-dot good' }), '持续监测中')),
                h('div', { className: 'sns-operations-grid' },
                  h('div', { className: 'sns-operation-card blue' },
                    h('span', null, icon('network', 12), '全域感知覆盖'),
                    h('div', null, h('b', null, num(coverage?.percent), h('em', null, '%')), h('small', null, coverage ? `${num(coverage.collected)} / ${num(coverage.registered)} 资产` : '覆盖数据未接入')),
                    h('div', { className: 'sns-metric-track' }, h('i', { style: { width: `${coverage?.percent ?? 0}%` } }))),
                  h('div', { className: 'sns-operation-card violet' },
                    h('span', null, icon('agent', 12), '智能体协同'),
                    h('div', null, h('b', null, num(platform ? Math.min(4, platform.agents?.length || 0) : null), h('em', null, '个')), h('small', null, platform ? `共 ${num(platform.agents?.length)} · ${num(platform.models?.length)} 个模型` : '平台数据未接入')),
                    h('div', { className: 'sns-agent-slots' }, ...Array.from({ length: Math.max(0, Math.min(8, platform?.agents?.length || 0)) }, (_, index) => h('i', { key: index })))),
                  h('button', { type: 'button', className: 'sns-operation-card rose', onClick: () => threats[0] && selectThreat(threats[0]), disabled: !threats[0] },
                    h('span', null, icon('activity', 12), '重点攻击事件 · 回放'),
                    h('div', null, h('b', null, threats[0] ? `风险 ${num(threats[0].riskScore)}` : '—'), h('small', null, threats[0] ? `${threatTypeText(threats[0].incidentType)} · 告警 ${num(threats[0].alerts)}` : '暂无重点威胁')),
                    h('div', { className: 'sns-risk-mini-chain' }, h('i'), '攻击源', h('span', null, '→'), h('i'), '已确认', h('span', null, '⇢'), h('i', { className: 'pending' }), '待核查'))),
                h('div', { className: 'sns-operations-pipeline' },
                  h('span', null, '智能防御闭环'),
                  ...['全域采集', '证据关联', '模型研判', '响应编排', '持续审计'].map((label, index) => h('span', { className: 'sns-pipeline-stage', key: label }, h('i', null, index === 2 ? '◉' : '✓'), label)),
                  h('b', null, '实时运行')),
              ])),
            h('footer', { className: 'sns-space-footer' },
              h('span', null, h('i', { className: 'sns-dot good' }), t('synced'), h('i', { className: 'sns-separator' }), t('recentSync'), h('b', null, clockText(now))),
              h('span', null, coverage ? `覆盖 ${num(coverage.percent)}%` : '覆盖未接入'))),
          h(RightRail, { t, threats, threatTotal, threatStatus, selectedThreat, onSelectThreat: selectThreat, agent })))
    }
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'network-space: locale')
      const t = ctx.locale.bind(NS), exit = () => ctx.layout.selectPanel(null)
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 20, label: () => t('entry'), locale: NS }, () => icon('network', 18)))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS }, () => h('section', { style: { padding: 20 } }, h('h1', null, t('title')))))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: PANEL, order: 20, locale: NS }, (props) => {
        const activePanel = props.usePanelInfo((value) => value.activePanelId === PANEL)
        return activePanel ? h(Monitor, { ...props, t, exit, uiWorkspace: ctx.uiWorkspace }) : null
      }))
    }
    return { inject: ['slots', 'layout', 'uiWorkspace', 'locale'], apply }
  },
})
