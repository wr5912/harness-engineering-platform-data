import { api, data, rows, prepare, type Soc } from '../../../src/action-api.ts'

export function create(soc: Soc) {
  return {
    responseMode: 'complete' as const,
    inputSchema: { type: 'object', additionalProperties: false, required: ['stop'], anyOf: [{ required: ['changes'] }, { required: ['taskId'] }], properties: {
      stop: { type: 'string', enum: ['preview', 'draft', 'apply'] },
      name: { type: 'string', minLength: 1 }, changeReason: { type: 'string' }, taskId: { type: 'string', pattern: '^[0-9]+$' },
      changes: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', required: ['deviceId', 'configKind', 'operation', 'payload'], properties: {
        deviceId: { type: 'string' }, configKind: { type: 'string', enum: ['ACL', 'ROUTE'] }, operation: { type: 'string', enum: ['ADD', 'MODIFY', 'DELETE'] },
        policyConfigKey: { type: 'string' }, targetExternalId: { type: 'string' }, payload: { type: 'object' },
      }, additionalProperties: false } },
    } },
    connections: (config: any) => Object.values<string>(config.connections),
    prepare: (input: any, config: any) => prepare(soc, input, config),
    components: {
      async resolve(input: any, config: any, context: any) {
        const call = api(soc, config, context)
        if (input.taskId) return { ...input, taskId: input.taskId }
        const devicesByKind = Object.fromEntries(await Promise.all([...new Set<string>(input.changes.map((change: any) => change.configKind))].map(async configKind => [configKind, rows(await call('ingest', 'get_ingest_dispatch_dispatchable_devices', { configKind }, true))])))
        const changes = await context.map(input.changes, async (change: any) => {
          const matches = devicesByKind[change.configKind].filter((device: any) => device.deviceId === change.deviceId)
          if (matches.length !== 1) throw new Error(`执行设备不唯一或不支持下发：${change.deviceId}`)
          if (['MODIFY', 'DELETE'].includes(change.operation) && !change.targetExternalId) throw new Error('修改或删除必须指定原配置 targetExternalId')
          const device = matches[0]
          const [configs, fields] = await Promise.all([
            call('ingest', 'get_admin_dispatch_task_policy_configs', { deviceId: change.deviceId, configKind: change.configKind, operation: change.operation }, true),
            call('ingest', 'get_admin_dispatch_task_input_fields', { deviceId: change.deviceId, configKind: change.configKind, operation: change.operation, ...(change.policyConfigKey ? { policyConfigKey: change.policyConfigKey } : {}) }, true),
          ])
          const choices = rows(configs).filter((item: any) => !change.policyConfigKey || item.value === change.policyConfigKey)
          if (choices.length !== 1) throw new Error('策略配置不唯一或已失效，请从当前目录选择 policyConfigKey')
          if (choices[0].inputMode && choices[0].inputMode !== 'PARAMETERS') throw new Error('当前配置不支持参数方式，请先核对真实配置合同')
          for (const field of rows(fields)) {
            const value = change.payload[field.fieldName]
            if (field.required && (value === undefined || value === null || value === '')) throw new Error(`缺少策略参数：${field.fieldName}`)
            if (value !== undefined && value !== null && field.enumValuesJson && !JSON.parse(field.enumValuesJson).includes(value)) throw new Error(`策略参数不在当前枚举中：${field.fieldName}`)
          }
          return { ...change, policyConfigKey: choices[0].value, vendor: device.vendor, deviceType: device.deviceType }
        })
        return { ...input, changes }
      },
      async preview(value: any, config: any, context: any) {
        const call = api(soc, config, context)
        if (value.taskId) {
          const detail = data(await call('ingest', 'get_admin_dispatch_task_by_id', { id: value.taskId }, true))
          return { ...value, task: detail.task ?? detail, detail, stage: 'existing', proceed: value.stop === 'apply' }
        }
        const items = await context.map(value.changes, async ({ contracts, ...change }: any) => {
          try {
            const preview = data(await call('ingest', 'preview_admin_dispatch_task', { body: change }, true))
            const blocked = preview.success !== true || preview.online !== true || preview.precheck?.status === 'CONFLICT' || preview.precheck?.changeIntroducesHard === true || preview.precheck?.blocked === true
            return { change, preview, status: blocked ? 'blocked' : 'ready' }
          } catch (error: any) { return { change, status: 'blocked', error: error.message } }
        })
        return { ...value, items, stage: 'preview', proceed: value.stop !== 'preview' && items.every((item: any) => item.status === 'ready') }
      },
      async draft(value: any, config: any, context: any) {
        if (value.taskId) return value
        const call = api(soc, config, context)
        let taskId: string | undefined
        try {
          const created = data(await call('ingest', 'create_admin_dispatch_task', { body: { name: value.name ?? `策略变更 ${context.runId}`, changeReason: value.changeReason ?? '用户授权的策略变更', changes: value.items.map((item: any) => item.change) } }))
          const id = created.id ?? created.taskId ?? (typeof created === 'number' || typeof created === 'string' ? created : undefined)
          if (!id) return { ...value, stage: 'create-unknown', proceed: false, message: '建任务回执缺少原 ID，停止，不重建' }
          taskId = String(id)
          context.progress({ status: 'running', result: { taskId } })
          const detail = data(await call('ingest', 'get_admin_dispatch_task_by_id', { id: taskId }, true))
          const task = detail.task ?? detail
          return { ...value, taskId, task, detail, stage: 'draft', proceed: value.stop === 'apply' }
        } catch (error: any) { return { ...value, taskId, stage: 'create-unknown', proceed: false, message: error.message, recovery: '先查询 AISOC 原任务；无法唯一确认时不得重新创建' } }
      },
      async submit(value: any, config: any, context: any) {
        const call = api(soc, config, context), taskId = value.taskId
        let detail = value.detail, task = value.task
        try {
          detail ??= data(await call('ingest', 'get_admin_dispatch_task_by_id', { id: taskId }, true)); task = detail.task ?? detail
          if (task.status === 'DRAFT') {
            const precheck = data(await call('ingest', 'precheck_admin_dispatch_task', { id: taskId }, true))
            if (precheck.blocked || precheck.success === false || precheck.riskAcceptanceRequired || precheck.overallHasConflict || precheck.perDevice?.some((device: any) => device.status === 'CONFLICT' || device.changeIntroducesHard)) return { ...value, task, precheck, proceed: false, stage: 'precheck-blocked' }
            await call('ingest', 'submit_admin_dispatch_task', { id: taskId, body: precheck.reviewFingerprint ? { reviewFingerprint: precheck.reviewFingerprint } : {} })
            detail = data(await call('ingest', 'get_admin_dispatch_task_by_id', { id: taskId }, true)); task = detail.task ?? detail
          }
          return { ...value, task, detail, stage: 'submitted', proceed: true }
        } catch (error: any) {
          try { detail = data(await call('ingest', 'get_admin_dispatch_task_by_id', { id: taskId }, true)); task = detail.task ?? detail } catch { /* 原 ID 与未知状态仍可恢复。 */ }
          return { ...value, task, detail, stage: 'submit-unknown', proceed: false, message: error.message, recovery: '按原 taskId 核对，禁止重放提交' }
        }
      },
      async approval(value: any, config: any, context: any) {
        // 审批归 AISOC；没有真实批准状态就返回原任务，不代替审批人作决定。
        if (!value.proceed) return value
        const status = value.task?.status
        return { ...value, stage: status === 'APPROVED' ? 'approved' : 'waiting', proceed: ['APPROVED', 'READY', 'SUCCESS', 'PARTIAL_SUCCESS', 'PARTIAL', 'FAILED', 'RUNNING', 'EXECUTING'].includes(status), recovery: '按原 taskId 查询；需要审批时办理关联的真实待办' }
      },
      async execute(value: any, config: any, context: any) {
        const call = api(soc, config, context)
        if (!['APPROVED', 'READY'].includes(value.task?.status)) return value
        try { await call('ingest', 'execute_admin_dispatch_task', { id: value.taskId }); return { ...value, stage: 'accepted' } }
        catch (error: any) { return { ...value, stage: 'execute-unknown', message: error.message, recovery: '按原 taskId 查询，禁止再次 execute 或创建任务' } }
      },
      async observe(value: any, config: any, context: any) {
        const call = api(soc, config, context)
        try {
          const detail = data(await call('ingest', 'get_admin_dispatch_task_by_id', { id: value.taskId }, true)), task = detail.task ?? detail
          return { ...value, task, detail, stage: value.stage === 'execute-unknown' ? value.stage : 'observed', message: value.message ?? '以 AISOC 原任务及设备明细为准；提交受理和预览不能证明设备已生效' }
        } catch (error: any) { return { ...value, stage: 'observe-unknown', message: error.message, recovery: '保留原 taskId 查询，不重放写入' } }
      },
      result(value: any) { const { changes, items, ...result } = value; return { ...result, ...(items ? { items } : {}), requestedChanges: changes?.map(({ contracts, ...change }: any) => change) } },
    },
  }
}
