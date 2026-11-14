#!/usr/bin/env python3
"""Generate the native DSH Client component from the fixed UI baseline."""
from __future__ import annotations

import json
import re
from pathlib import Path

PLUGIN = Path(__file__).resolve().parents[1]
DSH = PLUGIN.parents[1]
BASELINE = DSH / "workspace" / "references" / "ui-baseline" / "方案文档生成工具-静态验收原型.html"
OUTPUT = PLUGIN / "lib" / "client.js"


def balanced_end(text: str, start: int) -> int:
    depth = 1
    quote = None
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if quote:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == quote:
                quote = None
            continue
        if char in "'\"":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    raise ValueError("unbalanced CSS block")


def scoped_selector(selector: str) -> str:
    selector = selector.strip()
    if selector == ":root":
        return ".proposal-workbench-native"
    if selector in {"html,body", "html, body", "html,body,body"}:
        return ".proposal-workbench-native"
    if selector == "html":
        return ".proposal-workbench-native"
    if selector == "body":
        return ".proposal-workbench-native"
    if selector.startswith(":root"):
        return selector.replace(":root", ".proposal-workbench-native", 1)
    if selector.startswith("html,") or selector.startswith("body,"):
        return ".proposal-workbench-native " + selector
    if selector.startswith("*"):
        return ".proposal-workbench-native" + selector[1:]
    return ".proposal-workbench-native " + selector


def scope_css(css: str) -> str:
    output: list[str] = []
    cursor = 0
    while cursor < len(css):
        brace = css.find("{", cursor)
        if brace < 0:
            output.append(css[cursor:])
            break
        selector = css[cursor:brace]
        end = balanced_end(css, brace + 1)
        body = css[brace + 1 : end]
        stripped = selector.strip()
        if stripped.startswith("@media") or stripped.startswith("@supports") or stripped.startswith("@container"):
            rendered = stripped + "{" + scope_css(body) + "}"
        elif stripped.startswith("@keyframes") or stripped.startswith("@font-face"):
            rendered = stripped + "{" + body + "}"
        else:
            rendered = ",".join(scoped_selector(item) for item in selector.split(",")) + "{" + body + "}"
        output.append(rendered)
        cursor = end + 1
    return "".join(output)


def main() -> None:
    source = BASELINE.read_text(encoding="utf-8")
    style = scope_css(re.search(r"<style>(.*?)</style>", source, re.S).group(1))
    body = re.search(r"<body>(.*?)</body>", source, re.S).group(1)
    scripts = re.findall(r"<script(?:[^>]*)>(.*?)</script>", body, re.S)
    if len(scripts) < 2:
        raise SystemExit("baseline must contain its contract and interaction script")
    script = scripts[-1]
    script_block = re.search(r"<script>\s*" + re.escape(script) + r"\s*</script>", body, re.S)
    if not script_block:
        raise SystemExit("baseline interaction script block not found")
    body = body[: script_block.start()] + body[script_block.end() :]
    state_helpers = r'''    function applyLiveState(content, state) {
      if (!state || typeof state !== 'object') return
      content.dataset.stateMode = state.stateMode || 'fixture'
      content.dataset.stateSource = state.source || 'unknown'
      const marker = content.querySelector('[data-testid="workbench-state"]')
      if (marker) marker.textContent = `状态来源：${state.source || '未知'} · ${state.stateMode === 'live' ? '已读取项目工作区' : '固定参考/待验证'}`
      const breadcrumb = content.querySelector('[data-testid="project-breadcrumb"] .project')
      if (breadcrumb && state.project?.name) breadcrumb.textContent = state.project.name.slice(0, 48)
      const coverage = content.querySelector('[data-testid="coverage-summary"]')
      if (coverage) coverage.textContent = `${state.stateMode === 'live' ? '工作区状态' : '固定样本'} · ${state.document?.requirementCount || state.requirements?.length || 0} 条要求 · ${state.publish?.blockerCount || 0} 项阻断`
      const saveState = content.querySelector('[data-testid="save-state"] span:last-child')
      if (saveState) saveState.textContent = state.stateMode === 'live' ? '项目工作区状态 · 待核对' : '固定合成样本 · 状态待验证'
      const navRequirements = content.querySelector('[data-testid="nav-requirements"] .nav-count')
      if (navRequirements && Array.isArray(state.requirements)) navRequirements.textContent = String(state.requirements.length)
      const navEvidence = content.querySelector('[data-testid="nav-evidence"] .nav-count')
      if (navEvidence && Array.isArray(state.evidence)) navEvidence.textContent = String(state.evidence.length)
      const tableBody = content.querySelector('[data-testid="document-table"] tbody')
      if (tableBody && Array.isArray(state.requirements) && state.requirements.length > 0) {
        tableBody.innerHTML = state.requirements.slice(0, 8).map(row => `<tr><td>${String(row.id)}</td><td>待绑定章节</td><td>${String(row.source || '待核对')}</td><td><span class="status pending">${String(row.status || '待验证')}</span></td></tr>`).join('')
      }
      const chips = content.querySelector('[data-testid="evidence-chips"]')
      if (chips && Array.isArray(state.evidence) && state.evidence.length > 0) {
        chips.innerHTML = '<span class="evidence-label">证据：</span>' + state.evidence.slice(0, 8).map(row => `<button class="evidence-chip" data-evidence="${String(row.id)}"><span class="file-icon">•</span><span>${String(row.id)} ${String(row.source || '')}</span><span class="dot"></span></button>`).join('')
      }
      const gate = content.querySelector('[data-testid="publish-risk"]')
      if (gate) gate.textContent = state.publish?.status === 'blocked' ? `发布门禁：阻断（${state.publish.blockerCount || 0} 项）` : '发布门禁：待验证'
    }

    async function loadLiveState(content) {
      for (const prefix of ['/plugins/ai-proposal-workbench', 'plugins/ai-proposal-workbench']) {
        try {
          const response = await fetch(`${prefix}/state`, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
          if (!response.ok) continue
          const body = await response.json()
          if (body?.ok === true && body.state) { applyLiveState(content, body.state); return body.state }
        } catch (_) {}
      }
      return null
    }

    '''
    client = f'''window.__ModuleLoader__.load({{
  id: '@business/ai-proposal-workbench',
  factory(require) {{
    const React = require('react');
    const h = React.createElement;
    const BASE_STYLE = {json.dumps(style, ensure_ascii=False)};
    const BASE_BODY = {json.dumps(body, ensure_ascii=False)};
    const BASE_SCRIPT = {json.dumps(script, ensure_ascii=False)};

    function scopedDocument(root) {{
      const real = document;
      return new Proxy(real, {{
        get(target, key) {{
          if (key === 'querySelector') return selector => root.querySelector(selector);
          if (key === 'querySelectorAll') return selector => root.querySelectorAll(selector);
          if (key === 'getElementById') return id => root.querySelector('#' + CSS.escape(id));
          if (key === 'addEventListener') return (type, listener, options) => root.addEventListener(type, listener, options);
          if (key === 'removeEventListener') return (type, listener, options) => root.removeEventListener(type, listener, options);
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        }},
      }});
    }}

    function emit(name, payload) {{
      try {{
        if (window.dsh && typeof window.dsh.emit === 'function') window.dsh.emit(name, payload);
      }} catch (_) {{}}
    }}

    {state_helpers}

    function WorkbenchIcon({{ size = 18, active = false }}) {{
      return h('span', {{ 'aria-hidden': true, style: {{ width: size, height: size, display: 'inline-grid', placeItems: 'center', borderRadius: 5, background: active ? 'var(--dsw-alias-state-business-primary, #e7c83b)' : 'transparent', color: '#111315', fontSize: 11, fontWeight: 800, lineHeight: 1 }} }}, '方案');
    }}

    function NativeWorkbench() {{
      const host = React.useRef(null);
      const [open, setOpen] = React.useState(true);
      React.useEffect(() => {{
        const root = host.current;
        if (!root) return undefined;
        root.replaceChildren();
        const style = document.createElement('style');
        style.textContent = BASE_STYLE + '\\n.proposal-workbench-native[data-runtime="native-dsh"] {{ position: fixed; inset: 0; z-index: 0; }}\\n.proposal-workbench-native[data-runtime="native-dsh"] .app {{ min-height: 100%; }}';
        root.appendChild(style);
        const content = document.createElement('div');
        content.className = 'proposal-workbench-native';
        content.dataset.runtime = 'native-dsh';
        content.dataset.stateMode = 'fixture';
        content.dataset.source = 'references/ui-baseline/方案文档生成工具-静态验收原型.html';
        content.innerHTML = BASE_BODY;
        root.appendChild(content);
        const saveState = content.querySelector('[data-testid="save-state"]');
        if (saveState) saveState.innerHTML = '<span class="save-dot"></span><span>固定合成样本 · 状态待验证</span>';
        const coverage = content.querySelector('[data-testid="coverage-summary"]');
        if (coverage) coverage.textContent = '固定样本 · 覆盖率待核对 · 2 项待确认';
        const marker = document.createElement('div');
        marker.setAttribute('data-testid', 'workbench-state');
        marker.dataset.mode = 'fixture';
        marker.textContent = '状态来源：固定合成验收样本；真实项目状态待接入';
        marker.style.cssText = 'position:absolute;left:268px;top:76px;z-index:4;font-size:10px;color:#70756f;background:rgba(255,255,255,.88);padding:2px 6px;border-radius:4px;pointer-events:none';
        content.querySelector('.app')?.appendChild(marker);
        const realDocument = document;
        const script = realDocument.createElement('script');
        script.textContent = BASE_SCRIPT;
        root.appendChild(script);
        void loadLiveState(content);
        const onClick = event => {{
          const target = event.target.closest?.('[data-nav], [data-evidence], [data-download], #submitBtn, [data-selection-command], #selectionApply');
          if (!target || !content.contains(target)) return;
          if (target.dataset.nav) emit('view.change', {{ view: target.dataset.nav, stateMode: 'fixture' }});
          if (target.dataset.evidence) emit('evidence.select', {{ evidenceId: target.dataset.evidence, stateMode: 'fixture' }});
          if (target.dataset.download) emit('download.request', {{ format: target.dataset.download, stateMode: 'fixture' }});
          if (target.id === 'submitBtn') emit('review.submit', {{ blocked: true, reason: 'fixture-pending-evidence' }});
          if (target.dataset.selectionCommand || target.id === 'selectionApply') emit('ai.optimize', {{ command: target.dataset.selectionCommand || 'custom', stateMode: 'fixture' }});
        }};
        content.addEventListener('click', onClick);
        return () => {{ content.removeEventListener('click', onClick); root.replaceChildren(); }};
      }}, []);
      const shellStyle = {{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: open ? 'auto' : 'none', display: open ? 'block' : 'none' }};
      const closeStyle = {{ position: 'fixed', top: 10, right: 12, zIndex: 1005, height: 30, padding: '0 10px', border: '1px solid var(--dsw-alias-border-l2, #d9dcd7)', borderRadius: 7, background: 'rgba(255,255,255,.92)', color: '#111315', fontSize: 12, fontWeight: 650, cursor: 'pointer', boxShadow: '0 4px 12px rgba(17,19,21,.12)' }};
      const launcherStyle = {{ position: 'fixed', top: 12, right: 12, zIndex: 1005, height: 34, padding: '0 12px', border: '1px solid var(--dsw-alias-border-l2, #d9dcd7)', borderRadius: 8, background: 'var(--dsw-alias-bg-base, #fff)', color: 'var(--dsw-alias-label-primary, #111315)', fontSize: 12, fontWeight: 650, cursor: 'pointer', boxShadow: '0 6px 16px rgba(17,19,21,.14)', pointerEvents: 'auto' }};
      return h(React.Fragment, null,
        h('div', {{ style: shellStyle, 'data-native-proposal-workbench': 'open' }}, h('div', {{ ref: host, style: {{ width: '100%', height: '100%' }} }}), h('button', {{ type: 'button', style: closeStyle, onClick: () => setOpen(false), 'aria-label': '返回 DSH 原生对话' }}, '返回 DSH')),
        !open && h('button', {{ type: 'button', style: launcherStyle, onClick: () => setOpen(true), 'aria-label': '打开方案工作台' }}, '打开方案工作台'),
      );
    }}

    return {{
      inject: ['slots'],
      apply(ctx) {{
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({{ name: 'shell.overlay', id: 'ai-proposal-workbench', order: 5, label: '方案工作台' }}, NativeWorkbench));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({{ name: 'sidebar.panellist', id: 'ai-proposal-workbench', order: 50, label: '方案工作台' }}, WorkbenchIcon));
      }},
    }};
  }},
}});
'''
    OUTPUT.write_text(client, encoding="utf-8")
    print(f"generated {OUTPUT} bytes={OUTPUT.stat().st_size} baseline_sha256={__import__('hashlib').sha256(source.encode()).hexdigest()}")

if __name__ == '__main__':
    main()
