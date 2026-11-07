# 故障只读编排 Candidate 接入与研发交接

目标为 `EXP-security-operations-expert-027-f-r3ba4799b0cb7`，保留 `inspection-027-schedule-acceptance`。本轮只维护该 Candidate、共用用例和必要 MCP 分组；不改 DSH、不另建报告系统。源码与配置保存不等于实际装载或业务通过。

## 来源与证据边界

- [迁移前基线报告](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-baad80f3-fc6d-4e4a-ab92-428a1f1f34d9/report.md>)：U-FLT-013/014 机器结果 2/2 passed，封存来源 matched；未请求独立证据复核。封存 Candidate SHA 为 `916dc2c32d68ea1f5298cd78266606e60094796dfd5e6ccfdb5a0c1de9985df9`，封存 evaluation_sha256 为 `9cdfa1fcd08933e66106b5ffccd4badeba6537ecf33ba4c675d544e43a3afd91`。旧 Run 和冻结输入保持原样，不用它证明本轮新接入通过。
- 两包正式 show 修正与隔离实验各自见[访问包回执](<../../../mcp/compositions/troubleshooting-business-access/docs/management-receipts.json>)、[离线包回执](<../../../mcp/compositions/troubleshooting-device-offline/docs/management-receipts.json>)。本轮回读确认根批次及 offline 嵌套批次均保留官方类型和 `show:true`；未改引擎。研发的 974/984ms 是冻结 bundle 内存副本隔离实验，不是正式资产或业务实例运行通过。离线 34/34 是研发反馈，不覆盖本轮新增代码与断言。
- 既有[报告基础技术证据](<html-report-acceptance-20261107/report-acceptance.md>)按其冻结阶段解释；历史技术测试不充当本轮结果。运行报告不带开发进度或硬编码 runtime_validation。

## 本轮变更路径

所有业务 Case 仍只维护在 [evaluation.md](<../evaluation.md>)；本说明不复制用例输入和预期。

| 分组 | 实际文件 |
| --- | --- |
| 接入能力声明 | [harness.yaml](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/harness.yaml>) |
| 主助手行为 | [业务 AGENTS.md](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/AGENTS.md>)、[fault-analysis Skill](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/fault-analysis/SKILL.md>) |
| 原角色接线 | [主 Preset](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/presets/security-operations-expert/agent.cordis.yml>)、[故障子 Preset](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/presets/security-operations-fault-analysis/agent.cordis.yml>) |
| 权限边界 | [Guard](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-guard.mjs>)、[角色矩阵](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/role-tool-matrix.yaml>) |
| 原报告入口及来源 | [security-report-runtime.ts](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts>)、[security-report-source.mjs](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs>)、[security-report-source.d.mts](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.d.mts>) |
| Guard 技术回归 | [根 Guard 测试](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/security-operations-guard.test.mjs>)、[MCP 作用域测试](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/mcp-scope-guard.test.mjs>)、[子 Guard 测试](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/security-operations-child-guard.test.mjs>) |
| 新报告来源回归 | [troubleshooting 报告测试](<../tests/security-report-troubleshooting.test.mjs>)；既有[入口/巡检测试](<../tests/security-report.test.mjs>)、[主助手/legacy 测试](<../tests/security-report-main.test.mjs>)和[客户端测试](<../tests/security-report-client.test.mjs>)保留为兼容回归，未因新功能放宽旧断言 |
| 共用业务验收 | [evaluation.md](<../evaluation.md>)仅追加 U-FLT-015/016/017，保留原用例及 U-FLT-014 空会话拒绝；三个新增用例均未设置 fast |
| 研究假设与入口 | [hypothesis.md](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/hypothesis.md>)、[智能体索引](<../README.md>)及本文 |
| 管理侧 MCP 定义 | [manager.json](<../../../mcp/manager.json>)的新分组、[访问包定义](<../../../mcp/compositions/troubleshooting-business-access/composition.json>)、[离线包定义](<../../../mcp/compositions/troubleshooting-device-offline/composition.json>)均由公开工具保存，不手写凭据或实例 HOME |
| 正式包既有根因修正（本轮回读保留） | [访问流程](<../../../mcp/compositions/troubleshooting-business-access/flow.json#L11>)、[离线两层流程](<../../../mcp/compositions/troubleshooting-device-offline/flow.json#L10-L25>)；[访问回归源码](<../../../mcp/compositions/troubleshooting-business-access/tests/contract.test.mjs>)、[离线回归源码](<../../../mcp/compositions/troubleshooting-device-offline/tests/contract.test.mjs>)保留可见元数据断言，未运行 |
| 历史来源索引适用说明 | [迁移前入口](<troubleshooting-readonly-discovery-20261107-session-917d55d5/README.md>)、[报告基础入口](<html-report-acceptance-20261107/report-acceptance.md>)明确不代表本轮源码状态 |

## 报告接入合同

主助手只对完整访问异常或设备不在线问题创建两类只读编排 Run；简单已有事实查询保持原路线。源目/设备、端口与带时区的绝对窗口沿真实输入冻结，缺项询问，未知启动不重放；故障子角色仍不创建 Run。新分组权限不包含主动探测、配置写入、处置或旧 Java 诊断。

新 fault 报告必须从本 Root 会话原生成功调用回执绑定 troubleshooting 原 Run，查其当前外层完成状态及唯一原 HTML。默认跟随最新尝试；显式 run_id 仍须属于本会话真实绑定的原编排，不能借外部或 inspection 标识，也不能把指定较早结果称为最新。失败、进行中、未知、来源冲突或原产物校验失败均不能自动回退 legacy。

原 get_run/get_artifact 能力对应的公开工具原名为 get_composition_run/get_composition_artifact；只使用当前真实目录解析的身份，不重复添加 namespace。原 HTML 不套模板、不由模型重绘；filename、字节数和摘要与原产物一致。实际接口未提供服务端 SHA 时，明确摘要来自原 UTF-8 body 计算，不冒称服务器提供。重复下载只复用真实 attachment_id/原文件，不查 SOC、不重新执行或生成；本会话新编排来源须使默认旧附件失效。inspection 保持独立兼容；fault 完全无新编排来源时才使用 legacy 子结果和主助手补证导出，空会话不能造旧报告。

原生 Client 下载扩展不改，沿用既有文件、MIME、会话和摘要校验。源码/类型声明不替代 [security-report-runtime.mjs](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs>) 的受控构建；未手写编译物或 [change.yaml](<../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/change.yaml>) 的构建回执。

## 管理保存回执

- 新分组配置：公开 saveConfiguration，proposal `af805a21-f50c-470a-a3a1-478574a0d556`；输入 revision `f1fe835c6ef05da164abf64437b2a4f14ef1f32f3963ae2d7790f9e858edf3f8`，返回并回读 revision `453de6785b123978cafa7e1b623945ccbc1f8ad6457ba2c08230eebf9d0ac8b7`。只增加 troubleshooting-compositions，成员来自 platform-compositions，工具仅保存公开原名；其他组未覆盖。
- 共用 Case：公开 create-preview/create 后保存 U-FLT-015/016/017，proposal 依次为 `9359b627-b1af-42e1-9fe4-1d37a5d195f8`、`16bc0dea-d064-4d7f-9b24-a308f1d6e5b8`、`2476c8a2-b788-4bd3-8ff7-e00b373dcf7d`；本线程最后 Case 保存回执的内容 SHA-256 为 `5bc3bfbdf5cfd4713c397f4ab33d89517c0106fa138bca965d992a9a619663de`，不是一次新评测结果；后续并行改动以当前文件与研发冻结来源为准。
- 本轮两包均公开 saveCompositionDraft 成功：访问 proposal `1be8277a-add1-45cf-8fb7-7387553bc481`，目录 revision 由 `3b73063d82557c00baac61d37078a94e30ff78b1d7f39e05e2be08812992c72b` 更新至 `17b1583f769119b3cf5b69e014dfb3085d66f29133450f6d11687fe51bb19b6f`；离线 proposal `39f88437-1e39-4ba7-b514-40d0562c4c4d`，返回最终目录 revision `48aefd0e50cd802e9ae79776eccc256950431f83118aafed1c8b6b42c7b7def7`。描述只保留冻结输入、只读边界和同次原HTML，不发布或绑定。目录 revision 不代替源码构建与正式引擎复验。
- 本管理任务及两个子线程已停止 Candidate、evaluation 和包文件写入。新建重复 Guard 测试已删除，必要断言只留原 Candidate 技术测试；无测试后台任务。

## 未验证边界与研发交接

本轮不执行测试、源码构建、官方 LFX 探针、评测、绑定、发布、Git 或部署，不操作指定实例的重载；不对 SOC/设备配置写入。公开回读原有 R11 Run/Artifact 仅核对查询接口形状，不当作新功能测试。分组保存不证明两诊断工具已在业务实例可调用；最后公开观察仍为 pending_reload。

共享报告文件同时出现非本任务的 inspection 多 Run 选择器及意图词表增量，已原样保留，没有回退或声称由本任务引入；本线程新增 fault 来源与原附件复用边界与其共存，未统一构建验证。收到并发文件变更拒绝时，子线程重新读取后只做本任务的局部替换。研发冻结时须包括这些并行差异，不把旧编译物当作本轮源码。

正式源文件官方引擎复验、节点事实真实先落盘可见性、受管报告构建、平台激活、定向实例重载、草稿绑定及新 Session 业务验收均交研发。真实管理响应和主动原子缺失时，应按原事实输出 incomplete，不能据根流程执行完成宣称业务通过。

待统一运行的技术回归包括上述新报告来源及原报告三份测试、两包合同、相关 Guard 测试。已有子 Guard 的 threat 单次断言与当前实现存在静态不一致，本轮保留无关代码/标准，不据此宣称全量测试通过；研发若运行全量应分开归因。业务用例及必要 inspection/legacy/主助手补证/原生下载回归只引用共用用例源，不在本文另造用例或执行结果。
