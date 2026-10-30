/**
 * receipt-helper —— 收据合计验收工具 receipt_total（最小只读 DSH 原生工具插件）
 *
 * 目标版本：EXP-audit-e2e-assistant-web-002-ra2a3ad241109（Agent: audit-e2e-assistant-web）。
 * 注册写法遵循官方 cordis-plugin-development 与 @deepseek-ai/dsh-tools 的真实合同（上游固定提交
 * 687f282e8625c6b8d11ff58211a90524be2e4317，与运行时 source.lock.json 一致）：导出 apply(ctx, config)
 * 与 inject = ['tools']，在 apply 内 ctx.tools.register(defineTool({...}))。
 *
 * 工具契约（只读、无副作用、不写业务数据）：
 * - receipt_total 接收 unit_price（单价）与 quantity（数量），二者都必须是有限非负数；
 * - 合法输入返回可核对的乘积（算式、被乘数、乘积与单位说明）；
 * - 不合法输入（非有限数或负数）返回明确的“不可计算”原因与所需有效输入，不猜测、不返回负合计；
 * - 不访问任何外部系统，不保存或查询业务数据，不虚构任何回执。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** 合计单位说明：工具只收到数值，金额单位随单价单位、数量单位随输入数量单位，不由工具杜撰。 */
const UNIT_RULE = '金额单位随单价单位（如元），数量单位随输入数量单位（如件）'

type NumericField = 'unit_price' | 'quantity'

const FIELD_LABEL: Record<NumericField, string> = {
  unit_price: '单价',
  quantity: '数量',
}

/** 校验“有限非负数”；不合法返回明确不可计算原因，合法返回 null。 */
function invalidReason(field: NumericField, value: unknown): string | null {
  const label = FIELD_LABEL[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${label}无效：${JSON.stringify(value)} 不是有限数值，无法计算合计`
  }
  if (value < 0) {
    return `${label}无效：${value} 不是非负数，无法计算合计`
  }
  return null
}

const receiptTotalTool: ToolDefinition = defineTool({
  name: 'receipt_total',
  description:
    '收据合计只读计算工具：接收单价 unit_price 与数量 quantity，返回可核对的乘积合计与单位说明。' +
    '仅做本地乘法，不访问外部系统、不保存业务数据；输入不是有限非负数时如实返回不可计算原因。',
  parameters: {
    unit_price: {
      type: 'number',
      required: true,
      description: '单价（金额/件），必须为有限的非负数',
    },
    quantity: {
      type: 'number',
      required: true,
      description: '数量（件），必须为有限的非负数',
    },
  },
  output: {
    schema: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', const: true, required: true },
            formula: { type: 'string', required: true, description: '可核对算式：单价 × 数量 = 合计' },
            unit_price: { type: 'number', required: true },
            quantity: { type: 'number', required: true },
            total: { type: 'number', required: true, description: '合计 = 单价 × 数量' },
            unit: { type: 'string', required: true, description: '合计单位说明' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', const: false, required: true },
            computable: { type: 'boolean', const: false, required: true },
            field: { type: 'string', enum: ['unit_price', 'quantity'], required: true },
            reason: { type: 'string', required: true, description: '明确的不可计算原因' },
            requirement: { type: 'string', required: true, description: '需要用户提供的有效输入' },
          },
        },
      ],
    },
    render: (_args, value) => {
      const text = value.ok
        ? `receipt_total 计算成功：${value.formula}；合计 ${value.total}；${value.unit}`
        : `receipt_total 无法计算（ok=false）：${value.reason}。${value.requirement}`
      return [{ type: 'text', text }]
    },
  },
  execute: async (args) => {
    const unitPrice = args.unit_price
    const quantity = args.quantity
    const badUnitPrice = invalidReason('unit_price', unitPrice)
    const badQuantity = invalidReason('quantity', quantity)
    if (badUnitPrice !== null || badQuantity !== null) {
      const field: NumericField = badUnitPrice !== null ? 'unit_price' : 'quantity'
      const reason = badUnitPrice !== null ? badUnitPrice : (badQuantity as string)
      return {
        ok: false,
        computable: false,
        field,
        reason,
        requirement: `请提供有效的${FIELD_LABEL[field]}（有限的非负数）后重新计算`,
      }
    }
    const total = unitPrice * quantity
    return {
      ok: true,
      formula: `${unitPrice} × ${quantity} = ${total}`,
      unit_price: unitPrice,
      quantity,
      total,
      unit: UNIT_RULE,
    }
  },
})

/** 插件注册所需的最小上下文：工具注册表。 */
interface ToolsService {
  register(definition: ToolDefinition): unknown
}

interface ReceiptHelperContext {
  tools: ToolsService
}

/** Cordis 插件名（与 Managed Patch 注册行 id 一致）。 */
const name = 'receipt-helper'
/** 该插件使用的服务。 */
const inject = ['tools']

/** 注册 receipt_total 只读工具；无其他副作用。 */
function apply(ctx: ReceiptHelperContext): void {
  ctx.tools.register(receiptTotalTool)
}

export { apply, inject, name }
