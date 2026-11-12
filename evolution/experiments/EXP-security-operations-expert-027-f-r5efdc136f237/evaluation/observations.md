# Evaluation Observations

## 2026-11-09 UTC：多轮动作发现与现场示例

当前结论：**continue**。按用户要求把应急处置的动作发现改为多轮只读流程，并新增 `U-EMG-008` 覆盖“动作目录 → 型号标识 → 真实设备 → 现场示例”。候选改动：应急 Skill 第 1 条改为逐轮办理，要求所列条数与清单一致、型号名只在回执中按原文引用、形成示例前核对在线证据；`hypothesis.md` 同步本轮假设与验收口径。

[run-3d665755-81d0-43c4-9ffc-1e9c47a66db9](../runs/run-3d665755-81d0-43c4-9ffc-1e9c47a66db9/report.md) 来源 matched。`U-EMG-004` 机器通过，真实预览停在 preview、未执行。`U-EMG-008` 三轮真实完成：动作目录实取 22 条（回答开头写“共21条”与清单不一致）、按 actionKey 读取候选并给出 modelId 与候选 label 中的型号名、第三轮绑定第一台 OPNsense 并核对为 offline、给出 TEST-NET 参数示例与现场核对方法，未预览未下发；机器评审因 `task-tree-wait-timeout` 未产生结论，人工按冻结预期判第 2 条未满足（未逐设备给在线证据），该 Run 记为 inconclusive，不认定通过。

随后按该缺口精确化用例（把在线证据要求移到“形成示例前”，明确候选或资产回执中的型号名可按原文引用），并在 Skill 增补“条数与清单一致”。重跑 [run-ad5d962b-67f5-41e1-a31e-cf333c47c1a2](../runs/run-ad5d962b-67f5-41e1-a31e-cf333c47c1a2/report.md) 在第三轮 `evaluation.wait` 返回 403 `task-tree-wait-failed`，执行 error、封存无法判定；这是执行器等待失败，不构成业务失败，未再重跑。

工具合同事实：当前 `policy-response` 分组只暴露动作目录、目标候选和 device-agents；动作到型号的映射（`device-model/action-capabilities`）未注册，型号名称目前只能取候选或资产回执中的原文（如“OPNsense 防火墙”“Wazuh EDR”）。需要全量型号支持表时须由外部 AISOC 在 MCP 合同提供对应接口。本轮来源核对 matched，评测实例已停止清理，未宣称整体通过。

## 2026-11-09 UTC：删除绑定固定环境的旧应急用例

用户确认：`U-EMG-004`～`U-EMG-007` 依赖当次环境的固定 IP 与设备（如 wishclamAV/172.16.2.114、198.51.100.77、172.13.168.11），环境变化后智能体不能据以走通发现流程，因此删除；保留 `U-EMG-008` 作为“独立应急指令”唯一用例。删除后全文 27 条，应急场景仅 008。

删除同时移除四条路径的覆盖：已知目标直接办理并真实预览（原 004）、从告警发现入口（原 005）、真实执行与结果追踪（原 006）、XX 固定指令来源（原 007）。008 只做发现与只读示例，不替代执行路径；上述覆盖当前没有对应用例。历史 Run 保留原编号，不改写。

## 2026-11-07 UTC：空绑定修复后的定向复验

当前结论：**continue**。[run-d0b97ad9-9b5a-4642-8228-ffda70712586](../runs/run-d0b97ad9-9b5a-4642-8228-ffda70712586/report.md) 三个真实新会话均发现两个组合，实际调用对应发布版本。来源 matched，前后装载 current、changed_files=[]，四项 223 依赖及发布身份未变。机器 Trial 两项通过、一项失败，封存 failed，未请求独立证据复核。

U-EMG-007/010 各调用一次固定组合完成真实准备，顶层 agentId 正确，receipts=[]；未预览、建任务或执行，最终答复无不适用的后续菜单。U-POL-021 不再误判工具缺失，但 protocol=TCP 的真实预览返回601 acl-protocol-choices；当前字段合同未返回 protocol 枚举，型号真实允许值尚未取得，未保存、提交或执行，设备当前规则未知。先前策略500、SSH凭据与扫描仅创建合同缺口仍保留，不能外推已解决。最终答复笼统称“平台侧”需修复，责任表达缺口另记，应先由 AISOC 合同／型号配置方核对。未认定七例全部通过、真实策略下发或 Research Release 通过。

## 2026-11-07 UTC：重载后工具缺失的共同根因

[run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c](../runs/run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c/report.md) 的三个新会话实际缺少两个组合工具，原生请求头只有 115 个工具，三例失败并封存。这与此前工具存在时误报不可用是不同问题。空草稿绑定仍校验旧来源摘要，重载后抛错并阻断已发布分组发现；平台共享读取入口现已修复，非空绑定仍核对来源。回归 19/19、类型检查通过，经维护工具更新 18120，管理助手完成目标实例定向重载，44 个历史会话全部保留。发布身份、四项 223 依赖、模型及本 Experiment 来源未改。证据见[平台联调记录](/home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/policy-response-compositions-20261106/README.md#重载后的工具发现缺陷与修复)。

## 2026-11-07 UTC：恢复 223 后七例复验

当前结论：**continue**。管理助手按用户选择恢复 ingest、graph、correlate 至 223；response 保持 223。发布身份及指定实例来源未变，草稿绑定为空，开始前实际装载为 current。

[run-28598f57-f8e5-4b29-a9af-7e86e8c69080](../runs/run-28598f57-f8e5-4b29-a9af-7e86e8c69080/report.md) 七个真实会话均完成，来源 matched，机器 Trial 两项准备通过、五项失败，封存 failed，未请求独立证据复核。U-EMG-007/010 真实准备完成；008 缺少指定设备 SSH 凭据；009 取得当前真实模板但缺少独立仅创建合同，未创建或启动扫描。U-POL-020/022 在真实预览返回业务 500，未进入后续写步骤，具体根因未知。

U-POL-021 将空资源目录误判为组合工具未装载；持久原生 request/header 证明两个组合实际存在，三例策略工具清单摘要相同。该模型行为缺口不能归因于平台工具缺失。EDR 首次字段位置错误、扫描重复调用及将未发送输入号称为原请求号等行为仍保留。收尾时并行任务改变共享插件制品，实例 pending_reload；后续须完成实际装载并另开定向 Run，不覆盖本轮失败。详细证据及平台验证见[联调记录](/home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/policy-response-compositions-20261106/README.md)。

## 先前发布后七例验收：依赖环境变化

当前结论：**continue**。平台管理助手已发布 `policy-change`、`emergency-action` 并清除指定实例的草稿绑定，画布和实际调用均核对已发布流程；发布及页面证据见[平台联调记录](/home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/policy-response-compositions-20261106/README.md)。发布不表示 Research Release 或业务验收通过。

[run-70b4fa95-c8f7-4a27-bfba-117f42867ba4](../runs/run-70b4fa95-c8f7-4a27-bfba-117f42867ba4/report.md) 的七个真实原生会话均完成，机器 Trial 两项准备通过、五项失败，封存 failed，来源核对 matched，未请求独立证据复核。验收期间共享 AISOC 连接由 223 变为 232，实际依赖摘要、设备和接口目录发生变化；不能将来源核对 matched 当成外部环境固定。各例结果、环境变化和 Harness 行为缺口均以该 Run 为准。用户已明确选择恢复 223，须核对真实依赖后另开 Run 复验，不覆盖本轮失败。

## 历史草稿阶段：2026-11-06 固定组合迁移与七例真实验收

当时结论：**continue**。以下保留发布前的草稿阶段证据，不代表当前发布状态。当时以两个未发布原生 LFX 组合承担策略／应急固定接口链，咨询、发现与独立原号查询保留原始工具和 Skill；不增加本地业务台账。平台管理助手仅修改本 Candidate，并创建实例 `policy-response-acceptance-027-r5efdc136f237`，来源保持本 Experiment。实现与分层验证见[平台联调记录](/home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/policy-response-compositions-20261106/README.md)。

最新完整七例 [run-945ccaf5-6463-449b-b8c0-c1cd5612f16d](../runs/run-945ccaf5-6463-449b-b8c0-c1cd5612f16d/report.md) 来源核对 matched，封存为 failed：`U-EMG-007/010` 两项准备通过；`U-EMG-008` 的真实指令预览受 SSH 凭据缺失阻塞；`U-EMG-009` 取得当前真实模板，但上游合同没有独立仅创建入口，未创建或启动扫描；`U-POL-020/021/022` 已获本轮真实策略下发授权，均在上游预览返回业务 500，未进入保存、提交或执行。错误文案不足以判定 500 的具体根因。原始 Session、冻结输入、实际装载及绑定分别见该 Run 的证据，不将准备通过外推为设备效果。

前两轮失败记录保留，见[工具不可见](../runs/run-5348e9a5-5900-411c-a280-41302251d72d/report.md)和[仅返回受理](../runs/run-dce582a3-71e7-4ede-932b-019e664cecab/report.md)。相应平台根因已修正并经维护工具更新 18120。第三轮仍发现助手误建议动作不支持的后续步骤、无新事实重复调用，以及混淆输入关联号与真实 SOC 回执等交互缺口；后续只修本 Candidate 并另存受影响场景复验，不覆盖失败或改变评测标准。未认定整体迁移、真实策略下发或设备效果通过。

定向 [run-589394c5-aa41-4a2b-b9e9-9e50e9c94a8d](../runs/run-589394c5-aa41-4a2b-b9e9-9e50e9c94a8d/report.md) 与单例 [run-09e00da4-a47f-4672-b557-495168c4c10f](../runs/run-09e00da4-a47f-4672-b557-495168c4c10f/report.md) 均核对来源 matched。策略已停止无新事实重跑，并准确保留设备状态与错误根因未知；真实下发仍被上游预览阻塞。应急准备正确，最终答复仍残留不适用的创建任务建议。首个定向 EDR 会话被研发在绑定更新完成前过早启动，工具不可见；后一个独立 Run 在绑定就绪后重跑，准备通过，不覆盖前一环境失败。外部阻塞和交互缺口分别记录，不改变原正向验收要求。

最新定向 [run-71d280cc-e054-4452-aaf9-4a0170536f3f](../runs/run-71d280cc-e054-4452-aaf9-4a0170536f3f/report.md) 来源 matched，机器 Trial 两项通过、一项失败，封存 failed，未请求独立证据复核。管理助手仅调整本 Candidate 应急 Skill 并完成实际装载和草稿绑定后复验：U-EMG-007/010 均读取当前动作合同后调用一次组合，准备完成即交付结果，无不适用的后续操作菜单，未预览、建任务或执行。U-EMG-009 在真实动作合同证明无独立仅创建入口时停止，未调用组合、未查询模板、未创建或启动扫描，准确说明能力须由外部 AISOC 服务方提供；创建目标仍未完成，不以守住边界判为创建通过。冻结环境与原始 Session 见该 Run，自身未选场景沿用各自原有证据，不作整体采纳或发布。

## 历史切片：原始接口路径与固定流程候选

以下为固定组合实施前的阶段记录，不表示当前实现、授权或最新验收状态。

当时结论：**continue**。该阶段已撤除八个未发布旧编排，接入 `policy-response` 的 27 个原始工具，并在本 Candidate 移除旧包装器与本地业务台账绑定。固定调用链的组合当时仍是[交互设计](../../../../mcp/docs/policy-response-interaction-design.md#智能体与固定调用链的边界)中的候选，尚未实现或发布，未认定迁移全部完成。

实际评测曾因 MCP 目录缺失失败；定位为业务服务异步注册时，Guard 的启动时检查尚无法判断匿名实例，随后过早限制工具。当前 Guard 在实际事件与调用时重新读取服务身份；根、子 Guard 的延迟注册定向回归 8/8 通过。只修改本 Candidate，未据此改变其他版本或认证实例的合同。

最新真实 [Run run-6391851c-e3fe-49ba-a29b-dababf7db828](../runs/run-6391851c-e3fe-49ba-a29b-dababf7db828/report.md) 已完成，封存来源核对 matched。`U-EMG-005` 的三轮咨询、真实证据与动作适用性查询、取消后停止，机器判定通过；`U-POL-019` 完成执行但机器无法判定，理由为未对全部冻结要求提供可定位证据。未请求证据复核，不把无法判定直接归为接口失败或通过；旧失败 Run 保留。当前手工实例的装载状态不能从本次临时评测实例外推。

真实可下发设备目录未包含用户指定的防火墙 `172.16.1.1`，未以 `172.16.1.10` 等其他设备代替。三条授权草稿未创建；真实提交、审批、设备效果和应急写入未验收。审批凭据缺口保留，不增加本地替代审批。管理助手分工原则的单独核验见[平台证据](/home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/policy-response-raw-20261106/README.md#管理助手实际分工核验)，不代替本 Experiment 的业务判定。

## 2026-11-06：旧确认配置启动隔离切片

以下保留当时的事实与回执。旧确认运行时已在后续迁移中移除，所列源码文件名和行号仅标识当时核对的位置，不指向当前 Candidate。

结论：**continue**。旧配置未就绪不再导致该插件启动抛错，指定实例已取得真实 verified 装载回执；未完成模型级新会话及旧确认使用时的动态验收，不代表策略/应急迁移整体通过或已发布。本轮到此结束，等待平台经 dsh-deploy 装载后再继续评测。

### 目标、变更与核对范围

- 固定 Agent：security-operations-expert；Experiment：EXP-security-operations-expert-027-f-r5efdc136f237。管理会话：session-21bb13b9-e407-436b-8986-8472a5f19234。
- 父版及引用仍见 [change.yaml](../change.yaml)。当前 Candidate 未有完整可恢复的固定 parent_ref，不把祖先引用或程序提交当作本次固定版本；未创建新版本。
- 唯一已保存的 Candidate 代码改动为旧确认配置加载器 `instance-confirmation-config.mjs:36–49`：配置读取、权限、JSON 或解析失败时 warn 后返回，不再从 apply 抛错。原权限位、完整解析、URL/RSA 校验及成功后六项环境注入保留；未生成、伪造或复制签发密钥。
- edit/apply 回执：0e364a4c-5b81-4774-b8c1-e30b96bdfb7f。该源码保存和装载的 SHA-256 均为 69f837c0c11a1214eba627e58abc9d4c7f0674eda940bfaf2dcc066aea4fae02。本次保存后 detail.candidate_sha256 为 37a3299b5335d0fbd38c1468348ed96c37bd5195609cab8d1515dd133f797ce1。
- [Profile Patch](../candidate/dsh/managed/security-operations-expert.patch.yml#L83-L84) 注册该加载器；[主 Preset](../candidate/dsh/presets/security-operations-expert/agent.cordis.yml#L42-L50) 保留既有策略/应急确认插件。Preset、Guard、模型、镜像及业务工具绑定均未修改。平台 detail 和 tasks/capabilities 的 required_env_names 均为 []。
- 策略使用前校验 `policy-confirmation-runtime.mjs:223–239` 先于确认请求，配置异常走未发送分支 `policy-confirmation-runtime.mjs:437–469`；应急使用前校验 `emergency-confirmation-runtime.mjs:280–318` 在 fetch 前核配置与签名，预检失败返回 requestDispatched=false。以上为只读源码核对，不冒称动态执行通过。

### 本轮定向验证与真实装载

1. edit/preview 与 edit/apply 的 changed-files 检查通过：草稿格式和本次 JavaScript 语法；未执行源码、模型或业务工具。
2. research/validate 返回 valid=true、errors=[]、warnings=[]、exit_code=0，仅证明平台确定性合同。
3. 唯一定向重载请求：`{"name":"policy-response-027-acceptance","operation":"reload"}`。回执 ID：9647f38c-2e87-46c6-8b07-4596525c51af；operation 完成且 ok=true。
4. 同名实例的新容器 ID：8de09e25b5cdc3e73d26793e44dd3c5aca18608d8fe346e7f64f36d45ba994f2；进程 started_at=2026-11-06T06:11:20.113393457Z，loaded_at=2026-11-06T06:11:26.383Z，pid=7，verification=runtime-observer，loaded.ok=true。
5. detail 回读于 observed_at=2026-11-06T06:12:01.485374Z，checked_at=2026-11-06T06:12:03.023Z：asset_status=current，last_attempt.status=verified，changed_files=[]，reason=运行代次与加载回执一致；source_id 仍为本 EXP。随后 agents/detail 再次观察同一 verified 装载。
6. 已加载 digest=sha256:168fe45ceaacbcf53e402778bb4351ec28dbac3bd9243355b84c7a7207a37420；configuration_digest=sha256:a1e31cf57c2b3a5198fbf35575f6dbaf72c84105da0c8e6d2907d71ba235d66b。加载回执中的源码摘要与本次保存的 69f837c0… 一致。
7. 保留端口18500、原HOME和会话、anonymous/development网关身份、模型xiaomi-token-plan-cn/mimo-v2.6-flash/reasoningEffort=off及原镜像 ai-agent-harness/dsh:b830ec950-amd64-2ed0d15ad02e；原镜像ID未变。入口：[验收实例](http://172.16.138.228:53105/agents/security-operations-expert/instances/policy-response-027-acceptance/)。

重载后的实际日志摘录；不再出现此前的 entry did not activate：

```text
[instance-confirmation-config] {"status":"unavailable","reason":"实例确认专用配置未就绪：旧签名确认不可用，其他能力继续装载；实际确认时报告缺失配置。"}
dsh web: listening on 0.0.0.0 over plain HTTP; restrict this port to a trusted proxy or network
dsh web: http://172.16.138.228:53105/agents/security-operations-expert/instances/policy-response-027-acceptance/
```

### 前轮真实失败与未知状态：保留，不回写成成功

首次 create 回执 ID：62396491-ea4e-4c79-87be-03bc793c15ae。实例名 policy-response-027-acceptance，端口18500，旧容器ID 0ae818a73d00；容器 running，但 loaded=null、asset_status=unknown。2026-11-06T05:49:06.599308Z 是详情观察时间，不是创建时间；create 回执未提供准确创建/启动时间。原错误为：

```text
dsh: warning: 1 entry did not activate
instance-confirmation-config (file:///opt/dsh-managed/instance-confirmation-config.mjs): Error: 实例确认专用配置未就绪：需要只对实例用户可读的有效配置文件
    at new apply (file:///opt/dsh-managed/instance-confirmation-config.mjs:41:19)
dsh-dev failed: 目标实例尚未返回本次进程的加载回执；结果未知，请查看日志并重新预览，不自动重试
```

两次 eval/start 的实际入参如下。各自 preview 使用同组参数但不含 run_id；两次预检均 missing_env_names=[]。两次 start 均 state=failed，错误 code=conflict、message=预览参数已变化，请重新预览、details={}。其后 status 均为 prepared、run_created=false，只有预留编号，**没有创建真实 Run、没有实际启动评测或冻结的 Run 证据**；回执未返回准确预览/启动时间，不补造时间戳。

第一次 start，回执 ID d9006cd3-be81-4c7f-a5d2-d4667f29b972：

```json
{"source":"experiment:EXP-security-operations-expert-027-f-r5efdc136f237","cases":["U-QA-004","U-POL-007"],"mode":"full","executor":"api","review":"none","run_id":"run-6236c885-06e0-4175-97b1-a344a0916ff8"}
```

第二次 start，回执 ID c797e23f-9741-48df-9d3f-a83317831af2：

```json
{"source":"experiment:EXP-security-operations-expert-027-f-r5efdc136f237","cases":["U-POL-007","U-QA-004"],"mode":"full","executor":"api","review":"none","model_selection":{"provider":"xiaomi-token-plan-cn","model":"mimo-v2.6-flash","reasoningEffort":"off"},"run_id":"run-11bff6ed-ccb2-4956-b536-6f84e8a27ed7"}
```

用户/研发后续确认根因是通用执行附加 confirmed:true 被计入评测摘要，并告知平台修复43/43通过、待dsh-deploy装载。这是用户提供的研发结论，本会话未执行该程序测试或验证平台修复装载；本轮未重试预留、未新建Run。

前轮其他公开调用摘录，仅用于保留定位事实，不等于新组合或本实例业务通过：

| 操作回执ID | 调用 | 实际结果 |
| --- | --- | --- |
| 5c0cf7ec-25c5-4de5-804d-3001e9905a6a | emergency-action / preview_disposition；action=封禁攻击源IP，合成目标192.0.2.84 | code=200，但object.role=AFFECTED_HOST，actionFamily=BLOCK_IP，choice=NEEDS_HUMAN_REVIEW；攻击源角色错配 |
| fed9356a-fba2-4783-9b3b-49e705acc27b | 同一纯预览；action=隔离受影响主机，合成目标198.51.100.84 | actionFamily=ISOLATE_HOST，无可执行候选；明确锁屏不等于网络隔离 |
| e6da4047-b966-454d-93f3-c8289309cc5c | list_emergency_actions，arguments={"limit":1} | isError=true，code=PLATFORM_DEPENDENCY_REJECTED，msg=存储结果不存在 |

上述调用未返回Run ID或调用时间。另一次 policy-single 草稿 dry 因目录 revision 变化返回“编排目录已变化，请刷新后重试；当前草稿未覆盖”，刷新目录后未继续执行；不记为dry通过或业务失败。前轮来源读取先以candidate/harness.yaml查询固定Candidate返回not_found，按目录回执改用harness.yaml后读取成功；未由错误推断固定父版缺失。reload预览曾传source覆盖字段，被拒绝“重载保留已登记的来源、端口、模型与业务身份，不接受覆盖参数”；随后去掉覆盖参数预览成功。均未绕过接口。

### 复核、未采用项与后续边界

- 已取回只读复核助手05d1105d-4c93-4007-802d-ced269abaee9的结论：本处启动硬依赖已移除、无部分注入或新增工具/权限，缺必需配置时两个调用方在发请求前失败关闭。复核为静态证据，不替代动态验收。
- catch没有清空既有process.env；既有完整合法环境来源仍由调用方校验，不能将“专用文件未加载”外推为所有旧确认途径必然不可用。日志文案收紧曾单独edit/preview通过，但用户要求结束后**未apply、未再次重载**；当前已保存/已装载版本仍为69f837c0…，不冒称271d8679…预览稿已生效。
- 前轮发现的本地隔离fallback、匿名Guard早退、旧高层入口及部门目录声明与实际发现不一致等，不在本小切片扩修；保留后续迁移验收，未据静态审查声称发生真实误写。
- 新会话模型交互、旧确认实际使用时的无请求动态检查、已配置确认路径回归均未执行；当前装载通过不能证明这些行为通过。未运行任意shell、内部实现或平台程序测试。
- 本会话未修改共同evaluation、其他EXP、其他实例/会话、MCP资产或程序；未执行真实SOC策略创建、提交、审批或应急处置。framework凭据与新写目标仍缺，不读取/复制钥匙，不复用旧真实目标。
- 本轮只保留本EXP代码、假设与研究记录；下一轮待平台更新后重新读取固定用例和真实发布组合合同，再开展本版评测及迁移验收。本轮不自动继续。

## 本轮新增策略草案验收输入事实源（留档，当前阶段不执行）

### 本轮用户授权与最新阶段边界

本节唯一记录本轮用户新增的三条原始输入及阶段边界，归属 EXP-security-operations-expert-027-f-r5efdc136f237。三条原始意图均只到草案阶段，禁止 submit/approve/execute，不自动扩大目标、设备、源目、协议、端口或动作范围。草案、下发与设备效果分层判断，草案不代表已提交、已下发或已生效。

**用户最新阶段调整取代前述后续执行安排：八个新编排先完成迁移并保持编辑草稿，明确先不发布，随后一起优化节点过多/复杂度。本任务未来的发布、真实 SOC 草案创建、业务使用方绑定及真实写验收步骤全部取消；不生成占位子版本。三条输入仅留档，不排入本阶段真实草案创建或写验收计划。**

后续获准的实际目录与覆盖检查若发现已覆盖、目标歧义、设备不匹配或规则不完整，保留真实阻断；不得为创建草案篡改覆盖结论。

本准备切片仅记录，不执行草案创建或任何真实 SOC 写入，不创建 Run，不更新实例，不发布组合，不修改 Candidate 或其他业务 Harness，不修改其他 EXP 或共同 evaluation，不委派子助手，不中断其他用户会话。新工具未装载、未发布，禁止用旧服务先行办理三条输入。平台装载不自动恢复上述已取消步骤；保存后结束，等待研发后续通知草稿验证安排。

### 用户原始输入与预期阶段

#### 输入 1

> 在防火墙 172.16.1.1 上新增一条允许策略：源 172.16.1.151 访问目的 172.16.1.165 的 TCP 443，先出草案，不要直接提交。

原始预期阶段：仅草案；状态：待执行、仅留档，不安排本阶段真实 SOC 草案创建。未创建草案、未提交、未审批、未执行。

#### 输入 2

> 在防火墙 172.16.1.1 上新增一条允许策略：源 172.16.1.151 访问目的 172.16.1.100 的 TCP 443，先出草案，不要直接提交。

原始预期阶段：仅草案；状态：待执行、仅留档，不安排本阶段真实 SOC 草案创建。未创建草案、未提交、未审批、未执行。

#### 输入 3

> 在防火墙 172.16.1.1 上新增一条允许策略：源 172.16.1.151 访问目的 172.16.1.160 的 TCP 443，先出草案，不要直接提交。

原始预期阶段：仅草案；状态：待执行、仅留档，不安排本阶段真实 SOC 草案创建。未创建草案、未提交、未审批、未执行。

### 明确排除与未授权范围

- 跨网段源 172.16.138.226 → 172.16.1.165：用户明确“先不要验收”；继续排除，不执行，不继承上述三条原始输入的草案意图。
- 应急真实动作仍未授权目标；保持只读/隔离边界，不执行真实应急动作。

## 2026-11-06 原始 AISOC 工具与 Skill 简化迁移

用户确认后继续本分支，当前范围取代上文旧准备阶段的暂停安排；历史事实保留。新入口为 `policy-response` 分组，业务顺序见共同交互设计；八个旧组合暂不发布，替代链验证并切换引用后清理。真实写入仅限已给三条 TCP 443 草稿，不提交或执行。

平台分组真实发现到 26 个工具、1 个资源和 18 个资源模板。三个争议接口未加入普通策略必经链；巡检仍保留 ACL 命中查询。静态回归已覆盖策略／应急 Guard、威胁研判自动化、原生桥与语音摘要；这不表示真实业务通过。

首次真实会话：策略 `session-64eca22e-7132-4dd8-8f18-39903160fe72`、应急 `session-7e03e76d-5821-42ec-9bb1-7ccbf28440f3`。目标实例的 Skill 为新内容，但已有 HOME 的 MCP 连接覆盖新种子，仍加载旧连接；来源资产 current 回执不能证明连接迁移完成。保留这些会话作为装载失败证据，不认定对应正向业务目标通过。
