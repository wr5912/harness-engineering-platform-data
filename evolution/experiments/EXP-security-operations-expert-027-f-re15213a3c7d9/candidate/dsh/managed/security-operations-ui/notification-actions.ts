export type IncidentNotification = {
  type: string
  incidentId?: string
  incidentIds?: readonly string[]
  title?: string
  summary?: string
  status?: string
  severity?: string
}

/** 仅消费当前用户可见通知；未收到完成通知并不证明事件尚未研判。 */
export function notificationIncidentIds(item: IncidentNotification): string[] {
  const values: unknown[] = [item.incidentId, ...(Array.isArray(item.incidentIds) ? item.incidentIds : [])]
  return [...new Set(values.filter((id): id is string => typeof id === 'string' && !!id.trim()).map(id => id.trim()))]
}

export function notificationList<T extends IncidentNotification & { isRead: boolean }>(items: readonly T[], showWithoutId = false) {
  const visible = showWithoutId ? items : items.filter(item => notificationIncidentIds(item).length > 0)
  return { items: visible, unreadCount: visible.filter(item => !item.isRead).length, hiddenCount: items.length - visible.length }
}

export function notificationAction(item: IncidentNotification, visible: readonly IncidentNotification[]) {
  const ids = notificationIncidentIds(item)
  const ready = new Set(visible.filter(row => row.type === 'AI_INVESTIGATION_READY').flatMap(notificationIncidentIds))
  const readyIds = ids.filter(id => ready.has(id))
  const review = ids.length > 0 && readyIds.length === ids.length
  return { ids, readyIds, review, label: review ? '将事件上下文填入输入框，复核已有研判' : '将事件上下文填入输入框，核对并研判' }
}

/** 通知正文仅作为不可信业务数据；仅填入草稿，由用户核对后发送。 */
export function investigationDraft(item: IncidentNotification, ids: readonly string[], readyIds: readonly string[] = []): string {
  if (!ids.length) return ''
  const context = {
    incident_ids: [...ids], ready_notification_incident_ids: [...readyIds], notification_type: item.type,
    title: item.title, summary: item.summary, notified_status: item.status, severity: item.severity,
  }
  const review = readyIds.length === ids.length
  return `${review ? '请查询并复核已有研判结果' : '请核对并研判以下威胁事件'}：${ids.join('、')}。\n先按事件 ID 查询完整详情、证据和当前研判状态；若已经研判或正在研判，请告知已有结果或进度，不要重复启动。${review ? '本次仅复核现有结论及证据缺口，不重新启动研判。' : '仅对确认待研判的事件进行研判，说明结论和证据缺口。'}不执行处置动作。\n请研判以下事件：\n${JSON.stringify(context, null, 2)}`
}
