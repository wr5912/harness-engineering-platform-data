---
name: policy-configuration
description: 部门或组织集合策略先走高层计划、本地意图任务或严格草稿分支；独立单点新增网络访问策略仍经 AI Platform 解析资产名称、IPv4 或 IPv4 CIDR 并准备 DRAFT，确认前不下发。
---

# 网络访问策略配置（迁移候选）

从识别出本 Skill 意图到最终结果，所有面向用户的过程说明都必须使用中文。装载 Skill 前不得输出英文计划或工具旁白；完整参数进入流程时，只允许使用本 Skill 锁定的中文过渡语。

## 表格附件输入（先于参数补问）

附件提取源码已归入本候选，但插件默认停用、尚未完成当前目标的装载与边界验证；只有本会话真实目录存在且获准时才可使用 `read_attachment_table`。未装载时如实说明当前不能读取表格，不猜本机路径、不读附件缓存、不把附件名或粘贴摘要当作已读取内容。

可用后先列当前会话的真实用户附件，再用回执中的 `attachment_id` 提取工作表、原表头、原值、四个策略字段和问题清单。缺失、歧义、未支持字段、公式、宏、外链与截断如实保留；提取只是用户事实，不构成配置或执行授权。先依据原请求判断部门或 single：部门/组织请求仍走下节专用分支，不循环 single.prepare；只有原本属于独立 single 的多行请求才逐行解析，不能合并未知意图或批量执行。

## 部门专用分流（先于 single）

先判断用户是否要求部门、组织或集合范围；是则先读 [部门策略合同](references/department-policy.md)，不套用 single 固定过渡语，也不进入下文 single 的端点解析、自动 prepare、候选选择、公开摘要或原生执行确认规则。即使最终合格子集只有一台，也不改走 single，不循环 `prepare_policy_configuration`。本节与 reference 仅限定部门分支，不修改独立 single 的流程及公开脱敏条款。下文 operation 名标识业务操作，不保证存在同名工具；统一来源的状态、结果及部门计划/Task/Draft回读共5个资源模板，须从本会话真实模板发现入口并按合同填参。本轮测试授权止于草稿，不触发确认或执行；未来用户明确授权时仍保留正常 single 受信确认机制。

- 部署主线统一使用 `policy-configuration` 单一真实来源及 HEP 已保存的签名组地址，不另建部门来源。平台目录为12个 tools及5个 resource templates；部门九项 operation 对应6个 tools及计划、Task、Draft回读的3个资源模板，部门目录走 `list_policy_departments` 工具。后台26113统一 OAS 的17项操作已部署并返回200，平台 MCP 来源组已配置；业务27新装载、草稿和新会话行为仍待本轮验证，不以此声称已经可调用或业务通过。只调用当前目录中真实存在且获准的入口；入口缺失或权限不足时说明具体停点，不猜工具、不增设 MCP/HTTP 代理、不改网络或借底层能力绕行。Task 结果保留当前已准入原模型正常中文解释，不切自定义 fixed provider/model、不伪装 provider、不绕过模型目录或平台策略，也不保证最终逐字。
- `create_department_policy_task` 的本地 REST 源码仅供同宿主探索，本容器 Preset 默认禁用，不是当前可用能力或优先路线。网络已核为 private bridge（宿主仅127端口绑定），不能把容器 `127.0.0.1` 当作宿主服务。只有未来真实目录确实存在此工具、授权和可达性均有证据时才可调用 `{}`；其真实用户整句、授权、计划与任务 GET 由 Runtime 内部验证，不套模型侧 MCP 三引用。当前不得因源码存在而调用不存在工具或声称连通。仅分析或不保存时，原生创建工具和 MCP Task.prepare 均禁止。代码、测试通过不代表部署就绪或真实业务验收完成。
- 部门是候选集合，不是资产。动态目录、成员与资产主数据、声明 IP、规则和数量均以本会话高层回执为准；不固定研发部、101 或任何计数规则，不自造资产 ID 或规则。只取合格子集，同时保留未纳入成员及原因；目录/地址有歧义时只问必要选择，目的多声明 IP 必须选择其中一个声明 IP。
- 先通过原七项能力中已装载且获准的只读入口按 `list → targets → dest → plan` 推进。用户仅查看或分析时不 prepare；用户最初已明确“生成草稿/开通策略”且计划允许准备时，直接接续部门 `prepare → get`，不机械追加第二次确认。一次草稿可含多个 changes，不按成员逐个 prepare。
- `prepare_policy_department_draft` 的 `body` 严格仅含 `request_id`、`plan_id`、`expected_plan_digest`；计划 ID/摘要只能复制本会话真实计划回执，其他调用参数按实际目录合同。`get_policy_department_draft` 的 `operationId` 必须来自本会话真实回执，不接受文档示例、用户粘贴或其他会话的操作号。
- 请求已发无回执、`UNKNOWN` 或 `PREPARING` 时禁止换号重写；已知 operationId 仅 get，无真实 ID 则报告未知并停止，不能靠重新 prepare 查账。`541` 不认作新成功，不触发换号或重写。
- 展示本次规则、纳入及排除原因、真实配置与回滚预览；不由模型生成命令。`DRAFT_READY` 仅表示已保存的绑定证据，不是当前 SOC 状态刷新；预检 `NOT_RUN`、scope/direction/current-policy `UNVERIFIED` 与 `execution_allowed=false` 分别说明，不声称执行成功，不触发旧 single 原生执行确认、审批或 SOC 写接口。
- 原七项高层 operation 保留，新增 `prepare_policy_department_task` / `get_policy_department_task`；九项 operation 在统一 `policy-configuration` 来源下按6个工具及3个资源模板办理，不另猜部门来源。计划、Task、Draft回读须从本会话真实资源模板取得入口与参数，不把 operation 名当作同名工具。按当前路线核对真实目录与矩阵/Guard；入口、权限或合同缺口时失败关闭，不调用底层 SOC、旧 single 或其他来源兜底。平台来源已配置不等于业务27的 loader、装载或新会话模型行为已通过。
- 用户明确创建/保存任务且当前 `task_preparation.ready_for_task=true` 时，完整真实意图可生成本地分组策略任务：选中真实主机及声明 IPv4、READY 目的、ADD/ALLOW、TCP/UDP、单目的端口完整；即使 authority/SOC 阻塞也可保存，每项保留分析状态和阻塞原因，不能绕过 authority。未知资产、缺地址、多地址未选仍须选择或排除；0 完整意图拒空任务，一个坏成员不连坐其他完整意图。仅分析或不保存绝不 Task.prepare。例：`为部门“某真实部门”创建策略任务，允许访问172.16.2.100 TCP443，不执行`。
- 以下三引用与 helper 绑定仅用于实际装载且获准的 MCP Task 入口，不套用于上述原生高层工具。Task prepare 的对象 body 也严格仅 `request_id/plan_id/expected_plan_digest`；Task get 的业务参数仅 `taskId=本会话真实prepare回执ID`，按实际发现的资源模板填参读取，不猜同名工具或 URI；任务 ID 为 `pgt-` 加60位小写十六进制，不能用整数 SOC 任务号替代。回读真实任务 ID、原意图和每项状态；当次 helper 绑定成功且 `schema_version=policy-department-task/v1`、`persisted=true`、`execution_allowed=false`、`soc_task_id=null`、`task_precheck_status=NOT_RUN` 才将可信中文 `result_markdown` 供原模型解释；坏当前回执只给待核提示，不借历史成功正文建立当前成功结论。MCP 入口仅有 admitted 消息投影，尚未证明可过滤全部历史 ModelContext；不应将其称为最终输出的强制过滤或逐字保证。这是本地意图任务，不是 SOC DRAFT，未审批、未执行；不能补 SOC 命令或进入旧确认链。未知只保守待核，不重复创建、不换号或跨 Task/Draft 绕锁。原 strict draft 仍必须满足 `preparation.ready_for_draft=true` 的 ready 子集，Task 可保存不证明 SOC 草稿就绪。

## 独立 single 流程（以下原规则不用于部门）

本 Skill 选择性迁移旧链路能力。只覆盖明确要求新增允许访问或新增阻断访问的 `ADD`，对象为资产名称、IPv4 或网络地址对齐的 IPv4 CIDR 标识的主机/网段到主机/网段、TCP/UDP 单目的端口。`operation=ADD` 表示新增，`action=ALLOW|DENY` 分别表示允许或阻断；阻断、拒绝、禁止访问使用 `ADD + DENY`，不能提交成允许策略；用户询问、故障排查、巡检以及 MODIFY/DELETE 不进入本轮策略写入路线。超出能力时说明当前边界并停止，不调用准备工具。带源、目的、协议、端口的阻断仍属于本策略路线；不得改述为放通或转为不含相同范围的应急封禁。DSH 主 Agent 是低权限协议客户端；源/目资产名称解析、设备身份、拓扑可达或直接防火墙兜底、候选冻结、Preview 和 DRAFT 均由 Platform 判断，不能自行调用 SOC 资产搜索、查询拓扑、设备映射、直接调用 Preview 或猜测设备。

## 参数与设备门禁

- 用户必须给出源与目的端点（各自可为一个资产名称、IPv4 或网络地址对齐的 IPv4 CIDR）、TCP/UDP 协议、1–65535 的目的端口、明确的新增意图和允许/阻断动作；单说“新增策略”而未说明动作，或同时明确允许与阻断时，先澄清；“开通…禁止访问策略”中明确“禁止访问”优先，action=DENY；缺失时只追问，不调用工具。端点是否已给出按用户句子中的源/目的位置判断，不按模型对名称语义的猜测判断：例如“新增 A 到 B 的 TCP 443 访问策略”中 `A` 和 `B` 都是已给出的字面端点查询词，即使它们看起来像角色、用途、昵称、缩写或自然语言描述，也必须原样交给 Platform 解析，禁止先要求用户证明它们是不是资产名称。
- 参数不足时只列出本轮用户尚未提供的必需参数及本路线能力边界；不得把本 Skill 的结构示例、其他会话内容或模型推测当作已确认参数，也不得声称当前会话已有草稿、Operation、taskId 或设备选择。只有本会话真实工具回执才能建立这些状态。
- 只续查当前会话成功 prepare 回执中的 operation ID。用户提供、其他会话或文档中的操作号不能作为续查依据；当前会话尚无操作号时直接说明无法查询，不要求用户贴旧操作号。
- 先使用 `workbench-policy-endpoint-resolution/v1` 解析端点；仅把 Platform 返回的 `prepare_body` 交给 prepare。最终 intent 仍使用 `workbench-policy-intent/v1`、`policy_kind=NETWORK_ACCESS`、`operation=ADD`、`action=ALLOW|DENY`、Platform 冻结的 IP/CIDR selector、`target_external_id=null`，并携带 Platform 返回的 `endpoint_resolution` 冻结证明。不得自行拼装、修改或删除解析证明。
- 用户说“在防火墙上”或明确指定防火墙名称、设备 ID 或管理 IP 时，将原话中的单一设备线索原样放入解析请求的 `device_query`，并只接受 Platform 返回的 prepare intent 中同值 `device_query`；不指定设备时省略该字段。不得把 ADD 的设备线索改写为 DELETE 文档字段 `device_name`，也不得丢弃约束后按普通开通。“在防火墙上”的单一设备线索就是 `防火墙`，解析服务负责核验是否唯一，不应要求用户重复提供已有线索。调用前从当前工具目录确认 policy-configuration 来源及唯一匹配能力，再核对 MCP 工具参数表包含 `device_query`；若工具客户端拒绝该字段，停止并记录为客户端合同障碍，不暗中换字段或声称成功。
- 用户给多个设备或描述有歧义时先澄清；用户指定设备不存在、未在线、无 ACL 能力或不在路径时，使用 Platform 的真实目录和替代候选；受信插件展示在线状态、能力及不可用原因，要求用户明确选择，即使只有一台替代也不能自动选择。明确替代后 Platform 更新设备约束、摘要和版本，并重新核验；没有合格候选时按真实结果停止。
- 本轮接受规范 IPv4 CIDR 网段，但不接受 IPv6 网段、MODIFY、DELETE，也不把“关闭/停用”解释为 DELETE。Platform 对 CIDR 不伪造主机可达路径：它会采用直接防火墙兜底，并继续校验防火墙在线状态、设备映射、ACL 能力、模板和只读 Preview；模型不得把兜底描述成“路径可达”。
- 用户把单个 IPv4 称为“网段”但没有给出掩码时，先澄清要单主机还是具体 CIDR；不得默认为主机并准备草稿。CIDR 必须使用网络地址，例如 `172.16.1.0/28`；`172.16.1.12/28` 不得静默扩大，交由 Platform 拒绝并请用户改正。用户要求有效期、截止时间或持续时长时，本轮先说明限时下发与到期语义尚未端到端验证并停止，不得省略时间约束后生成永久策略，也不得自行推算起止时间后声称已包含有效期。
- 本地原生 Guard 拒绝工具调用时，准确说明是当前 DSH 运行时门禁拦截；只有 Platform 或 SOC 实际返回拒绝，才说对应服务拒绝。工具调用被拦截后不得推断上游已受理、已拒绝或已执行。

端点解析的结构示例（名称和地址仅示意，实际值必须来自用户）：

```json
{
  "contract_version": "workbench-policy-endpoint-resolution/v1",
  "request_id": "本轮生成并保存的唯一幂等 ID",
  "operation": "ADD",
  "action": "ALLOW",
  "source_query": "源资产名称、192.0.2.10 或 192.0.2.0/28",
  "destination_query": "目的资产名称、198.51.100.20 或 198.51.100.0/28",
  "protocol": "TCP",
  "destination_port": 443
}
```

当前目录若缺少或重复对应工具，应停止并报告能力发现问题，不能改用其他来源的相似工具。

**提交形状（必须照此，否则平台会判“参数不完整或无效”）**：上面这个 JSON 不是工具入参本身，而是入参 `body` 的**值**。调用时顶层**只有 `body` 一个键**，且 `body` 必须是**对象**（不能写成 JSON 字符串）：

```
端点解析工具
{"body": {"contract_version": "workbench-policy-endpoint-resolution/v1", "request_id": "<本轮唯一幂等键>", "operation": "ADD", "action": "ALLOW", "source_query": "<用户原文源端点>", "destination_query": "<用户原文目的端点>", "protocol": "TCP", "destination_port": 443, "device_query": "<可选：用户原话中的设备线索>"}}
```

提交前自检三条：① 顶层键只有 `body`；② `body` 是对象而非字符串；③ `destination_port` 是整数。若 MCP 客户端拒绝该形状，立即停止并把原始报错作为**客户端合同障碍**回报，**不要**改成扁平字段或字符串重试。
**禁止自行解析资产（会被门禁拒绝）**：不得调用 `SOC 拓扑查询能力`、`SOC 事件关联能力`、`SOC 资产查询能力` 等 SOC 工具去查资产、拓扑或设备——它们不在本角色授权集合内，调用必被拒绝且重试无意义。资产解析**只能**通过 `端点解析工具` 交给 Platform 完成；被拒绝后不得换其它 SOC 工具重试，也不得据此推断资产不存在。

**意图判定**：“允许 X 访问 Y 的 TCP 443”这类表述**已同时给出新增与动作**（ADD + ALLOW），不得再追问“是否新增”。只有源、目的、协议、目的端口、动作（ALLOW/DENY）中确有缺失时才澄清；用户已说“允许/阻断”即动作明确。

例如用户说“请在防火墙上开通 192.0.2.97 到 198.51.100.97 的 TCP 18097”，解析请求必须含 `"device_query": "防火墙"`。

指定执行设备时在同一解析请求增加 `"device_query": "用户原话中的设备名称或 ID"`。Platform 返回的 `prepare_body` 会保留该约束；上述名称和地址仅示意，不能照填。

## 条件协议

1. 装载 Skill 且确认参数完整后，受信插件会先向用户输出且只输出一次固定过渡语（模型不得另写工具前正文）：`已进入策略配置流程，正在识别源、目的资产并核对五元组……`。随后第一个策略 MCP 调用必须且只能是 `端点解析工具`；没有解析回执与冻结候选摘要时绝不能调用 `choose_ambiguous_policy_endpoints` 或策略候选选择工具。如果误调用选择或 prepare 并收到“必须先调用 resolve_policy_endpoints”的运行时反馈，下一次调用必须立即改为 resolver，不得再试其他策略工具。模型只负责从“源到目的”等句式提取端点槽位，不负责判断字面名称是否像真实设备；例如“攻击肉机到 EDR-Agent”必须以 `source_query="攻击肉机"`、`destination_query="EDR-Agent"` 调用解析器，不得把“攻击肉机”改判为缺参、角色描述或要求用户换成 IP。源或目的即使已经是 IPv4/CIDR 也必须解析，以便在资产存在时向用户显示 `设备名称（IP）`，并由 Platform 决定路径或直接防火墙兜底。同一业务轮次只生成一个唯一 `request_id` 并保存；解析、选择与 prepare 都沿用它。
2. 端点解析返回后只按 `data.resolution_status` 推进：
   - `RESOLVED`：这只是面向用户的需求理解，不要求再次确认；由受信插件在最终结果中逐字交付一次，模型不另行重复。然后在同一轮立即以完全未改动的 `data.prepare_body` 调用 `策略准备工具`。
   - `SELECTION_REQUIRED`：受信插件展示 `data.result_markdown` 并使用 DSH 原生单选；源、目的各自有多候选时依次单选，唯一一侧自动保留，全部选择后原样接续同一请求。端点取消、跳过和关闭不选择、不准备；防火墙选择阶段已有平台操作，明确取消经受信插件绑定候选集摘要及业务版本记录 REJECT，跳过保留平台等待选择事实；自由输入确切编号/IP/标签兼容选择，其他内容作为补充或改条件，以新的 request_id 重新解析。原生面不可用才用文字候选流程。只接受用户对本轮候选的明确编号、IP 或完整 `名称（IP）`；选择不明确时继续询问，绝不猜测。收到明确选择后调用 `端点歧义选择工具`：原样复制此前的合同字段、查询、可选设备线索和 `candidate_set_digest`；有歧义的一侧填用户选中项的 candidate ID，无歧义的一侧填解析回执已有的 `selected_candidate_id`。选择工具返回 `RESOLVED` 后，同样由受信插件在最终结果交付其 `result_markdown`，立即以未改动的 `prepare_body` 调用 prepare，不增加确认。
   - `UNRESOLVED`：逐字输出 `data.result_markdown` 并停止，不调用选择或 prepare。
   - 状态、候选 ID、摘要或 `prepare_body` 缺失、冲突、未知：停止并报告诊断，不自行补造。
3. prepare 成功返回后，根据当前权威投影选择唯一下一步：
   - `waiting_user + awaiting_confirmation + task_status=DRAFT + confirmation_required=true + result_code=DRAFT_READY`：直接调用 `get_policy_configuration_result`。
   - `completed` 或 `stage_code=terminal` 且有权威结果记录：用同一 operationId 读取 result，不能把状态查询当成失败或回到旧草稿。
   - `created/running`：用相同 operationId 调用 `get_policy_configuration_status`。
   - status 为 `running + selecting_candidate（或兼容 awaiting_candidate_selection）` 且含至少两个候选或 replacement_required=true：由受信插件展示原生防火墙选择，选中后按同一 operation 继续查询，不由模型自动排序提交。原生面不可用才按下节文字兼容。
   - status 为 `waiting_user + awaiting_confirmation + can_decide=true`：调用 result。
   - `WAITING_EXTERNAL`：停止，返回 operationId 和可恢复说明；下次只续查，不重做 prepare。
   - `failed/cancelled`：报告真实终态，不重试同一请求；后续新的独立请求使用新的 request_id，不被旧失败或取消锁住。
   - 状态、ID、摘要或字段缺失、冲突、未知：停止并报告诊断。
4. status 与 result 各最多调用 3 次（失败尝试也计数）。端点 select 和策略候选 select 各最多一次；服务端拒绝时停止并报告错误，不尝试改选。
5. result 返回后只在权威草稿已就绪时，由受信插件把同一操作已冻结的端点解析 `result_markdown` 与 Platform 的公开草稿摘要组合成最终正常助手消息。多候选时需求理解由受信插件随原生候选展示；解析后已确定的需求理解在最终消息交付一次，模型不得在工具前重复。Platform 提供的“处理进度”必须按原有逐行列表显示，不能压缩成一整行。公开草稿不得包含配置预览、命令数组、接口路径、请求体或内部英文状态码；发现这些内容时受信插件只展示安全摘要，不能原样下发。底部 DSH 原生提问面板只提供简短问题、“执行”“取消执行”和自由输入，不在输入区重复草稿；只有“执行”进入受信确认链，取消、跳过、关闭和自由输入均不得确认或提交执行。“取消执行”由受信插件经既有 REJECT 决定取消平台任务；修改条件的自由输入经 REQUEST_CHANGES 撤销旧确认，再作为普通用户补充继续模型流程。跳过只关闭本地确认，不能声称平台任务已取消。终态失败优先交付 Platform 的公开中文 `data.error.result_markdown`；缺少该字段时固定输出“未完成/无法确认 + 简短原因 + 操作号 + 一个下一步”。模型不得在其后追加分析报告、建议清单、内部阶段、原因码或未知项。保留任务号、草稿状态和确认提示，不额外声称设备已生效。成功响应中的 `data` 是权威业务投影；`code` 不是成功或业务状态时不能据此推进。

## 候选排序

原生面不可用时，仅在最新 status 表明 `selecting_candidate`（或兼容 `awaiting_candidate_selection`），且含候选时接受用户明确选择后调用 `策略候选选择工具`。以用户明确选中的 ID 排第一，其余冻结候选只用于完整排名。不得把系统推荐当成用户替代授权；需要替代时 reason_codes 必须包含 user_confirmed_device_replacement。推荐说明使用 `traffic_direction`、`relative_position`、`coverage`、`reason_codes`，其余候选按 `path_order_ascending` 稳定排序。`ranked_candidate_ids` 必须包含最新集合的每个 ID 恰好一次；`candidate_set_digest` 原样复制；`reason_codes` 只填稳定审计代码。选中后 Preview 或复核失败，不自动改选第二名。

select 的参数由同一 Operation ID 和最新 status 的冻结集合组成，结构如下；示例值不是实际候选，不能照填：

```json
{
  "operationId": "op_...",
  "body": {
    "candidate_set_digest": "sha256:...",
    "ranked_candidate_ids": ["candidate-a", "candidate-b"],
    "reason_codes": ["path_order_tiebreak"]
  }
}
```

## 确认边界

DSH 受信插件直接消费原生提问面板的结构化答案：“执行”从当前真实 result 工具返回值绑定 operation ID、版本和摘要，携带 RSA proof 调用 Platform 确认接口；“取消执行”、跳过、关闭和自由输入均不触发执行确认。受信插件仅对明确取消发送绑定当前版本/摘要的 REJECT；修改条件发送 REQUEST_CHANGES，并读取权威决定结果后重新解析。跳过不发送后端取消，平台状态仍按实际查询。自由输入即便包含“执行”二字，也只作为普通补充内容。为兼容旧会话，用户在同一会话中单独回复“执行”时仍可绑定会话内最新 DRAFT。模型不可调用 `confirm_policy_configuration`、`decide_policy_configuration` 或 SOC 写入工具；只原样呈现插件注入的 Platform 确认结果。`DRAFT` 和 `confirmation.accepted=true` 都不代表策略已下发；以 `execution` 和 `failure_scope` 判断。任何改参、旧任务号、疑问或否定均不触发确认。


## 已有策略覆盖检查

prepare 可以完成只读策略判断而不创建 SOC 草稿。返回 `POLICY_ALREADY_COVERED`、`POLICY_PARTIALLY_COVERED`、`POLICY_BLOCKED` 或 `POLICY_COVERAGE_UNKNOWN` 时，立即以同一 operationId 调用 get_policy_configuration_result 读取权威中文结论，然后停止。已覆盖时无需新增；部分覆盖或无法判断时不自行拆分、不改参重试，明确拒绝时不自动绕过。只有真正返回 DRAFT_READY 才进入原生确认。覆盖结论限于目标防火墙，不能宣称已验证应用服务可达。

## 同一会话的任务与状态

同一会话可以连续新增多个任务。已经加载的本 Skill 在同一 Agent 的后续策略轮保持可用；切换业务时仍遵守每轮单路由。不要为了重载 Skill 先调用工具试错。每个完整的新请求用新的 request_id；选择、查询和同一请求的重试保持原 ID；源/目的/端口/动作/设备条件变化时旧候选和旧确认作废，重新解析。用户在原生确认面自由输入“改为阻断”等内容时，在同一会话结合原请求修改 action，并生成新的 request_id；旧草稿不得确认。

查询当前或前一任务时使用本会话实际 operation_id 读取 get_policy_configuration_status 和 result；多个任务有歧义时先问要查哪一项。受信插件注入的最新确认/执行状态覆盖同一操作历史 DRAFT，不要将已成功任务倒退为待执行，也不把另一任务结果套用当前任务。已确认、已取消或已作废草稿再次“执行”不得重下发。配置任务成功只表示所返回阶段完成，规则效果、连接可达必须按真实回读证据另行表达。
