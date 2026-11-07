import { api, data, rows, prepare, validateParameters, type Soc } from '../../../src/action-api.ts'

export function create(soc: Soc) {
  return {
    responseMode: 'complete' as const,
    inputSchema: { type: 'object', additionalProperties: false, required: ['actionKey', 'deviceId', 'params', 'stop'], properties: {
      actionKey: { type: 'string', minLength: 1 }, deviceId: { type: 'string', minLength: 1 }, agentId: { type: 'string' },
      params: { type: 'object' }, stop: { type: 'string', enum: ['prepare', 'preview', 'create-task', 'execute'] },
      requestId: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,64}$' },
    } },
    connections: (config: any) => Object.values<string>(config.connections),
    prepare: (input: any, config: any) => prepare(soc, input, config),
    components: {
      async discover(input: any, config: any, context: any) {
        const call = api(soc, config, context)
        const [definitions, candidates] = await Promise.all([
          call('response', 'get_resp_action_defs', {}, true),
          call('response', 'get_resp_actions_target_candidates', { actionKey: input.actionKey }, true),
        ])
        const matches = rows(definitions).filter((item: any) => item.actionKey === input.actionKey && item.enabled !== false)
        if (matches.length !== 1) throw new Error('当前动作目录无唯一可用动作')
        const action = matches[0]
        const targets = rows(candidates).filter((item: any) => (item.deviceId ?? item.id ?? item.value) === input.deviceId)
        if (targets.length !== 1) throw new Error('目标不属于此动作的唯一合格执行点')
        return { ...input, action, target: targets[0], params: { ...input.params } }
      },
      async parameters(value: any, config: any, context: any) {
        const call = api(soc, config, context), params = { ...value.params }
        if (value.stop === 'create-task' && value.actionKey !== 'trigger-scan') throw new Error('仅扫描动作支持仅创建任务的请求')
        let agent: any, template: any
        if (value.actionKey.startsWith('host-')) {
          const agents = rows(await call('response', 'get_resp_actions_device_agents', { deviceId: value.deviceId }, true))
          const matches = agents.filter((item: any) => String(item.agentId ?? item.id) === value.agentId)
          if (matches.length !== 1) throw new Error('必须指定该 EDR 设备实际列出的唯一 agentId')
          agent = matches[0]
        } else if (value.agentId) throw new Error('此动作不能携带 agentId')
        if (value.actionKey === 'trigger-scan') {
          const templates = rows(await call('ingest', 'get_admin_ingest_devices_scan_templates', { deviceId: value.deviceId }, true))
          const matches = templates.filter((item: any) => params.profileId ? (item.value ?? item.id ?? item.uuid ?? item.profileId) === params.profileId : (item.label ?? item.name ?? item.title) === 'Basic Network Scan')
          if (matches.length !== 1) throw new Error('当前扫描模板不能唯一匹配，请指定当前模板 ID')
          template = matches[0]; params.profileId = template.value ?? template.id ?? template.uuid ?? template.profileId
        }
        if (params.agentId !== undefined || params.dispatchId !== undefined) throw new Error('params 不能包含路由字段')
        validateParameters(value.action.inputSchema, params)
        return { ...value, params, agent, template, stage: 'prepared', proceed: value.stop !== 'prepare' }
      },
      async preview(value: any, config: any, context: any) {
        const call = api(soc, config, context), exec = value.action.execConfig ?? {}
        try {
          const preview = data(await call('ingest', 'preview_internal_ingest_dispatch', { body: { deviceId: value.deviceId, axis: 'action', actionKey: value.actionKey, configKind: exec.configKind, capability: exec.capability, operation: exec.operation, payload: { ...exec.extraPayload, ...value.params } } }, true))
          return { ...value, preview, stage: 'previewed', proceed: value.stop === 'execute' && preview.success === true && preview.online === true && !preview.precheck?.blocked && preview.precheck?.status !== 'CONFLICT' && !preview.precheck?.changeIntroducesHard }
        } catch (error: any) { return { ...value, stage: 'preview-blocked', proceed: false, message: error.message } }
      },
      createTask(value: any) {
        return { ...value, stage: 'blocked', proceed: false, message: '当前 AISOC 动作合同未提供扫描任务仅创建、不启动的独立入口；未调用执行接口，未创建任务', capabilityGap: 'scan-create-without-start' }
      },
      async execute(value: any, config: any, context: any) {
        const call = api(soc, config, context)
        const requestId = value.requestId ?? context.runId.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 64)
        context.progress({ status: 'running', result: { requestId } })
        try {
          const receipt = data(await call('response', 'execute_resp_agent_actions', { body: { requestId, actionKey: value.actionKey, params: value.params, target: { mode: 'device', value: value.deviceId }, ...(value.agentId ? { agentId: value.agentId } : {}) } }))
          return { ...value, requestId, receipt, stage: 'accepted' }
        } catch (error: any) { return { ...value, requestId, stage: 'execute-unknown', message: error.message, recovery: '只按原 requestId 查询，不换号或重放执行' } }
      },
      async observe(value: any, config: any, context: any) {
        const call = api(soc, config, context)
        try {
          const executions = data(await call('response', 'get_resp_agent_actions_executions', { requestId: value.requestId }, true))
          return { ...value, executions, stage: value.stage === 'execute-unknown' ? value.stage : 'observed', message: value.message ?? '以原请求执行记录为准；受理不等于设备生效' }
        } catch (error: any) { return { ...value, stage: 'observe-unknown', message: error.message, recovery: '保留原 requestId 查询，不重放执行' } }
      },
      result(value: any) {
        const { action, ...result } = value
        return { ...result, action: { actionKey: action.actionKey, name: action.name, risk: action.risk, reversible: action.reversible, rollbackAction: action.rollbackAction } }
      },
    },
  }
}
