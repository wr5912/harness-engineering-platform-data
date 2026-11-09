# 故障只读编排接入与验收

将业务访问异常和设备不在线排查迁移到 MCP 原生 LFX 组合，替换旧 Java 诊断入口。当前来源为 `EXP-security-operations-expert-027-f-r3ba4799b0cb7`，验证实例为 `inspection-027-schedule-acceptance`；两组合保持草稿，通过实例绑定使用，没有发布为正式工具或 Research Release。

## 使用入口与执行合同

主助手依据 [fault-analysis Skill](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/fault-analysis/SKILL.md)选择 [业务访问排查](../../../mcp/compositions/troubleshooting-business-access/docs/README.md)或[设备不在线排查](../../../mcp/compositions/troubleshooting-device-offline/docs/README.md)。简单事实查询保留原路线；缺少对象、观察设备或明确时间窗口时先澄清，不启动排查。公开连接名为 `troubleshooting-compositions`，发布原始工具名，由 DSH 添加一次命名空间。

输入按本次授权冻结，资产 ID 与 IP 同时核对，重复 IP 不能串用资产。工具异步返回真实 Run，后续通过公开查询读取进度和原产物。事实在节点完成后先持久化，再推进后继；固定步骤由 LFX 和 HepBatch 执行，助手负责语义判断和异常说明。查询超时、空数据、来源时区未知和能力缺失分别保留。

仅调用现有 SOC 只读接口；不主动执行 TCP、HTTP、ICMP、配置变更或修复。当前管理响应、实时监听、DNS、HTTP/TLS、路由等原子不足时，结果保持 `incomplete`，不把 SOC 在线或流程执行完成当作故障已定位。

## 原始报告

[报告入口](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts)和[来源解析](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs)只接受本主会话真实绑定的原 Run。新流程运行中、失败、未知或来源冲突时拒绝导出，不回退旧分析。历史同步启动回执仍须与原工具、流程、会话及规范 Run 查询一致；新调用使用异步 Run，避免大回执被原生对话裁剪后丢失来源。

保存原 HTML 的 filename、UTF-8 字节和 SHA-256，经既有原生附件扩展预览、下载，不让模型重绘。重复下载复用同一原附件，不重新查询 SOC 或执行诊断。无新编排活动时保留既有 legacy 分析报告；空会话拒绝造报告。巡检原报告保持独立兼容。用户下载指令按句子识别，完整 Run 编号不会因固定字符窗口被误拒。

用户后续提供的两份参考已落实为[生成端新版格式与离线验证](report-format-update-20261107.md)；不重绘已保存原 HTML。该样式任务没有重载、发布或改实例草稿绑定，不能将样例与离线浏览器结果当作当前实例新报告验收。

## 构建交接与验证状态

平台更新通过项目 `platform/dsh-deploy` 完成；用户授权后中断在途管理会话并快速恢复，未修改 DSH 源码。实例通过公开生命周期工具定向重载，保留 HOME、Session、模型、端口和计划，并核对当前来源与真实装载回执；每次来源更新后重新绑定草稿，保存文件不作为运行生效证据。

- 两包当前合同测试共 **56/56** 通过；报告及入口兼容回归 **400/400** 通过。Mock 只替换外部 SOC，不能证明真实业务结论。
- 官方 LFX 使用正式 flow/TS、仅替换外部 SOC 边界，两根流程执行通过；真实画布覆盖条件标签、批次与嵌套展开及返回。原始证据保存在程序工作区 `platform/plugin/test/evidence/troubleshooting-compositions-20261107/`。
- 管理助手公开 dry 两草稿均完成、零上游请求；真实 SOC 两类 Run 均执行完成并生成原 HTML，运行中节点事实可经公开接口读取。业务结果均保留缺口，未宣称故障修复或根因成立。
- 巡检、legacy 及两类新故障报告均在真实原生会话完成预览、两次下载；原 HTML 字节摘要一致、页面异常为零。异步报告重复取回只调用导出，新增 SOC 查询与诊断启动均为零。
- 完整业务接入回归最终为平台 **204/204**、容器适配 **23/23** 通过；此前短租约与网关时序失败保留为历史观察。独立威胁子会话断言失败仍未解决，不将本次技术通过外推为该业务通过。

## Evaluation 与研究结论

Case 的唯一来源是[共用 evaluation.md](../evaluation.md)。本轮核心集为 U-FLT-012、U-FLT-016、U-FLT-017、U-INS-024、U-QA-016，各 Case 内保持原多轮顺序；原报告重复下载另核对新增 SOC 调用为零。

[迁移前基线](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-baad80f3-fc6d-4e4a-ab92-428a1f1f34d9/report.md)仅解释自身冻结来源。首轮统一验收 [run-c627519b-d871-49ce-8d9b-4f1a893850a3](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-c627519b-d871-49ce-8d9b-4f1a893850a3/report.md)为 failed，且并行资产变化使封存来源不匹配；保留其真实失败，不覆盖成后续结果。其后 [run-99282789-7ff3-435e-b6dd-403eb12b9caf](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-99282789-7ff3-435e-b6dd-403eb12b9caf/report.md) 因同一 Candidate 被并行修改、实例重载而出现五项错误，来源不匹配，保留失败。

稳定来源后的 [run-ea5f30b0-19ac-408e-b72d-4beabb28d4c1](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-ea5f30b0-19ac-408e-b72d-4beabb28d4c1/report.md) 来源核对相符：四项执行完成、一项错误；同一路由自评为两项通过、一项失败、两项结论不足。巡检与缺参澄清/取消通过；咨询转查询遗漏用户可见分页范围；离线候选发现反复扩大查询并超过等待期限；业务访问未取得真实连接前置而转用离线诊断，不能据报告导出成功判为访问正向通过。以上失败与原判断保留。

最终统一验收由管理助手在稳定来源后分五个独立 Run 完成，五项 `source_verification` 均为 `matched`：[U-FLT-012 / run-f074c620-03fc-493f-839f-71613498cd72](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-f074c620-03fc-493f-839f-71613498cd72/report.md) 因 `evaluation-interrupted` 取消并判为 `inconclusive`，[U-FLT-016 / run-0602631c-d836-43fe-9549-4ca5cd9a5928](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-0602631c-d836-43fe-9549-4ca5cd9a5928/report.md) 因执行错误判为 `inconclusive`；[U-FLT-017 / run-3b429607-ccad-42e7-b8ac-fa99f4e78996](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-3b429607-ccad-42e7-b8ac-fa99f4e78996/report.md)、[U-INS-024 / run-0199035d-4293-4a8b-9e02-58b26c45aedd](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-0199035d-4293-4a8b-9e02-58b26c45aedd/report.md)、[U-QA-016 / run-b6b4d547-bede-423c-a9dc-ed79aa593634](../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-b6b4d547-bede-423c-a9dc-ed79aa593634/report.md) 完成且通过。整体 Decision 仍为 `continue`，两项真实失败保留，不改写为通过。

最终 Run 使用的是验收开始时读取为 `current/verified` 的实例装载回执；随后并行任务继续修改同一 Candidate，最新实例状态已变为 `pending_reload`，因此早先回执只证明采集时的装载状态，不延伸为当前状态。本轮不因该并行漂移再次重载或重跑最终 Evaluation。

当前 Decision 保持 `continue`：迁移技术路径可用，真实外部证据缺口与语义业务验收分别判断。
