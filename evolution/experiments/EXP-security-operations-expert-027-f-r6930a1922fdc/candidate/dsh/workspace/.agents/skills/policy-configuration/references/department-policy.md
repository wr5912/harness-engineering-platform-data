# 部门网络策略：专用计划、本地意图任务与严格草稿边界

## 当前可用性与外部停点

部门原七项高层 operation（含专用 `prepare_policy_department_draft` / `get_policy_department_draft`）保留，另增本地 `prepare_policy_department_task` / `get_policy_department_task`。统一真实来源为 `policy-configuration`，平台目录为12个 tools及5个 resource templates；部门九项 operation 对应6个 tools及计划、Task、Draft回读的3个资源模板，部门目录走 `list_policy_departments` 工具，不能称九个工具。本地假 SOC 回归不证明业务27已装载、已连接真实 SOC或新会话业务通过。

单点和部门均使用 `policy-configuration` 来源及 HEP 已保存的签名组地址，不另建 `policy-departments` 来源。目标 loader、工具装载和新会话业务通过，分别以当前目录及真实回执验证；后台部署、平台来源配置、源码实现或旧文档停点都不替代当前业务会话的实际能力发现。每个会话先核真实工具/资源目录与来源，只有当前路线所需 operation 的入口实际装载且矩阵/Guard 授权时才继续。已有文档、源码、工具声明或本地回归本身不能当作装载证据。当前目录未装载、路线入口缺失、来源不唯一或矩阵/Guard 未授权时失败关闭：说明具体缺口，不尝试写，不调用底层 SOC、旧 single 或其他来源兜底，不把缺接口说成用户缺参数。保留用户已给的部门、目的、协议、端口等原话，不让用户提供内部 ID 代替缺失入口。

以下是实际装载且获准后应遵守的部门合同，不是当前已经可调用的证明。操作须从本会话 MCP 工具/资源目录发现；计划、Task、Draft的 GET 以资源模板提供，按实际发现的模板合同填参读取，不猜同名工具、连接或 URI。合法入口缺失、合同或权限错误时报告缺口，不用 Shell、文件、直接 HTTP 绕过。文档停点不能替代 Runtime 硬门禁。

## 先分流，后解析

部门、组织或集合请求先于单点（single）判断，使用本 Skill 的部门专用分支。部门是当前候选集合，不是一个资产；即使合格子集只有一台，也不改走 single。不调用 single resolver、旧端点歧义选择、防火墙选择或循环 `prepare_policy_configuration` 替代部门计划；不套用 single 固定过渡语、“RESOLVED 立即 prepare”、公开脱敏摘要及原生执行确认规则。独立 single 请求仍按原流程及公开脱敏条款，不复用部门草稿、旧请求或旧确认执行。

首期按专用高层合同支持的 ADD/ALLOW、本部门当前快照范围办理。用户要求阻断、修改、删除、子部门、未来成员自动继承、多设备或限时时，不擅自改成首期能力或永久规则继续；按实际合同说明边界并停止。仅查询、查看或分析不创建草稿；最初已明确“生成草稿/开通策略”即为业务生成意图，必要参数和歧义处理完成且计划允许准备后，不再机械追问一次“是否生成草稿”。这不构成执行授权。

## 部署主线与原生探索工具限制

部署主线使用 HEP 已保存的签名组地址与统一 `policy-configuration` 来源，复用下表九项 operation，按6个工具及3个资源模板办理；不另建部门来源，不因本地探索封装改称十项后台 operation。只使用当前真实目录中存在且获准的入口；缺目录、缺部署或权限不足时停止对应路线，不猜工具，不增设第三层 MCP/HTTP 代理，不改网络或借底层接口绕行。Task 可信结果由当前已准入原模型正常用中文解释，不切自定义 fixed provider/model、不伪装 provider、不改模型目录或平台策略，不声称最终逐字保证。

`create_department_policy_task` 的本地 REST 原生工具源码仅供同宿主探索；本容器 Preset 默认禁用，不是当前可用能力，也不是模型应优先选择的入口。已核容器网络为 private bridge（宿主仅127端口绑定），容器 `127.0.0.1` 不等于宿主地址，不得声称可访问宿主本地 REST。只有未来真实目录确实存在此工具，且授权与可达性均有实际证据时才可调用 `{}`；真实用户整句、授权、动态部门/资产/声明地址、计划及任务 GET 的验证由 Runtime 内部完成，不套 MCP 三引用。其成功或受控失败仍只按真实 tool/result 解释，不造 pgt ID、SOC 任务号或假 assistant 事件。仅分析、不保存时绝不调用创建工具或 MCP Task.prepare。

后台26113统一 OAS 的17项操作已部署并返回200，平台 MCP 来源组已按用户配置为统一 `policy-configuration` 来源及 HEP 已保存的签名组地址。业务27的新装载、草稿及新会话行为仍待本轮验证；后台和平台目录就绪不能代替实际装载、模型准入或真实业务验收。原 single 与 strict Draft 的既有交付机制保留，不据此扩展 Task 路线或声称自定义 provider 已获准。本轮测试授权仅到草稿，不触发确认或执行；这不撤销未来用户明确授权下的正常 single 受信确认机制。

## 原七项高层能力与新增 Task operation（正常 MCP 主线）

| 阶段 | 高层操作 | 原生入口 | 推进依据 |
| --- | --- | --- | --- |
| list | `list_policy_departments` | 工具 | 动态目录回执，确定本轮部门；同名、层级或范围不唯一时仅问必要选择，不猜目录资源 URI |
| targets | `preview_policy_department_targets` | 工具 | 以真实部门身份查询当前成员和资产主数据；保留候选、合格子集、待选及未纳入原因 |
| dest | `resolve_policy_department_destination` | 工具 | 以用户原文解析目的；资产及地址只取回执，不借 single 自动 prepare 回调 |
| plan | `preview_policy_department_plan` | 工具 | 按实际合同携带本轮目标快照/选择与目的证据，生成真实规则和排除结果 |
| plan 回读 | `get_policy_department_plan` | 资源模板 | 按本会话发现的真实模板，以本会话真实计划 ID 回读；它不是草稿 GET |
| prepare | `prepare_policy_department_draft` | 工具 | 仅明确生成意图且真实计划允许准备时，提交下述三字段 body |
| get | `get_policy_department_draft` | 资源模板 | 按本会话发现的真实模板，用本会话真实回执的 operationId 读取同一草稿，不重写 |
| Task prepare | `prepare_policy_department_task` | 工具 | 明确保存意图且 `task_preparation.ready_for_task=true` 时，按三引用保存本地完整意图集合 |
| Task get | `get_policy_department_task` | 资源模板 | 按本会话发现的真实模板，仅以本会话真实 prepare 回执的 `taskId` 回读原任务与原意图 |

按 `list → targets → dest → plan →（已明确生成意图时）prepare → get` 推进；计划回读按真实状态需要使用，不把七项能力等同于每轮必须机械调用七次。仅查看或分析停在只读结果，不 prepare；后续用户明确要求生成时才接续。前序回执缺失、未知或矛盾时不跳步、不补造 ID/摘要/规则。

### 动态候选与必要选择

- 部门名称、层级、ID、成员、资产主数据、地址和数量来自当前高层回执；目录不完整要说明。不固定研发部、101、成员数或主机/软件单元的计数规则，不从历史样本、本地字典或模型猜测补齐。
- 成员不等于可用源资产；只纳入高层计划认可的合格子集，保留每个未纳入或待选对象及其真实原因，不因一个成员失败抹掉其他合格成员，也不把子集说成全部门。按回执保留独立身份，不擅自合并同名资产/独立 VM，不把软件单元重复当主机。空子集停止，不能扩大成全部。
- 多地址、主地址未定、共享地址或目录歧义时，仅询问会改变选择的必要输入；有真实唯一结果且无歧义时不反复询问。目的有多个声明 IP 时，必须让用户明确选择回执中一个声明 IP，不自行取首项、猜主地址、改用未声明 IP 或把全部地址并入规则。用户已明确选择且能与本轮声明项唯一匹配时不重复问。
- 只有本会话高层回执的资产 ID、候选 ID、声明地址、快照与摘要可进入计划；模型不造资产 ID、规则或设备映射，不要求用户手工代查内部 ID。部门归属不是执行设备证明；直接防火墙回退也不是路径已证实。
- 计划请求按实际目录合同复制用户已看到的目标快照摘要和必要选择，计划中的规则、阻塞及排除原因以回执为准。需求、成员、地址或设备变化时旧计划/摘要不再适用于新条件，须重新预览；若已有未知写入，先按下节查账，不用改条件重建掩盖未知。

## 本地分组策略意图任务（不是 SOC DRAFT）

示例：`为部门“某真实部门”创建策略任务，允许访问172.16.2.100 TCP443，不执行`。部门必须来自真实动态目录，示例不是可照填的部门或资产。用户仅要求分析、预览、查看，或明确不保存时，绝不调用 Task.prepare；后续明确要求保存才可接续当前有效计划。

Task 保存依据独立于 strict draft：当前计划必须明确 `task_preparation.ready_for_task=true`，并返回严格升序唯一真实 `asset_ids`、正数 `intent_count`、真实 `intents_digest`。只有真实选中主机、已声明且明确选中的源 IPv4、READY 目的及其声明 IPv4、完整 ADD/ALLOW + TCP/UDP + 单目的端口才算完整意图。authority/SOC 不通、证据不足可逐项阻塞，但不阻止保存这些完整真实意图；不能绕过 authority，也不能虚构设备、路径、规则或命令。未知真实资产、缺地址、多地址未选仍须选择或排除；0 完整意图拒绝空任务，不因一个坏成员连坐其他完整成员，不将合格子集称为全部门。

Task prepare 顶层只有对象 `body`，严格仅 `request_id/plan_id/expected_plan_digest`，ID/摘要来自本会话当前计划。Task 与 Draft 同请求跨协议互锁：已发无回执或未知时不换号、换计划、重复创建或切换协议。已知本会话真实 Task ID 时仅按发现的资源模板以 `taskId=原ID` get；无真实成功回执不能靠用户粘贴、猜测 ID 或资源 URI 建立绑定。

成功合同为 `schema_version=policy-department-task/v1`，`task_id` 是 `pgt-` 加60位小写十六进制，`storage_phase=ACCEPTED`、`persisted=true`、`execution_allowed=false`、`task_precheck_status=NOT_RUN`、`soc_task_id=null`。`READY_FOR_SOC/PARTIALLY_READY/EXTERNAL_BLOCKED` 仅描述已保存意图的逐项准备情况，均不是 SOC 草稿、执行许可或已下发证明；每项保留真实原意图、分析状态、阻塞原因及纳入/排除事实，未审批、未执行。

MCP Task 入口仅在当次原始结果事件通过 helper 的同会话 plan ID/digest、included IDs/intents digest 与 task ID 绑定后，才把服务端可信中文 `result_markdown` 原样提供给当前原模型解释；回读真实任务 ID 与原意图，不改写成 SOC DRAFT、不补 SOC 命令，不进入 single/应急旧确认链。schema、ID、摘要、当前事件、保存证据不符或结果未知，只保守待核，不推断未创建，不提示重新创建，也不能借历史绑定宣称当前成功。该 MCP 分支只对本次 admitted messages 作安全投影，未证明会覆盖全部历史 ModelContext；不能称完整模型请求已强制过滤坏正文，更不保证原模型最终逐字输出。原始 Session 事件不改写、不伪造 assistant/result 事件。原生高层工具的权威结果由其 Runtime 内部严格校验，不套此 MCP 事件绑定。

以下原 strict 草稿路线仍须 `preparation.ready_for_draft=true` 的 ready 子集；Task 可保存不证明该子集具备真实配置预览或 SOC DRAFT 条件。

## 一次草稿、多 changes 与未知写入

准备依据是本次计划的 `preparation.ready_for_draft=true` 及该准备子集的 `status=READY_FOR_DRAFT`，不是要求总体 `status` 全部通过：总体仍为 `BLOCKED` 或 `SELECTION_REQUIRED` 时，合格子集仍可继续，其他成员保留原因。准备就绪不代表草稿已保存，更不是执行成功。用户已明确业务生成意图且回执允许准备时，一次专用 prepare 可生成包含多个 changes 的草稿；不按成员拆成多个写入，不循环旧 single.prepare。prepare 工具顶层按实际合同使用对象 `body`，其内容严格只有以下三项：

```json
{
  "body": {
    "request_id": "本轮生成并保存的唯一幂等 ID",
    "plan_id": "本会话真实计划回执的 plan_id",
    "expected_plan_digest": "同一计划回执的真实摘要"
  }
}
```

示例不是可照填的 ID/摘要。`body` 不得再加部门、资产、changes、规则、设备或确认字段，不借模型重拼规则绕过冻结计划。同一草稿请求保存并沿用 request_id，不把新号当作重试手段。

- prepare 后只按真实回执进入 `get_policy_department_draft`；GET 的 `operationId` 必须来自本会话真实工具回执，不接受用户粘贴、其他会话或文档示例 ID。已知真实 operationId 时仅 get 同一操作，不再次 prepare。
- 已发请求却无回执，或结果为 `UNKNOWN` / `PREPARING`，均禁止换 request_id、换 plan 或重复 prepare。已知真实 operationId 则仅 get；没有真实操作号则如实说明结果未知、无法续查并停止，留待受控查账，不让用户随意贴旧号。
- `541` 不是新的成功回执，也不是换号重写依据；不能据此声称新草稿成功。ID、状态、摘要缺失或冲突时报告具体障碍，不推断未写入，也不声称已创建。
- 已保存草稿的 get 是读取绑定证据，不重新创建、不代表刷新当前 SOC。进程重启或计划缓存过期不授权自动重建 SOC 任务；未写入时如需继续须重新取得合法计划，未知写入仍先查账。

## strict 草稿结果交付与不执行边界

本节仅针对上面的 strict 草稿；本地 Task 按其独立合同交付，不要求或补造 SOC 配置命令。按本次真实回执展示本轮规则、纳入成员及原因、未纳入/待选成员及原因、实际配置预览和回滚预览；不存在或未返回的内容明确说未取得，不由模型生成命令、回滚步骤、规则或“已回滚”事实。不能只报总数，也不把候选总量等同于规则数。这里仅适用于部门专用分支，不改变 single 的公开脱敏条款。

分开说明下列证据，不能合并成“全部通过”：

- `DRAFT_READY`：草稿及其计划绑定证据已保存；绑定的是当时快照，不是当前 SOC 状态刷新。
- 任务级预检 `NOT_RUN`（及回执中的 `NOT_ASSESSED`）：尚未运行/评估，不说预检已通过。
- scope、direction、current-policy 为 `UNVERIFIED`：范围、方向、当前策略仍未验证，不说现有策略无冲突或方向正确。
- `execution_allowed=false`：不授予执行许可；本阶段未执行，不说下发、生效、执行成功或业务连通；其他字段也必须按实际回执表达，不把未返回字段补成上述值。

本部门分支不触发旧 single 的原生“执行/取消执行”确认、审批或提交，不调用 confirm、decide、SOC 写入接口，也不套用应急处置确认。生成草稿意图、候选选择、“执行”文本、取消、跳过、改参和自由输入都不能转换成部门执行批准。当前交付边界是本地意图任务或满足原门槛的专用草稿及其各自真实证据；真实装载、真实 SOC 连接、新会话模型行为和执行链均未由本次文档适配验证。
