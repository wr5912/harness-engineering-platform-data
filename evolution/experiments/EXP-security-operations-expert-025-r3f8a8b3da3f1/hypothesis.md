# EXP-security-operations-expert-025-r3f8a8b3da3f1

固定父版与继承来源见 [change.yaml](change.yaml)。

## 研究问题

新增策略配置能力并融合应急指令与响应处置后，安全运营各场景的权限边界、确认流程与既有研判、巡检、问答能力能否保持正确。

## 假设

- 应急处置：DSH 通过一个聚合 OpenAPI 接入 Platform，Platform 用 SOC REST + `X-API-Key` 直连 SOC；应保持研判→预览→草案→原生确认→执行→结果的完整链路。
- 策略配置：在应急处置聚合链路上继续增加策略配置能力；应保持策略预览、候选选择、草稿、提交、审批与执行的权限边界。
- 既有能力：EXP024 已融合的研判、巡检、问答、受控身份和 MCP 分组 v2 不应回退。

## 范围

- 阶段一（本分支当前提交）：应急处置聚合 MCP、SOC REST 直连、操作名解析、A0 研判摘要/处置建议前置、seed 聚合配置。
- 阶段二（待补）：策略配置的 SOC 直连、策略组/seed、策略确认与审批链路。
- 两阶段都完成前，本 Experiment 不合并到 main。

## 不回归

- 威胁研判摘要与报告下载；
- 巡检 MCP 工具与报告；
- 既有原生确认面板；
- EXP024 的 voice、mcp-manager、mcp-tool-identity 等资产。

## 停止条件

- 任一阶段出现权限边界扩大、确认被绕过、既有研判/巡检回归；
- 聚合 OpenAPI 缺少约定工具，或 SOC REST 认证/寻址无法稳定复现；
- 本地模型环境 `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_API_KEY` 缺失，导致评测无法执行（记录为环境阻塞，不伪造通过）。

## 来源取舍

- 父版：EXP024（`git:d2a93bf93f9713cc4b781e134e5a49b45cc1ec38`）；
- 应急代码来源：旧 EXP021 r249 的 `disposition-runtime`、A0、seed 改造；
- 只移植应急相关文件，不覆盖 EXP024 的融合资产。

## 阶段一完成标准

- resolver 测试 5/5；
- A0 摘要/建议测试 2/2；
- 应急处置实测：研判→预览→草案→面板→执行成功；
- seed YAML 可解析，组内含 7 工具 + 4 个研判资源模板。

## 续作：威胁研判后的规则建议

用户明确授权继续修改本独立研究Candidate，并接受其他共享EXP025实例受影响；仅主动重载threat-analysis-test001，不更改启用版本EXP024。本节不替代前述应急/策略研究，也不宣称其已完成。

研究问题：在基础威胁研判冻结后，以案内规则身份、历史命中快照、当前定义和可追溯证据构造独立压缩上下文，第二阶段模型是否能输出可解释的规则建议，同时使规则采集、JSON或模型失败不改变基础结论和交付能力。

本次只实现后置阶段3–8，不改变基础取证、快速路由、基础提示词及机械校验；模型型号不主动更换。两个辅助目录可选，三项排除接口不接入，不增加SOC规则写入、DSL校验或启用权限。缺版本、抽样、预算和外部规则边界保持显式；本地JSON通过不能当作规则执行或效果证据。

具体业务输入与预期以Agent evaluation中的U-THREAT-RULE-REAL及所选回归Case为单一来源。Run冻结本次实际代码、Case和模型环境；独立研究实例的结果不替代指定业务实例的新会话证据，未覆盖的正向检测定义、窗口家族及效果回放保持未知。实际路由与约定型号不一致时，该轮不能支持同模型比较；失败和取消保留，不改写为通过。

## 2026-10-29续作：应急准备可用性与异步研判处置承接

用户明确选择直接续修共享EXP025独立Candidate，接受共享挂载实例受影响。本次不新建虚假固定父版，不更改启用EXP024、不覆盖EXP026，不提交、推送或合并。变更前Candidate摘要为`15bfdc6756a65ae9546c7a430d805e752d12480156c1645b20763ccc27f32c8e`（run-content-path-mode）；当前未提交工作树不宣称已固定或可完整恢复。

本次仅修改应急承接相关业务插件、技能及所需用例，保留策略配置、基础研判提示词、基础输出校验器和规则建议等并行改动。默认保持目标实例local/Qwen3.8-27B，不把其他模型评测当作同条件验收。

待验证假设：从真实用户请求、父子会话记录和子研判原始结构化回执绑定处置来源，可使异步完成后稳定进入一次安全准备，或明确交付校验失败、无可执行建议、下游不可用等停点，而不依赖主模型自由复述后决定是否追加调用。准备不得重新选择无绑定的最新研判结果；规则建议不作为应急动作。

完成目标：直接应急与研判并处置分别能达到有效草案及原生用户确认；重复完成通知、取消和重连不重复准备或下发。基础结果未通过校验、复合动作或语义不明时明确停止，不为通过而删除校验、把隔离静默改为IP封禁或伪造目录。

本轮只自动推进到草案和原生确认停点；真实确认及设备下发不由管理助手代用户执行。静态检查、实际装载、真实业务验证及UI确认分别记录。当前应急规范读取HTTP502，以及原生独立评测默认模型与目标实例不一致，是待解决的真实限制，不以Mock或异模型结果替代。

## 2026-10-29 规则建议三字段整改：实现及装载记录

本节仅对应[需求文档第三章](</opt/Coding/威胁研判后续开发.md>)及用户随后要求的原协议隔离与去除报告缺口表，不覆盖上节并行应急研究。具体输入与验收预期已在[Agent evaluation](</home/cmp/harness-engineering-platform-data/agents/security-operations-expert/evaluation.md>)新增U-THREAT-RULE-JSON3并回读；旧Case和已完成Run保持原冻结口径。

本轮通过平台预览、保存及摘要回读四个规则生成/接线/报告模块：对外只替换原rule_optimization_suggestions，其元素只保留rule_content、impact_scope、cannot_optimize_reason。非空正文必须为完整原生配置、能唯一绑定已冻结目标且存在实质逻辑差异；不能优化或阶段失败则为null正文和具体原因。内部模型封套及runtime/摘要只在独立本地制品，不再给业务run写入rule_optimization、base_result_sha256或替代元字段。原规则建议段展示同一JSON正文和两项说明，不渲染规则缺口ID/缺口代码/阶段表及全局规则运行态段。

[回读静态证据](</home/cmp/harness-engineering-platform-data/.local/artifacts/rule-suggestions-three-fields-20261029/postapply-static-check.json>)证明四文件与已审草稿逐字节一致、AST可解析；基础分析函数及原入口、提示词、校验器、存储与规则收集/桥接资产未由本次四文件整改改动。该证据未导入/执行Candidate、不等同模型生成或业务测试。保留其它场景和并行修改；不将本轮四文件检查扩称为整个共享Candidate的完整比较。

仅主动重载threat-analysis-test001，平台回执20053cf0-cbf0-4a69-85d9-8e0c0d4b532b及详情回读确认running、EXP025只读挂载、HOME保留、统一网关anonymous/development及原local/Qwen3.8-27B策略不变。当前Candidate总摘要观察为3d99a2ebbc3f8c71fe7d10567ebcb73c20fbcd62e8ec5a5e310cb87fad0e889c；这是未提交工作树观察，不是固定Git来源，也不保证后续并行修改不变。启用Agent仍为EXP024，未切换其它版本或主动重启其它实例。

当前结论维持inconclusive：源码保存及装载就绪，尚未取得本次三字段版本的新业务Run。此前ff4432e7及白名单e46f等是旧版记录，不能拿旧SOC实参证明本轮新增字段已消失。后续沿用户认可的指定实例新会话手测，回读真实SOC请求、JSON正文/原因及报告；null原因、JSON/载体/保存通过、完整优化规则实际生成和规则效果分别判断。不为凑正文制造不存在的缺陷，不重试错误型号独立评测，不执行SOC规则写入/启用或处置；未覆盖分支仍保留未知。

## 2026-10-29 应急续接：本次实施与验收状态

本节仅记录应急续接修复，不改变上述规则建议研究结论。沿用户继续授权在共享EXP025内实施，未更改启用版本或其它Experiment，未提交、推送、合并或创建Release。

### 保存与范围

五个相关模块已由平台预览/保存及摘要回读，内容与最终审稿一致：

| 模块 | 变更前SHA256 | 保存回读SHA256 |
|---|---|---|
| [承接校验](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/candidate/dsh/managed/continuation-helper.mjs>) | 原不存在 | 915a15db1ae876dc799ec3fb82224d78b5150d7d9c6ef8392eba77cf620aa212 |
| [处置运行时](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/candidate/dsh/managed/disposition-runtime/index.mjs>) | b2b58e1d2586542ca80f5db1d0c1931a92ed51f0ccf3df880c0cfe716d1867be | 357c6f51370a85bd2bb14d3fd0aabf7d18b828b808a4cc93717890e1d0ace759 |
| [原生交付器](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/candidate/dsh/managed/operation-result-delivery.mjs>) | 3b63ac6b461e4d5699f22a909985001db28a907ed0cdf7be0e527388ee533e33 | 83d7d11d4b4e70ea25891cd3dde2328bdc6243e27196a34491caf8814589c4f9 |
| [原生交互绑定](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/candidate/dsh/managed/emergency-confirmation-runtime.mjs>) | 343e2ebd1c0b99a28719a283c525d6445239fcadd232bb04722ed6fe24b864aa | a5b686d36b0281a5392fd84b4bd2678d3649506e9eeb97455b5c19d89c660ddd |
| [异步续接控制器](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/candidate/dsh/managed/threat-analysis.mjs>) | 9ad04eadbadaf1dfbc67e220686ec9f0562e2475f779a404e275efd471cedb26 | 86b680f8c54167550a26dbed1a795d9ac98a3d7dfe2d0d8e18f6a8ff25117a79 |

自动承接只使用本次原生直接委派、真实用户意图及子会话原始研判，拒绝最新结果替换、复合动作、非唯一映射和静默隔离替代；写入前再核真实落盘来源。未知写入结果不重试，只有READY/NOT_SUBMITTED且ready=true才交付待确认草案。未新增确认工具或业务操作账本；同操作/版本/摘要及同次不透明入队标记仅用于原生输送接管与定向回调撤销，不取消后端草案、不执行回调来清理、不删除别域或后换回调。

基础研判提示词与校验器未由本次改动；策略业务分支及规则建议并行资产保留，未执行策略测试。全文传参曾引入无关注释差异和一处原常量名拼写偏差，均已受控恢复并回读对齐，不以中间错误稿作为通过证据；未能证明中间稿是否曾被其它进程加载。

Candidate总摘要是阶段观察而非固定父版：2026-10-29T12:47:52.971Z为cf53135ec09be7a0e7a44dcc6d0bcdac269dc23e033cc4de8040bf5401e3f19d；2026-10-29T14:43:11.172Z为aa63a8755acf9a21965b97bc76ac959b2ef64b9de899ad815781248ffd785d04，均由tasks/capabilities返回，basis=run-content-path-mode。期间有规则建议并行变更，不把整个Candidate差异全部归于本次五文件；文件备件也不等于完整父版已可恢复。

### 目标启动与共享影响

仅主动重启emergency-action2，回执a9997221-3dc8-4388-883d-db066e63b11d确认running、listener_verified=true、HOME保留，仍挂载本EXP025、使用固定镜像687f282e8-amd64-cbfc10fa115b及原local/Qwen3.8-27B策略，访问保持统一网关anonymous/development。[目标入口](http://172.16.138.228:53105/agents/security-operations-expert/instances/emergency-action2/)。其它同源实例未由本次应急工作主动重载；共享宿主资产可见性不等于各进程已重新装载。

control/status核对目标runtimeGeneration=fd602d7b7093069b96795cc541a17c98、sourceDigest=sha256:d1e10a2da91a83a607b94bcf2cf8a7312761693531bd5ab290a5e03224a4ce91，信任为development-pinned-source/trusted、认证not_required，restrictions和riskFacts为空。未修改基础许可或治理配置；该回执不证明业务插件已激活或上游应急服务健康。启动日志仅listener/browser提示、stderr为空，也不足以证明真实工具装载。

### 未完成验收与下一必要条件

research/validate返回valid=true，仅为确定性合同检查，原ACTIVE_OUTCOME警告保留。源码格式/语法及保存回读通过，不等于实际装载、业务或UI通过。

本次最新真实复测仍有两个阻塞：emergency-action规范读取返回HTTP502（匿名访问）；以U-NEW-001、U-NEW-002及预期local/Qwen3.8-27B预览评测，返回“--model 与实例默认模型不一致；此参数只记录预期，不切换 Runtime”。未发eval/start，没有本次新Run，不把不传model的预检或其它模型结果当作同条件验收。

需要应急服务维护方提供既有来源的健康规范/实际转发路由及合法日志入口，不能猜测端口或绕过已拒绝的目录权限；另需匹配27B的受控评测入口，或经用户同意改为指定实例新会话手测及轨迹/UI取证。具体Case与预期仍以[Agent evaluation](</home/cmp/harness-engineering-platform-data/agents/security-operations-expert/evaluation.md>)为单处来源，不改失败输出作标准答案。

当前应急结论为inconclusive：直接入口有效草案、研判后一次准备、完整草案/影响/恢复展示与原生面板，以及忙父通知、重复通知、自定义补充后合法新版本、过期回调定向撤销、取消和重连等实际效果均尚未通过验收。身份或绑定不足不能宣称队列已清；其它原生权威输出优先时，本操作的停点不保证同一步可见。管理助手未自动生成确认输入、点击确认或下发设备，也未声称任务已全部完成。

## 2026-10-30 当前应急口径与回修结果

本节说明当前口径；上文整份校验失败、单条或复合描述导致停止的要求只保留为旧实施事实，不再作为当前续接准入。用户已明确：完整消费本次recommended_actions，复用已有分类、分组、映射和一次准备，能做的部分到草案、不能做提醒；本轮不重做兜底或批量系统。基础提示词、校验器及原始结果不改，不将失败标签改成通过。

真实会话session-b66ab5ed-fe46-40f4-b4d0-0b96f66aab86已查原始父子事件：原生完成通知后控制器实际触发，但本次run-bc12528e-c27a-43c0-9454-fc85160c107d的validation=failed、错误secondary_findings.type lacks attack semantic、类型主机信息收集，旧续接在预览/准备前停止。此停点不是正常功能通过；不拿其它旧Run代替本次证据。

### 最终保存与范围

| 资产 | 保存回读SHA256 | 最终保存回执 |
|---|---|---|
| [续接助手](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/candidate/dsh/managed/continuation-helper.mjs>) | d34d696361ba74f2ef33426886992f5d52d4c0d18eae401108baf73d03491221 | 8954d7a1-5922-4f62-827c-177b926d5093 |
| [处置运行时](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/candidate/dsh/managed/disposition-runtime/index.mjs>) | efee138b45f612fa081dd841d341124d4382d10d045027375d7af549289024f9 | 887733b1-308d-4bb7-836c-03ca6743cbdc |

两稿均已真实平台预览、保存和原生回读，逐字节匹配审稿；全文传参的一处提示文案漂移已恢复。其它三个应急模块仍为上表历史记录中的83d7d1...、a5b686...、86b680...，未由本次两文件回修改变，规则建议与策略并行内容保留。

续接不再以整份validation状态、建议条数、并/及措辞否决，不再重复覆盖旧映射的fallback或另造穷尽候选准入。完整建议和分组保留，原查询/解析器负责目标匹配。准备仍是一次选择一个原可执行项；明确显示实际动作、尚未准备项及临时阻断不等同网络隔离，不宣称整条复合建议已完成。保留本次来源、映射快照、取消和避免重复写入；准备服务发现只在创建前，不拖只读预览。直接准备补齐原生会话参数，真实004句式及并且处置不再因该连接方式误拒。上述实现与静态复核不是装载或业务证明。

需求与Case仍在[Agent evaluation](</home/cmp/harness-engineering-platform-data/agents/security-operations-expert/evaluation.md>)单处维护。U-NEW-002已按用户新口径更新、原005输入保留；新增U-NEW-004覆盖用户真实004原句，保存回读当时摘要为987a9cc2472ea3208b69e9690aba490f88bed1925692dd08d4cffca130c6ea9e。旧Run不改写，新比较需冻结本次资产、Case与同一模型条件。

### 装载依赖与未完成验收

仅尝试重载emergency-action2，回执cf4b108b-c942-41ea-9357-d4f91848f762明确失败：业务Runtime配置或MCP专用凭据目录尚未prepare。未无变化重放restart。2026-10-30T05:26:38.900172Z详情仍为原容器cf74f7772001、running/Up4hours、HOME保留、local/Qwen3.8-27B及统一网关anonymous/development不变；新源码实际装载未证。

只读当前启动检查与公开布局常量，并仅检查路径元数据，确认新MCP专用目录/文件缺失、旧普通文件仍在，与启动拒绝条件吻合。官方实现规定迁移只由平台prepare执行；未读凭据内容、搬迁密钥、造空目录、修改程序、安装构建或关网关绕过。当前程序工作树观察不冒称固定运行提交。

最近原生测试中，emergency-action现配26100规范仍HTTP502；ai-soc-response规范和动作目录GET业务code=200，仅证明该只读边界可用，不证明草案链路。26100属主不能证明它就是zhouyang应使用的服务；正确服务来源仍需核实，不能猜端口或绕已拒权限。Issue #113正文和修复说明尚不可读，不能把接口健康基线称为该Issue联验通过。

当前应急结论仍为inconclusive：最终源码已保存，装载和正向业务未通过。需要平台维护侧完成官方prepare迁移、提供既有应急服务的健康入口后，再以指定27B实例新会话验证实际预览/准备、完整草案及原生面板。没有本次新评测Run，没有模拟确认或设备下发；语法、保存、只读目录成功或安全停止均不能替代完整任务通过。
