import type * as ReactTypes from 'react'
import avatarUrl from './assets/live-chatbot.gif'
import logoUrl from './assets/logo-v1.webp'
import { DELEGATE_ROLES, delegationReceipt } from './delegation'
import { investigationDraft, notificationAction, notificationList } from './notification-actions'

type InputActions = {
  captureInsertion(): { start: number; end: number; draftRev: number }
  insertText(text: string, span: { start: number; end: number; draftRev: number }): boolean
}

type Action = { title: string; description: string; prompt: string }
type Employee = { id: string; title: string; description: string; skills: string[] }
type EmployeeDraft = { title: string; description: string; skills: string }
type Tab = 'recommend' | 'employees' | 'favorites'
type OverviewCall = { parentSessionId: string; childSessionId?: string; startedAt: number; status: string }
type OverviewCounts = { toolCalls: number; skillLoads: number }
type OverviewRole = OverviewCounts & { id: string; title: string; state: string; active: number; completed: number; failed: number; noChild: number; unknown: number; recent: OverviewCall[] }
type Overview = { windowHours: number; parent: OverviewCounts & { state: string; active: number; sessions: number; recentSessionId: string | null }; roles: OverviewRole[] }
type Notification = {
  eventKey: string
  type: string
  label: string
  receivedAt: number
  eventId?: string
  alertId?: string
  incidentId?: string
  incidentIds: string[]
  severity?: string
  title: string
  summary: string
  status?: string
  fromStatus?: string
  toStatus?: string
  confidence?: string
  conclusion?: string
  investigation?: string
  alertDetail?: Record<string, unknown>
  affectedAssetId?: string
  account?: string
  edgeCount?: number
  hopCount?: number
  compromisedCount?: number
  implant?: string
  nodeId?: string
  instanceId?: string
  bindingId?: string
  pluginId?: string
  verdict?: string
  recovered?: boolean
  links: string[]
  link?: string
  isRead: boolean
  refreshRequired?: boolean
}
type NotificationResponse = { items: Notification[]; unreadCount: number }

function notificationTime(value: number) {
  if (!Number.isFinite(value)) return '时间未知'
  return new Date(value).toLocaleString()
}

const recommendations: Action[] = [
  {
    title: '新增访问策略草稿',
    description: '填写源与目的 IPv4、协议和端口，先生成待确认草稿。',
    prompt: '请新增 <源IPv4> 到 <目的IPv4> 的 TCP <目的端口> 访问策略，先生成草稿，不要执行。',
  },
  {
    title: '准备应急指令',
    description: '填写单个目标与动作，先查看冻结草案。',
    prompt: '请对 <单个目标IP或设备ID> 准备 <单个应急动作> 指令，先展示草案，不要执行。',
  },
  {
    title: '最近24小时网络总结报告',
    description: '汇总最近 24 小时网络运行、安全事件、风险变化及待处理事项。',
    prompt: '请生成最近24小时网络总结报告，汇总网络运行、安全事件、风险变化和待处理事项，并标明事实、推断与证据缺口。',
  },
  {
    title: '自动巡检',
    description: '巡检已接入设备、关键资产、服务和数据链路，定位异常与待办。',
    prompt: '请查询当前可用的巡检能力，按服务返回的能力执行一次巡检；如实返回结论、证据缺口和原始报告链接。',
  },
  {
    title: '风险处置',
    description: '梳理未闭环风险并形成分级、可验证、可回退的处置建议。',
    prompt: '请梳理当前未闭环风险，按优先级给出可验证、可回退的处置建议。只制定方案，不执行任何处置动作。',
  },
  {
    title: '资产盘点',
    description: '按资产类型、归属、状态、暴露面和风险等级形成资产视图。',
    prompt: '请盘点当前已接入资产，按类型、归属、状态、暴露面和风险等级汇总，并列出数据缺口。',
  },
  {
    title: '周报生成',
    description: '生成本周截至当前的安全运营周报，呈现趋势、成果和待办。',
    prompt: '请生成本周截至当前的安全运营周报，呈现关键趋势、已完成事项、未闭环风险和下周待办。',
  },
  {
    title: '月报生成',
    description: '生成本月截至当前的安全运营月报，分析风险变化和治理成效。',
    prompt: '请生成本月截至当前的安全运营月报，分析风险变化、事件处理、巡检结果和治理成效。',
  },
]

const defaultEmployees: Employee[] = [
  {
    id: 'threat-analysis',
    title: '威胁研判子智能体',
    description: '基于事件 ID 取证、研判并交付结果。',
    skills: ['事件研判', '证据核查', '报告交付'],
  },
  {
    id: 'fault-diagnosis',
    title: '故障分析子智能体',
    description: '只读核查设备、服务与链路故障。',
    skills: ['故障排查', '只读取证', '根因分析'],
  },
]

const PLUGIN_ID = 'dsh-security-operations-ui'
const STATUS_KIND = 'security-operations-status'
const THREAT_PLUGIN_ID = 'dsh-security-operations-threat-notifications'
const THREAT_KIND = 'security-threat-notifications'
// shortcut: 卡片仅保存在当前浏览器，需要跨设备共享时接入持久化服务。
const EMPLOYEES_KEY = 'dsh.securityOperations.digitalEmployees.v1'

function loadEmployees(): Employee[] {
  try {
    const saved = localStorage.getItem(EMPLOYEES_KEY)
    if (saved === null) return defaultEmployees
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return defaultEmployees
    return parsed.filter((item): item is Employee => typeof item?.id === 'string'
      && typeof item.title === 'string' && typeof item.description === 'string'
      && Array.isArray(item.skills) && item.skills.every((skill: unknown) => typeof skill === 'string'))
  } catch { return defaultEmployees }
}

type ModuleLoader = {
  load(plugin: { id: string; factory(require: (name: string) => unknown): unknown }): void
}

;(window as unknown as { __ModuleLoader__: ModuleLoader }).__ModuleLoader__.load({
  id: PLUGIN_ID,
  factory(require) {
    const React = require('react') as typeof ReactTypes

    function BrandMark({ size }: { size: number }) {
      return <img className="soc-brand-mark" src={logoUrl} width={size} height={size} alt="" />
    }

    function BrandName() {
      return <span className="soc-brand-name">AI 安全运营</span>
    }

    function HeroMark() {
      return <span className="soc-hero-brand"><img src={avatarUrl} width="50" height="50" alt="" /><strong>AI-SOC</strong></span>
    }

    function RuntimeOverview({ overview, openStatus, openSession }: {
      overview: Overview | null
      openStatus: () => void
      openSession: (id: string) => void
    }) {
      const [expanded, setExpanded] = React.useState(false)
      const roles = overview?.roles ?? Object.entries(DELEGATE_ROLES).map(([id, title]) =>
        ({ id, title, state: 'unknown', active: 0, completed: 0, failed: 0, noChild: 0, unknown: 0, toolCalls: 0, skillLoads: 0, recent: [] }))
      const running = overview ? overview.parent.active + roles.reduce((sum, role) => sum + role.active, 0) : null
      const failed = overview ? roles.reduce((sum, role) => sum + role.failed + role.noChild, 0) : null
      const stateText = (state: string) => state === 'running' ? '执行中' : state === 'idle' ? '空闲' : '未知'
      const parentState = overview?.parent.state ?? 'unknown'
      return (
        <section className="soc-runtime" aria-label="智能体运行概览">
          <header className="soc-runtime__header">
            <div className="soc-runtime__title"><strong>智能体运行概览</strong><span>当前实例 · 近 {overview?.windowHours ?? 24} 小时 · 统计启用后</span></div>
            <dl className="soc-runtime__summary">
              <div><dt>角色</dt><dd>4</dd></div>
              <div><dt>运行中</dt><dd>{running ?? '—'}</dd></div>
              <div><dt>失败及无子会话</dt><dd>{failed ?? '—'}</dd></div>
            </dl>
            <button type="button" className="soc-runtime__expand" aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}>{expanded ? '收起详情' : '展开详情'} <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button>
          </header>
          <div className="soc-runtime__strip">
            <article className={`soc-runtime__card soc-runtime__card--${parentState === 'idle' ? 'healthy' : parentState}`} data-runtime-state={parentState}>
              <div className="soc-runtime__card-head"><img src={avatarUrl} width="40" height="40" alt="" />
                <span className="soc-runtime__identity"><span><strong title="主智能体：网络安全运营专家">网络安全运营专家</strong><em>{stateText(parentState)}</em></span>
                  <small>运行 <b>{overview?.parent.active ?? '—'}</b>　会话 <b>{overview?.parent.sessions ?? '—'}</b></small>
                  <small className="soc-runtime__activity"><span>工具调用 <b>{overview?.parent.toolCalls ?? '—'}</b></span><span>Skill 加载 <b>{overview?.parent.skillLoads ?? '—'}</b></span></small></span></div>
              {expanded && <div className="soc-runtime__detail">主智能体会话由 DSH 会话服务统计。<br />
                <button type="button" onClick={() => overview?.parent.recentSessionId ? openSession(overview.parent.recentSessionId) : openStatus()}>查看最近会话</button></div>}
            </article>
            {roles.map(role => <article key={role.id}
              className={`soc-runtime__card soc-runtime__card--${role.state === 'idle' ? 'healthy' : role.state}`}
              data-runtime-state={role.state}>
              <div className="soc-runtime__card-head"><img src={avatarUrl} width="40" height="40" alt="" />
                <span className="soc-runtime__identity"><span><strong title={role.title}>{role.title}</strong><em>{stateText(role.state)}</em></span>
                  <small>运行 <b>{overview ? role.active : '—'}</b>　完成 <b>{overview ? role.completed : '—'}</b></small>
                  <small className="soc-runtime__activity"><span>工具调用 <b>{overview ? role.toolCalls : '—'}</b></span><span>Skill 加载 <b>{overview ? role.skillLoads : '—'}</b></span></small></span></div>
              {expanded && <div className="soc-runtime__detail">失败 {overview ? role.failed : '—'} · 无子会话 {overview ? role.noChild : '—'} · 状态未知 {overview ? role.unknown : '—'}
                {role.recent.length ? <ul>{role.recent.map((call, index) => <li key={`${call.startedAt}-${index}`}>
                  <button type="button" onClick={() => openSession(call.childSessionId ?? call.parentSessionId)}>
                    {new Date(call.startedAt).toLocaleString()} · {call.status} · {call.childSessionId ? '子会话' : '主会话'}
                  </button></li>)}</ul> : <p>当前时间窗暂无委派调用。</p>}
              </div>}
            </article>)}
          </div>
        </section>
      )
    }

    function QuickActions({ session, inputActions, openStatus, openThreat, useWorkspaces, useSessions, uiWorkspace }: {
      session: { blank: boolean }
      inputActions: InputActions
      openStatus: () => void
      openThreat: () => void
      useWorkspaces: (select: (state: any) => any) => any
      useSessions: (select: (state: any) => any) => any
      uiWorkspace: any
    }) {
      const [tab, setTab] = React.useState<Tab>('recommend')
      const [query, setQuery] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [employeeItems, setEmployeeItems] = React.useState<Employee[]>(loadEmployees)
      const [employeeEditing, setEmployeeEditing] = React.useState(false)
      const [editingId, setEditingId] = React.useState<string | null>(null)
      const [draft, setDraft] = React.useState<EmployeeDraft | null>(null)
      const [overview, setOverview] = React.useState<Overview | null>(null)
      const workspaceList = useWorkspaces(state => state) as { pinnedSessionIds: string[] }
      const sessionList = useSessions(state => state) as {
        phase: string
        byId: Record<string, { id: string; displayTitle: string; blank: boolean; running: boolean; parentId?: string }>
      }

      React.useEffect(() => {
        let active = true
        async function refresh() {
          try {
            const response = await fetch(new URL('api/security-operations/overview', document.baseURI), { credentials: 'same-origin' })
            if (!response.ok) throw new Error(`overview ${response.status}`)
            const data = await response.json() as Overview
            if (active) setOverview(data)
          } catch { if (active) setOverview(null) }
        }
        void refresh()
        const timer = setInterval(() => void refresh(), 5000)
        return () => { active = false; clearInterval(timer) }
      }, [])

      if (!session.blank) return null

      const keyword = query.trim().toLocaleLowerCase()
      const recommended = recommendations.filter(action =>
        `${action.title} ${action.description}`.toLocaleLowerCase().includes(keyword))
      const people = employeeItems.filter(person =>
        `${person.title} ${person.description} ${person.skills.join(' ')}`.toLocaleLowerCase().includes(keyword))
      const favorites = workspaceList.pinnedSessionIds
        .map((id: string) => sessionList.byId[id])
        .filter((item: any) => item && item.displayTitle.toLocaleLowerCase().includes(keyword))
      const hasResults = tab === 'recommend' ? recommended.length > 0 : tab === 'employees' ? people.length > 0 : favorites.length > 0

      function insert(text: string) {
        const inserted = inputActions.insertText(text, inputActions.captureInsertion())
        setNotice(inserted ? '' : '输入框暂不可编辑，请稍后重试。')
      }

      function switchTab(next: Tab) {
        setTab(next)
        setQuery('')
        setNotice('')
      }

      function persistEmployees(next: Employee[]) {
        try { localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(next)) }
        catch { setNotice('数字员工保存失败，请检查浏览器存储权限。'); return false }
        setEmployeeItems(next)
        setNotice('')
        return true
      }

      function openEmployeeForm(person?: Employee) {
        setEditingId(person?.id ?? null)
        setDraft({ title: person?.title ?? '', description: person?.description ?? '', skills: person?.skills.join('、') ?? '' })
        setNotice('')
      }

      function saveEmployee(event: ReactTypes.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!draft) return
        const title = draft.title.trim()
        const description = draft.description.trim()
        const skills = draft.skills.split(/[，,、]/).map(item => item.trim()).filter(Boolean)
        if (!title || !description) { setNotice('请填写数字员工名称和简介。'); return }
        if (employeeItems.some(item => item.title === title && item.id !== editingId)) {
          setNotice('数字员工名称不能重复。')
          return
        }
        const next = editingId
          ? employeeItems.map(item => item.id === editingId ? { ...item, title, description, skills } : item)
          : [...employeeItems, { id: crypto.randomUUID(), title, description, skills }]
        if (persistEmployees(next)) setDraft(null)
      }

      function removeEmployee(person: Employee) {
        if (!window.confirm(`确定删除“${person.title}”吗？`)) return
        if (persistEmployees(employeeItems.filter(item => item.id !== person.id)) && editingId === person.id) setDraft(null)
      }

      return (
        <section className="soc-quick" aria-label="智能对话快捷入口">
          <RuntimeOverview overview={overview} openStatus={openStatus} openSession={(id) => void uiWorkspace.openSession(id)} />
          <div className="soc-quick__heading">
            <strong>智能对话</strong>
            <span className="soc-quick__status-group"><button type="button" className="soc-quick__status" onClick={openThreat}>威胁事件通知</button><button type="button" className="soc-quick__status" onClick={openStatus}>系统消息</button></span>
          </div>
          <div className="soc-quick__toolbar">
            <div className="soc-quick__tabs" role="tablist" aria-label="快捷入口分类">
              <button type="button" role="tab" aria-selected={tab === 'recommend'} onClick={() => switchTab('recommend')}>推荐</button>
              <button type="button" role="tab" aria-selected={tab === 'employees'} onClick={() => switchTab('employees')}>数字员工</button>
              <button type="button" role="tab" aria-selected={tab === 'favorites'} onClick={() => switchTab('favorites')}>收藏</button>
            </div>
            {tab === 'employees' && <button type="button" className="soc-employee-edit-toggle"
              aria-label={employeeEditing ? '完成编辑数字员工' : '编辑数字员工'}
              title={employeeEditing ? '完成编辑' : '编辑数字员工'}
              onClick={() => { setEmployeeEditing(!employeeEditing); setDraft(null); setNotice('') }}>
              {employeeEditing ? '完成' : '✎'}
            </button>}
            <label className="soc-quick__search">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={event => setQuery(event.target.value)}
                aria-label={tab === 'recommend' ? '搜索推荐' : tab === 'employees' ? '搜索数字员工' : '搜索收藏'}
                placeholder={tab === 'recommend' ? '搜索推荐' : tab === 'employees' ? '搜索数字员工' : '搜索收藏'} />
            </label>
          </div>
          {notice && <p className="soc-quick__notice" role="alert">{notice}</p>}
          {tab === 'employees' && employeeEditing && <p className="soc-employee-scope">卡片变更仅保存在当前浏览器；新增卡片不会创建智能体。</p>}
          {tab === 'employees' && employeeEditing && draft && <form className="soc-employee-form" aria-label={editingId ? '编辑数字员工卡片' : '新增数字员工卡片'} onSubmit={saveEmployee}>
            <label>名称<input autoFocus maxLength={40} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <label>简介<input maxLength={160} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
            <label>技能（用逗号分隔）<input maxLength={160} value={draft.skills} onChange={event => setDraft({ ...draft, skills: event.target.value })} /></label>
            <div><button type="button" onClick={() => { setDraft(null); setNotice('') }}>取消</button><button type="submit">保存</button></div>
          </form>}
          {hasResults ? (
            <div className="soc-quick__grid" role="tabpanel">
              {tab === 'recommend'
                ? recommended.map(action => (
                  <button key={action.title} type="button" className="soc-quick__card"
                    onClick={() => insert(action.prompt)}>
                    <span className="soc-quick__card-title">{action.title}<span aria-hidden="true">↗</span></span>
                    <span className="soc-quick__card-description">{action.description}</span>
                  </button>
                ))
                : tab === 'employees' ? <>
                  {employeeEditing && <button type="button" className="soc-quick__card soc-employee-add" onClick={() => openEmployeeForm()}>
                    <span aria-hidden="true">＋</span>新增数字员工
                  </button>}
                  {people.map(person => employeeEditing ? <article key={person.id} className="soc-quick__card soc-quick__card--employee">
                    <img src={avatarUrl} width="42" height="42" alt="" />
                    <span className="soc-quick__person">
                      <span className="soc-quick__card-title">{person.title}</span>
                      <span className="soc-quick__person-label">简介</span>
                      <span className="soc-quick__card-description">{person.description}</span>
                      <span className="soc-quick__skills">{person.skills.map(skill => <span key={skill}>{skill}</span>)}</span>
                      <span className="soc-employee-actions"><button type="button" aria-label={`编辑${person.title}`} onClick={() => openEmployeeForm(person)}>编辑</button>
                        <button type="button" aria-label={`删除${person.title}`} onClick={() => removeEmployee(person)}>删除</button></span>
                    </span>
                  </article> : <button key={person.id} type="button" className="soc-quick__card soc-quick__card--employee"
                    onClick={() => insert(`@${person.title} `)}>
                    <img src={avatarUrl} width="42" height="42" alt="" />
                    <span className="soc-quick__person">
                      <span className="soc-quick__card-title">{person.title}<span aria-hidden="true">↗</span></span>
                      <span className="soc-quick__person-label">简介</span>
                      <span className="soc-quick__card-description">{person.description}</span>
                      <span className="soc-quick__skills">{person.skills.map(skill => <span key={skill}>{skill}</span>)}</span>
                    </span>
                  </button>)}
                </> : favorites.map((item: any) => (
                  <button key={item.id} type="button" className="soc-quick__card" onClick={() => uiWorkspace.openSession(item.id)}>
                    <span className="soc-quick__card-title">{item.displayTitle}<span aria-hidden="true">↗</span></span>
                    <span className="soc-quick__card-description">已置顶会话，点击继续对话。</span>
                  </button>
                ))}
            </div>
          ) : tab === 'employees' && employeeEditing ? <div className="soc-quick__grid" role="tabpanel"><button type="button" className="soc-quick__card soc-employee-add" onClick={() => openEmployeeForm()}><span aria-hidden="true">＋</span>新增数字员工</button></div> : <p className="soc-quick__empty" role="tabpanel">{tab === 'favorites' && !keyword
            ? '暂无收藏会话。可在左侧会话菜单中选择“置顶”。'
            : `没有匹配的${tab === 'recommend' ? '推荐任务' : tab === 'employees' ? '数字员工' : '收藏会话'}。`}</p>}
          {tab === 'favorites' && favorites.length > 0 && <p className="soc-quick__favorite">在左侧会话菜单中使用“置顶”或“取消置顶”管理收藏。</p>}
        </section>
      )
    }

    function StatusPanel({ useSession, useInput, threatOnly = false, appendDraft }: any) {
      const queued = useInput((state: any) => state.queue.length) as number
      const submitting = useSession((state: any) => state.pendingSubmissions.length) as number
      const running = useSession((state: any) => state.running) as boolean
      const attempted = useSession((state: any) => state.promptAttempted) as boolean
      const awaiting = useSession((state: any) => state.awaitingFirstTurn) as boolean
      const failed = useSession((state: any) =>
        state.lastAgentError !== null || state.promptError !== null || state.openError !== null) as boolean
      const [notifications, setNotifications] = React.useState<Notification[]>([])
      const [showWithoutId, setShowWithoutId] = React.useState(false)
      const display = notificationList(notifications, showWithoutId)
      const unreadCount = display.unreadCount
      const [notificationError, setNotificationError] = React.useState('')
      const [actionNotice, setActionNotice] = React.useState('')
      const [expandedKey, setExpandedKey] = React.useState<string | null>(null)
      const notificationsRef = React.useRef<HTMLDivElement | null>(null)
      const pending = queued + submitting
      const completed = attempted && !running && !awaiting && !failed ? 1 : 0
      const message = failed
        ? '执行异常，请查看当前会话详情。'
        : running || awaiting
          ? '当前会话正在执行。'
          : pending > 0
            ? `当前会话有 ${pending} 项待处理消息。`
            : completed
              ? '当前会话最近一次执行已完成。'
              : '暂无系统消息。'
      const metrics: [string, string][] = [
        ['1', '当前'],
        [String(pending), '待处理'],
        [running || awaiting ? '1' : '0', '执行中'],
        [String(completed), '已完成'],
      ]

      React.useEffect(() => {
        if (!threatOnly) return undefined
        let active = true
        async function refresh() {
          try {
            const response = await fetch(new URL('api/security-operations/notifications', document.baseURI), { credentials: 'same-origin' })
            if (!response.ok) throw new Error(`notifications ${response.status}`)
            const data = await response.json() as NotificationResponse
            if (!active) return
            setNotifications(Array.isArray(data.items) ? data.items : [])
            setNotificationError('')
          } catch {
            if (active) setNotificationError('实时通知暂不可用。')
          }
        }
        void refresh()
        const timer = setInterval(() => void refresh(), 5000)
        return () => { active = false; clearInterval(timer) }
      }, [threatOnly])

      async function markRead(eventKey: string) {
        try {
          const response = await fetch(new URL('api/security-operations/notifications/read', document.baseURI), {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ eventKey }),
          })
          if (!response.ok) return
          const data = await response.json() as NotificationResponse
          setNotifications(Array.isArray(data.items) ? data.items : [])
        } catch { /* 展开仍然可用，下一次轮询会重试已读状态 */ }
      }

      function quickInvestigate(item: Notification) {
        const action = notificationAction(item, notifications)
        const prompt = investigationDraft(item, action.ids, action.readyIds)
        if (!prompt) return
        try {
          const result = appendDraft?.(prompt)
          setActionNotice(result === 'applied' ? '已追加事件上下文，保留原有草稿；请核对后发送。' : '聊天输入框暂不可编辑，未更改草稿，请稍后重试。')
        } catch {
          setActionNotice('未能填入聊天输入框，原有草稿已保留，请稍后重试。')
        }
      }

      function focusUnread() {
        const target = notificationsRef.current?.querySelector<HTMLElement>('.soc-notification--unread .soc-notification__toggle')
        if (!target) return
        target.focus({ preventScroll: true })
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center', inline: 'nearest' })
      }

      function details(item: Notification) {
        const lines = [
          item.eventId && `事件流水 ID：${item.eventId}`,
          item.alertId && `告警 ID：${item.alertId}`,
          item.incidentId && `事件 ID：${item.incidentId}`,
          item.incidentIds.length > 0 && `事件 ID：${item.incidentIds.join('、')}`,
          item.status && `当前状态：${item.status}`,
          item.severity && `严重性：${item.severity}`,
          item.confidence && `置信度：${item.confidence}`,
          item.affectedAssetId && `关联资产：${item.affectedAssetId}`,
          item.account && `账号：${item.account}`,
          item.edgeCount !== undefined && `边数：${item.edgeCount}`,
          item.hopCount !== undefined && `跳数：${item.hopCount}`,
          item.compromisedCount !== undefined && `失陷数：${item.compromisedCount}`,
          item.nodeId && `节点：${item.nodeId}`,
          item.instanceId && `实例：${item.instanceId}`,
          item.bindingId && `绑定：${item.bindingId}`,
          item.pluginId && `插件：${item.pluginId}`,
          item.verdict && `判定：${item.verdict}`,
          item.recovered !== undefined && `已恢复：${item.recovered ? '是' : '否'}`,
        ].filter(Boolean) as string[]
        return <>
          {lines.length > 0 && <ul className="soc-notification__facts">{lines.map(line => <li key={line}>{line}</li>)}</ul>}
          {item.conclusion && <p><strong>研判结论：</strong>{item.conclusion}</p>}
          {item.investigation && <p><strong>研判过程：</strong>{item.investigation}</p>}
          {item.alertDetail && <pre>{JSON.stringify(item.alertDetail, null, 2)}</pre>}
          {item.refreshRequired && <p className="soc-notification__pending">该消息是刷新信号，完整事件详情仍待查询。</p>}
          <p className="soc-notification__context-hint">{notificationAction(item, notifications).ids.length === 0 ? '该通知未提供威胁事件 ID，暂不支持快速研判。' : notificationAction(item, notifications).review ? '已有研判完成通知；靶标按钮可准备复核草稿，不重复启动研判。' : '当前研判状态待核对；靶标按钮仅填入草稿，发送后先查询真实状态。'}</p>
          {item.links.length > 0 && <p className="soc-notification__links">{item.links.map(link => <a key={link} href={link} target="_blank" rel="noopener noreferrer">打开详情</a>)}</p>}
        </>
      }

      return (
        <section className="soc-status" aria-label={threatOnly ? '威胁事件通知' : '系统消息'}>
          <header className={threatOnly ? 'soc-notifications__header' : undefined}>
            <strong>{threatOnly ? '威胁事件通知' : '系统消息'}</strong>
            {threatOnly ? <>
              <span className="soc-notifications__counts"><span>共 {display.items.length} 条</span><button type="button" onClick={focusUnread} disabled={unreadCount === 0} aria-label={`定位第一条未读消息，当前 ${unreadCount} 条未读`} title="定位第一条未读消息">未读 {unreadCount} 条</button></span>
              <div className="soc-notifications__filter">
                <button type="button" role="switch" aria-checked={showWithoutId} aria-label="显示无事件 ID 消息"
                  className="soc-notifications__switch" title={showWithoutId ? '关闭后仅显示包含威胁事件 ID 的消息' : `已隐藏 ${display.hiddenCount} 条无威胁事件 ID 的消息`}
                  onClick={() => setShowWithoutId(value => !value)}>
                  <span className="soc-notifications__switch-track" aria-hidden="true"><span /></span>
                  <span>显示无事件 ID 消息</span>
                </button>
              </div>
            </> : <span>当前会话</span>}
          </header>
          {!threatOnly && <>
            <div className="soc-status__metrics">{metrics.map(([value, label]) =>
              <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
            <p className={failed ? 'soc-status__message soc-status__message--error' : 'soc-status__message'}>{message}</p>
          </>}
          {threatOnly && actionNotice && <p className="soc-notification__action-notice" role="status">{actionNotice}</p>}
          {threatOnly && <section className="soc-notifications" aria-label="威胁事件通知">
            {notificationError && <p className="soc-notification__error" role="status">{notificationError}</p>}
            {display.items.length === 0 && !notificationError && <p className="soc-notifications__empty">{display.hiddenCount > 0 ? '暂无包含威胁事件 ID 的消息。可打开上方开关查看其他通知。' : '暂无威胁事件通知。'}</p>}
            <div className="soc-notifications__list" ref={notificationsRef}>
              {display.items.map(item => {
                const expanded = expandedKey === item.eventKey
                const action = notificationAction(item, notifications)
                return <article key={item.eventKey} data-event-key={item.eventKey} className={`soc-notification${item.isRead ? '' : ' soc-notification--unread'}`}>
                  <div className="soc-notification__row">
                    <button type="button" className="soc-notification__toggle" aria-expanded={expanded}
                      onClick={() => { setExpandedKey(expanded ? null : item.eventKey); if (!expanded && !item.isRead) void markRead(item.eventKey) }}>
                      <span className="soc-notification__title"><strong>{item.title}</strong>{!item.isRead && <em>未读</em>}</span>
                      <span className="soc-notification__summary">{item.summary}</span>
                      <time dateTime={new Date(item.receivedAt).toISOString()}>{notificationTime(item.receivedAt)}</time>
                    </button>
                    {threatOnly && action.ids.length > 0 && <button type="button" className="soc-notification__investigate"
                      aria-label={action.label} title={action.label}
                      onClick={() => quickInvestigate(item)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
                        <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
                      </svg>
                    </button>}
                  </div>
                  {expanded && <div className="soc-notification__details">{details(item)}</div>}
                </article>
              })}
            </div>
          </section>}
        </section>
      )
    }

    function ThreatNotificationPanel(props: any) {
      return <StatusPanel {...props} threatOnly />
    }

    function DefaultThreatSidebar({ sessionId, useSidebarMounted, openDefaultThreat }: any) {
      const mounted = useSidebarMounted((id: string | undefined) => id)
      React.useEffect(() => {
        if (mounted === sessionId) openDefaultThreat(sessionId)
      }, [mounted, sessionId, openDefaultThreat])
      return null
    }

    const css = `
      .soc-brand-mark{display:block;object-fit:contain}
      .soc-brand-name{font-size:14px;font-weight:600;white-space:nowrap}
      .soc-hero-brand{display:inline-flex;align-items:center;gap:12px;white-space:nowrap}
      .soc-hero-brand img{display:block;object-fit:cover;border-radius:12px}
      .soc-hero-brand strong{font-size:20px;font-weight:600}
      div:has(> span > .soc-hero-brand){justify-content:flex-start}
      span:has(> [data-slot="conversation.hero.brand.mark"] .soc-hero-brand)+span{display:none}
      .soc-quick{order:10;width:100%;padding-top:14px;color:var(--dsw-alias-label-primary,#242933)}
      .soc-runtime{display:grid;gap:10px;margin-bottom:18px;padding:11px 12px 10px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:12px;background:linear-gradient(135deg,#e9f4ff88,transparent 42%),repeating-linear-gradient(0deg,#1677ff08 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,#1677ff08 0 1px,transparent 1px 22px),var(--dsw-alias-bg-base,#fff)}
      .soc-runtime__header{display:flex;align-items:center;gap:12px;min-width:0}
      .soc-runtime__title{display:flex;align-items:center;gap:6px;white-space:nowrap}
      .soc-runtime__title strong{font-size:16px}
      .soc-runtime__title span{padding:3px 7px;border:1px solid #b5d5ff;border-radius:99px;background:#eaf3ff;color:#2465ad;font-size:11px}
      .soc-runtime__summary{display:flex;flex:1;align-items:center;min-width:0;margin:0}
      .soc-runtime__summary div{display:flex;align-items:baseline;gap:5px;padding:0 11px;border-left:1px solid var(--dsw-alias-border-l2,#e4e7ec)}
      .soc-runtime__summary dt{color:var(--dsw-alias-label-secondary,#667085);font-size:12px;white-space:nowrap}
      .soc-runtime__summary dd{margin:0;font-size:15px;font-weight:700}
      .soc-runtime__expand{flex:none;padding:6px 9px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit;cursor:pointer;font:inherit;font-size:12px}
      .soc-runtime__strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
      .soc-runtime__card{flex:1 0 185px;min-width:185px;display:grid;gap:9px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-left:3px solid var(--runtime-accent);border-radius:9px;background:var(--runtime-soft);color:inherit;font:inherit;text-align:left}
      .soc-runtime__card:hover{border-color:var(--runtime-accent);box-shadow:0 5px 14px #1f23291a}
      .soc-runtime__card--healthy{--runtime-accent:#27b575;--runtime-soft:#f3fbf7}
      .soc-runtime__card--running{--runtime-accent:#1677ff;--runtime-soft:#f0f6ff}
      .soc-runtime__card--pending,.soc-runtime__card--unknown{--runtime-accent:#98a2b3;--runtime-soft:#f6f7f9}
      .soc-runtime__card-head{display:flex;align-items:center;gap:8px;min-width:0}
      .soc-runtime__card-head img{flex:none;border:1px solid var(--runtime-accent);border-radius:50%;object-fit:cover}
      .soc-runtime__identity{display:grid;gap:3px;min-width:0;flex:1}
      .soc-runtime__identity>span{display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0}
      .soc-runtime__identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .soc-runtime__identity em{flex:none;padding:3px 6px;border:1px solid var(--runtime-accent);border-radius:99px;color:var(--runtime-accent);background:var(--dsw-alias-bg-base,#fff);font-size:11px;font-style:normal}
      .soc-runtime__identity small{color:var(--dsw-alias-label-secondary,#667085);font-size:12px;white-space:nowrap}
      .soc-runtime__identity .soc-runtime__activity{display:flex;flex-wrap:wrap;gap:2px 8px}
      .soc-runtime__identity b{color:var(--dsw-alias-label-primary,#242933)}
      .soc-runtime__detail{padding-top:8px;border-top:1px solid var(--dsw-alias-border-l2,#e4e7ec);color:var(--dsw-alias-label-secondary,#667085);font-size:12px;line-height:1.5}
      .soc-quick__heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 12px 10px}
      .soc-quick__heading strong{font-size:16px}
      .soc-quick__status-group{display:inline-flex;align-items:center;gap:8px}
      .soc-quick__status{border:0;background:transparent;color:var(--dsw-alias-brand-primary,#1677ff);cursor:pointer;font:inherit;white-space:nowrap}
      .soc-quick__toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 14px}
      .soc-quick__tabs{display:flex;align-items:center;gap:5px}
      .soc-quick__tabs button{padding:8px 12px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#667085);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}
      .soc-quick__tabs button[aria-selected=true]{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#242933);box-shadow:0 2px 12px rgba(31,35,41,.06)}
      .soc-employee-edit-toggle{padding:6px 10px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-brand-primary,#1677ff);cursor:pointer;font:inherit;font-size:13px}
      .soc-quick__search{display:flex;align-items:center;gap:7px;min-width:160px;width:min(260px,42%);height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#667085)}
      .soc-quick__search{margin-left:auto}
      .soc-quick__search input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary,#242933);font:inherit;font-size:12px}
      .soc-quick__search:focus-within{border-color:var(--dsw-alias-brand-primary,#1677ff)}
      .soc-quick__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .soc-quick__card{display:block;min-width:0;min-height:132px;padding:16px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:9px;background:var(--dsw-alias-bg-base,#fff);color:inherit;cursor:pointer;font:inherit;text-align:left;transition:border-color .15s,box-shadow .15s,transform .15s}
      .soc-quick__card:hover{border-color:var(--dsw-alias-brand-primary,#1677ff);box-shadow:0 6px 18px rgba(31,35,41,.08);transform:translateY(-1px)}
      .soc-quick__card:focus-visible,.soc-quick__status:focus-visible,.soc-quick__tabs button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#1677ff);outline-offset:2px}
      .soc-quick__card-title{display:flex;justify-content:space-between;gap:8px;margin-bottom:9px;font-size:14px;font-weight:600}
      .soc-quick__card-title span{color:var(--dsw-alias-label-secondary,#667085);font-weight:400}
      .soc-quick__card-description{display:block;color:var(--dsw-alias-label-secondary,#667085);font-size:13px;line-height:1.5}
      .soc-quick__card--employee{display:flex;align-items:flex-start;gap:9px}
      .soc-quick__card--employee img{flex:none;border-radius:50%;border:1px solid #e4e7ec}
      .soc-employee-add{display:grid;place-items:center;align-content:center;gap:8px;color:var(--dsw-alias-brand-primary,#1677ff);text-align:center}
      .soc-employee-add span{font-size:24px}
      .soc-employee-actions{display:flex;gap:6px;margin-top:12px}
      .soc-employee-actions button,.soc-employee-form button{padding:5px 9px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:inherit;cursor:pointer;font:inherit;font-size:12px}
      .soc-employee-actions button:last-child{color:var(--dsw-alias-error-primary,#d92d20)}
      .soc-employee-scope{margin:0 0 10px;color:var(--dsw-alias-label-secondary,#667085);font-size:12px}
      .soc-employee-form{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-bottom:14px;padding:14px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:9px;background:var(--dsw-alias-bg-base,#fff)}
      .soc-employee-form label{display:grid;gap:5px;font-size:12px}
      .soc-employee-form label:nth-child(3){grid-column:1/-1}
      .soc-employee-form input{min-width:0;padding:8px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:6px;background:transparent;color:inherit;font:inherit}
      .soc-employee-form>div{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px}
      .soc-employee-form>div button:last-child{border-color:var(--dsw-alias-brand-primary,#1677ff);background:var(--dsw-alias-brand-primary,#1677ff);color:#fff}
      .soc-quick__person{display:block;min-width:0;flex:1}
      .soc-quick__person-label{display:block;margin:2px 0 3px;color:var(--dsw-alias-label-secondary,#667085);font-size:12px}
      .soc-quick__skills{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}
      .soc-quick__skills span{padding:2px 7px;border-radius:99px;background:#e8f2ff;color:#426381;font-size:11px}
      .soc-quick__empty{padding:30px 10px;color:var(--dsw-alias-label-secondary,#667085);font-size:13px;text-align:center}
      .soc-quick__notice{margin:0 0 10px;color:var(--dsw-alias-error-primary,#d92d20);font-size:12px}
      .soc-quick__favorite{margin:11px 2px 0;color:var(--dsw-alias-label-secondary,#667085);font-size:11px}
      .soc-delegation{margin:6px 0;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary,#242933)}
      .soc-delegation summary{cursor:pointer;overflow-wrap:anywhere}
      .soc-delegation summary span{color:var(--dsw-alias-label-secondary,#667085)}
      .soc-delegation>p,.soc-delegation>details{margin:6px 0 6px 18px}
      .soc-delegation pre{max-height:280px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
      .soc-delegation>button{margin-left:18px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
      .soc-status{height:100%;padding:18px;color:var(--dsw-alias-label-primary,#242933)}
      .soc-status header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e4e7ec)}
      .soc-status header span{color:var(--dsw-alias-label-secondary,#667085);font-size:12px}
      .soc-status__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:18px 0}
      .soc-status__metrics div{display:flex;min-width:0;flex-direction:column;gap:4px;padding:10px 4px;border-radius:8px;background:var(--dsw-alias-bg-subtle,#f5f7fa);text-align:center}
      .soc-status__metrics strong{font-size:18px}
      .soc-status__metrics span{overflow:hidden;color:var(--dsw-alias-label-secondary,#667085);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
      .soc-status__message{margin:22px 0;color:var(--dsw-alias-label-secondary,#667085);font-size:13px;line-height:1.6;text-align:center}
      .soc-status__message--error{color:var(--dsw-alias-error-primary,#d92d20)}
      .soc-notifications{margin-top:12px;padding-top:0;border-top:0}
      .soc-status header.soc-notifications__header{flex-wrap:wrap;row-gap:8px}
      .soc-notifications__filter{display:flex;justify-content:flex-end;flex:0 0 100%;min-width:0}
      .soc-notifications__switch{display:inline-flex;align-items:center;gap:7px;min-height:28px;padding:2px 0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
      .soc-notifications__switch-track{display:inline-flex;align-items:center;flex:none;box-sizing:border-box;width:28px;height:16px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:99px;background:var(--dsw-alias-bg-subtle)}
      .soc-notifications__switch-track>span{display:block;width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform 120ms ease}
      .soc-notifications__switch[aria-checked="true"] .soc-notifications__switch-track{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary)}
      .soc-notifications__switch[aria-checked="true"] .soc-notifications__switch-track>span{transform:translateX(12px);background:var(--dsw-alias-bg-base)}
      .soc-notifications__switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;border-radius:4px}
      @media(prefers-reduced-motion:reduce){.soc-notifications__switch-track>span{transition:none}}
      .soc-notifications__counts{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
      .soc-notifications__counts button{padding:2px 5px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-brand-primary,#1677ff);cursor:pointer;font:inherit;font-size:12px}
      .soc-notifications__counts button:disabled{color:var(--dsw-alias-label-tertiary,#98a2b3);cursor:default}
      .soc-notifications__counts button:not(:disabled):hover{background:var(--dsw-alias-bg-subtle,#f5f7fa)}
      .soc-notification__action-notice{margin:12px 0;padding:8px 10px;border-radius:7px;background:var(--dsw-alias-bg-subtle,#f5f7fa);color:var(--dsw-alias-label-secondary,#667085);font-size:12px}
      .soc-notifications__empty,.soc-notification__error{padding:16px 8px;color:var(--dsw-alias-label-secondary,#667085);font-size:12px;text-align:center}
      .soc-notification__error{color:var(--dsw-alias-error-primary,#d92d20)}
      .soc-notifications__list{display:grid;gap:8px;max-height:520px;overflow:auto;padding-right:2px}
      .soc-notification{border:1px solid var(--dsw-alias-border-l2,#e4e7ec);border-radius:9px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}
      .soc-notification--unread{border-left:3px solid var(--dsw-alias-brand-primary,#1677ff);background:linear-gradient(90deg,#1677ff0a,transparent 45%),var(--dsw-alias-bg-base,#fff)}
      .soc-notification__row{display:flex;align-items:stretch;min-width:0}
      .soc-notification__row .soc-notification__toggle{flex:1;min-width:0}
      .soc-notification__investigate{display:grid;place-items:center;flex:none;align-self:center;margin:0 8px 0 0;padding:0;width:28px;height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-brand-primary);cursor:pointer}
      .soc-notification__context-hint{color:var(--dsw-alias-label-secondary);font-size:11px}
      .soc-notification__investigate:hover{background:var(--dsw-alias-bg-subtle,#f5f7fa)}
      .soc-notification__investigate:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#1677ff);outline-offset:2px}
      .soc-notification__toggle{display:grid;width:100%;gap:5px;padding:11px 12px;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left}
      .soc-notification__toggle:hover{background:var(--dsw-alias-bg-subtle,#f5f7fa)}
      .soc-notification__toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#1677ff);outline-offset:-2px}
      .soc-notification__title{display:flex;align-items:center;gap:7px;min-width:0}
      .soc-notification__title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .soc-notification__title em{flex:none;padding:2px 6px;border-radius:99px;background:var(--dsw-alias-brand-primary,#1677ff);color:#fff;font-size:10px;font-style:normal}
      .soc-notification__summary{display:block;color:var(--dsw-alias-label-secondary,#667085);font-size:12px;line-height:1.5}
      .soc-notification__toggle time{color:var(--dsw-alias-label-tertiary,#98a2b3);font-size:11px}
      .soc-notification__details{max-height:260px;overflow:auto;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2,#e4e7ec);color:var(--dsw-alias-label-secondary,#667085);font-size:12px;line-height:1.6}
      .soc-notification__details p{margin:6px 0}
      .soc-notification__details pre{max-height:180px;overflow:auto;margin:7px 0;padding:8px;border-radius:6px;background:var(--dsw-alias-bg-subtle,#f5f7fa);white-space:pre-wrap;overflow-wrap:anywhere}
      .soc-notification__facts{margin:0;padding-left:18px}
      .soc-notification__pending{color:var(--dsw-alias-warning-primary,#b54708)}
      .soc-notification__links{display:flex;flex-wrap:wrap;gap:8px}
      .soc-notification__links a{color:var(--dsw-alias-brand-primary,#1677ff)}
      @media(max-width:1100px){.soc-quick__grid{grid-template-columns:repeat(2,minmax(0,1fr))}.soc-runtime__header{flex-wrap:wrap}.soc-runtime__summary{flex-basis:100%;order:3}.soc-runtime__summary div:first-child{padding-left:0;border-left:0}}
      @media(max-width:720px){.soc-quick__grid{grid-template-columns:1fr}.soc-quick__toolbar{align-items:stretch;flex-direction:column}.soc-quick__search{width:100%;box-sizing:border-box;margin-left:0}.soc-employee-form{grid-template-columns:1fr}.soc-employee-form label:nth-child(3){grid-column:auto}}
    `

    function DelegationTool({ toolName, phase, block, inspect }: any) {
      const role = DELEGATE_ROLES[toolName]
      const argsRaw = phase === 'result' ? block.call?.argsRaw : block.argsRaw
      const receipt = phase === 'result' && !block.isError
        ? delegationReceipt(toolName, block.content, argsRaw) : undefined
      const title = phase === 'preparing' ? `正在准备启动${role}`
        : phase === 'start' ? `正在启动${role}`
          : block.isError ? `启动${role}失败` : receipt?.title ?? `${role}已返回回执`
      return <details className="soc-delegation">
        <summary>{title}{receipt?.task && <span> · {receipt.task}</span>}</summary>
        {receipt && <><p>结果将在任务结束后返回。</p><p>子会话 ID：<code>{receipt.subagentId}</code></p></>}
        <details><summary>技术详情</summary>
          <pre>{toolName}{'\n'}{argsRaw}{'\n'}{JSON.stringify(block.content ?? [], null, 2)}</pre>
        </details>
        {inspect && <button type="button" onClick={inspect}>查看调用记录</button>}
      </details>
    }

    const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'uiWorkspace', 'locale', 'configForms', 'conversation', 'sessions']
    function apply(ctx: any) {
      const defaultedSessions = new Set<string>()
      const openDefaultThreat = (sessionId: string) => {
        if (defaultedSessions.has(sessionId) || ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return
        ctx.sidebarRight.openTab(THREAT_KIND)
        defaultedSessions.add(sessionId)
      }
      for (const toolName of Object.keys(DELEGATE_ROLES)) {
        ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
          { name: 'tool.call.toolview', key: toolName }, DelegationTool,
        )), `security-operations-ui: ${toolName} status`)
      }
      ctx.effect(() => {
        const preference = ctx.configForms.get('locale')
        let settled = false
        const setDefault = () => {
          if (settled) return
          const snapshot = preference.getSnapshot()
          if (snapshot.mode === 'memory') {
            settled = true
            ctx.locale.setLocale('zh')
          } else if (snapshot.status === 'ready') {
            settled = true
            if (!snapshot.value?.preference) ctx.locale.setLocale('zh')
          }
        }
        const unsubscribe = preference.subscribe(setDefault)
        setDefault()
        return unsubscribe
      }, 'security-operations-ui: default Chinese locale')

      ctx.effect(() => {
        try {
          if (localStorage.getItem('dsh.workspace.view.v5') !== null) return
        } catch { return }
        let applied = false
        const setDefault = () => {
          if (applied) return
          const view = ctx.slots.entries('sidebar.workspaces')[0]?.store?.create()
          if (!view) return
          applied = true
          view.actions.setGroupBy('flat')
        }
        const unsubscribe = ctx.slots.subscribe('sidebar.workspaces', setDefault)
        setDefault()
        return unsubscribe
      }, 'security-operations-ui: default workspace grouping')

      ctx.effect(() => {
        const layout = ctx.slots.entries('root')[0]?.store?.create()
        if (!layout) throw new Error('security-operations-ui: root layout store unavailable')
        if (window.innerWidth > 720 && layout.getSnapshot().layoutInfo.rightbar === null) layout.actions.setRightbar(350)
      }, 'security-operations-ui: right sidebar default width')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.dshSecurityOperationsUi = 'true'
        style.textContent = css
        document.head.appendChild(style)
        return () => style.remove()
      }, 'security-operations-ui: styles')

      ctx.effect(() => ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register(
        { name: 'sidebar.brand.mark', key: PLUGIN_ID, priority: -1 }, BrandMark,
      )), 'security-operations-ui: brand mark')
      ctx.effect(() => ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register(
        { name: 'sidebar.brand.name', key: PLUGIN_ID, priority: -1 }, BrandName,
      )), 'security-operations-ui: brand name')
      ctx.effect(() => ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register(
        { name: 'conversation.hero.brand.mark', key: PLUGIN_ID, priority: -1 }, HeroMark,
      )), 'security-operations-ui: hero mark')

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: THREAT_PLUGIN_ID,
        kind: THREAT_KIND,
        title: () => '威胁事件通知',
        guide: [{ order: 4, title: () => '威胁事件通知', description: () => '查看 SOC 威胁事件并快速发起研判' }],
      }), 'security-operations-ui: threat notifications type')
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: PLUGIN_ID,
        kind: STATUS_KIND,
        title: () => '系统消息',
        guide: [{ order: 5, title: () => '系统消息', description: () => '查看当前会话执行状态' }],
      }), 'security-operations-ui: status type')

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key: THREAT_PLUGIN_ID, inject: (sessionId: string) => ({
          appendDraft(prompt: string) {
            const binding = ctx.sessions.binding(sessionId)
            if (!binding) return 'blocked'
            const result = ctx.conversation.input.requestDraftInitialization(binding, { prompt, whenDraftExists: 'append' })
            if (result === 'applied' && ctx.sidebarRight.mounted.getSnapshot() === sessionId) {
              ctx.conversation.input.for(binding.ctx).focus()
            }
            return result
          },
        }) },
        ThreatNotificationPanel,
      )), 'security-operations-ui: threat notifications panel')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key: PLUGIN_ID },
        StatusPanel,
      )), 'security-operations-ui: status panel')

      const openStatus = () => ctx.sidebarRight.openTab(STATUS_KIND)
      const openThreat = () => ctx.sidebarRight.openTab(THREAT_KIND)
      const Dock = (props: any) => <>
        <DefaultThreatSidebar {...props} openDefaultThreat={openDefaultThreat} />
        <QuickActions {...props} openStatus={openStatus} openThreat={openThreat} uiWorkspace={ctx.get('uiWorkspace')} />
      </>
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: PLUGIN_ID, order: 100, inject: () => ({ hooks: { sidebarMounted: ctx.sidebarRight.mounted } }) },
        Dock,
      )), 'security-operations-ui: quick actions')
    }

    return { apply, inject }
  },
})
