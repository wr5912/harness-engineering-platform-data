import { api, data, rows, prepare, validateParameters, type Soc } from '../../../src/action-api.ts'

function candidateId(item: any): string | undefined {
  const value = item?.deviceId ?? item?.value ?? item?.id
  return value === undefined || value === null || value === '' ? undefined : String(value)
}

function matchesTarget(item: any, requested: string): boolean {
  return [item?.deviceId, item?.value, item?.id, item?.ip, item?.hostname, item?.assetId]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .some((value) => String(value) === requested)
}

function targetSelection(item: any) {
  return {
    deviceId: candidateId(item),
    hostname: item?.hostname ?? item?.hostName ?? item?.name ?? item?.deviceName ?? null,
    ip: item?.ip ?? item?.address ?? null,
    assetId: item?.assetId ?? null,
    modelId: item?.modelId ?? null,
  }
}

function generatedRuleName(srcIp: string): string {
  const suffix = String(srcIp).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return `AUTO-BLOCK-${suffix || 'SOURCE'}`
}

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
        const requestedTarget = String(input.deviceId)
        const targets = rows(candidates).filter((item: any) => matchesTarget(item, requestedTarget))
        if (targets.length === 0) throw new Error('目标不属于此动作的合格执行点')
        if (targets.length > 1) {
          return {
            ...input,
            status: 'NEEDS_SELECTION',
            stage: 'awaiting-device-selection',
            proceed: false,
            selection: {
              kind: 'device',
              requested: requestedTarget,
              candidates: targets.map(targetSelection),
            },
            message: '该输入对应多个合格执行设备，请用户选择后重新提交相同动作。',
          }
        }
        const resolvedDeviceId = candidateId(targets[0])
        if (!resolvedDeviceId) throw new Error('候选执行点缺少可用 deviceId')
        return { ...input, deviceId: resolvedDeviceId, action, target: targets[0], params: { ...input.params } }
      },
      async parameters(value: any, config: any, context: any) {
        if (value.status === 'NEEDS_SELECTION') return value
        const call = api(soc, config, context), params = { ...value.params }
        if (value.actionKey === 'block-ip' || value.actionKey === 'unblock-ip') {
          if (params.src_ip === undefined && params.ip !== undefined) params.src_ip = params.ip
          if (params.rule_name === undefined && params.ruleName !== undefined) params.rule_name = params.ruleName
          delete params.ip
          delete params.ruleName
          if (value.actionKey === 'block-ip' && !params.rule_name && params.src_ip) params.rule_name = generatedRuleName(params.src_ip)
          if (value.actionKey === 'unblock-ip' && !params.rule_name) throw new Error('解封必须关联原封禁回执中的规则标识；当前动作合同不支持仅按源IP安全定位规则')
        }
        if (value.stop === 'create-task' && value.actionKey !== 'trigger-scan') throw new Error('仅扫描动作支持仅创建任务的请求')
        let agent: any, template: any
        if (value.actionKey.startsWith('host-')) {
          const agents = rows(await call('response', 'get_resp_actions_device_agents', { deviceId: value.deviceId }, true))
          const requestedAgentId = value.agentId === undefined || value.agentId === null || value.agentId === '' ? undefined : String(value.agentId)
          const matches = requestedAgentId === undefined
            ? agents
            : agents.filter((item: any) => String(item.agentId ?? item.id) === requestedAgentId)
          if (matches.length === 0) throw new Error(requestedAgentId === undefined ? '该 EDR 设备没有可用的 agentId' : '指定的 agentId 不属于该 EDR 设备')
          if (requestedAgentId === undefined && matches.length > 1) {
            return {
              ...value,
              status: 'NEEDS_SELECTION',
              stage: 'awaiting-agent-selection',
              proceed: false,
              selection: {
                kind: 'agent',
                deviceId: value.deviceId,
                candidates: matches.map((item: any) => ({
                  agentId: String(item.agentId ?? item.id),
                  hostname: item.hostname ?? item.hostName ?? item.name ?? null,
                  ip: item.ip ?? item.address ?? null,
                  os: item.os ?? null,
                })),
              },
              message: '该 EDR 执行设备存在多个可用 Agent，请用户选择后重新提交相同动作。',
            }
          }
          agent = matches[0]
          value = { ...value, agentId: String(agent.agentId ?? agent.id) }
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
        if (!action) return result
        return { ...result, action: { actionKey: action.actionKey, name: action.name, risk: action.risk, reversible: action.reversible, rollbackAction: action.rollbackAction } }
      },
    },
  }
}
