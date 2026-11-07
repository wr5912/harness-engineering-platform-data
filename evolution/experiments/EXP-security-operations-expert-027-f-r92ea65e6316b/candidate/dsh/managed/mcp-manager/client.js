"use strict";
window.__ModuleLoader__.load({
    id: 'dsh-web-mcp-manager',
    factory(require) {
        const React = require('react');
        const { useEffect, useState } = React;
        const formName = 'mcp-session-manager';
        const defaultSpec = 'http://172.16.138.232:18087/v3/api-docs/mcp';
        const emptyServer = () => ({ id: '', description: '', specUrl: '', authType: 'credential',
            apiKey: '', authHeader: 'Authorization', loginUrl: '', loginUsername: '', loginPassword: '', loginTokenPath: 'data.token',
            enabled: true, tools: { mode: 'all', names: [] } });
        const commonHeaders = ['Authorization', 'X-API-Key', 'Api-Key', 'X-Auth-Token'];
        const emptyGroup = () => ({ id: '', members: [] });
        const duplicateMemberIds = members => [...new Set(members.map(member => member.serverId)
                .filter((serverId, index, ids) => ids.indexOf(serverId) !== index))];
        const input = (value, change, props = {}) => React.createElement("input", { value: value ?? '', onChange: event => change(event.target.value), ...props });
        const button = (label, action, disabled = false) => React.createElement("button", { type: "button", onClick: action, disabled: disabled }, label);
        const styles = `
      .mcp-manager{--mcp-ink:var(--hep-text,var(--dsw-alias-label-primary,#20344c));--mcp-muted:var(--hep-muted,var(--dsw-alias-label-secondary,#607186));--mcp-line:var(--hep-border,var(--dsw-alias-border-l3,#dfe6ee));--mcp-tint:var(--hep-surface-muted,color-mix(in srgb,var(--mcp-surface) 96%,#0075ca));--mcp-blue:var(--hep-primary,#0075ca);--mcp-link:var(--hep-link,#0075ca);--mcp-surface:var(--hep-surface,var(--dsw-alias-bg-layer-1,#fff));--mcp-active:var(--hep-primary-soft,color-mix(in srgb,var(--mcp-surface) 92%,var(--mcp-blue)));width:100%;max-width:1200px;margin:20px auto 40px;color:var(--mcp-ink);font-size:14px;line-height:1.6}
      body[data-ds-dark-theme] .mcp-manager{--mcp-link:var(--hep-link,var(--dsw-alias-link,#7aaaff))}
      .mcp-manager *{box-sizing:border-box}
      .mcp-manager button,.mcp-manager input,.mcp-manager select{font:inherit}
      .mcp-manager button{cursor:pointer;min-height:40px;padding:8px 12px;border:1px solid var(--mcp-line);border-radius:var(--hep-control-radius,8px);background:var(--mcp-surface);color:var(--mcp-ink);line-height:1.4;transition:background var(--hep-motion-fast,140ms),border-color var(--hep-motion-fast,140ms),box-shadow var(--hep-motion-fast,140ms),transform var(--hep-motion-fast,140ms)}
      .mcp-manager button:hover:not(:disabled){background:var(--mcp-tint);border-color:color-mix(in srgb,var(--mcp-blue) 32%,var(--mcp-line))}
      .mcp-manager button:active:not(:disabled){transform:translateY(1px)}
      .mcp-manager button:disabled{cursor:not-allowed;opacity:.5}
      .mcp-manager :is(button,input,select,summary):focus-visible{outline:2px solid var(--mcp-blue);outline-offset:3px}
      .mcp-manager .mcp-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:24px;padding:20px 24px;background:var(--mcp-tint);border:1px solid var(--mcp-line);border-radius:var(--hep-radius,12px)}
      .mcp-manager .mcp-toolbar strong{display:block;font-size:14px}.mcp-manager .mcp-toolbar p{margin:4px 0 0;color:var(--mcp-muted)}
      .mcp-manager .mcp-primary{border-color:var(--mcp-blue);background:var(--mcp-blue);color:#fff;padding:9px 16px;font-weight:600;white-space:nowrap}
      .mcp-manager .mcp-primary:hover:not(:disabled){background:var(--hep-primary-hover,#0063ab);border-color:var(--hep-primary-hover,#0063ab)}
      .mcp-manager .mcp-shell{min-width:0}
      .mcp-manager .mcp-tabs{display:flex;gap:24px;margin-bottom:24px;border-bottom:1px solid var(--mcp-line);overflow-x:auto}
      .mcp-manager .mcp-tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--mcp-muted);padding:12px 0;white-space:nowrap;font-weight:500}
      .mcp-manager .mcp-tabs button[aria-current=page]{border-color:var(--mcp-blue);color:var(--mcp-link);font-weight:600}
      .mcp-manager .mcp-tabs small{margin-left:6px;padding:2px 6px;border-radius:6px;background:var(--mcp-tint);color:inherit;font-size:12px;font-variant-numeric:tabular-nums}
      .mcp-manager .mcp-content{min-width:0}
      .mcp-manager h3{margin:0;color:var(--mcp-ink);line-height:1.4;overflow-wrap:anywhere;font-size:16px}
      .mcp-manager .mcp-muted{color:var(--mcp-muted);line-height:1.6;overflow-wrap:anywhere}
      .mcp-manager .mcp-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;align-items:start}
      .mcp-manager .mcp-card{min-width:0;border:1px solid var(--mcp-line);border-radius:var(--hep-radius,12px);background:var(--mcp-surface);padding:24px}
      .mcp-manager .mcp-sidebar{padding:8px;background:var(--mcp-tint);border-color:transparent}
      .mcp-manager .mcp-list-item{display:block;width:100%;margin:0 0 4px;padding:12px;border-color:transparent;background:transparent;text-align:left;color:var(--mcp-ink)}
      .mcp-manager .mcp-list-item:hover:not(:disabled){background:var(--mcp-surface);border-color:transparent}.mcp-manager .mcp-list-item[aria-current=true]{background:var(--mcp-surface);border-color:var(--mcp-line);box-shadow:0 2px 8px #16395908;color:var(--mcp-link)}
      .mcp-manager .mcp-list-item strong{display:block;overflow-wrap:anywhere;font-weight:600}.mcp-manager .mcp-list-item small{display:block;margin-top:4px;color:var(--mcp-muted);font-size:12px;overflow-wrap:anywhere}
      .mcp-manager .mcp-add{width:100%;margin-top:8px;border:1px dashed var(--mcp-line);background:transparent;color:var(--mcp-link);padding:10px;font-weight:500}
      .mcp-manager .mcp-card-head{display:flex;align-items:start;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:20px;border-bottom:1px solid var(--mcp-line)}
      .mcp-manager .mcp-card-head>div{min-width:0}.mcp-manager .mcp-card-head p{margin:6px 0 0}.mcp-manager .mcp-card-head .mcp-switch{flex:none;margin:0}
      .mcp-manager .mcp-section{padding-top:24px}.mcp-manager .mcp-section+.mcp-section{margin-top:24px;border-top:1px solid var(--mcp-line)}
      .mcp-manager .mcp-section h3{margin-bottom:16px}.mcp-manager .mcp-section>p{margin:0 0 16px}
      .mcp-manager .mcp-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 24px}
      .mcp-manager label.mcp-field{display:grid;gap:8px;min-width:0;color:var(--mcp-ink);font-weight:500}
      .mcp-manager .mcp-field input,.mcp-manager .mcp-field select{width:100%;min-width:0;min-height:40px;padding:8px 12px;border:1px solid var(--mcp-line);border-radius:var(--hep-control-radius,8px);background:var(--mcp-surface);color:var(--mcp-ink);font-weight:400;transition:border-color var(--hep-motion-fast,140ms),box-shadow var(--hep-motion-fast,140ms)}
      .mcp-manager .mcp-field input:focus,.mcp-manager .mcp-field select:focus{border-color:var(--mcp-blue);box-shadow:0 0 0 3px var(--mcp-active)}
      .mcp-manager .mcp-field small{font-size:12px;color:var(--mcp-muted);font-weight:400}
      .mcp-manager .mcp-wide{grid-column:1/-1}.mcp-manager .mcp-switch,.mcp-manager .mcp-check{display:flex;align-items:center;gap:10px;cursor:pointer}
      .mcp-manager .mcp-switch input,.mcp-manager .mcp-check input{width:16px;height:16px;flex:none;accent-color:var(--mcp-blue)}
      .mcp-manager .mcp-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:20px}
      .mcp-manager .mcp-danger{color:var(--dsw-alias-danger-text,#bd3a42);border-color:color-mix(in srgb,var(--dsw-alias-danger-text,#bd3a42) 25%,var(--mcp-line))}
      .mcp-manager .mcp-note{padding:16px;border-radius:var(--hep-control-radius,8px);background:var(--mcp-tint);color:var(--mcp-muted)}
      .mcp-manager .mcp-status{margin:0 0 20px;padding:12px 16px;border-left:3px solid var(--mcp-blue);border-radius:0 8px 8px 0;background:var(--mcp-active);color:var(--mcp-ink);overflow-wrap:anywhere}
      .mcp-manager .mcp-link{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere;padding:10px 12px;border:1px solid var(--mcp-line);border-radius:var(--hep-control-radius,8px);background:var(--mcp-tint);color:var(--mcp-link)}
      .mcp-manager .mcp-server-tools{border-bottom:1px solid var(--mcp-line);margin-top:12px;background:var(--mcp-surface)}
      .mcp-manager .mcp-server-tools summary{display:flex;align-items:center;gap:8px;cursor:pointer;padding:12px 0;font-weight:500;list-style:none;overflow-wrap:anywhere}
      .mcp-manager .mcp-server-tools summary::-webkit-details-marker{display:none}.mcp-manager .mcp-server-tools summary::before{content:'▸';flex:none;color:var(--mcp-link);transition:transform var(--hep-motion-fast,140ms)}.mcp-manager .mcp-server-tools[open] summary::before{transform:rotate(90deg)}
      .mcp-manager .mcp-server-tools summary .mcp-muted{margin-left:auto;flex:none;font-size:12px}
      .mcp-manager .mcp-tool-body{padding:4px 0 16px}.mcp-manager .mcp-tool-body p{margin:0 0 12px}
      .mcp-manager .mcp-tool-body h4{margin:16px 0 6px;font-size:13px;line-height:1.4}
      .mcp-manager .mcp-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:320px;overflow:auto;margin-top:12px}
      .mcp-manager .mcp-check{min-width:0;overflow-wrap:anywhere;padding:10px;border-radius:var(--hep-control-radius,8px);background:var(--mcp-tint);font-size:13px}
      .mcp-manager .mcp-result{max-height:420px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:16px 0 0;padding:20px;border:1px solid var(--mcp-line);border-radius:var(--hep-control-radius,8px);background:var(--mcp-tint);color:var(--mcp-ink);font-size:13px;line-height:1.7}
      .mcp-manager .mcp-catalog{list-style:none;margin:0;padding:0}.mcp-manager .mcp-catalog li{padding:16px 0;border-top:1px solid var(--mcp-line);overflow-wrap:anywhere}.mcp-manager .mcp-catalog li:first-child{border-top:0}.mcp-manager .mcp-catalog strong{display:block}.mcp-manager .mcp-catalog small{display:block;margin-top:4px;color:var(--mcp-muted);font-size:12px}
      .mcp-manager .mcp-source{padding:16px 0;border-top:1px solid var(--mcp-line)}.mcp-manager .mcp-source:first-child{border-top:0}
      .mcp-manager .mcp-empty{text-align:center;padding:64px 24px;color:var(--mcp-muted)}.mcp-manager .mcp-empty strong{display:block;color:var(--mcp-ink);font-size:16px}
      @media(max-width:1000px){.mcp-manager .mcp-layout{grid-template-columns:200px minmax(0,1fr);gap:20px}}
      @media(max-width:760px){.mcp-manager .mcp-toolbar{align-items:start;flex-direction:column;padding:16px}.mcp-manager .mcp-tabs{gap:20px}.mcp-manager .mcp-layout{grid-template-columns:minmax(0,1fr)}.mcp-manager .mcp-fields,.mcp-manager .mcp-tools{grid-template-columns:minmax(0,1fr)}.mcp-manager .mcp-card{padding:16px}.mcp-manager .mcp-sidebar{padding:8px}}
      @media(pointer:coarse){.mcp-manager button,.mcp-manager .mcp-field input,.mcp-manager .mcp-field select{min-height:44px}.mcp-manager .mcp-switch input,.mcp-manager .mcp-check input{width:20px;height:20px}}
      @media(prefers-reduced-motion:reduce){.mcp-manager button,.mcp-manager input,.mcp-manager select,.mcp-manager summary::before{transition:none}.mcp-manager button:active:not(:disabled){transform:none}}
    `;
        function Manager({ view, form, write }) {
            const state = form?.state;
            const [draft, setDraft] = useState(null);
            const [discovered, setDiscovered] = useState({});
            const [discoveredResources, setDiscoveredResources] = useState({});
            const [selected, setSelected] = useState('');
            const [sources, setSources] = useState(null);
            const [sourceId, setSourceId] = useState('');
            const [specName, setSpecName] = useState('');
            const [specUrl, setSpecUrl] = useState(defaultSpec);
            const [toolName, setToolName] = useState('');
            const [argumentsText, setArgumentsText] = useState('{}');
            const [uriText, setUriText] = useState('');
            const [result, setResult] = useState(null);
            const [catalog, setCatalog] = useState(null);
            const [status, setStatus] = useState('');
            const [busy, setBusy] = useState(false);
            const [page, setPage] = useState('servers');
            const [activeServer, setActiveServer] = useState(0);
            const [activeGroup, setActiveGroup] = useState(0);
            const [tokenVisible, setTokenVisible] = useState(false);
            useEffect(() => {
                if (state?.status !== 'ready')
                    return;
                setDraft({ servers: structuredClone(state.value.servers ?? []),
                    groups: structuredClone(state.value.groups ?? []), sharedToken: state.value.sharedToken ?? '', revision: state.revision });
            }, [state?.value, state?.revision, state?.status]);
            if (view === 'summary')
                return React.createElement(React.Fragment, null, "\u901A\u8FC7 OpenAPI \u89C4\u8303\u751F\u6210 MCP tools/resources\uFF0C\u5E76\u7BA1\u7406\u5206\u7EC4\u94FE\u63A5\u3002");
            if (!draft || !state)
                return React.createElement("p", null, "\u6B63\u5728\u8BFB\u53D6 Web profile \u914D\u7F6E\u2026");
            const editServer = (index, field, value) => setDraft(previous => {
                const next = structuredClone(previous);
                next.servers[index][field] = value;
                return next;
            });
            const switchServerType = (index, type) => setDraft(previous => {
                const next = structuredClone(previous);
                const current = next.servers[index];
                const saved = state.value.servers.find(server => server.id === current.id);
                const restore = saved && (type === 'openapi' ? 'specUrl' in saved : !('specUrl' in saved));
                const source = restore ? structuredClone(saved) : type === 'openapi' ? emptyServer()
                    : { url: '', headers: [], tools: { mode: 'all', names: [] } };
                next.servers[index] = { ...source, id: current.id, description: current.description ?? '',
                    serverName: current.serverName, enabled: current.enabled };
                return next;
            });
            const editGroup = (index, update) => setDraft(previous => {
                const next = structuredClone(previous);
                update(next.groups[index]);
                return next;
            });
            const diagnosticServer = draft.servers.find(server => server.id === selected) ?? draft.servers[0];
            const diagnosticId = diagnosticServer?.id ?? '';
            const call = async (action, extra = {}) => {
                setBusy(true);
                setStatus('');
                if (action === 'test')
                    setCatalog(null);
                try {
                    const response = await fetch('/api/mcp-manager', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ serverId: diagnosticId, action, ...extra }),
                    });
                    const data = await response.json();
                    if (!response.ok)
                        throw new Error(data.error || `HTTP ${response.status}`);
                    setResult(action === 'test' ? null : data);
                    if (action === 'sources' || action === 'create' || action === 'refresh' || action === 'toggle') {
                        const list = action === 'sources' ? data : await callSources(diagnosticId);
                        setSources(list);
                    }
                    if (action === 'test') {
                        setCatalog({ serverId: diagnosticId, data });
                        setDiscovered(previous => ({ ...previous,
                            [diagnosticId]: data.tools?.map(tool => tool.name) ?? [] }));
                        setDiscoveredResources(previous => ({ ...previous, [diagnosticId]: {
                                resourceUris: data.resources?.unavailable ? undefined : data.resources?.resources?.map(item => item.uri),
                                resourceTemplates: data.resourceTemplates?.unavailable ? undefined : data.resourceTemplates?.resourceTemplates?.map(item => item.uriTemplate),
                            } }));
                    }
                    setStatus(action === 'test' ? '配置解析与工具发现成功；新会话仍需单独验证。'
                        : '上游操作已返回；请检查下方结果和新会话。');
                }
                catch (error) {
                    setStatus(String(error));
                }
                finally {
                    setBusy(false);
                }
            };
            const callSources = async (serverId) => {
                const response = await fetch('/api/mcp-manager', { method: 'POST', credentials: 'same-origin',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ serverId, action: 'sources' }) });
                const data = await response.json();
                if (!response.ok)
                    throw new Error(data.error || `HTTP ${response.status}`);
                return data;
            };
            const callTool = action => {
                try {
                    void call(action, { sourceId, toolName, arguments: JSON.parse(argumentsText) });
                }
                catch (error) {
                    setStatus(`工具参数 JSON 无效：${String(error)}`);
                }
            };
            const save = async () => {
                setBusy(true);
                setStatus('');
                try {
                    for (const server of draft.servers) {
                        if (!('specUrl' in server)) {
                            if (server.enabled !== false && !server.url)
                                throw new Error(`${server.id}: 请填写 MCP URL`);
                            continue;
                        }
                        if (!/^[A-Za-z0-9_-]{1,32}$/.test(server.id) || (server.enabled !== false && !server.specUrl))
                            throw new Error('请填写有效的服务器 ID 和 OpenAPI 接口规范地址');
                        if (!server.specUrl)
                            continue;
                        const url = new URL(server.specUrl);
                        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
                            throw new Error('OpenAPI 接口规范地址须为 HTTP(S) URL');
                        if (server.authType === 'credential' && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(server.authHeader ?? 'Authorization'))
                            throw new Error('凭据 Header 字段名无效');
                        if (server.authType === 'login') {
                            if (server.enabled !== false && (!server.loginUrl || !server.loginUsername || !server.loginPassword || !server.loginTokenPath))
                                throw new Error('请填写完整的登录授权信息');
                            if (!server.loginUrl)
                                continue;
                            const loginUrl = new URL(server.loginUrl);
                            if (!['http:', 'https:'].includes(loginUrl.protocol) || loginUrl.username || loginUrl.password || loginUrl.hash)
                                throw new Error('登录接口地址须为 HTTP(S) URL');
                            if (!server.loginTokenPath.split('.').every(part => /^[A-Za-z_][\w-]*$/.test(part)))
                                throw new Error('凭据字段路径无效');
                        }
                    }
                    const response = await write([
                        { op: 'set', path: ['servers'], value: draft.servers },
                        { op: 'set', path: ['groups'], value: draft.groups },
                        { op: 'set', path: ['sharedToken'], value: draft.sharedToken },
                    ], draft.revision);
                    setStatus(response.ok ? '配置已保存。请新建会话验证连接与工具发现。'
                        : `保存失败：${response.error.message}`);
                    if (response.ok)
                        setCatalog(null);
                }
                catch (error) {
                    setStatus(String(error));
                }
                finally {
                    setBusy(false);
                }
            };
            const toggleSelection = (groupIndex, serverId, field, value) => editGroup(groupIndex, group => {
                let member = group.members.find(item => item.serverId === serverId);
                if (!member) {
                    member = { serverId, names: [], resourceUris: [], resourceTemplates: [] };
                    group.members.push(member);
                }
                const current = member[field] ?? [];
                member[field] = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
                group.members = group.members.filter(item => item.names?.length || item.resourceUris?.length || item.resourceTemplates?.length);
            });
            const mergeDuplicateMembers = groupIndex => editGroup(groupIndex, group => {
                const firstByServer = new Map();
                group.members = group.members.filter(member => {
                    const first = firstByServer.get(member.serverId);
                    if (!first) {
                        firstByServer.set(member.serverId, member);
                        return true;
                    }
                    for (const field of ['names', 'resourceUris', 'resourceTemplates']) {
                        first[field] = [...new Set([...(first[field] ?? []), ...(member[field] ?? [])])];
                    }
                    return false;
                });
            });
            const sourceList = Array.isArray(sources) ? sources : sources?.items ?? sources?.data ?? [];
            const isDirty = JSON.stringify(draft.servers) !== JSON.stringify(state.value.servers ?? [])
                || JSON.stringify(draft.groups) !== JSON.stringify(state.value.groups ?? [])
                || draft.sharedToken !== (state.value.sharedToken ?? '');
            const editingServer = draft.servers[activeServer];
            const editingGroup = draft.groups[activeGroup];
            const duplicateIds = editingGroup ? duplicateMemberIds(editingGroup.members) : [];
            const savedGroup = (state.value.groups ?? []).find(group => group.id === editingGroup?.id);
            const savedDuplicateIds = savedGroup ? duplicateMemberIds(savedGroup.members) : [];
            const linkReady = !!savedGroup && !duplicateIds.length && !savedDuplicateIds.length
                && !!state.value.sharedToken && draft.sharedToken === state.value.sharedToken;
            return React.createElement("section", { className: "mcp-manager" },
                React.createElement("style", null, styles),
                React.createElement("div", { className: "mcp-toolbar" },
                    React.createElement("div", null,
                        React.createElement("strong", null, "\u5F53\u524D\u5B9E\u4F8B\u7684 MCP \u914D\u7F6E"),
                        React.createElement("p", null, "\u4FEE\u6539\u540E\u4FDD\u5B58\u5230 Web profile\uFF0C\u518D\u65B0\u5EFA\u4F1A\u8BDD\u9A8C\u8BC1\u8FDE\u63A5\u548C\u5DE5\u5177\u53D1\u73B0\u3002")),
                    React.createElement("button", { className: "mcp-primary", type: "button", onClick: save, disabled: busy || !state.writable || !isDirty }, "\u4FDD\u5B58\u66F4\u6539")),
                status && React.createElement("p", { className: "mcp-status", role: "status" }, status),
                React.createElement("div", { className: "mcp-shell" },
                    React.createElement("nav", { className: "mcp-tabs", "aria-label": "MCP \u914D\u7F6E\u7BA1\u7406\u9875\u9762" },
                        React.createElement("button", { type: "button", "aria-current": page === 'servers' ? 'page' : undefined, onClick: () => setPage('servers') },
                            "MCP \u670D\u52A1\u5668 ",
                            React.createElement("small", null, draft.servers.length)),
                        React.createElement("button", { type: "button", "aria-current": page === 'groups' ? 'page' : undefined, onClick: () => setPage('groups') },
                            "\u5DE5\u5177\u5206\u7EC4 ",
                            React.createElement("small", null, draft.groups.length)),
                        React.createElement("button", { type: "button", "aria-current": page === 'connection' ? 'page' : undefined, onClick: () => setPage('connection') }, "\u5DE5\u5177\u4E0E\u8D44\u6E90")),
                    React.createElement("div", { className: "mcp-content" },
                        page === 'servers' && React.createElement(React.Fragment, null,
                            React.createElement("div", { className: "mcp-layout" },
                                React.createElement("aside", { className: "mcp-card mcp-sidebar", "aria-label": "\u670D\u52A1\u5668\u5217\u8868" },
                                    draft.servers.map((server, index) => React.createElement("button", { key: index, className: "mcp-list-item", type: "button", "aria-current": activeServer === index ? 'true' : undefined, onClick: () => setActiveServer(index) },
                                        React.createElement("strong", null, server.serverName || server.id || '新服务器'),
                                        React.createElement("small", null,
                                            server.id || '未设置 ID',
                                            " \u00B7 ",
                                            server.enabled === false ? '已停用' : '已启用'))),
                                    React.createElement("button", { className: "mcp-add", type: "button", onClick: () => { setActiveServer(draft.servers.length); setDraft(previous => ({ ...previous, servers: [...previous.servers, emptyServer()] })); } }, "\uFF0B \u65B0\u589E\u670D\u52A1\u5668")),
                                editingServer ? React.createElement("div", { className: "mcp-card" },
                                    React.createElement("div", { className: "mcp-card-head" },
                                        React.createElement("div", null,
                                            React.createElement("h3", null, editingServer.serverName || editingServer.id || '新服务器'),
                                            React.createElement("p", { className: "mcp-muted" }, editingServer.description || editingServer.id || '填写 ID 与 OpenAPI 规范地址后保存')),
                                        React.createElement("label", { className: "mcp-switch" },
                                            React.createElement("input", { type: "checkbox", checked: editingServer.enabled !== false, onChange: event => editServer(activeServer, 'enabled', event.target.checked) }),
                                            "\u542F\u7528")),
                                    React.createElement("section", { className: "mcp-section" },
                                        React.createElement("h3", null, "\u57FA\u672C\u4FE1\u606F"),
                                        React.createElement("div", { className: "mcp-fields" },
                                            React.createElement("label", { className: "mcp-field" },
                                                "ID",
                                                input(editingServer.id, value => editServer(activeServer, 'id', value), { placeholder: '例如 sec-ops-api' })),
                                            React.createElement("label", { className: "mcp-field" },
                                                "\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
                                                input(editingServer.description, value => editServer(activeServer, 'description', value))),
                                            React.createElement("label", { className: "mcp-field" },
                                                "\u76F4\u8FDE\u670D\u52A1\u540D\u79F0\uFF08\u53EF\u9009\uFF09",
                                                input(editingServer.serverName, value => editServer(activeServer, 'serverName', value)),
                                                React.createElement("small", null, "\u4E3A\u7A7A\u65F6\u4F7F\u7528\u670D\u52A1 ID\uFF1B\u5206\u7EC4\u94FE\u63A5\u4F7F\u7528\u5206\u7EC4 ID \u4F5C\u4E3A\u8FDE\u63A5\u540D\u3002")),
                                            React.createElement("label", { className: "mcp-field" },
                                                "\u63A5\u5165\u65B9\u5F0F",
                                                React.createElement("select", { value: 'specUrl' in editingServer ? 'openapi' : 'mcp', onChange: event => switchServerType(activeServer, event.target.value) },
                                                    React.createElement("option", { value: "openapi" }, "OpenAPI \u63A5\u53E3\u89C4\u8303"),
                                                    React.createElement("option", { value: "mcp" }, "\u73B0\u6210 MCP \u8FDE\u63A5"))))),
                                    'specUrl' in editingServer ? React.createElement("section", { className: "mcp-section" },
                                        React.createElement("h3", null, "OpenAPI \u63A5\u53E3"),
                                        React.createElement("p", { className: "mcp-muted" }, "\u4FDD\u5B58\u540E\uFF0C\u63A5\u53E3\u89C4\u8303\u4E2D\u7684\u64CD\u4F5C\u4F1A\u81EA\u52A8\u751F\u6210 MCP \u5DE5\u5177\u6216\u8D44\u6E90\uFF1B\u670D\u52A1\u5668\u5185\u5168\u90E8\u5F00\u653E\u3002\u89C4\u8303\u5148\u533F\u540D\u8BFB\u53D6\uFF0C\u9047 401/403 \u518D\u7528\u5DF2\u914D\u7F6E\u7684\u6388\u6743\u91CD\u8BD5\uFF1B\u4E1A\u52A1\u63A5\u53E3\u59CB\u7EC8\u6309\u6388\u6743\u65B9\u5F0F\u8C03\u7528\u3002"),
                                        React.createElement("div", { className: "mcp-fields" },
                                            React.createElement("label", { className: "mcp-field mcp-wide" },
                                                "OpenAPI \u63A5\u53E3\u89C4\u8303\u5730\u5740",
                                                input(editingServer.specUrl, value => editServer(activeServer, 'specUrl', value), { placeholder: defaultSpec })),
                                            React.createElement("label", { className: "mcp-field" },
                                                "\u6388\u6743\u65B9\u5F0F",
                                                React.createElement("select", { value: editingServer.authType || (editingServer.apiKey ? 'legacy' : 'credential'), onChange: event => editServer(activeServer, 'authType', event.target.value) },
                                                    !editingServer.authType && editingServer.apiKey && React.createElement("option", { value: "legacy" }, "\u6309\u89C4\u8303\u5339\u914D\uFF08\u65E7\u914D\u7F6E\uFF09"),
                                                    React.createElement("option", { value: "credential" }, "\u51ED\u636E\u6388\u6743"),
                                                    React.createElement("option", { value: "login" }, "\u7528\u6237\u540D\u5BC6\u7801\u767B\u9646\u6388\u6743"))),
                                            editingServer.authType === 'login' ? React.createElement(React.Fragment, null,
                                                React.createElement("label", { className: "mcp-field mcp-wide" },
                                                    "\u767B\u5F55\u63A5\u53E3\u5730\u5740",
                                                    input(editingServer.loginUrl, value => editServer(activeServer, 'loginUrl', value), { placeholder: 'https://…/login' })),
                                                React.createElement("label", { className: "mcp-field" },
                                                    "\u7528\u6237\u540D",
                                                    input(editingServer.loginUsername, value => editServer(activeServer, 'loginUsername', value), { autoComplete: 'username' })),
                                                React.createElement("label", { className: "mcp-field" },
                                                    "\u5BC6\u7801",
                                                    input(editingServer.loginPassword, value => editServer(activeServer, 'loginPassword', value), { type: 'password', autoComplete: 'new-password' })),
                                                React.createElement("label", { className: "mcp-field" },
                                                    "\u767B\u5F55\u54CD\u5E94\u4E2D\u7684\u51ED\u636E\u5B57\u6BB5",
                                                    input(editingServer.loginTokenPath, value => editServer(activeServer, 'loginTokenPath', value), { placeholder: 'token 或 data.access_token' })),
                                                React.createElement("p", { className: "mcp-muted mcp-wide" }, "\u4EE5 JSON \u7684 username\u3001password \u5B57\u6BB5\u767B\u5F55\uFF1B\u51ED\u636E\u6309 OpenAPI \u5B89\u5168\u58F0\u660E\u53D1\u9001\uFF0C401 \u65F6\u91CD\u65B0\u767B\u5F55\u4E00\u6B21\u3002")) : React.createElement(React.Fragment, null,
                                                React.createElement("label", { className: "mcp-field" },
                                                    "\u51ED\u636E Header \u5B57\u6BB5",
                                                    React.createElement("select", { value: commonHeaders.includes(editingServer.authHeader ?? 'Authorization') ? (editingServer.authHeader ?? 'Authorization') : 'custom', onChange: event => editServer(activeServer, 'authHeader', event.target.value === 'custom' ? '' : event.target.value) },
                                                        commonHeaders.map(name => React.createElement("option", { key: name, value: name }, name)),
                                                        React.createElement("option", { value: "custom" }, "\u81EA\u5B9A\u4E49\u5B57\u6BB5"))),
                                                !commonHeaders.includes(editingServer.authHeader ?? 'Authorization') && React.createElement("label", { className: "mcp-field" },
                                                    "\u81EA\u5B9A\u4E49 Header \u5B57\u6BB5\u540D",
                                                    input(editingServer.authHeader, value => editServer(activeServer, 'authHeader', value), { placeholder: 'X-Custom-Token' })),
                                                React.createElement("label", { className: "mcp-field mcp-wide" },
                                                    "\u51ED\u636E\uFF08\u53EF\u9009\uFF09",
                                                    input(editingServer.apiKey, value => editServer(activeServer, 'apiKey', value), { type: 'password', autoComplete: 'new-password' }),
                                                    React.createElement("small", null, "\u9ED8\u8BA4\u5C06\u51ED\u636E\u539F\u6587\u5199\u5165 Authorization\uFF1B\u82E5\u63A5\u53E3\u8981\u6C42 Bearer\uFF0C\u8BF7\u5728\u51ED\u636E\u4E2D\u5305\u542B Bearer \u524D\u7F00\u3002"))))) : React.createElement(React.Fragment, null,
                                        React.createElement("section", { className: "mcp-section" },
                                            React.createElement("h3", null, "\u8FDE\u63A5\u8BBE\u7F6E"),
                                            React.createElement("p", { className: "mcp-muted" }, "\u586B\u5199 Streamable HTTP MCP URL\uFF1B\u9700\u8981\u9274\u6743\u65F6\u6DFB\u52A0\u8BF7\u6C42 Header\uFF0C\u4F8B\u5982 Authorization: Bearer \u2026\u3002\u4FDD\u5B58\u540E\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002"),
                                            React.createElement("div", { className: "mcp-fields" },
                                                React.createElement("label", { className: "mcp-field mcp-wide" },
                                                    "MCP URL",
                                                    input(editingServer.url, value => editServer(activeServer, 'url', value), { placeholder: 'https://…/mcp' })),
                                                (editingServer.headers ?? []).map((header, index) => React.createElement(React.Fragment, { key: index },
                                                    React.createElement("label", { className: "mcp-field" },
                                                        "Header \u540D\u79F0 ",
                                                        index + 1,
                                                        input(header.name, value => editServer(activeServer, 'headers', editingServer.headers.map((item, at) => at === index ? { ...item, name: value } : item)), { placeholder: 'Authorization' })),
                                                    React.createElement("label", { className: "mcp-field" },
                                                        "Header \u503C ",
                                                        index + 1,
                                                        input(header.value, value => editServer(activeServer, 'headers', editingServer.headers.map((item, at) => at === index ? { ...item, value } : item)), { type: 'password', autoComplete: 'new-password' })),
                                                    React.createElement("div", { className: "mcp-wide" }, button(`删除 Header ${index + 1}`, () => editServer(activeServer, 'headers', editingServer.headers.filter((_, at) => at !== index)))))),
                                                React.createElement("div", { className: "mcp-wide" }, button('＋ 添加请求 Header', () => editServer(activeServer, 'headers', [...(editingServer.headers ?? []), { name: '', value: '' }]))))),
                                        React.createElement("section", { className: "mcp-section" },
                                            React.createElement("h3", null, "\u5DE5\u5177\u8303\u56F4"),
                                            React.createElement("div", { className: "mcp-fields" },
                                                React.createElement("label", { className: "mcp-field" },
                                                    "\u5F00\u653E\u65B9\u5F0F",
                                                    React.createElement("select", { value: editingServer.tools?.mode ?? 'all', onChange: event => editServer(activeServer, 'tools', { mode: event.target.value, names: editingServer.tools?.names ?? [] }) },
                                                        React.createElement("option", { value: "all" }, "\u5168\u90E8\u5DE5\u5177"),
                                                        React.createElement("option", { value: "selected" }, "\u4EC5\u6307\u5B9A\u5DE5\u5177"))),
                                                editingServer.tools?.mode === 'selected' && React.createElement("label", { className: "mcp-field mcp-wide" },
                                                    "\u5DE5\u5177\u539F\u540D\uFF08\u9017\u53F7\u5206\u9694\uFF09",
                                                    input((editingServer.tools.names ?? []).join(', '), value => editServer(activeServer, 'tools', { mode: 'selected', names: value.split(',').map(name => name.trim()).filter(Boolean) })))),
                                            React.createElement("p", { className: "mcp-muted" }, "\u5DE5\u5177\u4ECD\u53D7\u4E1A\u52A1 Guard \u9650\u5236\uFF1B\u5B50\u667A\u80FD\u4F53\u7684 toolFilter \u53EF\u6309\u89D2\u8272\u8FDB\u4E00\u6B65\u6536\u7D27\u3002"))),
                                    React.createElement("div", { className: "mcp-actions" },
                                        React.createElement("button", { className: "mcp-danger", type: "button", onClick: () => {
                                                if (!window.confirm(`删除服务器「${editingServer.serverName || editingServer.id}」及其分组引用？`))
                                                    return;
                                                const serverId = editingServer.id;
                                                setDraft(previous => ({ ...previous, servers: previous.servers.filter((_, at) => at !== activeServer), groups: previous.groups.map(group => ({ ...group, members: group.members.filter(member => member.serverId !== serverId) })) }));
                                                setActiveServer(Math.max(0, activeServer - 1));
                                            } }, "\u5220\u9664\u670D\u52A1\u5668"))) : React.createElement("div", { className: "mcp-card mcp-empty" },
                                    React.createElement("strong", null, "\u6682\u65E0\u670D\u52A1\u5668"),
                                    React.createElement("p", null, "\u4ECE\u5DE6\u4FA7\u65B0\u589E\u4E00\u4E2A MCP \u670D\u52A1\u5668\u3002")))),
                        page === 'groups' && React.createElement(React.Fragment, null,
                            React.createElement("div", { className: "mcp-card", style: { marginBottom: 16 } },
                                React.createElement("h3", null, "\u7EDF\u4E00\u8BBF\u95EE Token"),
                                React.createElement("p", { className: "mcp-muted" }, "\u5206\u7EC4\u548C\u667A\u80FD\u4F53 MCP \u94FE\u63A5\u5171\u7528\u3002\u672A\u751F\u6210\u65F6\u94FE\u63A5\u4E0D\u63A5\u53D7\u8BBF\u95EE\uFF1B\u66F4\u6362\u5E76\u4FDD\u5B58\u540E\u65E7 Token \u7ACB\u5373\u5931\u6548\u3002"),
                                React.createElement("div", { className: "mcp-fields" },
                                    React.createElement("label", { className: "mcp-field mcp-wide" },
                                        "Token",
                                        input(draft.sharedToken, () => { }, { type: tokenVisible ? 'text' : 'password', readOnly: true, placeholder: '尚未生成', autoComplete: 'off', id: 'mcp-shared-token' }))),
                                React.createElement("div", { className: "mcp-actions" },
                                    button(draft.sharedToken ? '重新生成 Token' : '生成 Token', () => {
                                        if (draft.sharedToken && !window.confirm('更换 Token 并保存后，旧 Token 立即失效。继续？'))
                                            return;
                                        const bytes = new Uint8Array(32);
                                        window.crypto.getRandomValues(bytes);
                                        setDraft(previous => ({ ...previous, sharedToken: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') }));
                                        setStatus('新 Token 已生成；请点击「保存更改」使其生效。');
                                    }),
                                    button(tokenVisible ? '隐藏' : '显示', () => setTokenVisible(value => !value), !draft.sharedToken),
                                    button('复制 Token', async () => { try {
                                        await navigator.clipboard.writeText(draft.sharedToken);
                                        setStatus('Token 已复制。');
                                    }
                                    catch {
                                        setTokenVisible(true);
                                        setStatus('当前浏览器无法自动复制，请显示后手动复制。');
                                    } }, !draft.sharedToken))),
                            React.createElement("div", { className: "mcp-layout" },
                                React.createElement("aside", { className: "mcp-card mcp-sidebar", "aria-label": "\u5206\u7EC4\u5217\u8868" },
                                    draft.groups.map((group, index) => React.createElement("button", { key: index, className: "mcp-list-item", type: "button", "aria-current": activeGroup === index ? 'true' : undefined, onClick: () => setActiveGroup(index) },
                                        React.createElement("strong", null, group.id || '新分组'),
                                        React.createElement("small", null,
                                            group.members.reduce((count, member) => count + (member.names?.length ?? 0), 0),
                                            " \u4E2A\u5DE5\u5177 \u00B7 ",
                                            group.members.reduce((count, member) => count + (member.resourceUris?.length ?? 0), 0),
                                            " \u4E2A\u8D44\u6E90 \u00B7 ",
                                            group.members.reduce((count, member) => count + (member.resourceTemplates?.length ?? 0), 0),
                                            " \u4E2A\u6A21\u677F"))),
                                    React.createElement("button", { className: "mcp-add", type: "button", onClick: () => { setActiveGroup(draft.groups.length); setDraft(previous => ({ ...previous, groups: [...previous.groups, emptyGroup()] })); } }, "\uFF0B \u65B0\u589E\u5206\u7EC4")),
                                editingGroup ? React.createElement("div", { className: "mcp-card" },
                                    React.createElement("div", { className: "mcp-card-head" },
                                        React.createElement("div", null,
                                            React.createElement("h3", null, editingGroup.id || '新分组'),
                                            React.createElement("p", { className: "mcp-muted" }, "\u4EC5\u5F00\u653E\u6B64\u7EC4\u52FE\u9009\u7684\u5DE5\u5177\u4E0E\u8D44\u6E90\u3002"))),
                                    React.createElement("section", { className: "mcp-section" },
                                        React.createElement("div", { className: "mcp-fields" },
                                            React.createElement("label", { className: "mcp-field" },
                                                "\u5206\u7EC4 ID",
                                                input(editingGroup.id, value => editGroup(activeGroup, group => { group.id = value; })))),
                                        /^[A-Za-z0-9_-]{1,32}$/.test(editingGroup.id) && React.createElement("div", { className: "mcp-actions" },
                                            React.createElement("span", { className: "mcp-muted" }, "MCP \u94FE\u63A5"),
                                            linkReady && React.createElement("code", { className: "mcp-link" }, new URL(`mcp/groups/${editingGroup.id}/v2`, document.baseURI).href),
                                            button('复制分组链接', async () => { try {
                                                await navigator.clipboard.writeText(new URL(`mcp/groups/${editingGroup.id}/v2`, document.baseURI).href);
                                                setStatus('分组链接已复制。');
                                            }
                                            catch {
                                                setStatus('当前浏览器无法自动复制，请手动复制上方链接。');
                                            } }, !linkReady)),
                                        editingGroup.id && !/^[A-Za-z0-9_-]{1,32}$/.test(editingGroup.id) && React.createElement("p", { className: "mcp-muted" }, "\u5206\u7EC4 ID \u987B\u4E3A 1\u201332 \u4E2A\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u6216\u8FDE\u5B57\u7B26\u3002"),
                                        !!duplicateIds.length && React.createElement("div", { className: "mcp-note" },
                                            "\u670D\u52A1 ",
                                            duplicateIds.join('、'),
                                            " \u5728\u6B64\u5206\u7EC4\u4E2D\u6709\u91CD\u590D\u6210\u5458\uFF0Cv2 \u94FE\u63A5\u4E0D\u53EF\u7528\u3002\u5408\u5E76\u4F1A\u5BF9\u5DE5\u5177\u3001\u8D44\u6E90 URI \u548C\u8D44\u6E90\u6A21\u677F\u53D6\u5E76\u96C6\uFF0C\u5E76\u6539\u53D8\u65E7\u7248\u5206\u7EC4\u7684\u76EE\u6807\u6458\u8981\uFF1B\u8BF7\u4FDD\u5B58\u540E\u91CD\u65B0\u53D1\u73B0\u5DE5\u5177\u3002",
                                            React.createElement("div", { className: "mcp-actions" }, button('合并同源成员', () => mergeDuplicateMembers(activeGroup)))),
                                        !duplicateIds.length && !!savedDuplicateIds.length && React.createElement("p", { className: "mcp-muted" }, "\u91CD\u590D\u6210\u5458\u5DF2\u5728\u8349\u7A3F\u4E2D\u5408\u5E76\uFF1B\u4FDD\u5B58\u5E76\u7B49\u5F85\u914D\u7F6E\u5237\u65B0\u540E\uFF0Cv2 \u94FE\u63A5\u624D\u53EF\u4F7F\u7528\u3002"),
                                        !savedGroup && !duplicateIds.length && React.createElement("p", { className: "mcp-muted" }, "\u6B64\u5206\u7EC4\u5C1A\u672A\u4FDD\u5B58\uFF1B\u4FDD\u5B58\u540E\u624D\u4F1A\u751F\u6210\u53EF\u7528\u94FE\u63A5\u3002"),
                                        !!savedGroup && !duplicateIds.length && !savedDuplicateIds.length && !state.value.sharedToken && React.createElement("p", { className: "mcp-muted" }, "\u8BF7\u751F\u6210\u5E76\u4FDD\u5B58\u7EDF\u4E00\u8BBF\u95EE Token \u540E\u4F7F\u7528\u5206\u7EC4\u94FE\u63A5\u3002"),
                                        !!savedGroup && !duplicateIds.length && !savedDuplicateIds.length && !!state.value.sharedToken && draft.sharedToken !== state.value.sharedToken && React.createElement("p", { className: "mcp-muted" }, "\u65B0 Token \u5C1A\u672A\u4FDD\u5B58\uFF1B\u4FDD\u5B58\u540E\u518D\u590D\u5236\u5206\u7EC4\u94FE\u63A5\u3002"),
                                        linkReady && isDirty && React.createElement("p", { className: "mcp-muted" }, "\u5F53\u524D\u8349\u7A3F\u5C1A\u672A\u4FDD\u5B58\uFF1B\u94FE\u63A5\u4ECD\u4F7F\u7528\u4E0A\u6B21\u4FDD\u5B58\u7684\u914D\u7F6E\u3002"),
                                        React.createElement("p", { className: "mcp-muted" }, "\u901A\u8FC7 Authorization: Bearer <\u7EDF\u4E00\u8BBF\u95EE Token> \u8C03\u7528\u3002DSH \u4E2D\u5C06\u8FDE\u63A5\u540D\u8BBE\u4E3A\u5206\u7EC4 ID\uFF0C\u6A21\u578B\u53EF\u89C1\u5DE5\u5177\u540D\u4EE5\u8BE5\u5206\u7EC4\u4E3A\u524D\u7F00\uFF1B\u8D85\u957F\u5DE5\u5177\u540D\u7531 DSH \u7F29\u77ED\u3002")),
                                    React.createElement("section", { className: "mcp-section" },
                                        React.createElement("h3", null, "\u9009\u62E9\u5DE5\u5177\u4E0E\u8D44\u6E90"),
                                        React.createElement("p", { className: "mcp-muted" }, "\u53D1\u73B0\u4F7F\u7528\u4E0A\u6B21\u4FDD\u5B58\u7684\u670D\u52A1\u914D\u7F6E\uFF1B\u5DF2\u4FDD\u5B58\u7684\u9009\u62E9\u59CB\u7EC8\u663E\u793A\u3002"),
                                        draft.servers.map((server, index) => {
                                            const members = editingGroup.members.filter(item => item.serverId === server.id);
                                            const selected = Object.fromEntries(['names', 'resourceUris', 'resourceTemplates'].map(field => [field, [...new Set(members.flatMap(member => member[field] ?? []))]]));
                                            const needsMerge = members.length > 1;
                                            const resources = discoveredResources[server.id];
                                            const sections = [
                                                { field: 'names', title: '工具', items: [...new Set([...selected.names, ...(discovered[server.id] ?? [])])], discovered: discovered[server.id] },
                                                { field: 'resourceUris', title: '资源 URI', items: [...new Set([...selected.resourceUris, ...(resources?.resourceUris ?? [])])], discovered: resources?.resourceUris },
                                                { field: 'resourceTemplates', title: '资源模板', items: [...new Set([...selected.resourceTemplates, ...(resources?.resourceTemplates ?? [])])], discovered: resources?.resourceTemplates },
                                            ];
                                            const selectedCount = selected.names.length + selected.resourceUris.length + selected.resourceTemplates.length;
                                            return React.createElement("details", { className: "mcp-server-tools", key: index },
                                                React.createElement("summary", null,
                                                    server.serverName || server.id || '新服务器',
                                                    React.createElement("span", { className: "mcp-muted" },
                                                        selectedCount,
                                                        " \u4E2A\u5DF2\u9009",
                                                        server.enabled === false ? ' · 已停用' : '')),
                                                React.createElement("div", { className: "mcp-tool-body" },
                                                    React.createElement("p", { className: "mcp-muted" },
                                                        "\u670D\u52A1\u5668 ID\uFF1A",
                                                        server.id || '未设置 ID',
                                                        server.enabled === false ? '。此来源已停用，所选能力不会通过分组开放。' : '',
                                                        needsMerge ? '。此来源有重复成员，请先合并再编辑选择。' : ''),
                                                    React.createElement("button", { className: "mcp-quiet", type: "button", onClick: () => { setSelected(server.id); void callTest(server.id); }, disabled: busy || !server.id || server.enabled === false }, "\u53D1\u73B0\u5DE5\u5177\u4E0E\u8D44\u6E90"),
                                                    sections.map(section => React.createElement("section", { key: section.field },
                                                        React.createElement("h4", null, section.title),
                                                        section.items.length ? React.createElement("div", { className: "mcp-tools" }, section.items.map(item => React.createElement("label", { className: "mcp-check", key: item },
                                                            React.createElement("input", { type: "checkbox", checked: selected[section.field].includes(item), disabled: needsMerge, onChange: () => toggleSelection(activeGroup, server.id, section.field, item) }),
                                                            item,
                                                            selected[section.field].includes(item) && Array.isArray(section.discovered) && !section.discovered.includes(item) && React.createElement("span", { className: "mcp-muted" }, "\uFF08\u5F53\u524D\u672A\u53D1\u73B0\uFF09"))))
                                                            : React.createElement("p", { className: "mcp-muted" }, section.discovered === undefined ? '尚未发现，或此服务未提供该列表。' : '没有可选项目。'),
                                                        section.discovered === undefined && selected[section.field].length > 0 && React.createElement("p", { className: "mcp-muted" }, "\u5DF2\u4FDD\u5B58\u7684\u9009\u62E9\u5C1A\u65E0\u6CD5\u901A\u8FC7\u5F53\u524D\u53D1\u73B0\u7ED3\u679C\u6838\u5BF9\u3002")))));
                                        }),
                                        editingGroup.members.filter(member => !draft.servers.some(server => server.id === member.serverId)).map(member => React.createElement("p", { className: "mcp-note", key: member.serverId },
                                            "\u5DF2\u9009\u6765\u6E90 ",
                                            member.serverId,
                                            " \u4E0D\u5728\u670D\u52A1\u5217\u8868\u4E2D\uFF1B\u8BF7\u6062\u590D\u8BE5\u670D\u52A1\u6216\u53D6\u6D88\u6B64\u5206\u7EC4\u5F15\u7528\u3002")),
                                        !draft.servers.length && React.createElement("p", { className: "mcp-note" }, "\u8BF7\u5148\u6DFB\u52A0 MCP \u670D\u52A1\u5668\u3002")),
                                    React.createElement("div", { className: "mcp-actions" },
                                        React.createElement("button", { className: "mcp-danger", type: "button", onClick: () => {
                                                if (!window.confirm(`删除分组「${editingGroup.id}」？`))
                                                    return;
                                                setDraft(previous => ({ ...previous, groups: previous.groups.filter((_, at) => at !== activeGroup) }));
                                                setActiveGroup(Math.max(0, activeGroup - 1));
                                            } }, "\u5220\u9664\u5206\u7EC4"))) : React.createElement("div", { className: "mcp-card mcp-empty" },
                                    React.createElement("strong", null, "\u6682\u65E0\u5206\u7EC4"),
                                    React.createElement("p", null, "\u4ECE\u5DE6\u4FA7\u65B0\u589E\u5DE5\u5177\u4E0E\u8D44\u6E90\u5206\u7EC4\u3002")))),
                        page === 'connection' && React.createElement(React.Fragment, null,
                            React.createElement("div", { className: "mcp-card" },
                                React.createElement("h3", null, "\u8FDE\u63A5\u68C0\u67E5"),
                                React.createElement("p", { className: "mcp-muted" }, "\u6D4B\u8BD5\u4F7F\u7528\u4E0A\u6B21\u4FDD\u5B58\u7684\u670D\u52A1\u5668\u914D\u7F6E\u3002"),
                                React.createElement("div", { className: "mcp-fields" },
                                    React.createElement("label", { className: "mcp-field" },
                                        "\u670D\u52A1\u5668",
                                        React.createElement("select", { value: diagnosticId, onChange: event => { setSelected(event.target.value); setSources(null); setResult(null); setCatalog(null); setUriText(''); } }, draft.servers.map((server, index) => React.createElement("option", { key: index, value: server.id }, server.serverName || server.id || '新服务器'))))),
                                React.createElement("div", { className: "mcp-actions" }, button('发现工具与资源', () => call('test'), busy || !diagnosticId))),
                            diagnosticServer?.specUrl ? React.createElement("div", { className: "mcp-card", style: { marginTop: 16 } },
                                React.createElement("h3", null, "OpenAPI \u6765\u6E90"),
                                React.createElement("p", { className: "mcp-muted" }, diagnosticServer.specUrl)) : diagnosticServer?.managementUrl ? React.createElement("div", { className: "mcp-card", style: { marginTop: 16 } },
                                React.createElement("div", { className: "mcp-card-head" },
                                    React.createElement("div", null,
                                        React.createElement("h3", null, "OpenAPI \u6765\u6E90"),
                                        React.createElement("p", { className: "mcp-muted" },
                                            "\u7BA1\u7406 API\uFF1A",
                                            diagnosticServer.managementUrl)),
                                    button('读取来源', () => call('sources'), busy || !diagnosticId)),
                                React.createElement("section", { className: "mcp-section" },
                                    React.createElement("h3", null, "\u6DFB\u52A0\u6765\u6E90"),
                                    React.createElement("div", { className: "mcp-fields" },
                                        React.createElement("label", { className: "mcp-field" },
                                            "\u6765\u6E90\u540D\u79F0",
                                            input(specName, setSpecName)),
                                        React.createElement("label", { className: "mcp-field" },
                                            "OpenAPI specification URL",
                                            input(specUrl, setSpecUrl))),
                                    React.createElement("div", { className: "mcp-actions" }, button('创建来源', () => call('create', { name: specName, specUrl }), busy || !specName || !diagnosticId))),
                                sourceList.length > 0 && React.createElement("section", { className: "mcp-section" },
                                    React.createElement("h3", null, "\u73B0\u6709\u6765\u6E90"),
                                    sourceList.map(source => React.createElement("div", { className: "mcp-source", key: source.id },
                                        React.createElement("strong", null, source.name),
                                        React.createElement("p", { className: "mcp-muted" },
                                            "ID\uFF1A",
                                            source.id,
                                            " \u00B7 ",
                                            source.status ?? '状态未知'),
                                        React.createElement("div", { className: "mcp-actions" },
                                            button('组件', () => { setSourceId(String(source.id)); void call('components', { sourceId: String(source.id) }); }, busy),
                                            button('刷新', () => call('refresh', { sourceId: String(source.id) }), busy),
                                            button(source.enabled ? '停用来源' : '启用来源', () => call('toggle', { sourceId: String(source.id), enabled: !source.enabled }), busy),
                                            button('日志', () => call('logs', { sourceId: String(source.id) }), busy))))),
                                React.createElement("section", { className: "mcp-section" },
                                    React.createElement("h3", null, "\u5DE5\u5177\u64CD\u4F5C"),
                                    React.createElement("div", { className: "mcp-fields" },
                                        React.createElement("label", { className: "mcp-field" },
                                            "\u6765\u6E90 ID",
                                            input(sourceId, setSourceId)),
                                        React.createElement("label", { className: "mcp-field" },
                                            "\u5DE5\u5177\u540D\u79F0",
                                            input(toolName, setToolName)),
                                        React.createElement("label", { className: "mcp-field mcp-wide" },
                                            "\u5DE5\u5177\u53C2\u6570 JSON",
                                            input(argumentsText, setArgumentsText))),
                                    React.createElement("div", { className: "mcp-actions" },
                                        button('预览请求', () => callTool('preview'), busy || !sourceId || !toolName),
                                        button('执行工具', () => callTool('invoke'), busy || !sourceId || !toolName)))) : React.createElement("div", { className: "mcp-card", style: { marginTop: 16 } },
                                React.createElement("h3", null, "\u73B0\u6210 MCP \u8FDE\u63A5"),
                                React.createElement("p", { className: "mcp-muted" }, "\u8BE5\u670D\u52A1\u5668\u6309\u5DF2\u4FDD\u5B58\u7684 MCP URL \u548C\u8BF7\u6C42 Header \u8FDE\u63A5\u3002")),
                            catalog?.serverId === diagnosticId && React.createElement("div", { className: "mcp-card", style: { marginTop: 16 } },
                                React.createElement("h3", null, diagnosticServer?.specUrl ? 'OpenAPI 生成的 MCP 能力' : '现成 MCP 服务的能力'),
                                [
                                    { title: '工具', items: catalog.data.tools ?? [] },
                                    { title: 'Resources', items: catalog.data.resources?.resources ?? [], unavailable: catalog.data.resources?.unavailable },
                                    { title: 'Resource Templates', items: catalog.data.resourceTemplates?.resourceTemplates ?? [], unavailable: catalog.data.resourceTemplates?.unavailable },
                                ].map(section => React.createElement("section", { className: "mcp-section", key: section.title },
                                    React.createElement("h3", null,
                                        section.title,
                                        "\uFF08",
                                        section.items.length,
                                        "\uFF09"),
                                    section.unavailable ? React.createElement("p", { className: "mcp-muted" }, "\u670D\u52A1\u672A\u63D0\u4F9B\u8BE5\u5217\u8868\uFF0C\u6216\u8BFB\u53D6\u5931\u8D25\u3002")
                                        : section.items.length ? React.createElement("ul", { className: "mcp-catalog" }, section.items.map((item, index) => React.createElement("li", { key: index },
                                            React.createElement("strong", null, item.name || item.uri || item.uriTemplate),
                                            (item.uri || item.uriTemplate || item.description) && React.createElement("small", null, [item.uri || item.uriTemplate, item.description].filter(Boolean).join(' · '))))) : React.createElement("p", { className: "mcp-muted" }, "\u6CA1\u6709\u53EF\u5217\u51FA\u7684\u9879\u76EE\u3002"))),
                                React.createElement("section", { className: "mcp-section" },
                                    React.createElement("h3", null, "\u8BFB\u53D6 Resource"),
                                    React.createElement("div", { className: "mcp-fields" },
                                        React.createElement("label", { className: "mcp-field mcp-wide" },
                                            "Resource URI",
                                            input(uriText, setUriText))),
                                    React.createElement("div", { className: "mcp-actions" }, button('读取 Resource', () => call('readResource', { uri: uriText }), busy || !uriText)))),
                            result && React.createElement("div", { className: "mcp-card", style: { marginTop: 16 } },
                                React.createElement("h3", null, "\u64CD\u4F5C\u7ED3\u679C"),
                                React.createElement("pre", { className: "mcp-result" }, JSON.stringify(result, null, 2)))))));
            async function callTest(serverId) {
                setBusy(true);
                try {
                    const response = await fetch('/api/mcp-manager', { method: 'POST', credentials: 'same-origin',
                        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId, action: 'test' }) });
                    const data = await response.json();
                    if (!response.ok)
                        throw new Error(data.error);
                    setDiscovered(previous => ({ ...previous, [serverId]: data.tools?.map(tool => tool.name) ?? [] }));
                    setDiscoveredResources(previous => ({ ...previous, [serverId]: {
                            resourceUris: data.resources?.unavailable ? undefined : data.resources?.resources?.map(item => item.uri),
                            resourceTemplates: data.resourceTemplates?.unavailable ? undefined : data.resourceTemplates?.resourceTemplates?.map(item => item.uriTemplate),
                        } }));
                    setStatus(`${serverId} 已发现 ${data.tools?.length ?? 0} 个工具、${data.resources?.resources?.length ?? 0} 个资源、${data.resourceTemplates?.resourceTemplates?.length ?? 0} 个模板。`);
                }
                catch (error) {
                    setStatus(String(error));
                }
                finally {
                    setBusy(false);
                }
            }
        }
        function apply(ctx) {
            ctx.effect(() => ctx.configForms.whileServed([formName], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
                name: 'plugins.item', id: 'mcp-session-manager', order: 50,
                label: () => 'MCP 配置管理',
            }, props => React.createElement(Manager, { ...props, write: (ops, revision) => ctx.remote.settings.mutate(formName, ops, revision) })))), 'mcp-manager: page');
        }
        return { apply, inject: ['slots', 'configForms', 'remote', 'remote.settings'] };
    },
});
