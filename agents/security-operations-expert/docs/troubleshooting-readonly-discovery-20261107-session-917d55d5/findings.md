# 故障排查迁移：第一阶段只读发现

结论：**两条原生 LFX 流程的只读取证基础可复用，但尚未创建、装载或业务验收；主动原子、增量编排接线及故障组合报告接入仍有明确缺口。** 本阶段没有重启、主动探测、配置保存、Candidate/Case 修改或新评测。

[真实回执摘录](<receipts.json>)保存本会话平台输入、实际结果、时间、原请求标识及限制；完整工具回执保留在当前管理会话。[所属智能体](<../../README.md>)；[共用 Case 唯一来源](<../../evaluation.md>)。

本文件保留初次采样与两流程方案；清点已结束，最小能力、动作冲突、必要Schema和最新研发交接见[清点收口](<minimal-capabilities.md>)，不再扩大清点。

## 固定目标与取证边界

工作区 `workspace-95db14d2-d53d-4015-8256-ade8612b1b77`；管理会话 `session-917d55d5-4f2c-4fbd-8442-7d88549ab2f3`。观测窗口为 2026-11-07 03:09–03:15 UTC，即 2026-11-06 19:09–19:15 America/Los_Angeles；这是取证时间，不替代业务源观测时间。

固定 Agent `security-operations-expert`、版本 `EXP-security-operations-expert-027-f-r3ba4799b0cb7`、实例 `inspection-027-schedule-acceptance`，入口为[指定业务实例](<http://172.16.138.228:53105/agents/security-operations-expert/instances/inspection-027-schedule-acceptance/>)。没有切换其他版本；[manifest](<../../manifest.yaml#L1-L5>) 的已启用版本仍是 024，不用它替代本任务的显式目标。

只查询相关 SOC 连接与限定资产，不逐台展开动作候选、不遍历资产全库。历史 Run 查询接口虽返回同 Agent 的其他版本索引，仅沿指定版本相关记录回读，没有把其他版本作为实施对象。新增文件仅为本次证据与说明，不是连接、资产或运行状态的新权威来源。

设计依据是[指定概要](</home/cmp/Downloads/troubleshooting-playbook-orchestration-overview-v0.1.md#L12-L32>)。其中“待评审／未批准”是旧稿原貌；本条最新用户授权有效，不重复索权，但本次仍止于第一阶段。

旧克隆的 [HEAD](</tmp/hep-ai-lite-readonly-sgyjg86d/.git/HEAD>) 与 [master 引用](</tmp/hep-ai-lite-readonly-sgyjg86d/.git/refs/heads/master>) 对应指定提交 `9250e1643a05873e020dd8557127c9d0c02790b0`。只读了[模块说明](</tmp/hep-ai-lite-readonly-sgyjg86d/ai-lite-troubleshooting/README.md>)、[访问插件说明](</tmp/hep-ai-lite-readonly-sgyjg86d/ai-lite-troubleshooting/ai-lite-troubleshooting-plugin-access/README.md>)和[离线插件说明](</tmp/hep-ai-lite-readonly-sgyjg86d/ai-lite-troubleshooting/ai-lite-troubleshooting-plugin-offline/README.md>)；没有执行旧代码，也未核工作树与提交逐字一致。旧说明中的 TCP/ICMP/路由/监听能力不能冒充新平台已接入原子。

## 1. 实例装载与并行修改

R01 的真实 observer 回执确认：实例运行中、来源精确匹配指定版本，最后实际加载为 `2026-11-07T02:53:01.203Z`，加载摘要 `sha256:76852d15f33ff97bc98d289215aa7a9d645a07c1cb48804d0bca83ef9a47f364`。

核查过程中，03:10:05 UTC 曾为 `current`；03:10:13 变为 `pending_reload`；03:15:49 的磁盘摘要为 `sha256:f51b0fb0fdb1c85b2ae3833d1000d8155190b3ff0b69dfa2aac40cf3dd4ecf1e`。相对最后装载的差异包括适配器与故障 Skill。没有重载，不把当前磁盘内容宣称为已实际装载。

当前 Candidate 的完整可派生固定引用为空，平台说明有未提交修改；祖先 Git 或程序 HEAD 都不能充当完整当前 Candidate。后续在原指定版本续作，逐项回读摘要、最小预览和合并，不覆盖并行修改，不改成其他版本。

实例公开日志仅证明监听入口和模型目录加载，没有当前业务 Agent 的逐项 MCP 发现回执。**管理侧发现成功 ≠ 指定实例已看见新工具。** 本阶段没有新建业务 Session，也未读 HOME 或凭据来补证。

## 2. 已核对的真实 MCP 与原子合同

R02：`ai-soc-master`、`ai-soc-ingest`、`ai-soc-graph`、`ai-soc-detect`、`ai-soc-response` 均启用，真实 `test` 发现成功；其规范/资源声明均指向 223 上的对应 SOC 服务，随后必要业务查询也成功。配置与目录的凭据状态字段不完全一致，因此不以标志代替真实发现或业务查询，也没有读取凭据。

当前公开工作流登记只有六项巡检、策略变更、应急动作；没有两条目标工作流、两条目标组合或 `troubleshooting-compositions` 分组。不能凭计划的 ID 直接宣称可保存运行；平台登记/执行接线属于研发交付。

| 业务能力 | 本次真实名称／合同 | 已验证边界 |
| --- | --- | --- |
| 唯一资产解析与状态 | Master `list_soc_asset`，支持 `ip/hostname/keyword` 和 `pageNum/pageSize`；资产详情资源要求整数 `assetId` | 指定两个 IP 各返回 total=1；IP 是模糊过滤，组件仍须精确比对并读全页，不能取第一页第一条 |
| 业务名称发现 | Master `list_soc_biz_system`，必填 `filter`，可按 `bizName` 分页 | “版本”筛选 total=0；不证明业务不存在，不从 Case 猜业务端口 |
| 关联告警 | Detect `list_detect_alert`，必填 `req`；支持 `assetId/from/to/windowSeconds/pageNum/pageSize/snapshotId`；`get_detect_alert_group_members` 支持组内游标 | 指定资产近24小时 totalGroups=0、totalAlerts=0、truncated=false；非零时组页和成员都须续读 |
| 配置路径 | Graph `get_graph_path_query`，必填 `srcIp/dstIp`，本流程显式传 `port/protocol`；另发现 `get_graph_path_evidence` 可按探测起止毫秒取已有证据 | 实查 UNKNOWN、NO_DATA、nat_snapshot_pending、portEvaluated=false；不是主动连通性测试 |
| 已有端口事实 | Master `get_soc_asset_port_evidence`，必填 `ip/port`，协议默认 tcp | 实查 NO_RECORD；不能当成当前未监听 |
| 采集关联／适用性 | Ingest `get_ingest_devices_by_asset_by_asset_id(assetId)`；Master `get_soc_asset_collection_capability(assetId)` | 目标无采集设备、modelId=null、groups=[]；仅为来源返回，不判断硬件是否可采 |
| 绑定后采集运行／配置 | Ingest `get_admin_ingest_devices_run_state(deviceId)`、`get_admin_ingest_devices_plugin_configs(deviceId)` | 核实源设备后两者均空；设备台账存在不等于插件已绑定、任务运行 |
| 绑定运行历史 | Ingest `get_admin_ingest_collection_summary(bindingId,window)`、`get_admin_ingest_collection_run_log(bindingId,page,size,status)` | Schema已发现；本次无真实bindingId，未猜号查询；有数据时按总数读全 |
| 当前源端单端口 TCP | Response 动作 `diagnose-source-tcp` v4：必填 `sourceIp/targetIp/port`，IPv4、端口1–65535、禁止额外字段；实际执行经 `execute_resp_agent_actions` | 只读到动作和候选；说明称“当前停用”却 enabled=true。型号7有启用SSH实现v5及UTC结果模板，但未作真机执行，不认定已就绪 |
| 未知动作回执恢复 | Response `get_resp_agent_actions_executions(requestId)`；执行详情资源 `/resp/actions/executions/{id}` | 真实查询合同已发现；本次未提交动作，无原请求可查询。后续未知回执先查原号，不重发 |
| Run／步骤／产物 | `get_composition_run`、`get_composition_details`、`get_composition_artifact`；管理侧对应 `compositionRun/Details/Artifact` | 读到历史Run、节点、2页全部明细及完整HTML，不重跑 |

以上为已经观察的工具/资源，不把候选名称、分组元数据或旧服务能力拼成新的工具名。其他未核服务保持未知，不声称这些是全平台唯一能力。

## 3. 必要真实资产与返回语义

- **资产3617609／172.16.200.11／200.11防火墙**：SOC原始分类为host、vm，宿主3617426。SOC返回online/REPORTED，但无采集设备，原始心跳未观察、状态同步UNKNOWN。不能把在线标签当正常，也不能把无绑定当断电。
- **资产3617426／172.16.138.226／部署验证环境服务器**：SOC原始分类server、modelId=7；源TCP候选中确有 `dev-71fb60c9bc57`，资产关联查询也返回同一设备。插件配置和运行态为空。未执行TCP，没有本次源端结果。
- 告警快照窗口为 `2026-11-06T03:13:28.094Z` 至 `2026-11-07T03:13:28.094Z`，快照ID已保留。零告警仅支持该窗口下未命中，不支持“无故障”。
- 路径合同核验使用上述两资产的TCP443连接；它是只读接口核验输入，不冒充已确认的用户业务连接。`reachable:false` 与 `verdict:UNKNOWN/reason:NO_DATA` 同时返回时保留UNKNOWN，不能判阻断；返回NAT候选也未证明实际经过，不展开其他设备。
- SOC状态时间标为 `DATABASE_LOCAL`，未返回可核时区。保留原时间，不能仅凭与UTC相差八小时推定时区，不能把查询时刻、evaluatedAt或资产更新时间补成源观测时间。SOC自有的历史探测不是本会话探测。

## 4. 两条最小可实施流程

这是待新增的业务资产方案，**不是当前可直接调用的已登记工具**。每包独立保有原生流程与TS组件，流程唯一源是包内 `flow.json`；不导入兄弟组合私有文件，不调用旧 `start_diagnosis` 或旧报告。公共复用仅通过已声明的平台公共合同。

### troubleshooting-business-access / diagnose_business_access

```text
唯一源/目标解析 → 核对协议端口及真实源执行点 → 冻结本次输入
  ├─ 两端SOC状态 → 单项保存 → 各自必要补证
  ├─ 关联告警（固定窗口/快照，全分页）→ 单项保存
  ├─ 配置路径/既有流量证据 → 单项保存
  └─ 已核可用的当前源TCP，或明确未执行缺口 → 单项保存 → 真实条件节点
       ├─ OPEN → 应用检查；缺原子则保存未执行缺口
       ├─ CONNECTION_REFUSED → 服务身份 → 当前监听/进程/相关日志局部并行
       ├─ TIMEOUT / NO_ROUTE → 源路由、目标、路径证据；只等本分支必要关联
       └─ UNAVAILABLE / INDETERMINATE → 保留未知，不假造网络根因
```

TCP结果落事实后即可释放对应后继，不等告警或其他慢支。非TCP协议不套用TCP实测结论；域名没有真实解析原子时不在平台侧偷做DNS，也不猜IP。疑似离线复用同Run内设备证据，不另起旧诊断。

首版可运行只读状态、告警、路径、已有端口事实和明确缺口的闭环；主动TCP目前按待验证能力处理。它只能交付范围内取证与未知，不称已经排除应用/路由或完成全部根因定位。

### troubleshooting-device-offline / diagnose_device_offline

```text
唯一资产/管理对象解析 → 冻结本次输入
  ├─ SOC状态及原始判据 → 单项保存
  ├─ 关联告警 → 单项保存
  └─ 管理侧观察 / 已核对象的有限当前观察，或未执行缺口 → 单项保存 → 条件节点
       ├─ 确切电源关闭 → 仅确认该事实；无审计则关机原因未知
       ├─ 确切电源开启 → 系统/目标网卡/接入检查，缺原子则列缺口
       ├─ 本次真实响应且身份匹配 → 采集适用性/绑定
       │    └─ 绑定唯一后 → 运行、非敏感配置、心跳、同步的局部分支
       └─ 无响应 / 管理态未知 → 已关联路径/接口证据或缺口；不判断断电
```

SOC“在线”不是本次真实响应，不能用它触发“设备正常”或代替管理侧观察。当前资产关联字段只支持对象关系，不证明宿主或虚机实时电源。无本次有效响应时，采集元数据可作为只读背景事实保存，但不能冒称已完成“真实响应后的采集根因验证”。

两流程采用共享有界请求额度；首版建议4个在途请求，具体值和超时在实际合同/官方LFX验证后固定，不声称已有性能验证。每个检查组件返回后先复用既有Run步骤/产物保存事实，再输出到下游；依赖只连到确有需要的分支。超时/失败保存各自终态，不丢已完成结果。局部汇合只等本分支实际执行的必要输入，互斥早退保留独立原生终态；最终报告可等所有分支有结果或明确缺口，但不得因此阻塞已有结果的业务后继。

每项事实保留实际执行点、实际源/目标、来源服务与操作、查询时间、源观测时间及已核时区、原requestId/executionId和原始回执引用，分别记录执行状态、业务结果、失败、冲突和未执行缺口。TCP的taskId/deviceStatus只说明动作阶段；须核对同一请求的真实源设备、精确连接、唯一探测结果及完成标记、带时区且适用于本次的观测时间，不能以任务成功代替端口可达。未知写回执先按原requestId查询，不自动重放。本条授权的主动诊断仅限已核故障对象上的有限TCP/ICMP；应用、域名等缺失项只复用已有只读证据或记缺口，不顺带发HTTP/TLS请求、扫描、修复、配置写入或重启。

## 5. 明确缺口与最小接线范围

| 缺口 | 本次证据及处理 |
| --- | --- |
| 两目标workflow尚未登记 | 当前公开登记未包含目标ID；研发沿现有扩展注册两条LFX工作流及TS回调，管理助手随后保存草稿。不得临造执行器、通用调度库或数据库 |
| 单项落事实、局部推进尚未验证 | 既有Run节点/分页/报告读取已验证；没有本次新流程的逐项保存与慢分支不阻塞证据。要求研发用同份官方flow验证条件、并行、局部汇合及独立终态，不做黑盒start节点 |
| 当前源TCP就绪性冲突 | 动作说明与启用标志不一致，只有模板/候选静态证据。未执行；后续只在核对对象与实际合同后进行授权范围内有限诊断，不改外部动作或扩展外部服务 |
| DNS、应用/HTTP/TLS、目标当前监听/服务、源当前路由、ICMP、管理电源/网卡 | 本次相关已发现来源中尚未核到可用公开原子；旧仓库说明不算新平台能力。各节点明确未执行及影响，不虚构工具或以bash/HTTP绕过，不扩展外部开发 |
| 原始心跳与状态同步 | 资产返回NO_VERIFIED_HEARTBEAT_SOURCE、NO_CORRELATED_STATUS_EVENT；采集运行态不是原始心跳。现有概览不证明该对象同期同步正常，无关联事实时保持UNKNOWN |
| SOC来源时区 | DATABASE_LOCAL没有已核时区；保持原始值和适用性缺口，不硬算当前有效 |
| Candidate的故障组合入口 | [故障Skill](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/fault-analysis/SKILL.md>)当前仍以只读取证子会话为主；[Guard](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-guard.mjs#L75-L118>)未列新组合。仅后续最小接入真实分组/查询合同，保留咨询、单事实查询、无主动许可和其他业务边界，不覆盖并行改动 |
| 故障组合Run的HTML接入 | [现有报告入口](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts#L46-L101>)接受fault直接子会话，却拒绝fault的run_id。需最小适配到本会话真实故障组合Run的原HTML，保留原字节、摘要、字节数与来源核对；不新增报告服务 |
| 指定实例工具发现／评测复用 | 采样时为pending_reload，原describe未声明实例字段只是当时的历史观察。最新用户转述：instance_name已实现、正在验证，instance-assets差异来自该研发；本条未重新验证或装载，不再记为尚未实现。不preview/start、不预留Run，不创建其他评测实例 |

## 6. 现有Case与只读/报告路径

Case保留在[现有评测定义](<../../evaluation.md>)，本次摘要 `a5eec7e819eb4754bd604f78e62b35917d6f13685ff784079bf1c43da2221100`；本阶段没有改写预期或新增用例。

- 已逐项回读 U-FLT-001（访问故障）、002（离线证据区分）、012（从业务名发现到诊断）、013（只读HTML与重复下载）、014（无同会话结果不造报告）。另有003–011既有故障场景，后续按两流程实际边界选择必要回归，不为数量全跑。
- [历史浏览器失败](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-47f129c0-d733-41f2-a06f-31721b95c8fc/report.md>)及[checks原件](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-47f129c0-d733-41f2-a06f-31721b95c8fc/evidence/U-FLT-013/checks.json>)：workspace-connect超时，U-FLT-013为inconclusive，没有业务结论。
- [历史API Run](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-039c1d04-3550-4c18-bb69-f3f7fb3c6c3d/report.md>)的U-FLT-013有真实只读调用，但target-trace-export失败，仍为inconclusive。两者实际使用旧独立评测实例，不能充当本轮53105基线，也不重跑它们。
- 已回查原巡检 `run-ef1d5e0f-e0f1-4f62-b5a2-92c82803f1ad`：`compositionRun`取得节点；`compositionDetails(root,offset=0/1,limit=1)`读全2条；`compositionArtifact(report)`返回完整UTF-8 HTML，目录登记9206字节。执行completed而业务incomplete，异常1、未知1。这只验证既有复用路径，不是新的故障诊断或当前设备状态。
- 既有本会话子分析→`export_security_report(kind=fault)`路线和巡检原HTML导出应保留；不依赖已禁用的旧诊断Runtime，不因为缺故障组合接线恢复Java服务。

## 下一交接

最新用户已安排：**先定向重载同一指定实例，核对实际装载及instance_name复用入口，保存本次迁移基线，再进入两流程与Harness实施。** 本条只保存清点证据，没有执行重载、评测或Candidate/编排写入；不创建其他评测实例，历史fault报告Run只作历史参考基线，不替代本次迁移基线。

本次基线取得后，后续业务资产实施仍需沿现有Run/步骤/产物的两条LFX工作流登记、TS回调及单项持久化接线，再办理原生草稿保存、回读、dry和官方运行时验证；缺原子明确记未执行，不要求新增外部能力。随后最小适配同一Candidate的故障路由、原HTML导出及相关Case，取得指定实例的真实工具发现和使用方证据。

清点收口与研发交接统一见[最小清单](<minimal-capabilities.md>)。沿已有整体授权继续，不重复索权；每次写前回读新摘要/revision，保留并行修改、旧服务、原Run与历史报告。
