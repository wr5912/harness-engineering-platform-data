export interface InspectionReportBinding {
  readonly run_id: string
  readonly workflow: string
}

/** 只能由 selectFaultChild 从当前父会话原生日志派生，不接收模型提供的绑定。 */
export interface FaultReportBinding {
  readonly parentId: string
  readonly childId: string
  readonly childCreatedAt: number
  readonly delegateCallId: string
  readonly request: string
  readonly userMessageId: string
  readonly requestSeq: number
  readonly delegateSeq: number
  readonly receiptSeq: number
  readonly noticeSeq: number
  readonly noticeTime: number
}

export interface FaultReportSource {
  readonly kind: 'fault-readonly'
  readonly parent_session_id: string
  readonly child_session_id: string
  readonly child_created_at: number
  readonly delegate_call_id: string
  readonly user_message_id: string
  readonly request_seq: number
  readonly delegate_seq: number
  readonly receipt_seq: number
  readonly notice_seq: number
  readonly result_seq: number
  readonly completed_turn: number
  readonly completed_seq: number
  readonly completed_at: string
  readonly request_sha256: string
  readonly content_sha256: string
  readonly source_sha256: string
}

/** 仅从本会话真实成功启动回执绑定run/workflow；调用方再以完整canonical回执校验终态及产物。 */
export function selectInspectionRun(
  events: readonly unknown[],
  runId?: string,
  canonicalName?: (name: string) => string | undefined,
): InspectionReportBinding

/** 默认只允许唯一尝试；latest_completed须由Skill按用户明确语义填写，显式runId只返回指定运行。 */
export function selectInspectionRuns(
  events: readonly unknown[],
  runId?: string,
  canonicalName?: (name: string) => string | undefined,
  selection?: 'latest_completed',
): readonly InspectionReportBinding[]

export interface TroubleshootingReportBinding {
  readonly parent_session_id: string
  readonly run_id: string
  readonly composition_id: 'troubleshooting-business-access' | 'troubleshooting-device-offline'
  readonly workflow: 'troubleshooting-business-access' | 'troubleshooting-device-offline'
  readonly start_tool_name: string
  readonly start_registered_tool_name: string
  readonly start_call_id: string
  readonly start_turn: number
  readonly start_step: number
  readonly start_seq: number
  readonly start_result_seq: number
  readonly user_message_id: string
  readonly request_seq: number
  readonly request_sha256: string
  readonly start_receipt_hash_scope: 'native-tool-result.visible-text/v1'
  readonly start_receipt_sha256: string
}

export interface TroubleshootingReportSource extends TroubleshootingReportBinding {
  readonly kind: 'fault-troubleshooting'
  readonly artifact_id: string
  readonly original_filename: string
  readonly original_content_type: string
  readonly original_sha256: string
  readonly original_sha256_scope: 'sha256-of-original-utf8-body'
  readonly original_bytes: number
  readonly artifact_metadata: Readonly<Record<string, any>>
  readonly artifact_response_metadata: Readonly<Record<string, any>>
  readonly source_sha256: string
}

/** 默认选最新尝试，显式runId须本会话唯一真实启动；仅无新活动返回undefined，未知/冲突不legacy fallback。 */
export function selectTroubleshootingRun(
  parentId: string,
  events: readonly unknown[],
  runId?: string,
  canonicalName?: (name: string) => string | undefined,
): TroubleshootingReportBinding | undefined

/** 输入须是现有Tools.execute策略管线返回的完整canonical Run，不用Session裁剪展示判终态。 */
export function selectTroubleshootingArtifact(
  binding: TroubleshootingReportBinding,
  run: unknown,
): Record<string, any>

/** 验证唯一HTML及所有提供的身份/字节/SHA/额外metadata；不改动原body/filename。 */
export function troubleshootingReportSource(
  binding: TroubleshootingReportBinding,
  run: unknown,
  artifact: unknown,
): { html: string; filename: string; source: TroubleshootingReportSource }

/** 默认最近已完成故障来源；指定 childId 也必须存在本会话原生直接子证据。 */
export function selectFaultChild(
  parentId: string,
  events: readonly unknown[],
  childId?: string,
): FaultReportBinding

/** snapshot 为 sessionQuery.readSession 的原生返回；正文只取成功终态的可见文本。 */
export function faultReportSource(
  binding: FaultReportBinding,
  snapshot: unknown,
): { html: string; source: FaultReportSource }

export interface MainFaultEvidence {
  readonly call_id: string
  readonly tool_name: string
  readonly call_seq: number
  readonly result_seq: number
  readonly is_error: boolean
  readonly user_message_id: string
  readonly request_seq: number
  readonly receipt_projection: 'native-tool-result.visible-text/v1'
  readonly receipt_sha256: string
}

export interface MainFaultReportSource {
  readonly kind: 'fault-main-readonly'
  readonly parent_session_id: string
  readonly user_message_id: string
  readonly request_seq: number
  readonly evidence: readonly MainFaultEvidence[]
  readonly evidence_until_seq: number
  readonly evidence_until_utc: string
  readonly requests: readonly {
    readonly user_message_id: string
    readonly request_seq: number
    readonly request_sha256: string
  }[]
  readonly receipt_hash_scope: string
  readonly request_sha256: string
  readonly content_sha256: string
  readonly source_sha256: string
}

/** Root归属由Runtime核对；正文仅为主助手可见分析，来源只能绑定真实本会话只读回执。 */
export function mainFaultReportSource(
  parentId: string,
  events: readonly unknown[],
  analysis: string,
  evidenceCallIds?: readonly string[],
  canonicalName?: (name: string) => string | undefined,
): { html: string; source: MainFaultReportSource }

export interface SavedSecurityReport {
  readonly value: Record<string, any>
  readonly receipt_seq: number
  readonly has_new_source: boolean
  readonly has_new_troubleshooting_source: boolean
}

/** 需原生export成功配对回执；不透明MCP别名会保守阻止默认旧附件复用。 */
export function selectSavedSecurityReport(
  parentId: string,
  events: readonly unknown[],
  kind: 'inspection' | 'fault',
  attachmentId?: string,
  canonicalName?: (name: string) => string | undefined,
): SavedSecurityReport | undefined
