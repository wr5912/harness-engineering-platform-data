# 巡检编排与 Skill 自包含验收

记录时间：2026-11-06T14:02:02.940853+00:00，2026-11-07 UTC 补充撤除生效与定向复验。独立状态组合已删除，当前剩余五项巡检编排；指定实例已重载，单资产状态查询已验证直接使用原始工具。业务整体结论仍为 **continue**。完整 24 个安全巡检用例均已执行并保留冻结 Run，但不能声明 24 项全部通过；后续定向复验分别保留来源、失败与未知。

## 来源、实例与变更边界

以下装载与提交记录为首轮验收快照；2026-11-07 的最新定向装载回执见下一节。

- Candidate：`EXP-security-operations-expert-027-f-r3ba4799b0cb7`。未切换到其他版本，也未改写既有 Run。
- 用户指定实例：`inspection-027-schedule-acceptance`，网关 `53105`，Runtime 端口 `18502`；实际入口为 `http://172.16.138.228:53105/agents/security-operations-expert/instances/inspection-027-schedule-acceptance/`。
- 标准镜像：`ai-agent-harness/dsh:b830ec950-amd64-2ed0d15ad02e@sha256:c06d4e1fecc66f175a2fbeaa51e96ea0b2af8f58be22f89edac73df3c779bece`。模型保留 MiMo-V2.6-Flash / Xiaomi、reasoning off；未为 Harness 修改构建派生镜像。
- 正式实例预览与重载回执：`ok=true`，`loaded_at=2026-11-06T13:44:10.216Z`，来源与请求一致，装载摘要 `sha256:b7a3e23f2642d3e392c2061627a3d8ec887b142a1556de7ec8882dc427b87769`。这是本次回执时的观察，不替代后续工作树变化核对。
- 保留 HOME、原有会话、端口、模型及访问配置。平台 18120 未因本任务重启。
- 运行版本记录程序提交 `63ab5063c98d166fcc480a613765424ec8b7f888`、数据提交 `c5b63d45d35f77cb5a48b36aa8241f0ceace49b1`，两边均 dirty；只支持保存的冻结包，不冒称已提交的 Research Release。

程序、Skill 全量审查、测试与管理助手参与的事实见[程序侧验证入口](/home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/skill-inspection-selfcontained-20261106/README.md)。本文件只维护本轮业务证据，不复制用例标准或 Skill 方法。

## 简单流程与组合必要性的补充审查

2026-11-07 UTC：上轮主要核对六项编排的内部实现和真实执行，没有完整审查哪些用户任务无需组合，也未取得原始工具与组合的同输入比较；不能据下列六次运行认定六项都应独立保留或更快。

目标 Candidate 的 [security-inspection 公开入口](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/security-inspection/SKILL.md) 区分简单查询与完整巡检。独立 inspection-status 仅转换资产接口已有的状态事实，分页、冻结范围及报告来自共用能力，不能作为独立组合的保留依据；选定源码删除整个包、登记和当前调用入口。周期状态查询及多设备状态查询由 Skill 直接组织原始只读工具，常规巡检内部处理同次状态证据。

选定交付源码剩余基线、漏洞、可达性、常规及深度五项。当前 [范围准备实现](../../../../mcp/src/inspection/index.ts) 直接读取显式资产，状态判定归入 [常规巡检实现](../../../../mcp/compositions/inspection-routine/src/index.ts)，不为该判定新增调用。不宣称五项数量最优或已经取得性能改善。

实际删除试验曾触发旧平台历史版本列表读取失败。程序修复区分当前固定依赖与未引用历史；历史依赖缺失保留配置和错误原因，不能启动新运行。用户授权快速生效后，正式更新工具已完成平台受控重启；实际登记、资产目录及 MCP 工具发现均剩五项，inspection-status 包及公开工具已删除。平台更新与发现回执只在[程序侧生效记录](/home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/skill-inspection-selfcontained-20261106/logs/retire-status/activation.json)维护，旧 Run 不改写。

两仓审视 Skill 与组合开发方法补充双向核查：既核对固定链是否应下沉，也核对简单任务是否被过度编排；核对实际执行角色可见工具，不将配置名当作可调用证据。新增共用用例 U-INS-026 防止单台已有状态查询启动完整巡检，旧 Run 与评分保持冻结。

管理助手通过原生 Session `session-aaa73da3-00c1-443c-a328-ad62a6762bcf` 参与只读复核，seq 628 回读最新入口并给出 11 条意见，未修改、发布或启动业务运行。其审查同时保留了原始漏洞接口完整聚合能力、目标会话实际工具可见性及同输入成本未验证的限制；配置声明不能替代这些回执。

本次四个受影响 Skill 包的递归离线检查无 ERROR/BLOCKED；两份审视 Skill 各有三条既有反例工具名提示，均为明确的示例。该次全量扫描为 107 个路径、56 个包摘要，0 ERROR/BLOCKED。确定性检查为组合 17 项、Candidate 27 项及工作流 5 项通过，撤除后的新增回归见程序侧日志；静态检查不证明模型路由或业务查询通过。当时因在途任务而保留的 pending_reload 状态，已由下述真实装载回执更新。

### 五项目录生效后的定向复验

2026-11-07T04:26:10.168Z，指定实例通过正式预览与重载入口完成更新，运行时观察 `asset_status=current`、`verification=runtime-observer`。来源仍为 EXP-security-operations-expert-027-f-r3ba4799b0cb7，装载摘要为 `sha256:b8ac5c6278de544b238fad076e9d928280799269b5112d48f8d2c815cc4c03f5`；保留 HOME、会话、Runtime 端口 18502、网关 53105 与标准镜像。本次装载含当时工作树的并行修改，不能将全部运行差异归因于本任务。

原生会话 `session-e85b27e8-5014-4e0a-a90f-54425a4297ca` 输入“请查询资产编号 3617609 当前已有的设备状态，告诉我状态和观测时间。”，在 35051 ms 内完成。完整回读截至 seq 30、无后续分页：seq 19 加载 security-inspection Skill，seq 24 唯一一次业务调用为 `mcp__sec-ops__get_soc_asset_by_asset_id`，参数 `assetId=3617609`；没有调用任何巡检组合。seq 25 返回已有状态，seq 28 交付状态与观测时间，seq 30 为 completed。

回执为 active、online、reachable，状态观测时间 `2026-11-07T12:26:44.076458`；助手保留 DATABASE_LOCAL 时间基准，不自行添加时区，也明确无已验证 Agent 心跳、状态同步未知及记录更新时间不能替代观测时间。来源、装载回执、调用参数、选定原始状态字段及最终答复见[定向复验原始摘录](status-query-activation.json)。这证明该次简单查询走原始只读工具，不替代全量 Evaluation，也不构成与旧版本的性能对照。

## 撤除前六项编排的执行证据

| 编排 | 本轮处理 | 保留的业务边界 |
|---|---|---|
| inspection-status | 冻结范围后直接汇总已有状态，删除重复检查节点与 Python 实现 | 缺失、过期或无法解释的观测保持未知；简单单台状态查询直接走原始工具 |
| inspection-baseline | 独立报告读取采用有界并发，固定数据加工与汇总由工具执行 | 缺模板、无报告或未就绪不当作合格 |
| inspection-vulnerabilities | 漏洞父子记录、修复及来源版本的固定读取和加工进入编排 | 读取已有漏洞事实，不启动主动扫描；空记录不证明没有漏洞 |
| inspection-reachability | 规则选择、范围冻结、检查对生成、路径及 ACL/NAT 解释进入编排 | 规则读取失败不同于无规则；配置推导不同于真实探测，NAT 缺失保留未知 |
| inspection-routine | 固定引用状态、基线、可达性子版本，共享范围及额度后汇总 | 不重复发现或让模型逐项拼装检查，不丢失子项未知或失败 |
| inspection-deep | 固定引用常规与漏洞子版本，复用同次范围、额度和事实 | 不重复执行常规检查，不把执行结束说成业务通过 |

各包 flow.json 是执行控制事实源，src 是业务实现，docs 是本包取舍和索引；共同实现通过公开模块 mcp/src/inspection 使用，不读兄弟组合私有源码。空的 inspection-lifecycle-check 不再作为第七项可用能力。未另建画布 DSL 或修改官方 LFX 调度器。

### 已发布版本与真实调用

以下 6 次均为真实 SOC 边界调用，范围只包含资产 `3617609`。执行完成与业务结论分别列出；请求数沿用回执指标，不包含准备阶段的全部可能调用，不据此宣称总网络成本为零。

| 编排 | 固定发布版本 | 真实 Run | 执行/业务 | 耗时 ms | 请求/峰值并发 |
|---|---|---|---|---:|---|
| `inspection-status` | `66ff38208cd4cd8ce58235ba0d9d190b06b60a9119e75eeebb58e471777eb7e6` | `run-1e18d6b8-7393-4721-80e3-c6f71bb14578` | completed / completed | 3957 | 0 / 0 |
| `inspection-baseline` | `cbab7937cc6318726309c47821ecd8616dafe5e1634bbe75af55754add01f9dc` | `run-c5bfa389-6ddf-48d2-9426-f840470c2d2b` | completed / incomplete | 5065 | 2 / 2 |
| `inspection-vulnerabilities` | `475681fc4867f7f4db38ede402caa66441e78a3c1bf986753d334ed656c1e4e2` | `run-d7cfe2e4-8566-4f84-b0a1-1c470002f73f` | completed / incomplete | 7237 | 3 / 2 |
| `inspection-reachability` | `03a782d9f932e08d41ab1c30cfa85b7784f10d3775cecf859a92b6c6b87c426b` | `run-026a53ba-f44b-4ec6-ab77-df1b803c1ab4` | completed / incomplete | 3305 | 0 / 0 |
| `inspection-routine` | `791a73615fd8994407a87ce64790780f88dbf415fecc883f9eae8877b47fc7d0` | `run-7f6e3a2d-4ea7-4084-9ebe-edfa3069ed41` | completed / incomplete | 9104 | 2 / 2 |
| `inspection-deep` | `34a98b1cb120b0543af24fd7557c03f167ec1ead18994ad6bc08caad897d3dc0` | `run-db8b6e47-7e10-44ae-8e5a-45b1cde2f804` | completed / incomplete | 12871 | 5 / 2 |

所有 Run 均生成同次 report 和 details。状态检查为正常 1；基线为未知 1；漏洞为未知 1；单资产可达性为未知 6。常规及深度汇总保留上述未知，未将空记录、无模板或规则范围不匹配解释为正常。

## 指定实例的原生端到端任务

### 深度巡检

原生 Session `session-a114d7d8-e4ed-43f6-bcaa-ae46603f249e`，一次 inspection_deep 对应 `run-3f4d87fd-1dce-4d9b-90ed-f381b52ceb7e`。冻结资产为 3617609；2026-11-06T13:14:21.593Z 创建、13:14:24.000Z 完成，回执耗时 3056 ms、5 次请求、峰值并发 2。查询与报告沿用同一 Run，没有另外启动常规或漏洞检查。report 24968 字节、details 16411 字节；状态正常 1，基线、漏洞及可达性保留未知，业务 incomplete。

### 全部适用规则的业务互联专项

原生 Session `session-f7fcc7a4-6db6-4e31-b5f4-7e487bda81a5`。输入“按当前配置的全部适用规则，执行一次业务互联专项检查。”；一次 inspection_reachability，scope.all=true，对应 `run-3f30bf34-1bea-4e64-a1d4-4a9b9a8a39b2`。

冻结时间 2026-11-06T13:35:06.065Z，105 项资产、6 条启用规则；13:35:06.220Z 创建、13:36:51.204Z 完成，105410 ms、128 次请求、峰值并发 8。128 个检查对形成 131 个检查项，正常 1、异常 43、未知 87、执行失败 0；DMZ 图层与 NAT 快照缺失明确保留，整体业务 incomplete。助手续查到同次终态并读取报告，没有主动探测、策略变更或虚构报告链接。

实际 Chrome 回到该准确 Session，展示 completed / incomplete、计数、来源时间和局限，页面错误 0，见[实际业务页面](target-complete.png)。原生页面的对话耗时不等于组合引擎耗时，不将二者混用。

### 原生周期任务到期、续查与清理

Session `session-f8cf3385-40dc-4214-9a10-1a2ce6e65713` 创建原生每 600 秒 Schedule `schedule-c0d19882-56d3-4f4d-9068-9d04b2cf379b`。真实到期事件在 seq 35，source.kind=schedule，occurrence 为 2026-11-06T13:16:01.078Z；seq 38 唯一一次 inspection_routine 产生 `run-85046c09-e6ce-47d2-909c-e0c585109319`，范围仅 3617609。

Run 在 13:16:07.651Z 创建、13:16:08.701Z 完成，回执耗时 1477 ms、2 次请求、峰值并发 2。状态正常 1、基线未知 1、可达性未知 6；report 22728 字节、details 15058 字节。seq 43/48 读取同次运行与报告；用户继续后 seq 61/63 仍读取原 Run，没有重复启动。

在第二次到期前，只删除本轮测试 Schedule（seq 68 deleted=true，seq 73 列表为空），保留业务 Run、报告与会话。公开 Run 没有返回触发绑定字段，因此证据限于原生到期事件和唯一调用的关联，不额外声称机器级绑定证明。

## 完整 24 Case 与定向复验

以下是封存来源的历史判定，不作为当前版本的单一最终分数；本轮未修改其原结果，也未用当前 evaluation.md 回填旧记录。

### 首轮全量

[完整 Run](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-dd78c7f4-a3fd-42a4-8766-934922fafe13/report.md) 共 24 项：**11 passed、8 inconclusive、5 failed**。同一路由 AI 自评，仅作研究辅助，没有独立采纳复核。逐项原始证据位于对应 Run 的 evidence/<Case>/case-result.json。

| Case | 首轮结论 |
|---|---|
| `U-INS-001` | inconclusive |
| `U-INS-002` | passed |
| `U-INS-004` | passed |
| `U-INS-005` | inconclusive |
| `U-INS-006` | passed |
| `U-INS-007` | passed |
| `U-INS-008` | inconclusive |
| `U-INS-009` | passed |
| `U-INS-010` | passed |
| `U-INS-011` | passed |
| `U-INS-012` | passed |
| `U-INS-013` | passed |
| `U-INS-014` | inconclusive |
| `U-INS-015` | inconclusive |
| `U-INS-016` | inconclusive |
| `U-INS-017` | inconclusive |
| `U-INS-018` | inconclusive |
| `U-INS-019` | failed |
| `U-INS-020` | failed |
| `U-INS-021` | passed |
| `U-INS-022` | failed |
| `U-INS-023` | failed |
| `U-INS-024` | failed |
| `U-INS-025` | passed |

主要缺口：001/015 在受理或执行中结束回答；005 无有效评审；016/017/018 导出轨迹超时；008 冻结输入未覆盖补充范围的后续步骤；014 缺少逐项证据；019 未按全部适用规则直接执行；020 将 11 月回执误述为 1 月；022 确认执行被重复语义检查拒绝；023 取消后仍尝试启动；024 未获得设备候选。各项详细裁决以原 Run 为准。

### 后续各自封存的定向复验

| Run | 所选 Case 结果 | 工作者终态/汇总 |
|---|---|---|
| [run-7db27653-feb8-414a-b8eb-d25315824e39](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-7db27653-feb8-414a-b8eb-d25315824e39/results.jsonl) | U-INS-015 passed；U-INS-001 inconclusive；U-INS-019 failed | completed；已保存 report/summary |
| [run-d497bd09-98a8-4721-8882-b6c90d039808](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-d497bd09-98a8-4721-8882-b6c90d039808/results.jsonl) | U-INS-020 inconclusive；U-INS-019 inconclusive；U-INS-022 passed；U-INS-023 passed | failed；已保存 report/summary |
| [run-d6e5b5b8-d0b1-4cb7-b338-c788f6c681f1](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-d6e5b5b8-d0b1-4cb7-b338-c788f6c681f1/results.jsonl) | U-INS-001 inconclusive；U-INS-022 passed；U-INS-023 passed | completed；已保存 report/summary |
| [run-a4e7a1d9-b767-4933-acbe-bbf688d3895f](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-a4e7a1d9-b767-4933-acbe-bbf688d3895f/results.jsonl) | U-INS-001 inconclusive；U-INS-024 failed | failed；已保存 report/summary |

022/023 在两次不同冻结来源中均通过，支持预览后一次执行、重复确认读取原 Run、取消后不尝试启动旧任务。019 的定向自动评审仍有轨迹超时，但指定实例另已取得上述真实终态、计数和报告，不能将此人工证据改写为自动 Run passed。020 复验为证据不足，不能据日期引用规则已修正就判通过。001 末次仍无有效自动结论；024 仍失败。

### 末次常规巡检的实际回执核对

末次 Run 的 U-INS-001 原生 Session `session-3440f800-ed50-493a-b308-af6e4d5d895c` 属于该评测运行，不冒称为指定 53105 实例的会话。原始 [response.json](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-a4e7a1d9-b767-4933-acbe-bbf688d3895f/evidence/U-INS-001/response.json) 已交付同次终态、范围、各类计数和报告说明；工具事件 seq 25 唯一启动 inspection_routine，seq 30/35/40/69 查询原运行，seq 74 读取同次报告。

随后经公开 compositionRun 回读 `run-c9230b70-87b4-4734-beba-5cabbea0763b`：冻结于 2026-11-06T13:43:57.584Z，all=true、105 台资产；13:43:57.945Z 创建，13:45:51.291Z 完成，耗时 114549 ms、338 次请求、峰值并发 8。执行 completed，业务 incomplete；状态正常/异常/未知为 77/24/4，基线为 9/0/96，可达性为 1/43/87，三类 failed 均为 0。report 为 2565157 字节，details 为 1910456 字节。此证据支持常规巡检已走到同次结果交付；自动评审未产生有效结论，U-INS-001 仍保留 inconclusive，不改写原结果，也不把上游未知当作正常。

### 冻结身份

| Run | Candidate SHA-256 | Evaluation SHA-256 |
|---|---|---|
| `run-dd78c7f4-a3fd-42a4-8766-934922fafe13` | `95a388e71784f94afbc5a7c942da33585219bed20072499b209a7f6129addf30` | `d3530a054e0580435232cad5039abc4b348447e139ddf0b28f9483f81a776142` |
| `run-7db27653-feb8-414a-b8eb-d25315824e39` | `724979da9cf772bcde5482526aaede45d0061d4cc28e996d9fe0bbefee6d72c5` | `1424e80db1aafde9e34ee960d0a52f8a7836bd0d7a2d4dafaf17ac0d9ba61284` |
| `run-d497bd09-98a8-4721-8882-b6c90d039808` | `23d58d2b66170c966222b0783911a0226bafbf3eee093f43f9f982be55ee6534` | `a7e49263d39fd2a91f0e6e4321ce4f256c890e7fdf29e4d00987c3d8cb1840fd` |
| `run-d6e5b5b8-d0b1-4cb7-b338-c788f6c681f1` | `8964af9ff4ddcc5be050df793b798d43cc7c2829e135a70a2ee26399e5c44e2e` | `3b8f63a4864d2e6fd0fecae30469629110faa6b5cd819cf9165828582e7abbf3` |
| `run-a4e7a1d9-b767-4933-acbe-bbf688d3895f` | `835fed71abf65bd1abc0fbb1768c01f3e2c2741bc2324484de887c1c7febd8f8` | `8e68f810bf4f3782243d2e730993183b5484eafac07cc00f0db870b3038319ae` |

每次都使用当时的 current evaluation 并保存完整冻结输入。期间存在其他业务任务并行变更，不把不同冻结口径混算通过率，也不将分数变化全部归因于本轮 Skill。实际总模型调用及 Token 统计并不完整，不能给出完整成本结论。

## 当前未决项与继续条件

1. 设备咨询到巡检/异常分析的链路未通过。原生父 Session `session-c9911685-88af-4385-8148-dd17c1ebfbbf` 正确经公开 fault-analysis Skill 交接，只读子 Session `661c699d-3bf4-4146-a6aa-27c37e49c049` 已加载；实际目录只提供按已知资产 ID 查询接入设备的能力，未取得可枚举资产的真实工具及候选。空资源目录不等于没有设备。没有猜测“第一台”、扩大范围、运行诊断或执行写入。接下来应在目标原生 MCP 配置中核对真实资产列表能力及作用域，先证明候选来源，再复验 U-INS-024；不以 Shell/HTTP 绕过业务边界，也不修改外部服务源码。
2. U-INS-001 已有同次终态和报告交付证据，仍需有效的独立复核；005/008/014/016/017/018/020 等证据缺口仍需各自重验。原生周期和业务互联的实际证据可证明对应行为，但不替代每条冻结 Case 的完整结论。
3. 上游无模板、漏洞事实不足、规则选择器及 NAT 配置缺失属于已暴露业务事实，不能由平台伪造补齐。整改后使用相同口径重新运行，保留当前 incomplete/unknown。

本轮不声明业务整体采纳、Research Release、新离线包或 ARM64 部署通过；代码交付与运行中生效分别核对，不处理并行的资产纳管或策略整改。
