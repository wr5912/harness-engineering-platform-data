# 原生 HTML 报告基础与历史技术证据

本文保留 `EXP-security-operations-expert-027-f-r3ba4799b0cb7`（陈飞）原报告任务的实现来源、技术测试及构建证据。以下状态与摘要只描述该阶段，不作为后续源码现状或当前通过证明。

后续真实legacy基线、故障只读编排接入及正式复验边界统一见[当前Candidate交接](<../troubleshooting-candidate-integration-20261107.md>)；不在本文复写。原阶段停写不等于不可变冻结、实际装载或业务验收，原始TAP、截图、Run及当时观察保持不变。

## 当前实现

- 巡检导出绑定本会话真实启动的原运行，重新读取完整原生回执验证终态及唯一 HTML 产物，保留原文件字节，不从截断聊天拼报告。
- 主助手已直接取证或补证时，以真实只读回执绑定完整可见分析正文，生成故障 HTML。没有更新证据时仍可复用真实完成子任务；默认拒绝仅导出较早子任务的能力缺口而遗漏主助手补证。
- 同一报告通过本会话真实已导出附件标识复用，不重新取证、委派或改写正文。来源、MIME、路径、字节、摘要与元信息冲突检查已落实；后续不合法回执不会覆盖先前合法记录或洗掉原来源截止点。
- 原生 Client 工具视图提供预览/下载，校验完整文件、会话、路径与 SHA-256，兼容 HTTP 环境的 SHA 回退。HTML 正文全部转义，不导出隐藏 reasoning，不增加 SOC 写入、探测、处置或旧 Java/53105 调用。

## 最终已落盘文件

以下仅列本报告线程的变更与必要构建记录；共享文件中的并行修改原样保留。

| 分组 | 文件 |
| --- | --- |
| 报告入口与受控产物 | [security-report-runtime.ts](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts>)、[security-report-runtime.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs>) |
| 来源与共用安全模板 | [security-report-source.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs>)、[security-report-source.d.mts](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.d.mts>) |
| 下载扩展 | [package.json](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/package.json>)、[index.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/index.mjs>)、[client.js](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/client.js>)、[zh.json](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/locale/zh.json>)、[en.json](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/locale/en.json>)、[icon.svg](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/icon.svg>)、[LICENSE](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/LICENSE>) |
| 接线与报告权限声明 | [Profile patch](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-expert.patch.yml>)、[主 Preset](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/presets/security-operations-expert/agent.cordis.yml>)、[Guard](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-guard.mjs>)、[工具矩阵](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/role-tool-matrix.yaml>)、[harness.yaml](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/harness.yaml>) |
| 业务行为 | [业务 AGENTS.md](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/AGENTS.md>)、[巡检 Skill](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/security-inspection/SKILL.md>)、[故障 Skill](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/fault-analysis/SKILL.md>) |
| 测试 | [入口与巡检测试](<../../tests/security-report.test.mjs>)、[客户端下载测试](<../../tests/security-report-client.test.mjs>)、[主助手来源与复用测试](<../../tests/security-report-main.test.mjs>) |
| 既有研究与用例 | [hypothesis.md](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/hypothesis.md>)、[evaluation.md](<../../evaluation.md>)中已保存 U-INS-027、U-FLT-013、U-FLT-014、U-QA-017；收尾未再改用例或降低标准。受控构建元数据由平台在[change.yaml](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/change.yaml>)维护。 |
| 交接入口与证据 | 本文及[智能体入口](<../../README.md>)、下列原始测试结果、截图与冻结 Run。旧入口专用检查脚本和两份被本文替代的状态说明已清除，原始证据未删除。 |

## 必要本地验证

最后一次联合运行现有三份测试：**175/175 通过，0 失败、0 跳过，exit 0**，见[完整 TAP](<technical-tests-d2b7c0b4.tap#L1054-L1063>)。主来源测试独立运行也为 124/124 通过。覆盖真实形状事件配对、主助手补证、默认旧子结果拒绝、显式历史选择、附件复用、错误及跨会话拒绝、MIME/摘要/来源冲突、裁剪投影、未知 MCP 保守处理、HTML 转义、SHA 回退、Blob 字节与取消清理。

这些是隔离的技术 Mock：外部 MCP/Session、React hooks、URL 与点击均有明确模拟边界，不代表当前页面实际下载或 SOC 端到端通过。此前失败输出[旧边界断言](<technical-tests.tap>)与[较早通过版本](<technical-tests-c9974352.tap>)保留，不用最终通过结果改写历史。

最终受控 Managed 构建已执行，TypeScript 5.9.3 / esbuild 0.25.12 类型检查与编译成功；没有执行来源 package scripts、安装依赖或修改平台程序。构建后的文件摘要已独立核对：

| 交接项 | SHA-256 |
| --- | --- |
| [入口源码](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts>) | `9438d6b8056e5e0221d67ff72c3df9126de24703fcd68843e0d34be4c7b30f13` |
| [可装载 ESM](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs>) | `d2b7c0b4e850ea2d672d30f9c10b228b4f4e9baf8d1dd0cf98fc2db6a06fa571` |
| [来源模块](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs>) | `eb9be96ebe3c10ccb9d6a87dde203a948e7463a93a421c9182bb778ccbb8259d` |
| [类型声明](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.d.mts>) | `bc437e5899ec1adbc5087b7ec3fe29eb525700a322d31814b56a12d9fab03c73` |
| [Client](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/client.js>) | `cfe509a75440179883f61bf51a2724b60025dfc72c0af4ac94b74eddfda0d2f1` |

受控构建回执的 Candidate 摘要为 `916dc2c32d68ea1f5298cd78266606e60094796dfd5e6ccfdb5a0c1de9985df9`，build digest 为 `3087465d7eaad1493e8c5adb52358ce886f5b53059481cc6ceda258fd9bacc28`。这是收尾时点观察，不是全局写锁或固定 Git 发布源；研发固定前须核对是否仍一致，不覆盖其他线程的成果。研究结构校验 valid，保留既有 `ACTIVE_OUTCOME` 提示，未用修改分支完成状态来消除警告。

## 已有真实业务证据与未决项

1. [Run 039c](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-039c1d04-3550-4c18-bb69-f3f7fb3c6c3d/report.md>)：巡检真实生成原 HTML，重复导出同一文件，物理文件字节与摘要已核对；故障任务超时，未计通过。该 Run 只支持它自己的冻结来源。
2. [Run 11df](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-11df2a7e-322a-4eb8-9d8f-9ac85d7a1370/report.md>)：4 个 Case 执行完成，自动结果为 3 passed / 1 inconclusive；同时 source verification 为 changed，因此不能宣布当前整体 Candidate 通过。实际巡检文件 22,730 字节，重复导出 SHA 相同。实际故障文件 7,596 字节虽可保存且重复一致，但正文仅是子任务能力缺口，漏掉了[主助手随后取得的真实事实](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-11df2a7e-322a-4eb8-9d8f-9ac85d7a1370/evidence/U-FLT-013/response.json>)，**不作为合格故障业务报告**。
3. 本次主助手来源修复针对上述真实缺陷，已经编译和本地验证；按用户暂停安排，**没有再创建业务 Run、没有装载到共享实例、没有真实复测新版故障报告**。不能把旧 Run、模型自评或 175 项技术测试当成该项通过。
4. 当前平台独立浏览器检查曾进入登录页，[DOM](<current-platform-initial-dom.json>)与[网络记录](<current-platform-initial-network.json>)保留。没有读取凭据或个人浏览器状态；当前业务页面报告卡片的真实预览/下载点击及下载后文件核验尚未完成。认证模式的实际工具隐藏也未单独实测。
5. 用真实原生文件打开得到的[巡检截图](<inspection-native-preview-run-039c1d04.png>)只证明该文件可渲染，不证明工具卡片下载。较早旧 53105 页面检查与重载不作为当前链路成功依据，用户澄清后本任务已停止该入口。

## 稳定验收交接点

本线程及全部子代理已结束写入，无后台测试任务待收集。保留现有源码、编译产物、用例、原始证据和并行资产接入成果；不提交、推送或发布，不回退，不重载 `inspection-027-schedule-acceptance`。

下一步交研发统一固定 Candidate、用例、MCP 编排与实例装载来源，再经当前 Harness 原生入口验收：两类 HTML 正文必须包含本轮完整业务结果；重复下载保持同一字节且不重查/再委派；无结果与仅咨询不伪造文件；实际预览、下载及文件摘要分别取证。上述是交接范围，不是本线程继续执行的排程。

平台恢复后仅只读复核，五项报告核心文件摘要与上述交接记录一致，未再修改 Candidate 或用例、运行评测或重载实例。持久目标现已收到暂停成功回执，自动推进已关闭；未将未验证目标标记完成。统一 MCP 编排后的报告来源适配仍需核对[当前来源合同](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs#L242-L280>)并实测，本线程不再扩展实现。
