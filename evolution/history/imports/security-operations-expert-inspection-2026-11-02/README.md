# 巡检运行时迁移与整改

本次按用户 2026-11-02 的授权，将旧巡检功能整改到 EXP024 及其后的全部现存版本和派生变体。当前业务口径统一维护在 [评测文件](../../../../agents/security-operations-expert/evaluation.md#安全巡检)，实现位于各版本的 `candidate/`；本文件保存来源处置、变更范围和本次证据，不另建业务规则副本。

## 来源与读取边界

用户指定的旧交接目录为 `/home/chenfei/Coding/ai-lite-platform/docs/validation/000652-2026-11-02-dsh-inspection-runtime-handoff-v0.1`。当前开发身份没有该目录的读取权限，因此未声称完整审读交接包。实际通过旧运行容器 `ai-lite-local223-independent` 只读取得以下两个文件，未执行旧脚本、插件或 Hook：

| 读取位置 | SHA-256 |
| --- | --- |
| `/opt/dsh-managed/inspection-preparation-runtime.ts` | `c6bd45805c083bd9f2f86b261cde3e2efd46d4f0bd0bc91917adbde9ab597172` |
| `/work/harness/workspace/.agents/skills/security-inspection/SKILL.md` | `38af3b0229a46d4ba420331fa5d1b34a9d1cb98a03a81ca6526c16d6a5873ebe` |

旧仓库当时位于 `fix/AGENT-security-operations-expert-local223-inspection`、提交 `2e291de7`，Runtime 为 2.18；相关文件在旧仓库未被跟踪，不能用该 HEAD 代替上述文件摘要。其他旧版本目录中的对应文件摘要一致性也已核对。旧交接材料中的 Mock 数量、资产数量和“不完整”结果只代表旧环境，不作为本次验收。

## 覆盖范围

| 对象 | 保留的实现方式 | 本次巡检变化 |
| --- | --- | --- |
| [EXP024](../../../experiments/EXP-security-operations-expert-024-rad80a907c628/) | 原有主 Agent 与其他业务插件 | 接入受管准备、启动及报告处理 |
| [EXP025](../../../experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/) | 原有独立应急、研判及报告处理 | 同上，不带入其他并行研判整改 |
| [EXP026](../../../experiments/EXP-security-operations-expert-026-ra06021c8deaf/) | 原有语音等业务能力 | 同上 |
| [EXP027](../../../experiments/EXP-security-operations-expert-027-reab20c48f610/) | 已存在的当前候选资产与身份 | 将原本未跟踪的候选资产纳入版本管理并整改巡检 |
| [VAR001-rd4c625231cdb](../../../experiments/VAR-security-operations-expert-001-rd4c625231cdb/) | AOT 与真实 LangGraph | 主 Agent 选择实际模板，图中准备、启动并查询同一运行 |
| [VAR002-r5a8db4982991](../../../experiments/VAR-security-operations-expert-002-r5a8db4982991/) | AOT 与真实 LangGraph | 同上，并纳入原本未跟踪的候选资产 |
| [VAR001-r144fbb173cad](../../../experiments/VAR-security-operations-expert-001-r144fbb173cad/) | 整体纯代码编排 | 从真实目录选择唯一模板，解析明确范围；仅支持真实用户消息，周期任务如实说明不支持 |
| [VAR002-r727f8750a82f](../../../experiments/VAR-security-operations-expert-002-r727f8750a82f/) | 原有混合编排与真实小模型 | 仅巡检绕过 KEV，其他职责保留原路由 |

各对象原 ID、父来源与已有 Run 保留。已删除的 EXP028 没有恢复。没有切换已启用版本、改动外部 DSH 源码、改写历史结果或为 Harness 构建派生镜像。

各候选中同步修改巡检 Skill、工作区角色说明、角色工具矩阵、Guard、Preset、能力声明及受管源码和构建回执；只对需要变更编排的四个 Variant 修改工作流。部分版本的巡检连接原先仍指向旧服务，本次仅更新该连接到实际核对的当前巡检服务。

程序仓库同步修正受管构建：仅使用 DSH 原生模块的入口不再被其他插件尚未准备的业务依赖阻塞；原生类型从程序依赖解析，标准镜像通过对应 workspace 包定位原生模块。业务依赖未准备仍拒绝构建。整体编排的最终回复与图身份从同一原生工具回执的持久化投影读取，避免原生大结果落盘后解析截断正文；会话、调用、模式和完成状态核对继续生效。纯代码变体只展示实际目录的名称、版本和巡检项，完整参数 Schema 留给模板核对。未修改 DSH Runtime。

## 拒绝照搬的旧实现

| 旧做法 | 违反的当前原则与替代方式 |
| --- | --- |
| 强制匹配下一轮“确认执行”，准备过期后再次要求确认 | 用户已明确要求完整请求同轮执行；去除本地额外确认，保留真实目录、范围、缺项及服务回执核对 |
| 缺少范围时默认全部设备，或周期消息不保存选择器 | 违反准确对象与输入边界；范围不完整只澄清，周期保存原选择器及业务输入，按到期时点重新解析 |
| 以 preparationId 作为每次提交身份 | 准备刷新可能引发重复执行；按真实 Session 消息及原输入绑定稳定 requestId，启动前持久记录提交，未知回执停止重提 |
| 无条件删除 businessSummary 与逐项整改建议 | 违反结果保真；保留服务原结论、摘要、建议及证据缺口 |
| 以文本长度估算并硬编码 12500 阈值 | 与实际 Runtime 预算重复维护；复用 DSH 原生 spill 标记，全文溢出后至多补读一次同运行摘要，补读同样受原生预算约束 |
| 只允许固定路径且丢弃查询参数的报告地址 | 会拒绝真实部署前缀和带查询参数的下载地址；保留服务返回的有效 HTTP(S) 原地址，不拼造路径 |
| 为迁移额外叠加 KEV 路由或新 node_runtime 调度 | 当前巡检无需该依赖；复用原生工具与既有编排，其他业务职责按原实现保留 |

同时保留旧技能仍有效的独有要求：只读取已有漏洞结果、不主动扫描或修复；范围条件取交集；预览不启动；取消不启动；查询已归档明细时按需分页；区分设备、巡检项、规则与路径记录的数量；缺证据不写成正常；下载链接和结论必须属于同一次真实运行。

## 确定性验证

- 数据侧 [巡检运行时合同测试](../../../../agents/security-operations-expert/tests/inspection-runtime.test.mts) **36/36 通过**，直接加载八个候选的构建产物；仅在真实外部工具接口边界使用受控回执。覆盖七类选择器、原条件交集、过期刷新、幂等与未知提交、取消和状态损坏、真实消息来源、周期身份、摘要及全文溢出、链接保真、两个 LangGraph 同运行查询、纯代码和混合编排。
- 程序侧受影响构建、依赖和工作流运行测试 **67/67 通过**，插件 TypeScript 构建通过；未将其写成全仓回归。
- 八个来源的 `dsh-eval --dry-run --source-check` 解析通过；八个巡检入口与四个工作流共 **12 份受管构建回执**逐项核对通过。
- 在现有标准 DSH 镜像中实际导入巡检运行时成功。临时装载核对实例已停止并保留 HOME；未重启共享平台和其他业务实例。

这些结果证明资产合同、受管构建及受控接口行为；不证明第三方真实巡检、报告交付或周期到期业务通过。

## 真实服务与研究结论

实际 MCP 初始化、工具发现和目录查询成功。服务提供准备、启动及结果读取等真实工具；同轮准备返回 READY 后，实际启动仍返回“请先展示巡检范围，等待下一轮用户明确确认后再启动”，没有 runId。该拒绝来自第三方服务，当前候选代码中没有该拒绝文案。

本次不伪造下一轮确认、不绕过准备接口、不修改外部服务，也不以目录可用替代巡检完成。研究结论为 **continue**：本地迁移与确定性验证完成；同轮真实启动受外部合同阻塞，需要巡检服务支持当前明确请求的授权方式后继续验证真实执行、原运行续查和报告。自动评判结果完整保留；下面单独说明真实工具回执可支持的事实，不覆盖机器结论。

本次对每个对象选择 U-INS-001、U-INS-002、U-INS-008、U-NEW-009 四例执行真实服务评测，`review: none`，未执行其他业务用例。下表是机器评判的“通过 / 失败 / 不确定”数量，不能把不确定视为通过。每个 Run 保存其实际代码、dirty 状态、候选冻结摘要、模型策略和输入；前六个 Run 早于最后的共享整体编排回复投影修复，后两个 Run 使用该修复及最终工作流构建。最后重新核对全部受管构建和来源，不以当前目录推定早期 Run 的冻结内容。八个主要 Run 的冻结来源核验均为 matched；32 例机器评判合计 8 例通过、3 例失败、21 例不确定。

| 对象 | 本次主要 Run | 机器评判：通过 / 失败 / 不确定 |
| --- | --- | --- |
| EXP024-rad80a907c628 | [run-18c6a0d5-6354-4a92-a83d-0c00b08287e8](../../../experiments/EXP-security-operations-expert-024-rad80a907c628/runs/run-18c6a0d5-6354-4a92-a83d-0c00b08287e8/) | 1 / 0 / 3 |
| EXP025-r3f8a8b3da3f1 | [run-f22b4571-d547-47d9-9709-3771468c0b83](../../../experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/runs/run-f22b4571-d547-47d9-9709-3771468c0b83/) | 0 / 0 / 4 |
| EXP026-ra06021c8deaf | [run-0c10d093-5aa4-46a0-9765-b975251c532c](../../../experiments/EXP-security-operations-expert-026-ra06021c8deaf/runs/run-0c10d093-5aa4-46a0-9765-b975251c532c/) | 1 / 0 / 3 |
| EXP027-reab20c48f610 | [run-48496f54-b728-40c2-8490-b8302493d2d0](../../../experiments/EXP-security-operations-expert-027-reab20c48f610/runs/run-48496f54-b728-40c2-8490-b8302493d2d0/) | 1 / 0 / 3 |
| VAR001-rd4c625231cdb | [run-eeeff5ab-9076-4fe7-8c1b-22afda0a2078](../../../experiments/VAR-security-operations-expert-001-rd4c625231cdb/runs/run-eeeff5ab-9076-4fe7-8c1b-22afda0a2078/) | 1 / 0 / 3 |
| VAR002-r5a8db4982991 | [run-8bba0a05-8be4-4753-be08-70586c08f55d](../../../experiments/VAR-security-operations-expert-002-r5a8db4982991/runs/run-8bba0a05-8be4-4753-be08-70586c08f55d/) | 2 / 0 / 2 |
| VAR001-r144fbb173cad | [run-3921e2d1-c474-4b68-a595-4faeb9badba8](../../../experiments/VAR-security-operations-expert-001-r144fbb173cad/runs/run-3921e2d1-c474-4b68-a595-4faeb9badba8/) | 2 / 0 / 2 |
| VAR002-r727f8750a82f | [run-6e9d59cf-1a6c-48c8-9039-6445feb7b410](../../../experiments/VAR-security-operations-expert-002-r727f8750a82f/runs/run-6e9d59cf-1a6c-48c8-9039-6445feb7b410/) | 0 / 3 / 1 |

逐例工具事实与限制：

- **U-INS-001 同轮执行**：EXP024–027、两个原巡检 LangGraph Variant 和整体纯代码 Variant 均见真实目录、READY 准备及同轮启动尝试；启动被第三方“下一轮确认”规则拒绝，没有真实 runId，未验证后续运行、续查或报告。整体混合 Variant 的实际模型请求失败，未完成该业务路径。
- **U-INS-002 目录查询**：前六个对象均见只读目录回执；部分机器评审未生成有效结论，仍保留不确定。整体纯代码变体已从旧的溢出正文解析失败恢复，实际返回六个模板及巡检项，机器判通过。混合变体保留实际模型请求失败。
- **U-INS-008 范围缺失**：未见擅自 ALL 或巡检启动。EXP024、027、原 VAR002 和整体纯代码 Variant 可见明确范围澄清；EXP025 另有读取失败，EXP026 与原 VAR001 存在轨迹导出失败或空正文，不能据此认定交互完成。纯代码变体的真实澄清已验证；初始输入没有补齐范围，未证明补齐后的执行。
- **U-NEW-009 影响咨询**：前六个对象未见准备、启动或 KEV 调用；部分回复对“没有影响”的表达过强，不能认定影响说明完整。整体纯代码变体只读目录，明确说明尚未执行、实际影响未知，机器判通过。整体编排自身的工具调用不等于巡检运行；原始机器评判保留，不因人工解释改写结果。

此外，混合变体本次四例机器结果为 3 例失败、1 例不确定，图回执中的模型请求为 `fetch failed`；U-NEW-009 也没有准备或启动，但未形成影响说明。以上失败保留，不能以静态测试替代。真实周期到期、七类范围在真实服务上的逐项执行、准备过期、未知提交恢复、完整报告与下载交付尚未完成业务验证；这些场景当前只有上文确定性测试证据。混合变体保留原有真实模型提供方与路由，没有用模拟模型掩盖依赖失败。

此前失败与取消的记录继续保留：

- EXP024 的[构建前置失败](../../../experiments/EXP-security-operations-expert-024-rad80a907c628/runs/run-f2e3b0d7-1f64-4d4b-95b2-704821bd6036/)、[依赖装载失败](../../../experiments/EXP-security-operations-expert-024-rad80a907c628/runs/run-6dd92186-1cb0-4893-bfea-fb4c60b2cf73/)、[早期 Preset 失败](../../../experiments/EXP-security-operations-expert-024-rad80a907c628/runs/run-16b95f06-78c6-4db9-a574-02cabc75a2f0/)，以及纯代码 Variant 的[早期 Preset 失败](../../../experiments/VAR-security-operations-expert-001-r144fbb173cad/runs/run-164ed853-7b6f-4321-8503-6c1d87003ac4/)。
- 调整 Skill 前取消的 [EXP024 Run](../../../experiments/EXP-security-operations-expert-024-rad80a907c628/runs/run-0e3a58ea-8322-4cf7-8cc8-78c503b16b2d/) 与 [EXP025 Run](../../../experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/runs/run-f77e8cd9-b8e6-442d-b67d-f40c7373680d/)。
- 整体纯代码变体的[溢出正文解析失败 Run](../../../experiments/VAR-security-operations-expert-001-r144fbb173cad/runs/run-5539d2e9-b72d-463f-aae7-0178af096a55/)和混合变体的[早期模型失败与路由 Run](../../../experiments/VAR-security-operations-expert-002-r727f8750a82f/runs/run-f255932c-e393-43af-8781-dbc3fbbdc6b4/)。

未将本次结果写成 Research Release 复现或生产部署验收。继续点是：在第三方服务支持当前同轮授权合同、混合变体模型能正常应答后，保持本次用例和实际来源，重跑相应受阻用例及真实报告、周期到期路径。
