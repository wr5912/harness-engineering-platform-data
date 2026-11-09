# 53105人工验收故障与发布冻结协调

当前协调状态：用户已要求根会话持续推进统一真实业务复验；资产会话本轮仅只读核查ASSET-HV-02有效分组装配并接续交接。Candidate及共用evaluation.md仍冻结，不恢复旧目标/子任务，不构建、装载、代发扫描或入库；53105超时及在途巡检Run由根在安全巡检会话核对，不重发或重载打断。保留并行修改、HOME、会话、Run、模型与端口，历史暂停/解除安排均按各阶段记录解释。

对象：网络安全运营专家，EXP-security-operations-expert-027-f-r3ba4799b0cb7（陈飞）；现有实例 inspection-027-schedule-acceptance。业务入口为用户指定的53105聊天入口。本文记录本批人工验收与本管理会话操作，不替代原会话、原运行或平台审计。

## R6两IP专项补证：数据失败；400为MCP调度状态，原HTTP/业务码未留存

- 原`run-aadee099-5c71-4bea-88c4-a7e34b018a1a`已公开只读回读：`completed`，业务`incomplete`，2 failed；冻结10:39:21.636Z，范围恰为3617468/172.16.2.170和3617471/172.16.2.114，10:40:29.643Z结束。固定漏洞版本`475681fc4867f7f4db38ede402caa66441e78a3c1bf986753d334ed656c1e4e2`，implementation=`243c0ec9bcfaf31728b84f8f574a491490904ed94c3e1a1ae8d74ab905f2fbd0`。指标requests=4、peak_concurrency=2，不把逻辑请求计数冒充4份HTTP回执。
- 根已实际原生下载70949字节HTML，SHA256=`55471f258d7483d6c3f6e08249c5cfe69d0132576d9e59be82bf1441d5b3498c`。范围、执行结束、聊天交付及下载分别保留正证；findings/sources均空且两项failed，不表示漏洞消失、无漏洞或数据查询成功，也不覆盖R3曾取得60/43条的历史。没有调用扫描下发接口。
- 已从原Run读取root两行：各自保留`接口调用失败：ai-soc-master/get_soc_asset_registration_children（400）`以及`资产 {assetId}：接口调用失败：ai-soc-master/get_soc_asset_vulnerabilities（400）`。本轮没有重新发SOC请求来替代历史证据。

### 输入契约与路径映射核对

复用R7调查已取得的公开MCP目录，不再次请求业务接口：

| 操作 | 本批目录输入 | 固定组件应生成参数（非原HTTP抓包） | 具体HTTP路径 |
| --- | --- | --- | --- |
| get_soc_asset_registration_children | assetId必填integer；page可选integer、默认1；目录同时存在工具与资源模板 | 分别`{assetId:3617468,page:1}`、`{assetId:3617471,page:1}` | GET `http://172.16.138.223:18087/soc/asset/registration/{assetId}/children?page=1` |
| get_soc_asset_vulnerabilities | assetId必填integer | 分别`{assetId:3617468}`、`{assetId:3617471}` | GET `http://172.16.138.223:18087/soc/asset/{assetId}/vulnerabilities` |

未发现上述参数与当前已取得目录存在明显类型/必填字段矛盾。固定连接为`master=ai-soc-master`。原始逐调用参数、实际展开URI、当时发现目录与原HTTP响应没有单独保存，不能用当前契约补作历史HTTP证据。连接适配器优先选择工具，否则回退资源/模板，不能仅凭当前目录认定R6当时必走某一个表面或擅自改类型、改操作名。

### 400的确切层级及留存缺口

1. 包装字符串直接来自[createSoc](</home/cmp/harness-engineering-platform-data/mcp/src/soc.ts#L41-L47>)：只有`dispatch`的`reply.status>=400`才生成该“接口调用失败…（400）”，并把`reply.value`附到异常的receipt。故可确认**MCP调度返回400**，不是已证实SOC HTTP400或业务code400。
2. [平台复用的dispatch桥](</home/cmp/work/harness-engineering-platform/platform/plugin/build.mjs#L58-L74>)会把捕获异常统一返回`status:400,value:{error:原message}`；原管理分支亦有参数校验400。[公开提供者](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L859-L885>)的工具/资源正常分支返回调度200。资源上游非2xx会先抛`Resource 读取失败：HTTP ...`，再可能被调度包装为400；超时、规格/模板处理或本地异常也可成为相同400。**包装码不能区分这些原因。**
3. 固定漏洞组件只把异常message保存到行错误，未保留receipt、HTTP状态、业务码、cause或请求关联；这就是已确定的信息丢失点。原子错误未留存，本轮不能把原400还原为某个具体底层异常。
4. 节点时间显示children和observations分别约31秒；[连接适配器](</home/cmp/harness-engineering-platform-data/mcp/src/soc.ts#L45-L46>)给dispatch设30秒，平台桥把该期限用于来源请求。时间接近支持检查超时链，但不足以判定本次必为超时，更不能把R7的20秒创建超时与R6合并为同一已确诊故障。

### 若实施新修复：先采用的最小范围（本轮未改源码/未装载）

第一步仅限`mcp/src/soc.ts`及现有`mcp/tests/test.mjs`：沿既有错误出口保留原`reply.value.error`/receipt中的脱敏异常，明确“调度状态”与“上游HTTP/业务码是否已取得”，附现有connection、operation、目标assetId；不新增API/权限/依赖/公开入参，不改原历史Run。离线回归区分：调度400包裹超时、资源HTTP非2xx被包装、业务code失败、工具isError及正常数据，并核对两项参数/URI映射。

只有原错误本身仍缺阶段时，第二步才评估现有组/OpenAPI错误链的脱敏phase与已有HTTP/request-id透传，保持现公共状态规则；不通过增时、改参数类型、换接口或关闭校验掩盖原因。先给出具体diff与检查，再由根确认空闲装载窗口；保留CF成果、原报告及所有关系证据。

## R7真实复验：ASSET-HV-02技术接线已加载，创建调用超时且SOC受理未知

R7优先于下文“待根复验”：原会话`session-156acd06-4963-4d31-828d-8e0d33c0a3b7`10:33:31Z请求172.16.138.1–254仅发现、不入库。真实`asset_onboarding`回执`kind=discovery`、`evidence_id=bba8db139bd81e7fd2aeebb6b6fc5ba6a0af8c5ce1cb1910ab8ba2c17a107438`、`state=unknown`、`reason=The operation was aborted due to timeout`、`evidence_complete=false`、`saved=false`、`autoAdopt=false`，无taskId。没有再次创建，本轮业务未通过；技术接线/类型/Mock通过不能替代SOC任务受理。

### 已有链路与阶段定位（只读，无create/start重发）

- 原生完整事件seq154：10:33:39.886Z，`call_2c98c1e643344ee6bf83edb4`，实参`{"action":"discover","ranges":"172.16.138.1-172.16.138.254"}`；seq156于10:34:00.542Z返回上述unknown，工具调用耗时20.656秒，根所述整轮74秒另含模型/交互时间。
- [实际源码](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L359-L397>)在写pending及进入创建try之前已完成create/start两项lookup，故初始组目录预检查已过。其后仅await`create_soc_discovery_tasks`；本地[journal原字节](</home/cmp/harness-engineering-platform-data/.local/instances/inspection-027-schedule-acceptance/dsh-home/asset-onboarding/9787cc62002f56fc73cfdfe4f3981fa93d3d308e56760afd2c92fff2017176ad/discovery-b40310e99178cee53e9edaf3bbd9a6d644d029e7a084a09c92c2766cca3dcbd2.json>)与工具回执一致，连taskId/null及facts.prepared字段都没有。可确定创建调用没有向高层返回可解析prepared，客户端未进入后续start或任务资源查询；不能据此断言组调用内部未尝试POST，或SOC没有创建任务。
- 本地evidence_id是原会话/消息/范围的hash，不是SOC受理号；`saved=false`指未纳管保存，不等于本地journal不存在。已有实现本来会在成功取得taskId及previewHash后、start之前写入中间状态；本轮没有可恢复的taskId，不能伪造或补写。
- seq159的实际后续实参仅`{"action":"query"}`，`call_242c207f69e346bab3c5961c`；seq161本地拒绝“只能查询本会话已受理的发现任务”。该次没有task_id，没有执行SOC GET，不是SOC查询失败或“任务不存在”证明。
- 现有[OpenAPI请求信号](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/openapi.ts#L8-L10>)默认20秒，规范发现及业务请求均可能用该边界。20.656秒与此吻合，但没有阶段化底层回执，不能只凭耗时把超时唯一归为SOC POST；外层高层工具timeout是120秒，本轮不是该外层超时。组调用还可能在内部重新解析来源/规格，原日志未区分。
- 已检索既有平台服务日志中的evidence/call/时间窗及公开实例日志；无可归属请求栈、HTTP/业务码或SOC关联号，实例日志仅启动/模型目录。未新增日志即不反证当时未请求。

### 现有只读任务核查与SOC配合清单

本方仅用公开目录核对接口（未执行创建）：`ai-soc-master`的`create_soc_discovery_tasks`为**POST http://172.16.138.223:18087/soc/discovery/tasks**；本轮高层意图为`includedRanges=172.16.138.1-172.16.138.254, autoAdopt=false`，排除范围为空。工具输入提供这些字段，不新增认证/公开参数。原生callId仅为本地关联，未证明已透传到SOC。

目录现有只读资源`get_soc_discovery_tasks_mine`为**GET http://172.16.138.223:18087/soc/discovery/tasks/mine?bucket=active&page=1**。本方只读调用得到`mcp_operation_failed / The operation was aborted due to timeout`，details为空，没有HTTP状态、业务码或列表；不能称返回空列表，也不能据当前身份列表证明原请求不存在。现有按ID查询为`GET /soc/discovery/tasks/{taskId}`，因没有已核ID未猜测调用，没有新建、start、探测或入库。

请SOC维护方以**2026-11-07T10:33:39.886–10:34:00.542Z**、上述POST路径、已配置平台调用身份、范围及`autoAdopt=false`核对接入/应用/持久化日志：①是否收到原请求及原request/trace关联；②是否已持久化任务，若是提供真实taskId、创建时间、状态及原HTTP/业务响应；③是否仅响应超时/丢失，还是规范解析、鉴权、创建事务或依赖异常；④现有任务GET返回同次目标/已扫/成功/失败/候选计数及终态。若确认未创建，须给原异常和可证实无落库边界，再由根决定是否另行授权新请求；unknown期间不重发。现在只可判为**创建调用链超时且受理未知**，尚不能确诊SOC实现缺陷或平台连接缺陷，更不能标HTTP500。

### 已确定的平台最小补强范围（未擅自实施/装载）

1. 在既有资产运行时journal/回执记录操作级阶段、原native callId、原操作与目标引用，区分目录预检查、create调用中、已获taskId、start调用中及查询；只保存已得到的中间事实，不新增API/权限/依赖/公开入参，不用阶段名冒充SOC已收到。保留当前pending防重发及start前持久化。
2. 现有组/OpenAPI错误链保留脱敏phase、已有HTTP/业务码、已有request-id及底层cause；凭据/完整认证头不入日志。没有收到响应就明确码未知，不以增大20秒超时或关闭校验替代根因。
3. 若未来已在本会话journal真实保存taskId但原工具回执被中断，查询恢复可核对该原journal，而非仅依赖模型看到的历史tool/result；不得放开为任意taskId。此为恢复缺口建议，**不能据此为本轮补造受理**。查到原任务后仅恢复同次查询，不自动start。

R5原报告问答及CF工作线保持；本轮只读追查，不构建/重载、改报告或触及巡检别名/发布规则。原生R7证据、journal及上述只读失败保留，等待根/SOC同次关联回执。

## ASSET-HV-02最新：10:26仅027已受管加载，原138发现待根真实复验

根10:17:39Z核实前次6da回执后，本方重新公开detail/preview确认`6da9deb8…53332c`为current/verified、无维护在途、报告差异为空，才推进本次唯一实例应用；不沿用旧running状态。没有修改CF巡检别名/发布规则，没有部署232/52或切换共享HEP。

- 本批程序仍为既有[管理包装](</home/cmp/work/harness-engineering-platform/platform/plugin/src/mcp/manager.ts>)、[业务装配](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/business.ts>)及[包装回归](</home/cmp/work/harness-engineering-platform/platform/plugin/test/business-mcp-overlay.test.mjs>)、[装配回归](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/test_business.mjs>)。保留官方原生提供者在`currentServer`先检查旧目标的并行一行修复；本方只在测试夹具补正常控制通道心跳，生产2秒期限、isError、零请求及停用断言不改。**最新源码MCP3/3、装配23/23、类型及空白检查均exit0**；此前2/1及原始失败保留为历史，不覆盖日志。[本次精确diff](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/asset02-ready/source.diff>)、[文件SHA](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/asset02-ready/source-sha256.json>)、[检查回执摘要](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/asset02-ready/checks.json>)。
- 现有程序制品已含依赖解析；本次直接复用，不重新构建程序或MCP数据扩展。实际observer加载`/opt/harness-platform/lib/mcp-manager.js` SHA=`27995ea90173f595a4c9d3eaee6633904b0f499c3ca171acbd09158bb3b834bf`、business薄入口SHA=`22a323505ed6fd630d7a110f0319a9477f6ecbf9ea2a916997df1c113253c63e`。不凭函数名冒充已加载，以上来自本次真实加载清单。
- Candidate仅向[既有seed](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/web-profile.seed.patch.yml>)追加明确组引用；连接/凭据仍取平台原`ai-soc-master`，不增加raw成员客户端。原字节SHA=`d46b154f3420f69a29145bb6a2fb65bb7a5b4766176f8425fe35c6a7cc48353c`，新实际字节SHA=`fecae8597ca42ad3ec03b391cf012de29cc8ab3666f2da2732063d12a04e0ca6`；[原字节](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/candidate-seed.before.yml>)已保留。真实六动作/一模板经依赖解析后通过同一原生schema（exit0、网络请求0）；孤立未解析声明仍按原校验拒绝，不恢复旧包装下的无效种子。
- 追加后公开preview唯一变化为seed，计划摘要f25a45c6…；实际受管reload内部重算并核验，最终以**`loaded=current=sha256:11945c0ebb824528732190185efdaf4ae10b069bf86cf737c101eeb0cb361633`**为准，不能把预览摘要当已加载。`loaded_at=2026-11-07T10:26:42.924Z`，容器`ce1e49cb07465da159483bd60102b8d99a6aee1c4e424b7ce03900a8f2b7e2b8`、启动10:26:32.995347927Z，10:31:21Z公开detail仍current/verified、changed_files=[]。操作回执`48bf45bb-4e8c-439e-a25f-f304460495db`；原HOME/会话/模型/计划/18502与53105保留，只替换027业务容器。
- 已回读生成的有效组声明：`asset-management`唯一成员`ai-soc-master`，仅`create_soc_asset_probe`、`create_soc_discovery_identify`、`create_soc_discovery_tasks`、`start_soc_discovery_tasks`、`create_soc_discovery_tasks_adopt`、`create_soc_asset`及原任务模板`http://172.16.138.223:18087/soc/discovery/tasks/{taskId}`；resourceUris为空，原应急组保留，新增raw成员客户端0。这里是**实际生成装配选择**，不是模型会话已发现七项或SOC已完成的替代证据。
- reload后business source=`sha256:bc96cf04686f70b73cd6dfa3b5ca14d47856a482d9304dd871fb89f206d5413a`。已用既有公开`bindCompositionDrafts`仅重绑两故障草稿，回执`f1d7c839-bd27-4209-af23-977dd0d7175b`；回读确认完整config及implementationDigest与[应用前原字节](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/asset02-ready/pre-apply-fault-binding.json>)完全相同，仅sourceDigest更新。仍为`diagnose_business_access`/`4bae33c08fee8c2fdcfcda9f92016811476fd43016bb5c30af7839d690ee36af`、`diagnose_device_offline`/`f6e23faef0d0813d8684af6e060e55a0646b3cc94152a4c03df025d29f90a180`，未发布、未加入常规巡检同名草稿。[脱敏实际应用回执](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/asset02-ready/applied-receipt.json>)。

**交还根原156业务会话复验**：本方未创建/开始/查询SOC发现任务、未入库。请根仅在原授权172.16.138.1–254范围发现，保留真实taskId、创建/开始/查询回执、目标/已扫/成功/失败/候选计数；目录错误、受理、终态及业务完成分别判断，未知写入不换号重发。入库继续禁止。发现未通过前不发送飞书完成通知。

INS14已核固定漏洞子版本支持合法宿主/直接子资产聚合，多宿主乱序官方LFX回归1/1、exit0；尚无证据把不同sourceAssetId定为并发污染或SOC串数据。其后本方在[mcp漏洞源码](</home/cmp/harness-engineering-platform-data/mcp/compositions/inspection-vulnerabilities/src/index.ts>)、[共享读取源码](</home/cmp/harness-engineering-platform-data/mcp/src/inspection/index.ts>)保留了未收口的来源证据/错误定位小改，以及[对应回归](</home/cmp/harness-engineering-platform-data/mcp/tests/test.mjs>)；不计为本次已验证资产修复，不在本次构建/发布，后续单独收口，不能无声夹带。原字节位于[INS14快照指纹](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/ins-hv-14-before/sha256.json>)，保留他方新中文报告模板及既有R5下载证据。

## 2026-11-07只读收口：INS-HV-13阶段对照、程序四文件及未解释失败

本节为最新阶段事实；下文07:25、06:30等记录按历史时点保留。本批后续未修改seed、权限、公共契约或流程源，未构建激活、重载、重发SOC、启动Evaluation或恢复旧目标/子任务。仅按根授权补本文及仓库外隔离复现。

### INS-HV-13：09:19旧会话目录缺失，不等于最终装载后的当前目录缺失

- **原问题与原始错误**：原深度会话`session-0d6ea58e-9cfa-44a4-beab-aa5c64012edc`在09:19:23Z提交全设备深度请求。已只读核对完整原生串联压缩事件：会话为`agentPreset=security-operations-expert`、`delegationDepth=0`；09:19:27.808Z的`request/header` seq322有139项工具，但没有任何组合工具或MCP资源通用工具。seq323新增4项为直连`ai-soc-correlate`，移除30项为巡检8项、应急11项、策略8项及资源通用3项。不是“新增两故障组合并只移除深度”。
- seq326/331/336分别返回`ToolNotFoundError / UNKNOWN_TOOL`：`unknown tool "mcp__inspection-compositions__inspection_deep"`、`unknown tool "mcp__inspection-compositions__get_composition_run"`、`unknown tool "list_mcp_resources"`。该轮没有新runId、未到SOC；与08:13旧深度TaskGroup失败分开，不以无Run解释为SOC零结果。
- **明确的新对照**：根已核原始MCP accepted：最终装载后新会话`session-ebff85f6-f45d-4af1-8191-2b815d8686d3`于09:30:39.378Z通过同名`mcp__inspection-compositions__inspection_deep`受理`run-d4eb2c99-ad5f-4786-b13c-e60c13faf889`，冻结105台；versionId=`9c4007b5c98793c841a86f768bdf45d2184b712d7235f9631c18e18dcab484b6`，implementation=`91eb787f73cd4ba47a7b70036bc383a4bfc5c2e6103619a104904a1e08736cb9`。这是根的真实受理证据，不是本方代验，也不证明完成或报告交付。
- 本方09:43:35Z公开detail确认：`loaded=current=sha256:40c70d3701fbf095eb9d92baeff6b54f772b2ba597b86c886b314a78c5b7ef4e`、`current/verified`、`changed_files=[]`；装载09:24:07.175Z，容器`07f957d3f706…`。因此09:19故障发生在这次最终装载之前。09:11:28的`e01e3655…`代次与最终40c70d37代次不能混用。新装载与新会话同时变化，尚无同代对照把原因单独归为缓存、绑定或目录重建。
- **配置/命名只读对照**：生成业务Patch仍声明`inspection-compositions`和`troubleshooting-compositions`两客户端；已保存巡检组仍选择五执行`inspection_routine/deep/vulnerabilities/baseline/reachability`及三查询`get_composition_run/artifact/details`。两故障草稿绑定存在；本次后续观测中实例生成binding、网关和草稿绑定曾同为`sha256:81b68aff653c951a68d6090fb8451def381ac39ff3a40c833fee975095fe719e`，这是业务来源摘要，不能冒充loaded摘要或回填09:19当时值。早读草稿曾为a600254d…，说明维护阶段发生过切换，不能仅凭现在一致反证当时一致。[巡检Skill](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/security-inspection/SKILL.md>)所用工具名未发现与上述正式名不符。
- **影响、处理方及闭环**：保留为旧会话/装载阶段的本地工具暴露故障，根与既有公共MCP接线维护方接续；不能认定故障绑定覆盖巡检，也不能认定当前目录必然丢失。现不提出额外配置或权限修改。若同代再次复现，最小排查范围为现有公共分组客户端发现/挂载与会话作用域生命周期；[原生挂载入口](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L998-L1063>)异步发现失败仅输出通用装载警告，尚缺具体serverId/底层cause。先取既有失败回执再决定最小修改，不新增预检工具、不全局暴露、不覆盖流程源。闭环须证明同代既有常规、深度、漏洞、基线、可达及两故障场景可同时暴露且互不覆盖；当前仅深度新会话入口受理有新正证。状态专项退役争议仍为INS09，不用常规替代。
- 受理后SSE断线、正文半句停止及根仅点原生立即重连继续归PLAT01；不重发启动。根正在追踪上述唯一新深度，本方不查询接管或新增业务。

### ASSET-HV-02程序四文件：精确交付与并行变化

本批已保存[manager.ts](</home/cmp/work/harness-engineering-platform/platform/plugin/src/mcp/manager.ts>)、[business.ts](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/business.ts>)、[业务MCP回归](</home/cmp/work/harness-engineering-platform/platform/plugin/test/business-mcp-overlay.test.mjs>)、[业务装配回归](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/test_business.mjs>)；通用程序无资产组名硬编码。声明依赖解析后再交同一原生schema校验，平台选择取交集，内部成员不新增为主/子底层客户端，原已保留设置不覆盖。[精确本次diff](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/final-source.diff>)相对接手原字节生成，保留此前并行增量；[已测文件SHA](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/final-source-sha256.json>)与[原字节回退指纹](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/before-sha256.json>)定位同目录before/镜像。回退前核对当前摘要，仅反向本次diff，不整文件覆盖后续他方修改。

- 装配23通过/0失败，exit0；资产消费者19通过/0失败，exit0；类型`tsc --noEmit`及diff检查exit0。
- 已测源码MCP为2通过/1失败，exit1，见[原日志](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/final-source-tests-v2.log>)。通过含声明解析后的真实原生schema、内存六动作＋一模板、缺组/成员、取消、未知Session和不新增主子客户端；不是SOC完成。
- 两程序源SHA分别`41b29986dc8c730b42112b8ca0d3b704d0fc5c1f3f54294ec6b3082eb5f15c68`、`9d87bfa138c90f1e3a448dce1a0c2c3a92401d3f518292890603a7f3f73d0947`；装配测试为`db3722fa8e1ffb3e5037e3398521e716fbc514bc752997ff8006187b4cc4cb2a`。MCP测试已测快照为`83fad3042e862ba714476a5e59d343c9ea18a1bdd7041fc209a484424cd9fe8b`，后续只读见他方改为`838ddfdb919c31566b7b555c43c637545b56282aa7832de64c1e44a2c3c432b9`（移除可选基线入口，并加入另一拒绝文案匹配）；全部保留，不能把原2/1结果自动算作现文件通过。见[并行观察指纹](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/impact-current-source-sha256.json>)。
- seed回改有根独立UI回执，已停写且不重加。最后只读原字节SHA为`d46b154f3420f69a29145bb6a2fb65bb7a5b4766176f8425fe35c6a7cc48353c`。[引用建议diff](</home/cmp/work/harness-engineering-platform/.local/asset-hv-02-provider-projection-20261107/source-reference.proposed.diff>)未应用，只能与新包装先解析依赖的接线同批核对；孤立旧段缺成员连接，原生校验确实非法，不能单独部署或降低校验。

### 旧Session断言：历史失败与此次隔离返回分别保留

原输入：`session-A`已装载固定Candidate工具名`mcp__candidate-name__echo`；平台把同一source的specUrl从fixture的`/a/openapi.json`改为`/b/openapi.json`并更新fixture凭据，再用旧agent、原callId和signal执行echo。原line276预期顶层`oldCall.isError === true`，随后预期错误包含“目标已变化/已停用”、HTTP账本为空。历史运行实际断言为`false !== true`，当时未捕获完整oldCall，不据此断言已放行，也不能用后续复现抹除；修改前源码也有失败记录。

本次只在仓库外复制夹具、保留上述原断言并输出回执，得到`{"isError":true,"error":{"message":"MCP 当前连接或工具范围已变化"},"content":[{"type":"text","text":"Error: MCP 当前连接或工具范围已变化"}]}`，`calls=[]`；exit1停在原错误文案正则而非line276。本次确为拒绝、没有触达新目标。最小建议仅在既有维护方确认当前真实契约后兼容该拒绝文案，同时保留isError和零请求断言；本方不修改权限/公共契约，也不把历史false失败宣布解决。[仓库外原日志](</tmp/asset-hv-02-session-audit-ry176rmu/result.log>)。

### 可达失败Run：执行阶段及底层原因仍有留存缺口

原`run-b2b8ac7a-f7d6-47fd-bae0-c628c0943080`、accepted执行号`call-df1201232b2d57c7bfe8f4a704c6db538b8a52963a502cff9d76cc9a3afba562`，07:58:41.561–43.681Z失败。保留根原查询：冻结105、root明细total=0、只有`fetch failed`、无endpoint/cause/HTTP/trace及报告。只读既有平台服务日志检索该Run、call及时间窗未命中；目标公开容器日志仅启动/模型目录信息，未提供可归属的底层异常。当前日志不能反证当时没有请求或异常，也不能从另一TaskGroup失败类推此Run。

[既有LFX桥](</home/cmp/work/harness-engineering-platform/platform/plugin/src/mcp/lfx-runtime.ts#L88-L114>)存在运行登记、上传、工作流流式执行及回调等多个网络边界，回调错误也仅保留message。静态路径不足以把这个`fetch failed`唯一归到内部LFX、回调或具体SOC接口；失败阶段只能确定为已受理后的执行失败，精确阶段、脱敏底层cause和责任接口仍未知。不以静态ai-soc连接标注推断SOC缺陷，不重发或新增业务。

### 受管程序影响与在途边界

- [受管update激活规则](</home/cmp/work/harness-engineering-platform/platform/deploy/update.mts#L300-L320>)仅纯client制品走HMR、纯sdk-worker走下次SDK；本批服务端manager制品不属这两类，应用需要`managed-restart`，涉及共享HEP管理进程，不能承诺对其他管理会话/实例控制零影响。只读dry-run不构建不应用；此前预览句柄在执行器恢复后不可查询，未取得完整busy清单，不能宣称全局空闲。
- 业务容器只读挂载[共享程序插件目录](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/business.ts#L261-L268>)。仅目标实例reload不必主动重启其它业务容器，但共享程序制品替换并非目标实例私有；其它实例后续新Session/重载可能读取新制品，需唯一研发核对正常路径，不能称影响只限027。
- 本方所有可查询本地检查/审计job已终态，无本方构建/装载/业务在途；这不等于其他维护会话或全局业务空闲。根已明确唯一新深度Run在追踪，当前不激活或重载。原生轨迹完整审计为exit2（54边界、62项审计错误，含selected_tool_not_in_header及未支持事件/内容块），仅逐条核实上述请求目录和工具错误，不宣称整条轨迹审计通过。

## ASSET-HV-02接续：07:25已加载，23:52真实失败为有效分组缺项

根会话提供：2026-11-06 23:52 America/Los_Angeles，原session-156acd06-4963-4d31-828d-8e0d33c0a3b7新发138.1–254只发现不入库，真实discover报“MCP 分组不存在”。新status为binding_error=ASSET_GROUP_DIRECTORY_UNAVAILABLE、transport=group-v2-public-service、group_api_supported=true、local_tool_registration_required=false；六项0、模板unavailable，无SOC请求/taskId。私有v2路径已经实际生效，失败点移到有效provider找不到组，不是SOC扫描0结果，57项Mock通过不能代替这一新业务失败。

本方公开实例只读复核（2026-11-07T07:57:48.089Z）：current_digest=loaded.digest=sha256:4430dde3cfc518a720f953c54cea58d3f6a040899d13ad78b203f670c7fa494e、status=current、changed_files=[]，loaded_at=07:25:29.192Z。确认本轮不再是旧06:30资产TS不一致的unknown；后者保留为历史，不能套用到本次。

### 现行源码、生成模块与有效投影：仍缺，不是只待激活

- 本轮重新读取[manager.ts:81–87](</home/cmp/work/harness-engineering-platform/platform/plugin/src/mcp/manager.ts#L81-L87>)：businessRuntime分支仅重写servers，groups仍继承suppliedConfig；只有非业务分支才取store.view().value.groups。[已生成模块:6611–6618](</home/cmp/work/harness-engineering-platform/platform/plugin/lib/mcp-manager.js#L6611-L6618>)完全同态。当前已审源码和生成物均尚无该groups投影修复，不能答“已修只需激活”。
- 只读检索[实例生成Patch非敏感选择键](</home/cmp/harness-engineering-platform-data/.local/instances/inspection-027-schedule-acceptance/business.patch.yml#L75-L193>)（未读HOME、认证值或headers）：business-mcp-manager.config.servers仍8项，无id=ai-soc-master，也无asset-management客户端；config.groups只有id=emergency-action，无id=asset-management。与23:52真实错误及此前共享装配核对相符。此文件仅为现有生成投影的观测，不是可手改的事实源。
- 真正传参落点为[renderBusinessInstance:174–190](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/business.ts#L174-L190>)读取既有manager.config，再在[223–225](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/business.ts#L223-L225>)禁用原manager、交给createBusinessRuntimePatch生成business-mcp-manager。只更新Candidate私有适配或重编提供者，均不会自动把平台保存的组投影进suppliedConfig.groups。组方法本身在current.groups找id，不存在即抛错，见[公开提供者:746–748](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L746-L748>)。

### 给唯一研发的最小修复入口与受管操作

1. 在上述**现有业务装配/管理包装**修复选择性投影，不另造wrapper、不改冻结Candidate/生成Patch/HOME。应使有效business-mcp-manager的groups包含原已保存asset-management及唯一成员ai-soc-master（names仅既有6动作，resourceTemplates仅原任务模板，resourceUris不新增）；对应成员连接也须在受管组调用可用，引用原平台ai-soc-master配置/凭据。不能只补groups后仍缺成员，也不能把平台全部groups/106工具/49模板全量投给业务或子助手。原生Session/callId/信号、目标摘要、原权限和主助手范围保持；不新增认证/API/依赖或SOC许可。
2. 当前已核平台工具没有“仅改此运行实例有效groups”的独立入口。tasks/assembly-preview/apply的configuration_edits会写目标Candidate，不用于越过冻结；mcp/saveConfiguration只改平台全局配置并自动重载，平台已有6+1组不缺，重存它不能修suppliedConfig投影。本方不调用这些写操作。
3. 研发先修并通过其既有程序模块构建/装配检查，再由唯一协调方待在途任务安全收口后使用现有instances生命周期入口：`platform_instances run {name:'inspection-027-schedule-acceptance', operation:'reload'}`。原生工具内部预览并核摘要、保留HOME/会话/模型/端口；这是**代码与投影修复后的激活**，不是直接重载相同代码能修复。现巡检执行中，绝不由本方调用，也不要求根重发扫描。
4. 交付最小非敏感回执：最终provider入口；有效groups中的asset-management/member/names/template选择；成员连接来源引用（无认证值）；修复模块/新投影摘要与加载回执。先核组目录唯一6+1、主/子隔离及原会话绑定，再由根原156重试业务，未到SOC前不判扫描为空。这里只给原许可内必要范围，不以“新增目录”要求重复审批。

### 实际交接定位，不猜统一研发会话

本文共享提供者/巡检维护的既有登记父会话为**session-6a79ab7e-f558-4cc5-b45d-7cc2e4c52975**（原生ID依据下方冻结记录）。它是可定位的安全巡检共享协调入口；本轮目标仍security-operations-expert / EXP-security-operations-expert-027-f-r3ba4799b0cb7 / inspection-027-schedule-acceptance。**平台程序“统一研发”的独立会话ID没有实际元数据，仍未知，不能把上述维护父会话自动冒充程序研发会话。**请根在已使用的安全巡检会话将本节转交其实际研发接收方，并由该方回执定位。当前工具不能跨独立管理会话直接发送，未冒称已投递；无需新建研发会话/子任务。本方本轮只补此事实交接，不做程序/Candidate写入或业务执行。

## 统一验收暂停交接（此前阶段记录）

本轮仅补此暂停交接，不再改Candidate/evaluation或运行检查。实际修改为下节4项资产私有文件（运行TS、组级测试、范围测试、Skill）及本文；最终指纹仍以下节表为准。没有本会话未完成的写入、构建、重载或业务任务；两个本地检查后台job均已完成且输出已收集，全部8个本会话子助手inactive。无需取消任何他方任务，不对并行文件回退或恢复覆盖。此前已撤回未交付的新证据投影，现无额外恢复项。

用户转研发从真实容器逐文件核对：06:30重载expected3952个文件中，唯一不一致是`/opt/dsh-managed/asset-onboarding-runtime.ts`；计划摘要（按原称）886277d3fbbc084bceeb816dc2957307e8c02610fea685994232cee0025be8b7，运行字节SHA256=fdb2c5c91222d2d502e86712c76a8a6f4987cd5198b0f97c7a07961d7e4a6dc5，因此实际加载回执unknown。此为用户提供的研发核对证据，本方未重复进入容器/重载/调整校验；不把该计划摘要冒称整个Candidate或实例加载摘要，也不因TS运行字节相同就声称对应MJS已加载新接线。

本方已完成57项本地Mock，不代表真实SOC或纳管验收。共享完整v2提供者、最终生成MJS/类型检查、冻结后的加载回执、138范围真实发现及后续新确认登记仍由原协调/业务入口核验；原始任务完成性和预览门槛风险仍按下节未验项保留，12条Excel类型字典待核不扩展。完成此条交接后停写暂停，等待统一验收新指令。

## ASSET-HV-02最终私有交接：源码与相关Mock就绪，待安全巡检统一构建/装载

### 本轮证据与当前目标

根会话仅从HEP MCP管理界面发现目录，未保存配置/执行业务工具：ai-soc-master为106工具/13资源/49模板，既有asset-management仍6工具+1模板。已核真实目录合同：create_soc_discovery_tasks对应POST /soc/discovery/tasks；start_soc_discovery_tasks对应POST /soc/discovery/tasks/{taskId}/start；查询模板为http://172.16.138.223:18087/soc/discovery/tasks/{taskId}。这是223有接口目录的证据，不是53105会话注册/调用已就绪或SOC实际扫描成功。

R3原156会话21:57旧228请求在本地resolver拒绝、六项0、无SOC请求/taskId；根会话后又补本轮138请求亦为相同本地未匹配，未给新请求精确时刻，不混成21:57同一次。后续真实正向目标现为172.16.138.1–254，先完整候选、不入库/不改已有资产；所有真实测试仍根会话从原53105/156业务入口发起。本方未代发扫描、发现、入库或SOC业务重查，也未取得任何可引用的138真实taskId。只读核目录未发现可按范围检索的既有任务列表合同，且尚无已知任务ID可读详情；不据此宣称历史任务不存在、不造ID，待根会话新业务回执。

### 最终资产私有文件与SHA256

| 文件 | 当前源码交付及SHA256 |
| --- | --- |
| [asset-onboarding-runtime.ts:236–350](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L236-L350>) | 删除四前缀/旧直连resolver及原始SDK工具注册求交，使用createAssetGroupBackend；fdb2c5c91222d2d502e86712c76a8a6f4987cd5198b0f97c7a07961d7e4a6dc5 |
| [asset-onboarding-group.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-group.test.mjs>) | 新增组级Mock及真实代理URI合同检查；ec0e1e8668b014c0691e40f9737e44fa9a3100dccdddbe9115b087362d2d6522 |
| [asset-onboarding-range.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-range.test.mjs>) | 保留原20项范围/否定，新增138授权隔离；Mock截停点改为首次组目录读取，仍早于日记/派发；bc7f5f7d9aa1a7fa3a90fb8b93cfde1a023fb60655e93ae8d062b9f17df2a27b |
| [资产Skill](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/asset-onboarding/SKILL.md#L13-L22>) | 状态明确为组v2绑定、与原始模型工具注册及SOC业务成功分开；不由200/空数组推完成或离线；55f796c1bb3c604073e1500f1dd1ffd25ca9005d3fd4db49969b107d90147837 |

既有附件getter/解析器未重修：[asset-workbook.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-workbook.mjs>)仍c444943009f00168b1f715d39ef738b892d95cd80f75e056b602be4522f7f8b3。本方未改任何共享report/runtime/guard/manager、允许清单、Profile/MCP配置、认证、依赖或SOC环境；不把并行故障报告文件计入资产成果。

### 私有适配的精确落点及本地结果

- 六动作与1模板仅按组v2原名、ai-soc-master、kind/sourceName/sourceUri唯一绑定；不依赖ctx.tools.get/resolveTool，不猜前缀、不跨组、不回退HTTP或读Token。状态保留原计数字段并新增来源已核标识/transport/可脱敏停点，evidence_scope明确为组目录而非本地工具注册；缺旧provider方法时为ASSET_GROUP_API_UNAVAILABLE，绝不说SOC没接口。
- 每次原生工具执行只冻结一次已核v2目录目标摘要，调用公开callGroupTool原样携带原生exec（Session/callId/signal）；等待目录后重验取消。发现/提交的异步lookup均已await，发生在mkdir/日记之前；不新增底层模型工具或子助手许可。读取并核对原允许清单资产6项，未写共享清单；主/子隔离本地负例通过。
- 模板沿真实inputSchema传integer/number或string taskId。只接受公开组资源代理URI `mcp-group:/asset-management/ai-soc-master/t/<base64url(已核sourceUri)>`及同taskId的合法query形态；拒错组/成员/kind/来源/任务、重复query、hash及裸上游HTTP URI。仅解析structuredContent.contents[].text，保留原始业务字段及缺项，不把展示占位当正文。
- 先复现R3：无原始SDK注册但Mock已有公开组目录时，旧status的tooling_ready=false，1项失败/退出1。首版组+范围37/37绿后，审查发现Mock错用了源URI；改为真实组代理URI再次复现模板读取失败1项/退出1，再按公开合同修复。不能用首轮37绿代替模板真实合同检查。
- 最终命令 `node --test tests/asset-onboarding-group.test.mjs tests/asset-onboarding-range.test.mjs tests/asset-workbook.test.mjs`：**57/57通过，0失败、0跳过**（组19、范围21、附件17）；组+范围40/40。两项新测试MJS的node --check通过。Node原生TS内存去类型，未构建/编译MJS，未发网络或写业务日记。原生ESM类型警告保留，未改宿主package.json。TypeScript受控类型检查仍交统一构建方。
- 用户要求收口后，尚未交付的managed_evidence/observations投影已撤回，当前源码无该新结构。真实任务字段仍按原facts完整返回，字典无回执项待核，不新增通用任务状态映射或OpenOcta/新探测能力。

### 生成物、装载与未验项（不能混作通过）

最新只读指纹：[生成asset-onboarding-runtime.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs>)为d349ddd705a88e82496c3a8cb91c52443a56e60744b1fd33ad33f31f147d6a2c，已由并行过程较5a75…变化，本方没有构建/手改。读取确认其包含HV04范围/否定修复，但仍有旧resolveAssetTools、不含createAssetGroupBackend/ASSET_GROUP_API_UNAVAILABLE或最终代理URI逻辑，**不是本节ASSET02最终源码的生成物**；安全巡检须以本节TS新指纹统一重新构建。

2026-11-07T06:41:49.795Z公开实例回执为status=unknown，最近尝试06:30:49.156148Z尚未核验；保留最近成功加载仍04:44:29.150Z、loaded.digest=sha256:34f40765b559e213ba194bee5cd170861c89a20d186a785f6902b3c4cc68f79c。当前投影547adf0646e764c6c16418596a25d1e646c95ccdd409ee9dcfbff9bf2402b810，与最后成功回执不同且含资产MJS/TS/Skill及并行文件差异；不把旧成功回执当当前代次已加载。本方未再次装载。

**尚未闭环而不计本地通过的部分**：实际共享提供者完整v2、受控类型检查/新MJS、当前代次装载、138真实任务创建/启动/查询及SOC登记均待唯一协调方/根业务回执。审查另提示既有单IP非null结果即completed、query完整来源门槛与未终态结果的风险；本批接线不发明SOC终态字段/枚举或新公开投影，该任务完成性/预览门槛未被本批57项证明。真实任务回执到达后须据真实合同最小核对，不能凭200、空数组、部分findings判完成或直接放入完整待纳管清单。当前真实验收仅发现、不入库；不宣称整体纳管可发布或已通过。

**交接结论**：资产私有接线源码与相关Mock已就绪；共享依赖仍按下一节由安全巡检唯一实施并统一构建/装载。核本节最终四文件指纹，避免使用旧37项/旧TS/现有MJS当最终制品。装载和来源就绪后，根会话从原156发起138真实发现与同任务查询；发现失败只返回本会话修复，不新增扫描/登记授权。原会话、12条新Excel及旧附件/失败均保留。

## 安全巡检共享交接：MCP提供者组v2版本对齐（资产私有部分已就绪）

用户R3新证据：原156会话21:57对旧228范围discover被本地create_soc_discovery_tasks候选未匹配拒绝，紧接新status仍六项0/任务目录不可用，无taskId、无SOC请求、无入库；不得说成SOC发现为空。最新后续正向发现/只读诊断范围改为172.16.138.1–254，替代228；原历史记录不改。所有真实测试仍由根会话从53105原业务聊天发起。本会话只改资产私有实现/相关测试；共享MCP提供者、Guard、report及实际构建/装载均归唯一安全巡检会话。

### 已核共享合同与缺口

- 当前候选[Manager服务TS:518–526](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.ts#L518-L526>)仅currentGroup/resolveTool；[现MJS:555–568](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.mjs#L555-L568>)另有sourceStatus，TS/MJS也不完全一致。候选旧v2摘要缺naming字段、工具仍成员前缀、无现行来源meta/模板转工具；不能仅加两个同名方法外壳。
- 既有公开完整合同在[程序Manager:763–789](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L763-L789>)：`listGroupTools('asset-management',2)`返回`{tools,_meta}`；`callGroupTool('asset-management',2,tool.name,args,meta,exec)`。资产高层内部复用，不注册六项底层工具给模型/子助手、不绕全局get/HTTP，不读currentGroup.token。
- [v2绑定:323–397](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L323-L397>)公布原name；`tool._meta['io.deepseek.dsh/mcp-group-tool']={serverId,kind,sourceName,sourceUri?}`。资产6动作只按原名、ai-soc-master、kind=tool唯一绑定；所选get_soc_discovery_tasks_by_task_id须kind=template、同成员/原名及真实sourceUri。冲突/离线目录不猜别名或跨源取代。
- [摘要:275–301](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L275-L301>)及[核对:612–619](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L612-L619>)：目录`_meta['io.deepseek.dsh/mcp-group-target']={digest,version:2}`，digest包含现有`naming:'group-boundary-v1'`、组/成员、启用、去敏端点和选择；调用原样绑定该摘要，第2参仍2。调用入口/叶子前/返回后均核配置未漂移，禁止失败自动换摘要重发。
- [模板包装:520–555](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L520-L555>)：模板作为只读工具，参数遵循目录inputSchema；原生MCP模板taskId通常string，OpenAPI按其integer/string schema，不加uri/body新包装。返回structuredContent.contents[].text才是真正文。上游OpenAPI内部可保留原模板URI，但[组资源包装:589–609](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L589-L609>)会将公开回包URI统一改为mcp-group代理URI，资产端必须按组/成员/t/已核sourceUri严格核对，不能只接上游HTTP URI；不把展示占位或HTTP200当结果正确。
- exec必须原样传原生工具execute对象：group v2现有withToolContext要求`exec.agent.session.id`和`exec.callId`，并用`exec.signal`贯穿派发/资源读取；不得伪造身份meta。目录listGroupTools只有2个参数，不接受exec/signal；资产侧等待后重验取消。正常示例见[fixed-composition:83–90](</home/cmp/work/harness-engineering-platform/platform/plugin/src/workflows/fixed-composition.ts#L83-L90>)。

### 最小共享实施/构建范围（安全巡检实施，本方不写）

1. 对齐既有MCP提供者完整v2目录/摘要/资源与模板包装/调用/上下文，保留原currentGroup/resolveTool以及当前sourceStatus消费者兼容；不新增公共API、权限、认证、依赖或组选择，不全局新增客户端到所有子预设。候选旧Manager入口仍由其默认Profile声明引用，不能只更新程序产物却继续加载旧候选模块。
2. 普通EXP受管构建合同已核：`platform_agents assets/build-preview`参数experiment_id/entry_path，执行assets/build使用其返回候选/预览摘要，不执行来源package scripts。本方不调用预览或构建。需由安全巡检先确认入口使用完整现行已审源及依赖闭包，不能直接把旧候选index.ts再编一次冒称升级；已核[Candidate构建映射:95–114](</home/cmp/work/harness-engineering-platform/platform/plugin/src/agents/asset-build.ts#L95-L114>)只把所选Candidate TS变同名MJS，[源码边界:101–110](</home/cmp/work/harness-engineering-platform/platform/plugin/src/agents/asset-build-core.ts#L101-L110>)禁止未固定外部源码，故不能直接跨目录import程序插件充当补丁。完整现行程序模块已有[构建器:16–80、127–128](</home/cmp/work/harness-engineering-platform/platform/plugin/build.mjs#L16-L128>)：managerSources收集当前plugins/mcp-manager/index.ts、openapi.ts及相对依赖，生成src/mcp/manager.ts并产出lib/mcp-manager.js（沿既有harness-mcp-manager-server原生依赖）。未核到该程序bundle自动替换Candidate的节点。独立source-runtime的standalone-*虽复用同一完整managerSources，现有投影只处理旧fixedComposition接缝，不升级候选管理器。安全巡检应先对齐Candidate实际引用的index/openapi/connection必需闭包并保留sourceStatus兼容，再受管build-preview/build；或者走另经核实的现有整体runtime装载路线。不能把lib/mcp-manager.js或独立导出冒称已自动替换候选，亦不创Shell编译命令。
3. 影响项限Manager源码/实际受管模块及确需的提供者装配引用；资产私有消费方由本会话适配，report/inspection等旧直接消费者只做必要兼容回归，不计入本方资产成果。Guard/允许清单只核现有资产身份及隔离，不扩允许集。
4. 相关回归：六动作+1模板原名/成员/kind/URI唯一匹配、冲突/缺失/不可用、摘要v1/v2及漂移拒绝、模板数字/字符串和正文包装、根Session/callId/取消、主/子隔离、原直连resolveTool/sourceStatus及现有巡检/报告消费者不回归。由唯一安全巡检在资产私有适配齐后一次统一类型检查/构建/装载并给真实observer回执。

本会话没有跨独立管理会话直接投递能力；此处为即时共享交接，不冒称已送达安全巡检。请根会话转交本节，资产私有适配不等待消息串行。另已收到原f0c27975业务附件新增12条多类型Excel真实完整解析，未探测/未入库；本轮无类型编码字典回执，仅记待核，不扩字典工作、不判SOC缺口。

## ASSET-HV-02：19:13新status补证与只读来源核对（R2历史证据）

**新证据归属**：用户从真实session-156acd06-4963-4d31-828d-8e0d33c0a3b7于19:13一次新status取得，非18:55旧失败；原对话完整值保留。本轮只读定位，仅补本交接记录；不改候选/权限/共享配置、不build/装载、不读HOME/Token、不新调用业务或替用户重放。HV04范围第一阶段已先完成；用户续授权的必要否定回归现已收口为20项Mock通过，当前指纹与具体交接见后文，不等待接线研究、不重复修getter。

### 19:12另一真实会话的资源作用域证据与候选绑定定位

用户新增：台账只读会话session-c40b6017-7500-4d45-a12b-dbd152885816在19:12本轮status同样六项0，随后按返回namespace调用list_mcp_resources(asset-management)与list_mcp_resource_templates(asset-management)，均返回`MCP resource server "asset-management" is unavailable in this agent’s scope`。这是该Agent的资源provider不可用证据，不是SOC HTTP数据查询结果或SOC缺接口；不与19:13的156新status混成同一次请求。

**本轮只读定位到的候选缺口**：

- [harness.yaml:16–18、47–55](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/harness.yaml#L16-L55>)仅声明asset能力与实际载入路径，不能替代MCP来源挂载。[主预设:39–42](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/presets/security-operations-expert/agent.cordis.yml#L39-L42>)启用的是高层asset-onboarding-runtime；完整主预设未声明资产MCP客户端。
- [Profile叠加:82–124](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-expert.patch.yml#L82-L124>)注册主/子预设，但未增加asset-management来源。对Candidate默认MCP声明只检索id/serverName/enabled/已知组路径这些非敏感字段，未读取headers或Token：[默认源元字段](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/web-profile.seed.patch.yml>)列policy-configuration、emergency-action、ai-soc-correlate、sec-ops、soc-readonly、inspection-compositions、troubleshooting、report-write及禁用的threat-analysis-runtime，没有asset-management的id/serverName，也未见其他alias指向该组v2路径。因此当前候选默认声明尚未补入该客户端，不是“候选已声明资产源只等加载”的已证状态。
- [当前Manager实际挂载代码:649–677](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.mjs#L649-L677>)遍历config.servers，为Preset作用域创建McpClient，serverName取server.serverName或id；不会把平台已保存的所有groups自动转成客户端。原始候选/资源名即使正确，也不能补足缺少客户端来源。候选缺口与两次scope unavailable吻合，但还不能仅凭它排除运行Profile另有手工来源或alias。

**实际装载边界更新**：2026-11-07T03:43:07.678Z实例detail为status=unknown，最近尝试2026-11-07T03:41:50.654879Z结果unknown，当前代次暂无已核回执；保留的最近成功回执仍03:34:50.391Z、b5582990…fb5e0df，不冒充当前代次。当前投影fe4ed3adb7a26ed880468627b3712ff242e2514e9809eb92dc019ee9e2aea59f，变化含business.patch及并行巡检/报告/Guard/矩阵等。由唯一协调方核验其实际生成绑定，不读实例HOME或生成文件，不补发装载；更不能倒填为19:12/19:13的配置。

**拟新增目录/权限的精确范围，未实施**：如果唯一协调方核实有效配置确无资产源，最小为仅向主预设接入1个原生MCP来源，本地serverName=asset-management，复用平台已保存asset-management组v2的受管地址/认证引用；只含下表既有6个operation及get_soc_discovery_tasks_by_task_id这1个任务资源模板。不增加SOC新接口、不给模型直接入库权限、不改角色允许集或匿名语义、不挂子预设。旧manager的servers循环会对各Preset挂载，不能未经角色范围核对就全局加条目。可落点为主预设的原生客户端绑定，或现有受管装配源绑定；与保留HOME的有效Profile如何合并须由协调方按公开入口确认，不能保证只改默认模板再reload就生效。

若唯一协调方实际生成配置已含该来源/不同alias，只交其核对装载与真实serverName，不重复改配置；若已注册但被隐藏，再针对实际参与的资产身份映射查证，不凭0增权限。本轮不实施上述新增目录；仍只缺与时刻/代次对应的一份有效MCP来源绑定/挂载回执来确定运行层，不要求重查SOC或重发status。HV04已独立交接，不受此补证阻塞。

### 用户提供字段摘录

| operation | registered_count | registered_names |
| --- | --- | --- |
| create_soc_asset_probe | 0 | [] |
| create_soc_discovery_identify | 0 | [] |
| create_soc_discovery_tasks | 0 | [] |
| start_soc_discovery_tasks | 0 | [] |
| create_soc_discovery_tasks_adopt | 0 | [] |
| create_soc_asset | 0 | [] |

其他原值：task_query_resource=unavailable，task_query_template_count=null，interfaces_loaded=false，tooling_ready=false，configured=null，configuration_check_supported=false；local_entry_loaded=true，evidence_scope=current_session_tooling_only，expected_namespace=asset-management，expected_member=ai-soc-master，group_id=asset-management，session_id=session-156acd06-4963-4d31-828d-8e0d33c0a3b7，schema_version=asset-onboarding/v1，business_verification=not_performed，registration_performed=false。此摘录不补造原回执未给的来源绑定或异常。

### 当前实际装载观察（不回填19:13）

2026-11-07T03:37:50.157Z公开实例detail：最近实际装载为2026-11-07T03:34:50.391Z，source_id仍为指定EXP，loaded.digest=sha256:b55829904a37cce034d06f167b19f16ac976fd56eb8f469ea08073b81fb5e0df，files_digest=sha256:f65e20325f5c3dfa63d8d3af5b232279f3bbbacba7360f82e16e02609afca069，runtime-observer/ok=true。当前投影digest=sha256:f4c908a1f7dc9fcf0b7898fa8f56cd28fc4a5c8a44bf62fb0b68d3d7787a2555，status=pending_reload，7项差异属于巡检/报告/Guard/矩阵等并行修改。本方未构建/重载，不覆盖这些差异，也不拿当前磁盘Guard推定已运行的过滤行为。

此装载晚于19:13新status，不能倒填为该次工具请求版本。只读受管实例日志tail=100仅返回Web启动及模型目录加载信息，没有资产MCP客户端挂载/注册回执；缺此日志不等于未挂载。公开实例detail只给来源/摘要，不给本地MCP连接名、注册工具身份或该Agent的过滤前后视图。

### 现在可证与仍不可证

- [现MJS resolver:861–871](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L861-L871>)只核固定asset-management外层命名空间及四组候选，再加旧manager直连resolveTool结果，并用get(name,agent)求交集。六项0精确说明这些候选在156该轮未匹配，不等于全注册表零工具、SOC无接口或源一定没挂载。旧manager把组ID当直连server的路径仍不正确；但代码还另查独立客户端候选，故不能仅此断言就是现场唯一根因。
- [任务模板目录:908–915](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L908-L915>)同样以server=asset-management访问本地资源provider。unavailable且count=null来自[status:945–951](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L945-L951>)异常被吞，区别于成功列目录后计数0；仍可能是目录工具不可见、provider名不对应或目录调用失败，不能直接判SOC缺模板。
- [status:953](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L953>)的configured=null、configuration_check_supported=false是该实现固定输出，不是新执行了后端配置检查，更不能证明运行服务缺某方法。
- DSH get(name,agent)是当前可见视图，隐藏与未注册均可表现为undefined；源绑定不明时不得改用global get、绕权限或补猜名前缀。当前平台组级listGroupTools/callGroupTool合同与候选旧同名服务差异仍在，不能从管理侧源码直接推定业务实例接口版本。

### 只缺的一份非敏感运行元数据

请用户或唯一协调方从UI可取得的记录补**资产组对应原生MCP客户端的来源绑定/挂载注册回执**，与时刻/运行代次对应：本地serverName或连接ID、实际绑定的groupId/去敏组路径、挂载结果及该来源的六项精确注册名；若UI能提供，同一记录附156作用域的可见性/限制结果。不要凭据、header、Token或HOME文件，也无需再重取同一个status。若UI只有过滤后的工具目录而无挂载注册结果，该视图仍不能独立区分隐藏与未挂载，须如实保留未知，不新增平台检查或私有取证。

这一个来源回执可决定最小落点：实际未注册则由唯一协调方补已有资产组原生接线；已注册但本地身份不同则仅修asset resolver/lookup/status及资源server绑定，使用已核local serverName+raw operation+group/member，不增候选；注册身份吻合但156不可见，才核并修实际参与的资产身份限制，不直接扩大权限。若已有可靠公开组级调用合同，按其真实版本收敛；缺合同时不从管理侧导入实现或加HTTP代理。本轮不选定尚无证据的分支，不宣称接线已修复。SOC目标仍223，发现仍仅用户授权228.1-254，不发业务验证。

## ASSET-HV-04源码小批交接：已保存及本地验证，未构建/装载

用户现已授权仅实施范围TS、直接测试及Skill说明。真实证据仍归session-156acd06-4963-4d31-828d-8e0d33c0a3b7的18:55最新请求172.16.228.1到172.16.228.254，不用旧非法输入或R1会话代替。ASSET02已收到156会话19:13新status，仍需的来源挂载补证见本文开头；不随本范围小批扩展。

### 实际修改与精确差异

| 文件 | 保存差异及SHA256 |
| --- | --- |
| [asset-onboarding-runtime.ts:37–119](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L37-L119>) | 新增共用normalizeRangeText及validateDiscoveryRanges；先规范再拆项/去重，完整token及包含/排除角色同值匹配；f98b3b00f79cb02784edb3dcf9c74a018fe1863b32dccae81e2c81a32dfc023d |
| [asset-onboarding-range.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-range.test.mjs>) | 新增直接import TS的本地Mock，不生成MJS；3bb09d760f8e1169255d6b64f95443fb847697e532d14ac1ecd82bd072797d20 |
| [资产Skill:14](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/asset-onboarding/SKILL.md#L14>) | 补到/至/-同端点等价及排除完整映射说明；c3f7d2c6fac77853d52f8182c8d3dd74fdee0252b965a5b153211663976bac1f |
| 本交接文档 | 记录差异/结果/限制，保留其他维护会话并行更新 |

[discover调用点:342–347](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L342-L347>)仅将原normalizeRange、排除存在性及原句includes四行替为`const { range, excluded } = validateDiscoveryRanges(identity.request, args.ranges, args.excluded_ranges)`。真实当前用户、意图/取消gate仍在其前，lookup及日记在其后。create/start/probe/identify的外部参数、autoAdopt=false、任务防重、完整预览和新确认/写入规则均不改。

仅对两个完整合法IPv4同一起止端点的“到”“至”“-”及两侧空白做无损规范；不拼散落IP、不补端点、不换算CIDR或借旧消息。包含/排除分别按完整显式片段匹配，不用子串授权。明确排除列表须完整消费，不能只取首项/末项或当包含；前置排除和后置除外同用完整列表规则。不明确连接词、列表续项或角色歧义保持失败关闭并澄清，不增加自然语言推断。原IPv4/CIDR对齐与4096上限保留。

### 检查结果（仅本地，无真实发现）

1. 先以`node --test tests/asset-onboarding-range.test.mjs`复现：初始14项4通过/10失败，退出1。修后14/14通过；只读审查再发现“排除C 和 D”及“C，D除外”的部分匹配，均按同根因修正，补3组直接回归，未把首轮绿色当充分证据。
2. 范围规范化第一阶段同命令17/17通过、0失败/跳过；必要否定回归收口后的当前结果为**20/20通过，0失败、0跳过**（详见下段）。覆盖到/至/-双向等价及空白、单IP/显式CIDR、越端点/0或255/138网段、散落IP/子串/CIDR借单IP、缺端点、排除漏项/错配/角色颠倒、带空白和及与及后置逗号/分号、无法准确映射的连接词、取消/咨询/否定扫描/排队取消/中止/旧消息和4096边界。审查提出的本补丁阻断项均已静态封闭；审查者未独立运行测试。
3. Node v24.21.0原生TS内存去类型直接导入当前源码，不调用tsc/esbuild或写编译物。高层正例在首次tools.get由Mock抛STOP，位于mkdir/业务日记及MCP调用之前；负例要求get计数0及授权/范围/取消类错误。无网络、扫描、任务创建、入库或额外业务评测。
4. 测试MJS的`node --check`通过。普通`node --check ...runtime.ts`按JS解析原有type Value时报SyntaxError、退出1，未算通过；没有为此构建或修改类型声明。TS实际导入/单测通过不等于TypeScript静态类型检查，后者留给统一受控构建。原生导入另有MODULE_TYPELESS_PACKAGE_JSON警告；未修改宿主package.json或安装依赖。

### 未实施项及统一交接

[受管生成MJS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs>)仍为5a75cc137ca96a7687e4da88b645bf23f1cb58040807eac819e9154d5c968a4b；[附件模块](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-workbook.mjs>)仍为c444943009f00168b1f715d39ef738b892d95cd80f75e056b602be4522f7f8b3，均与此前已核字节一致。本批未build/改写MJS、装载、保存共享配置或触任何巡检报告/Guard/manager/权限/SOC/平台程序，未读HOME/Token；不是已装载或真实发现通过。

### 必要否定回归收口：已按用户续授权保存，仍未构建/装载

用户明确将“不要发现”缺词纳入本次取消/否定边界的必要回归；此前单列限制不再作为不修的现行安排。先新增3组定向检查复现：`node --test --test-name-pattern='不要发现同一起止|明确否定发现和扫描|只发现不入库' tests/asset-onboarding-range.test.mjs`，1通过/2失败，退出1。两个否定用例实际到达Mock首次工具查找STOP，但仍未进入MCP或FS；合法“只发现/不入库/明确排除”对照通过，未降低负例期望。

精确生产差异仅为[TS:342](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L342>)否定动作正则的一个分支：

```diff
-(?:不|别|暂不|无需|禁止)(?:要|再)?(?:探测|扫描|识别|执行|做任何动作)
+(?:不|别|暂不|无需|禁止|勿)\s*(?:要\s*)?(?:再\s*)?(?:探测|发现|扫描|识别|执行|做任何动作)
```

仅补“发现”、明确“勿”及“要/再”组合/空白；不推导句子语义或目标，不改其他取消/咨询判断、权限、MCP参数、确认规则或范围解析。复杂否定/转折不做通用NLP判断，也不以本地覆盖声称所有自然语言否定均已识别。

完整回归`node --test tests/asset-onboarding-range.test.mjs`最终20/20通过，0失败、0跳过；测试MJS的node --check通过。新增检查覆盖不要发现A到B/A至B/A-B、别/暂不/无需/禁止/请勿/不要再及带空白的明确否定发现/扫描，均要求首次lookup前拒绝；“只发现A，不入库”“只发现A，不要入库”“发现A至B且明确排除C”仍通过到Mock首次查找停点，无二次确认。所有验证只用本地Mock，未真实发现、扫描、创建任务或入库。

当前TS/测试指纹以本节表格更新值为准；Skill、受管MJS及getter模块保持前述字节，原MJS仍是旧gate，必须由唯一协调方随范围/报告补丁一次受管构建/类型检查/装载。本地必要回归已收口不等于已发布、已装载或业务通过；在统一检查和装载回执完成前，不宣称范围模块可发布。

请巡检维护会话在报告补丁及范围补丁齐后核上述三项指纹，由其一次受管类型检查/构建/装载；不要用旧MJS冒称范围补丁产物。本方不自行build或装载。ASSET02继续根据156原status的registered_count/names定因，不从范围Mock绿色推定接口可执行。原会话、旧失败、附件保留，所有真实复测仍只由用户从原业务会话发起。

## R2原业务反馈与只读定位（实施前记录）

本轮用户明确：六类巡检在途，巡检维护会话仍是53105唯一装载方；本管理会话只读定位并返回最小修复范围，暂不改Candidate/测试/Skill、不运行脚本或测试、不构建/装载、不保存共享MCP配置，不启动或代重放业务。唯一写入为本交接文档。先前冻结解除不构成本回合实施授权；无需恢复goal或旧队列。SOC环境仍223，发现范围仍172.16.228.1-172.16.228.254，不修改SOC或扩大目标。

### ASSET-HV-03：原Excel读取展示已通过，不重修getter

来源为用户提供的R2原业务回执：session-f0c27975-ab5f-49c8-b4bd-dbd6310a37b6已成功读取同一原Excel，digest_verified=true、complete=true、未截断，两条合成数据行完整展示；未入库、未探测。此处确认的是原附件读取/完整展示子项通过，不把合成行当真实设备、不扩展成登记或发现通过。本方未重读原附件、未重放工具，不再重复修改服务getter；原失败及本地修复证据保留。

### 本次只读现场边界

2026-11-07T02:58:43.734Z公开实例回执：current_digest与loaded.digest均为sha256:76852d15f33ff97bc98d289215aa7a9d645a07c1cb48804d0bca83ef9a47f364，status=current、changed_files=[]，与用户R2摘要吻合；loaded_at=2026-11-07T02:53:01.203Z，files_digest=sha256:39da6b86985ec95e6d1f6310eb97bf666e910c4409768cddbca94027738a5ff8。它是资产投影/装载证据，不是业务可执行性或原始工具报文证据。

本轮新读配置revision=9a75c92906f5c923e59db93124543c3920065e791aa8ce7dd7e33440cff376e2：asset-management成员仍ai-soc-master并选择既有六项operation；规范入口与所选任务模板均已指223:18087。因此不再以旧232模板解释本轮未就绪。规范入口、目录声明目标不等于实际SOC HTTP下游；没有实际请求/路由证据就不补造下游或SOC发现结果。

### ASSET-HV-04：等价起止范围归一化缺陷

**经用户核浏览器session/prompt记录校正的原回执归属**：本轮18:55发现请求实际发送到session-156acd06-4963-4d31-828d-8e0d33c0a3b7。该会话曾有旧非法IP用例，标题相似而被本地选中；本轮最新真实用户输入仍明确“对172.16.228.1到172.16.228.254执行一次真实设备发现…只此授权范围，先完整候选不入库”，不能用旧非法输入替代。工具传等价ASCII连字符范围时，被“包含与排除范围都必须逐项来自当前用户请求，不扩大网段”拒绝；改传中文范围又报格式无效。上述错误和本轮接口0回执均按用户校正归属于156这一轮，尚无taskId或SOC发现结果。

此前把该R2回执关联到R1会话session-1893b241-e09e-4206-a4c4-72585c5b2461属于证据索引误标；用户已更正测试索引。156与1893两个既有会话的原记录全部保留，不改写原始会话，不把本轮冒充成1893重放。本管理会话只按用户校正更新证据关联，未独立读取浏览器prompt或发起任何新请求。

**已证实的源码根因**：[normalizeRange:37–56](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L37-L56>)先按空白拆项，再只按ASCII“-”解析起止；[discover:279–285](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L279-L285>)又用identity.request.includes(part)比对原句。参数A-B与原句A到B不一致时，语法通过、授权字面校验失败；参数A到B则在语法层失败。当前实际构建物也保留对应逻辑：normalizeRange第712/730行、原句includes第968行。在当前投影与R2装载匹配的边界上，两次拒绝与此代码路径吻合；本方未独立读取原会话工具参数/完整事件序列。

**最小待修范围，未实施**：

- 同一runtime文件内共用纯规范化，只处理两个完整合法IPv4同一起止端点的ASCII“-”/中文“到”及两侧空白，在拆项前无损规范成A-B；参数和当前真实用户原句中的明确授权片段使用同一规则。包含/排除按对应角色逐项完整同值核对，不再用裸子串includes授权。不能把散落IP拼范围、不能以子串或覆盖关系放行，不能推导CIDR、补.0/.255或扩大228目标；排除不能明确映射仍拒绝。
- 直接相关的[现有单测](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-runtime.test.mjs#L285-L300>)缺此等价表达/授权联动覆盖，后续在该文件补针对性回归，不引入SOC或持久化测试。既有当前用户来源、取消/咨询/否定扫描、非法或倒置范围、CIDR对齐、4096上限、排除缺失或错配、autoAdopt=false及清单后新确认边界全部保持。
- [资产Skill:14](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/asset-onboarding/SKILL.md#L14>)仅需同步无损等价规范化说明。生成MJS应在获准实施后受控生成，本轮不手改、不构建。ASSET-HV-04是范围校验阻断，本身不能证明发现接口通或不通。

### ASSET-HV-02：接口可见性/身份接线仍未闭环

**用户原status回执**按最新证据校正关联session-156acd06-4963-4d31-828d-8e0d33c0a3b7的18:55这一轮，interfaces_loaded=false、tooling_ready=false；用户另确认接口0回执同属此轮，但本管理会话尚未取得完整逐项interfaces原表，不补造各项数字。按当前实现，这只能证明至少一项未唯一可见，不能直接推成六项均为零，也不能区分零注册、多匹配或作用域隐藏；尚无taskId，不存在可引用的SOC发现结果。

**当前可证接口边界**：

1. [资产resolver:174–205](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L174-L205>)仍固定将asset-management当外层本地命名空间、枚举四套raw名，并取当前Agent可见定义；命名/哈希算法本身与锁定DSH一致，不是已证缺陷。SDK的外层serverName来自本地客户端配置，不能自动等同远端groupId、URL或serverInfo。
2. [候选旧manager:521–525](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.ts#L521-L525>)的resolveTool(serverId,rawName)只查自身直连servers，不按groupId解析独立客户端，且返回值只证明任一activeAgent可见；不能把它当本会话组工具目录。不得读其currentGroup取Token补证。
3. 锁定[SDK get/schemas:682–712](</home/cmp/.local/share/hep-runtimes/dsh-0.2.1-rc.5/node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts#L682-L712>)均读取当前scope的visible视图；被restrict隐藏的继承工具，get也返回undefined。不能省略agent改取global视图或导入内部registry绕过。ToolDefinition.execute(args,exec)两参数合同是正确的，不将其误判为API参数错接。
4. [直接Guard映射:724–727、778–785](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-guard.mjs#L724-L785>)仍只经旧manager算允许名称，与资产resolver四套候选不是同一事实源；存在注册身份/允许集不一致而隐藏继承工具的可证路径。但该Guard在匿名模式可直接退出，自身层工具也不由该restrict剔除，故缺少R2现场状态时不能断言本次一定被Guard隐藏。
5. 当前平台工作树的[分组v2绑定:323–397](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L323-L397>)发布原始sourceName，元数据io.deepseek.dsh/mcp-group-tool保留serverId/kind/sourceName/sourceUri；成员前缀只是旧别名。[v2调用:535–544](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L535-L544>)也走该绑定，不是孤立旧toolOwner前缀拆分。这只是当前平台工作树合同，不冒称53105注入了同版本接口；不再追加猜名或把旧候选manager的v2当现行平台合同。
6. 另有同名服务的版本合同差异：[现平台mcpSessionManager:750–789](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L750-L789>)除直连resolveTool外提供listGroupTools(id,version=2)及callGroupTool(id,version,name,args,meta,exec)，后者保留组摘要核对，配置要求时绑定原生Session/callId；目标候选旧服务没有这两项。它们是MCP业务服务合同，不是仅凭DSH SDK版本就能推出的能力。未核53105实际服务方法表前，不直接改成管理侧方法调用，不导入内部实现或读取currentGroup的Token。

**最小待修方向，未实施**：先由唯一协调方从该原回执取逐项registered_count/registered_names、task_query_resource/template_count，以及仅这六项实际精确注册名和非敏感本地sourceId/serverName、原rawName、group/member身份绑定；必要时再补实际服务是否提供listGroupTools/callGroupTool、对应挂载结果或restrict是否生效的布尔/脱敏错误码。工具schemas自身不保留平台来源_meta，不能靠反拆名称回推。仅使用已保存的原回执/目录元数据，不新启动业务，不索取凭据或读HOME。

若业务侧已经具备经核实的组级公开服务合同，优先在高层按组身份和真实目录复用该合同，不继续拼四套名称；若缺该合同，先列为业务MCP服务对齐/装配缺口，交唯一协调方处理，不能套用管理侧同名方法。若采用已有独立客户端且源未挂载，仅补现有资产组原生接线；若已挂载，则最小改asset resolver/lookup/status及确有参与时的直接Guard资产身份映射，统一已核绑定，保留唯一性、当前Agent作用域与模型底层直调拒绝。status只需必要的阶段/脱敏停点，不增探测。无Guard参与时不为猜测改Guard；不扩大其他允许集、不改匿名语义、不重建SDK/全局manager、不加HTTP路径。当前信息不足以唯一确定R2到底是哪一种，不能以Master目录URL、组已保存或current装载替代执行能力。

本轮实际只补本维护会话/交接记录，不修改上述候选、测试或Skill，不运行单元/业务评测、不构建/装载、不写共享配置、不主动探测或入库。六类巡检及其原报告、会话、附件和旧失败均保留；后续实施及装载时机只由用户与唯一协调方安排。

## 当前边界

用户已明确固定：本批SOC事实源沿用172.16.138.223；本轮真实发现及核对后待确认入库的目标范围已明确为172.16.228.1-172.16.228.254（228网段，不是138网段），不是SOC地址。用户已将范围补充到53105原“纳管一台设备”会话；先发现并展示完整清单，核对后由用户在同一会话新确认入库。本条范围更新不是对尚未展示清单的提交确认；不得修改已有资产或扩大目标。管理助手不代发或重放发现/入库，失败由用户交付真实回执。本次仅解除“尚未指定测试目标”前置，不等于接线已就绪、装载已核验或解除其他发布边界；53105仍由巡检维护会话作为唯一装载协调方。目录或配置出现232不构成改用232 SOC的授权。我方此前根据目录232改模板不能等同于获得该环境切换授权，此判断不严谨；现不以盲回滚掩盖不一致。

按用户INS-HV-07紧急要求，暂停本管理会话后续影响53105的MCP配置保存、接线发布和实例重载；不发起巡检、发现或资产登记，不用ALL扩大范围，不恢复历史错误配置，不改巡检报告修复及其他并行资产。后续业务验证由用户从53105聊天发起，旧隔离评测不计入本批业务通过。

## 并行变更阶段的历史只读快照

用户已确认：外部确实正在变更当前候选，尚未确认变更结束。这是已确认的并行变更事实，不再仅列为推测。本管理会话不覆盖相同候选文件、不保存共享MCP配置、不构建或重载53105、不启动或重放业务，不干预外部流程。仅补本协调记录；巡检维护会话仍为唯一装载协调方。下列为一次读取快照，不通过轮询、静默时长或零差异推断外部已结束。

### 当前候选资产投影与实际装载

观测时刻：2026-11-07T02:24:05.553Z（2026-11-06 18:24:05.553 America/Los_Angeles）。平台返回source_id仍为本候选，asset_status=current，changed_files=[]，运行代次与observer回执一致。

| 项目 | 本次公开回执 |
| --- | --- |
| 候选资产投影current_digest | sha256:9571d3b79314968c1ad81e535783d98137f32b6326aa8a9ab1fd6ca0cd47d525 |
| 实际装载digest | sha256:9571d3b79314968c1ad81e535783d98137f32b6326aa8a9ab1fd6ca0cd47d525 |
| 实际装载files_digest | sha256:ca57ddc21a76b3f76d789485a4df9197be470ad169d1fabde18ff992494975b3 |
| generation_digest | sha256:201b3764a045c61442b88033dc0901d4ab02946fef4e96911af0af5dc43962c6 |
| loaded_at | 2026-11-07T02:21:17.826Z（本地18:21:17.826） |
| 当前容器代次 | e882686948070d2a33b5d30bf3091b768f40673e5daaf7e81d025b125f540b3e，pid=7 |
| 核验 | runtime-observer，ok=true |

这是平台资产投影摘要，不是完整Candidate或Git发布摘要；仅证明采样时当前代次装载匹配，不证明外部变更结束、真实工具可用、Excel解析通过或业务验收通过。18:20曾为unknown的旧回执与此次current分别保留，不能改写为同一时刻状态。

### 实际SOC下游：已知与未知

本轮重新读取的公开MCP revision仍为41e63d2d83ffaada498567ac4b4becff51100cc3fc09fa8e0d33aace99627e80。已知配置为ai-soc-master规范入口http://172.16.138.223:18087/v3/api-docs/mcp；asset-management成员为ai-soc-master，所选任务模板仍为http://172.16.138.232:18087/soc/discovery/tasks/{taskId}。用户已将这项不一致同步给安全巡检会话；本方没有再修改。

接入/规范获取地址、转换目录声明的HTTP目标、实际发出的HTTP目的地及服务内部最终SOC下游是不同证据层。最近一次只读转换目录返回223任务URI，但本轮不刷新目录；它与当前接入配置都不能单独证明实际SOC HTTP事实源或代理内部下游。尚缺本次业务的脱敏request-target/服务路由及身份绑定证据，真实下游和不一致的业务因果仍未知。本批用户要求沿用223环境，不能因此把目录232视为切源授权，也不能把零范围说成SOC无数据或删除了资产。

### 我方已修改与未实施清单

**已修改/已办理的历史范围**：资产高层入口及受控xlsx模块、资产Skill、Mock测试源码、6份静态xlsx样本及manifest、U-ONBOARD-001至014定义和相关记录；最近的接线修正为当前Agent精确注册复核、状态证据分层及零/多匹配停点。平台组原有6项SOC操作与任务模板登记已办理；其中我方d46a90d1操作仅将该组一个任务模板223改232，未直接修改server地址或凭据。17:57:27我方受管重载发生于暂停指令前。具体原回执见下文，不把其后外部重载计为我方动作，也不以我方旧字节覆盖外部版本。

**截至该历史快照我方尚未实施**：把任务模板重新对齐223；Excel服务获取/inject缺陷修复及其构建发布；HV-01台账路由冲突修复与类型/部门图层新增公开能力或权限；本批新的发现、巡检、登记、实际Excel解析或业务评测。此处“我方未实施”不等于断言外部未修改；外部内容与验证结果由其交付。暂停后本方没有共享配置保存、候选文件覆盖、构建或实例重载，没有修改ai-lite-platform或平台源码。

### 可复验的版本稳定条件

1. 外部流程明确确认变更结束，并由唯一装载协调方交付固定来源及对应指纹；不能仅凭此次current/零差异或等待一段时间宣称版本稳定。
2. 接入绑定、规范/转换目录、资产组任务模板与已授权SOC环境一致；实际SOC HTTP下游及身份绑定有相称证据。223/232不一致由协调方核实修正，不以盲改URI掩盖错源。
3. 当前运行代次的实际装载回执绑定该固定来源与资产投影，状态为已核验，且没有未解释的漂移；需要复测的接线或Excel修复确已包含在该装载物中。当前业务会话只读目录还须能核对相应真实工具/模板，不用本地高层入口存在代替。
4. 满足上述前置后，仅由用户从原53105业务会话复测。发现范围固定172.16.228.1-172.16.228.254，先完整清单、核对后同会话新确认入库，不扩大目标或修改已有资产；Excel仅解析样本不入库。助手不代发、不重放，原报告、附件字节、会话与全部失败证据保留。

## INS-HV-07：同双IP从2台变为零范围

**用户报告**：业务会话 session-c5d4292c-f5f0-4802-883e-81cca3af18f0，17:54复测仅172.16.2.114、172.16.2.170，模型先去重。界面先出现“工具已更新，移除4个”，随后同参数两次返回“所选范围没有资产；本次未创建运行”。用户未修改业务配置或扩大范围，暂停追加巡检启动。

**已由公开接口回读的历史事实**：原运行 run-ef1d5e0f-e0f1-4f62-b5a2-92c82803f1ad，created_at=2026-11-07T01:28:57.867Z；input.scope.ips正是上述两个IP，冻结count=2、assetIds=[3617468,3617471]，执行completed、业务incomplete（异常1、未知1），不是“没有资产”。其报告和details产物均存在；只读取原产物，没有重新启动。定义是inspection-status，versionId=66ff38208cd4cd8ce58235ba0d9d190b06b60a9119e75eeebb58e471777eb7e6，connections.master=ai-soc-master。公开运行与details未给出当时实际连接URL，不能拿当前配置倒填历史来源。

### 本管理会话可核对的配置操作与漂移

| 观测/操作 | 非敏感事实 |
| --- | --- |
| 写入前公开revision f236fae80eaa8e96a152c9c367ee6b859977be1f3a882cf179a7d095554e88d0 | ai-soc-master、ai-soc-correlate、ai-soc-detect、ai-soc-event、ai-soc-graph、ai-soc-ingest的specUrl主机均为172.16.138.232；资产组任务查询模板仍为223。 |
| 我方saveConfiguration，proposal d46a90d1-bc1e-4a47-9677-663a460ac20b | 唯一请求op：set groups[5].members[0].resourceTemplates[0]，223:18087/soc/discovery/tasks/{taskId}改为当时真实目录返回的232同路径。未请求修改任何server、凭据、其他组或工具选择。 |
| 保存回执revision c9acc7c5883764e820e3f8de83da013b0f5b6ffdf0eb8d22414f39e704717714 | 上述6个server仍为232，资产组模板为232。该管理动作合同包含自动校验与重载；单字段请求不等于已经排除所有组的连带刷新影响。 |
| 后续公开revision 5c385fd10ccdc222adf1bae6569923b4e5a291f54fbf9e50071736ebfdf97202 | 上述6个server已为172.16.138.223；本管理会话没有请求此次地址切换，操作者与时刻尚未核实；本批正确目标后来已由用户固定为223。尚未据此回改资产模板。 |

追加只读观测：revision 41e63d2d83ffaada498567ac4b4becff51100cc3fc09fa8e0d33aace99627e80中，ai-soc-master.specUrl为http://172.16.138.223:18087/v3/api-docs/mcp，组asset-management仍绑定ai-soc-master但任务查询模板仍为232；当前resourceTemplates实际返回的get_soc_discovery_tasks_by_task_id是http://172.16.138.223:18087/soc/discovery/tasks/{taskId}。因此当前明确存在“223来源及转换目录／232组选择模板”不一致，暂停后未保存纠正。

232角色必须分层：当时公开配置把232:18087作为ai-soc-master的规范入口，返回模板232表示转换结果声明的HTTP base也在232；尚无证据确认它是原SOC、另一部署还是代理，更不能假定内部转发223。当前程序的[OpenAPI转换实现](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/openapi.ts#L171-L214>)先读取specUrl，再用规范servers[0].url（缺省为/）相对specUrl解析base；[工具执行](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/openapi.ts#L229-L250>)按该base拼接operation path，没有固定232→223重写。分组的resourceTemplates是精确选择键，不是URL重写器：它与当前源目录的完整URI相等才可发布；选择了232模板并不会直接改写server.specUrl或规范servers[0]，但会改变组目录与摘要，当前223目录下该232选择无法匹配。该绑定与派发规则见[分组选择](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L477-L501>)及[资源派发](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L589-L608>)。这是当前工作树静态规则，不是17:54真实报文。ASSET-HV-02未发业务请求，因此不存在该批已经向232执行发现或登记的证据；17:54巡检实际请求目的地址仍缺原始轨迹。

这里已确认的是配置观测发生漂移，不是已证明17:54两次调用去了哪台后端。需要区分连接/数据源、租户或权限目录、工具热更新及范围解析；不能据零范围断言SOC删除了资产。未读取或比较任何凭据值，配置“已配置”标志不证明身份与权限相同。

### 实际装载与暂停先后

收到INS-HV-07暂停指令前，我方已通过受管reload（proposal 36cc4458-5479-4579-8fad-f135237fe4c2）重载现有实例。真实observer回执：

- loaded_at：2026-11-07T01:57:27.016Z，即2026-11-06 17:57:27.016 America/Los_Angeles。
- loaded asset digest：sha256:4be72092cd296e77f88e5107e4d7e15a276b7f6a54b49b2daba90bfe8f0df5b7。
- files digest：sha256:2d2258c41073c7213beb07602e65ca59f09dd3ab5476ccfaba820e7ae31ecb7a。
- configuration digest：sha256:97c0be729d267a4a020afc2168941cc0b6b5fc40c4e6cb99d44cf04f7b8d8709。
- container：17e01dc94f916fd6fa8a3d398ff0a13871b3feffa8a496acc9e0d41b70d775ec；pid=7；verification=runtime-observer，ok=true。

HOME、会话数据、端口、模型和网关保留，但不能把保留数据说成在途请求不会中断。用户报告17:54先于此次17:57重载，因此不能直接把该次重载当作全部故障原因；此前配置保存的刷新影响另查。暂停后未再保存MCP配置、构建或重载。最后一次detail显示另有security-report-runtime.ts新增而pending_reload，属于并行报告修复，未由本任务修改或装载；旧加载摘要与当前磁盘摘要必须区分。

## ASSET-HV-02：发现接线失败

**用户确认的真实失败**：53105原会话标题“纳管一台设备”；授权范围172.16.228.1-172.16.228.254。高层返回create_soc_discovery_tasks“资产纳管分组接口未装载或存在命名歧义”，没有探测、taskId/findingId、待纳管清单或入库。原业务会话编号未由当前公开管理上下文返回，不编造编号。助手没有重放发现或登记。

**已实施的资产侧变更**：修正把组ID当作旧manager服务器ID的单一路径；按照锁定DSH公开命名合同处理本组及SOC Master已声明协议身份，再用当前Agent真实可见的精确工具注册复核，零匹配、多匹配均停止；不反拆哈希、不按后缀跨组搜、不新增HTTP路径、不重建manager。状态输出列实际匹配名与数量，不把本地入口、声明group_id、旧manager配置观测或目录可见当作SOC业务通过。原失败保留，当前原业务会话是否已唯一匹配仍待53105证据。

受控构建proposal 0a1c3efd-2c24-45ec-97d3-a473c0925edc；[入口源码](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts>)SHA256=90900b2025e32666365256a17a4c88a9aaf231b22932e53101ea8257db89adab；[构建物](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs>)SHA256=045a5bf6577895e5bb42e5e7d43bcb43048c90df7d22d4938f97d64dbe04a1e7。整体实际装载回执见上，不以此声称发现业务已通过。

## ASSET-HV-03：真实Excel解析失败

### 修复小批历史交接：已保存、检查及构建，后续R2原附件读取通过见本文开头

本小批前置来自用户确认：外部调整已完成，巡检维护会话已核9571d3b79314…cd47d525装载一致，R2双IP运行完成、9206字节报告已由浏览器实际下载，当前无本批在途业务。这些为用户提供的前置，不是本方新启动或重放的结果。本次授权只修本处及直接调用方；下列修改覆盖此前“我方尚未实施Excel修复”的阶段状态，其他旧问题不扩展。

**精确生产差异**仅为[附件模块:421–424](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-workbook.mjs#L421-L424>)服务获取表达式及两行说明：

```diff
-    const attachments = ctx?.attachments ?? ctx?.get?.('attachments')
+    // 锁定SDK允许通过公开get读取当前活动服务；不先触发未inject的属性getter。
+    // get返回undefined时仍交由verifiedBytes失败关闭，不回退触碰受限属性。
+    const attachments = typeof ctx?.get === 'function' ? ctx.get('attachments') : ctx?.attachments
```

锁定rc.5的[公开ctx.get合同](</home/cmp/.local/share/hep-runtimes/dsh-0.2.1-rc.5/node_modules/@deepseek-ai/cordis/lib/types/reflect.d.ts#L7-L16>)允许无inject读取当前活动服务；本次保留接收者且不传strict=false。get存在但服务未提供时不回退受限getter，仍由verifiedBytes返回ATTACHMENTS_UNAVAILABLE；只有无get的旧普通Mock上下文沿既有属性兼容路径。没有增加attachments为强制注入依赖，不让Excel可选服务缺失阻断其他纳管能力。

**实际修改文件**：

| 文件 | 修改范围与当前SHA256 |
| --- | --- |
| [asset-workbook.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-workbook.mjs>) | 上述唯一生产逻辑修复；c444943009f00168b1f715d39ef738b892d95cd80f75e056b602be4522f7f8b3 |
| [asset-onboarding-runtime.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L650>) | 直接调用方经受控构建同步内嵌的新取法，不手改生成物；5a75cc137ca96a7687e4da88b645bf23f1cb58040807eac819e9154d5c968a4b |
| [asset-workbook.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-workbook.test.mjs#L168-L207>) | 新增3项服务获取回归，更新Mock测试说明；179d85b57fa41b136a2055dfc5bf660ad2f25bbb83281cdcda43715a89029fc1 |
| [asset-onboarding-runtime.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-runtime.test.mjs#L124-L155>) | 新增1项实际构建MJS高层调用回归及Node内置模块导入，更新说明；9252744f351f512fe5bb9460ac1d227453612146445bb2671988fb8b8e4d0b40 |
| 本协调记录 | 本次差异、检查结果、边界及交接；不作为第二份源码或接口定义 |

[高层TS入口](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts>)未修改，SHA256仍90900b2025e32666365256a17a4c88a9aaf231b22932e53101ea8257db89adab；inject列表、对外Schema和附件引用合同未改。原xlsx提取/ZIP/XML模块、6份样本、Skill、Guard、矩阵、MCP配置、巡检报告及平台程序未改；没有安装依赖或增加文件权限。当前会话真实用户附件、原生readFileStream(ref,signal)、大小及SHA验证、200行/64KiB预算、格式与公式宏外链拒绝、完整解析后返回、未授权导入等边界保持。

**受控构建回执**：proposal=b8a01c69-2a40-418f-a991-203e1f634a2d；TypeScript=5.9.3，esbuild=0.25.12；source_sha256=5afd7415e62523d695cc15b17f496001ab0b2336959d7f74a2e342c65353f764；build_digest=446207547a6e565077c2e4df78ccbf7848dc7ab52b8f3bcabcd31e91e31d727d；构建后Candidate摘要=98b7f401ac997032bfed1aef7a3a2b6e3d6bedc6d19a8f99b0ef71fc0699c2cf。它是该次构建快照，不冒称当前实例装载摘要。

**已执行检查与真实结果**（Node v24.21.0，仅本地Mock，不连接SOC/业务实例）：

1. 修前新增定向单测：`node --test --test-name-pattern='公开附件服务' tests/asset-workbook.test.mjs`，3项中1通过、2失败，退出1；读取触发通用错误、缺服务未按原码失败，附件列举仍通过。保留负例，不降低期望。
2. 修复模块后：`node --test tests/asset-workbook.test.mjs`，17/17通过，0失败；含服务缺失、跨会话/非用户来源、非法ID/旧格式、SHA与字节、ZIP路径及展开预算、200行/64KiB、公式宏外链等既有边界。
3. 未重编旧高层构建物时：定向read_excel高层测试1项失败、退出1，证明只改独立模块不能代替更新直接调用方产物。
4. 受控重编后：`node --test tests/asset-workbook.test.mjs tests/asset-onboarding-runtime.test.mjs`，52/52通过，0失败、0跳过。新增高层回归以既有basic.xlsx真实字节、SHA和两段Mock原生流进入真实Excel提取函数，返回完整3行；断言未访问受限getter、未查找MCP工具或调用mcpSessionManager.resolveTool、无导入授权。没有桩掉Excel解析器。
5. 对生产模块、生成MJS及两份测试分别执行`node --check`，全部通过；受控构建的类型检查通过，未新增依赖。只读复核未发现阻断问题，但不替代原附件与实际装载验证。

本次测试不读取原业务附件。工作簿纯单元夹具仍标明CRC=0；高层测试只读Candidate内既有静态basic.xlsx，不能据Mock流或该样本推定原HV附件/真实原生附件后端已通过。修复前失败、旧业务WORKBOOK_REJECTED和全部历史Run保持。

**交给安全巡检会话（可由用户转述）**：本方不保存共享MCP配置、不独立重载、不启动真实业务或额外业务评测。由唯一协调方核对上述两项生产文件指纹，按其授权仅对齐当前223任务查询模板，并将相关修复统一装载一次；新装载回执须与本次修复产物对应。之后由用户在原Excel会话以原attachment_id仅解析预览，不入库；发现仍由用户在原会话限定172.16.228.1-172.16.228.254，先完整清单再核对和新确认，不修改已有资产。HV-01新增能力方案保留，不纳入本小批。

### 原失败与最初诊断（保留）

**用户报告**：session-f0c27975-ab5f-49c8-b4bd-dbd6310a37b6；实际上传“HV-20261106-仅解析不入库.xlsx”，1662字节，attachment_id=sha256:e654a3319c764cf91b3be23b2a4fff701ba0430fa98b4c1d916848324ed5ac92。attachments成功列出，read_excel返回WORKBOOK_REJECTED、complete=false、无行；未探测未登记。人工两行样本只授权预览，不代表真实设备事实。用户核对ZIP CRC与OOXML主文件可读，不能因此断言完整兼容，也不能判文件坏。

**修前源码证实的接入缺陷**：旧模块SHA256=e10bb097cbc8a6e0817e3efe0c8e5bb24385e92ec8e4c51629554c9bfde9f747，其421行先求值ctx.attachments，而调用插件未声明attachments注入。锁定SDK的受限属性getter可抛普通Error，后面的ctx.get兜底不会执行；该异常会被旧443–448行折叠为WORKBOOK_REJECTED，且发生在读取字节前。附件列表分支不取服务，与已报告现象相符。readFileStream的ref/信号参数及extractWorkbook同步输出合同未发现错配。当前改后代码与检查结果见本节交接，不把修前描述当作现状。

原次错误被折叠、尚未取得原异常，不能仅凭原失败回执唯一归因。本处代码缺陷在该修复小批按公开ctx.get取法修复并通过本地检查，交接时未由本方装载；后续用户已报告R2原附件读取/完整展示通过，当前状态见本文开头，不再重复修getter。不得增加任意路径/Scope绕读，不放宽当前会话真实附件、字节数/SHA、公式/宏/外链、大小/行数/完整性限制。

[真实下载样本asset-basic.xlsx](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/fixtures/asset-onboarding/asset-basic.xlsx>)已通过文件交付卡提供，摘要与其他合成样本见[manifest](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/fixtures/asset-onboarding/manifest.json>)。文件生成及ZIP CRC检查不是业务解析验收，更不授权生产登记。

## 测试与本批适用范围

当前[业务用例](<../../evaluation.md#L1818-L1952>)已补充U-ONBOARD-007至014，共14条资产纳管用例；6份实际xlsx合成输入已保存，缺原生附件或隔离环境的正向用例不启动、不算通过。两份Mock源码此前48项在该阶段未执行；本修复小批新增及执行结果见ASSET-HV-03交接。数量、CRC检查或本地Mock通过均不代替53105真实业务验证。

旧隔离[run-5a068dbb](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-5a068dbb-f658-4698-a69b-f5b8e6937e16/report.md>)为1通过、1失败，保留“本地工具存在被误说成SOC已接入”真实失败；[run-59ef1585](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-59ef1585-8641-4de2-ab9c-7b63d499e46e/report.md>)为2通过，但status实际因缺sourceStatus方法报错，不称状态接口技术通过；[run-1791575e](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-1791575e-eeb5-4676-a443-d7838263560a/report.md>)为1通过，支持其封存来源下准确报告未就绪，不是53105业务接线/发现/登记通过。上述均同一路由自评、未独立复核，且早于本批已装载的最终接线修正；不合并为本批通过率，不改历史Run。

## 与巡检维护会话的协调交接

当前管理工具没有向非本代理子会话直接发消息的入口；未假称已联系上另一维护会话。本记录是可共享的协调事实源，请巡检维护会话与操作者共同核对：

1. 17:28成功准备范围及17:54两次零范围请求的非敏感实际参数、调用入口、工具目录变更与来源绑定；已有原运行只读回查，不能重启。
2. 本批正确SOC目标已由用户固定为223，不再要求在223/232二选一。维护方应说明232的服务角色、地址切换责任与时刻，对照保存前后revision、规范servers与转换base；不能按旧地址盲回滚。最小待执行数据修复仅为将资产组的唯一任务查询模板对齐已核223目录，不改其他server、凭据、分组或工具选择；但当前保存合同会自动校验/重载，须先协调其他组和旧会话的刷新影响，发布冻结未解除前不执行。
3. 核对inspection-status当次版本与master绑定、当前范围解析；若范围解析异常，不降级ALL。若源/身份变化，先在统一来源修复，不挪用其他组。
4. 发布冻结解除后，先在53105同会话只读核对目录/接线及原资产范围，再由用户决定是否重试既定巡检或发现；Excel先仅解析预览。

缺少这些证据时保持原因未定，保留三条真实失败、原运行及报告。没有将任何隔离评测判分迁移为本批通过。

## INS-HV-01：spill终态误拒首轮历史（58项，后续兼容补核见下文）

本节保留首轮构建和失败证据，不是当前候选的最终指纹。该阶段“省略run_id只核最新启动再拒绝”的实现不符合原“最近已完成报告”契约，已纳入后续补核；不能把该中间实现描述当成原公共语义。

本节由巡检维护会话补充，范围仅报告来源选择、导出巡检分支、直接配套类型/测试和受管生成物；不覆盖前文资产维护改动。用户仍有业务聊天交付在途，本补丁不装载、不保存共享配置、不重放业务；原生轮询及any展示只挂单，不阻塞本补丁。

### 已证根因

原漏洞会话session-e62b8fee-1fe0-4527-8299-78f05a4c8857、run-4d74aebe-5bf3-4207-87ab-47d6bfef0082：seq109为本会话真实受理，seq114可完整解码且状态running；seq137展示头部已为completed，但包含spill省略，整条不再是完整JSON。旧选择器跳过无法解码的新回执，误取seq114的旧running，seq142遂报“原巡检尚未成功结束”。拒绝发生在读取报告之前，不归因为1738894字节报告过大，也不把业务incomplete当作执行未完成。原失败、原报告和全部运行保持原样。

### 局部实现与边界

1. 来源选择仅绑定当前会话真实成功巡检调用的run_id/workflow，保留原工具调用/回执配对、正确分组、继承前缀剔除及冲突拒绝；不再用聊天展示中的查询快照判断终态。当前resolver未精确确认启动工具身份时返回undefined并拒绝，不能回退旧canonical拼写猜源。没有可验证的真实启动来源仍拒绝，不从spill文件路径补读或凭模型run编号放行。省略run_id的原行为仍核本会话最近真实启动，不自动换成更早已完成者，参数说明同步澄清而不增参数。
2. 导出器通过原已注册inspection-compositions的get_composition_run，经公开ctx.tools.execute及既有策略管线获取本次canonical value，解开实际MCP content/structuredContent及ok/result包裹；严格检查同run、同流程、外层status=completed和唯一非空HTML产物，再按同run读取原artifact。value不是绕过政策的原协议响应，isError或无效完整结构仍拒绝，不回退聊天快照。业务result.status=incomplete不妨碍已completed运行的原报告导出。
3. 沿用原agent、signal、rootCallId及exec.token作为parent，逐项转交additionalContexts；查询或报告读取阶段取消/失败不继续保存。若取消恰落在原生保存已开始后，只等待原操作结束并拒绝成功返回，可能已留完整附件，不声称删除回滚。保留原参数/MCP契约、HTML完整性、32MiB上限、原生附件保存及路径获取；核对报告filename/contentType与同次元数据、实际UTF8字节数一致。没有任意文件读取、HTTP回退、跨组猜名、新权限或依赖。故障报告分支、Skill、Guard、矩阵、Preset、SOC事实及历史HTML未修改。

### 实际文件与构建指纹

| 文件 | 本补丁前SHA256 | 本补丁后SHA256 |
| --- | --- | --- |
| [security-report-source.mjs](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs>) | c846335813fc2532c2ad2df7523a23aee231bf4e49d181a524022f1beca0659e | d68e8bcac67214009b683ec82e6855f24470b947bcd4d5dacd52b937326f5782 |
| [security-report-runtime.ts](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts>) | cc70fd732af6d98afe9446ab736247fea02607f2e0b5008e27cb35a52aef9444 | 3965e686bfd6c4e4a5fbcb3cfc7d905ae684b45d204cc79025281fada5f5b539 |
| [配套类型声明](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.d.mts>) | 178362fa1273fcf532c748421c9766c13e699043ba94113ae8b74516eebf31b4 | 73e70f37e62a811cb36eb3c093ff6ea80cede7b9a4b8b35556cdbb3157a55658 |
| [受管生成物](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs>) | f5ec1be10c458b1a46cfee9a2fb372a6794e1c94b9774657940cce440fa26208 | 6f84d8d25c227f5744004ffbb67abe3f360f6e19e8b0e828e64ef74928c4eab6 |
| [本地Mock回归](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/security-report-runtime.test.mjs>) | 新增；首份失败回归4b67a06823fdfc661b3d95abe83af7a23a80f40480ddfa5ee06c31cd5c1b205d | db563f934349a8d4c062220c40a2f06611af30b2655c8f6c897b271482bb5c0d |

最终受管assets/build回执89d276c8-f415-4f44-9f21-a8c57e86ac97；TypeScript5.9.3、esbuild0.25.12；source_sha256=c2140e71037d4d9605914d5ee34fdc1ae8ea12c3406338b7a3faa919e94b754f；build_digest=32d54d1f59a07911cef75d6291f267f23977bc99b3e6a5c863c53a0e9ae22ad1。构建后目录摘要6e81a198127442a21223ea92680fb6764a31c5091daf9175a7c7e48a3ed30665，仅为该次候选快照，不冒称Git固定版本或实际加载摘要。首次中间构建回执acd2ec3b-105a-47d0-b629-6d79b682b46c、ESM=c99743527d7b8b5fe1851ebc8f6e81ea3973738a13263719922661db27bea297支持当时48项Mock；之后的小范围只读审查发现原有未匹配resolver仍回退旧拼写的来源缺口，补充失败回归并修正后完成本次最终构建，不将中间生成物当作待装载产物。

### 修前失败与修后检查

- 先保存回归，再以旧生成物运行`node --test --test-name-pattern='spill' tests/security-report-runtime.test.mjs`：1项失败、退出1，错误正是“原巡检尚未成功结束”，失败未降低期望或删除。
- 小范围审查后追加`resolver`定向回归：在中间生成物上2项均失败、退出1，均为Missing expected rejection，证明原名回退不能当作已配对来源；未匹配改为undefined后纳入最终回归。补充artifact规范失败/截断及合法UserMessage上下文原对象、顺序、失败/取消转交检查，不新增依赖或权限。
- 最终修复及受管重编后，`node --test tests/security-report-runtime.test.mjs`：58/58通过、0失败、0跳过。覆盖普通/分段/structured完整回执与普通/分段/spill展示组合；accepted/running/failed/canceled/cancelled及缺状态拒绝；completed且业务incomplete允许；跨会话编号、错误分组/流程、继承来源、重复回执、原始回执失败/截断、唯一HTML元数据、大小报告UTF8原字节/SHA、32MiB上限、取消、缺注册入口/路径及任意路径参数拒绝。
- 生产helper、测试及受管生成物的`node --check`通过；受管构建类型检查通过。research/validate为valid=true、errors=[]，既有ACTIVE_OUTCOME告警原样保留。
- 全部为本地Mock和静态检查：未连接SOC、未运行模型、未读真实业务附件、未启动/重放巡检或额外业务评测，不是浏览器下载或生产导出已通过的证据。公开rc.5 SDK合同已复核，调用方只使用原有注册/执行与附件能力，不自行改权限/API。

### 待协调装载与真实复验

本补丁仅保存候选及受管构建，未进行任何实例装载。待用户明确业务交付结束、通知空闲后，再统一安排一次定向装载及实际摘要回读；不以构建通过代替生效。随后由用户在53105原会话对既有completed运行导出报告即可，不为修复验证重起巡检：漏洞、基线、可达、常规分别沿原run核完整下载及字节/SHA，状态已成功下载的398387字节/SHA95d1eddc7138a48869c8f1d2f251092dc109ca501fa3626f8b78bfef724a24be作为非回归对照；运行中/失败/取消和来源未核验仍不得作为已完成报告导出。

## 本次接续：INS-HV-08、默认兼容与统一构建检查（待资产接线后装载）

### 本方已完成的最小修复

- INS-HV-08原始单IP会话session-8e183463-00e5-420c-964f-e49fffb6df11、run-d7e55a76-6268-4774-a34f-a2fc50fac334已completed仍被“当前请求没有报告生成或下载意图”拒绝。根因是私有动词识别漏掉“给出”；本次补明确“给出/出具/发给我”等报告交付问法及前后顺序，保留咨询、否定/取消与无报告请求拒绝。原句已作为集成回归，不改原运行和报告。
- 兼容补核先以旧生成物执行INS08及默认选择4项，全部失败、退出1，失败保留。现默认只从本会话真实来源倒序候选读取当前完整canonical状态，跳过已知running/failed/canceled等非完成运行，选择最近已完成原报告；未知、读取错误、来源错配不跳过。显式run_id候选仅它自己，失败不切换旧ID。原Tool参数和权限不增项。
- 当前并行故障正文、原附件复用及troubleshooting原报告逻辑均保留。共享canonical映射允许故障“活动痕迹”识别的设计未覆盖；巡检分支单独使用同组resolver精确映射，未匹配仍拒绝，不用旧拼写猜源。

### 本次实际检查与指纹

| 对象 | 本次结果/指纹 |
| --- | --- |
| 报告TS | 731b5bb13679a42b3fd09ca78a1a0693a6e66946686c1cb7d0ad691fcd9239f6 |
| 报告来源MJS | 40daacb1af53693a15bb36e7b07d5d86838966bc0d7380de4026b0161190f288 |
| 配套声明 | e0e7c831647c9d3dcc050d52ff7cac8ea66d02d09d507a95f04e65321105a86c |
| 受管报告MJS | c358d85820ee8f2df7a80d39c871c2096a35ddb6b847d585aa2e5ebef2086161；build回执61595669-fb6e-48be-b891-c2b0b3083b11 |
| 巡检专用回归 | 源码模式及受管MJS模式各85/85通过，0失败/跳过；[回归源码](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/security-report-runtime.test.mjs>) SHA8168d4331c61b42d2df7854406a5bd0f415c7d649869bc01ed21b7380de70aa8 |
| 并行报告兼容 | 按[故障接入交接](</home/cmp/harness-engineering-platform-data/agents/security-operations-expert/docs/troubleshooting-candidate-integration-20261107.md>)指定4套测试，审过导入/副作用后明确列文件运行，300/300通过，0失败/跳过；覆盖入口、主助手/legacy、新故障来源和Client VM，不等于真实GUI下载或业务通过 |
| 已交接资产TS | f98b3b00f79cb02784edb3dcf9c74a018fe1863b32dccae81e2c81a32dfc023d；本方未重复修改其源码 |
| 受管资产MJS | d349ddd705a88e82496c3a8cb91c52443a56e60744b1fd33ad33f31f147d6a2c；build回执63aed2be-a1a3-4975-b3b0-8648e085713a |
| 资产范围/否定 | 既有直接TS的20项Mock由本方复核20/20通过；未调用MCP、未写业务日记；不是实际发现或入库结果 |

两个构建均通过固定TypeScript5.9.3/esbuild0.25.12类型检查，运行时依赖未新增；报告生成物仅node:crypto。报告/资产生成物及来源/测试语法检查通过。research/validate为valid=true、errors=[]，既有ACTIVE_OUTCOME告警保留。Node源码模式有MODULE_TYPELESS_PACKAGE_JSON警告，未为消除告警修改宿主配置或依赖。各组技术结果分列，不混成业务通过率。

### 时序及剩余前置

用户先要求等待资产业务窗口，后明确21:57原156会话discover止于本地注册查找、无SOC请求/taskId/扫描/入库，窗口已结束。该失败只按用户新证据保留，不反写成SOC拒绝。根会话随后授权继续受管构建与离线检查，但要求最终装载等待资产6项操作及1模板最小主助手接线交接。本方已先给准备回执并完成上述两项构建，未对实例发起新装载、未保存共享配置、未重放任何真实业务。

待资产接线交接齐备，只核该来源绑定及最新源码/生成物，不扩大报告研究；前置满足后一次定向装载并回读current/loaded一致，再由根会话在53105原业务会话发起真实六类与下载。多IP去重新run-a0173fcf-ebde-4bdf-a4f3-a109c0425992的2台/9209字节真实下载、CIDR新run-c386826e-9adb-486d-a856-414b86f09e2f的8台/32359字节真实下载，以及深度原运行completed复核均按用户回执保留，不计为本补丁装载后的验证。

## 共享提供者与最终资产源码构建结果（现已暂停，待统一验收；未装载）

本节为安全巡检按根会话直接续授权完成的实际结果。只维护本候选；未运行程序package scripts、未安装依赖、未保存共享MCP配置、未改认证/允许集或SOC环境，未发起新的实例重载/真实业务。前述58/85/20阶段均保留时点，不冒称最终资产接线已生效。

### 完整公开组v2来源与本地兼容

完整公开index/openapi/connection三源迁入候选自包含闭包，不跨目录import程序源码。读取的上游工作文件SHA依次为16af07203fe4f0a72d4d17b17fd43b4d18b060c4f3e390b6d53e7cecf30e407d、d819b7e967ae763dbb7952523e3d894ad4171d47e311d07e105dd666aa2f5692、09d66d933a12a12d500c606ce9744e10348a48eb732cf77ae56a68012098adf3；这是读取快照，不冒称固定Git提交。

本地仅保必要兼容：源码引用openapi.ts避免误混旧MJS；保snapshot/publicToolName/listAll导出、原Runtime anchor开关、sourceStatus原配置布尔语义；无withToolContext时按真实活跃Agent注册可见性resolve及清理，不塞no-op上下文；OpenAPI保原HTTP状态meta；新v1/v2摘要/来源/typed模板/取消/凭据就绪及业务header不降级主体保留。Strict Managed检查曾报隐式any，已仅补回调类型不放宽编译配置。真实SDK兼容测试另证v1健康成员隔离会回归，已在v1目录分支保留单成员失败隔离（取消仍抛），未删除该断言。

### 最终受管构建快照

- [提供者index源码](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.ts>) SHA=cf23516fad250cb42b4add3271666ae07a5fb9bb4488d81fff3420dd8d63ef83；[index产物](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.mjs>) SHA=bbbf77f95e6166151b7f51461555b10943e212286bb895d2512820236bb6fe0b；受管build回执e457300e-30f9-4b79-aa03-6f5af7137b3b（前次313b96e6为补v1隔离前快照，不再作为最终产物）。
- [OpenAPI源码](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/openapi.ts>) SHA=7af7dab8d039fb2d536e359130dd8f46191a2424a04a3e89fe88baf177b91c31；[OpenAPI产物](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/openapi.mjs>) SHA=7e9e243104a73ca64de2ffae353d982afc33121f5f6d974ed3b8c47065448f63；受管build回执c17acf1c-7a9a-4fa4-a326-4f0f68bde5ab。connection源码与上游逐字节相同，已入两个受管闭包。
- [最终资产TS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts>) SHA=fdb2c5c91222d2d502e86712c76a8a6f4987cd5198b0f97c7a07961d7e4a6dc5；[最终资产MJS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs>) SHA=ccb404e92ae333a3cdf8bb6269d495a0323f0685dcc589b4af56deafd71b570c；受管build回执c3029ba6-389f-4fee-a642-d69848fae36b。d349旧产物仅含上一阶段范围修复，不冒充此最终组消费方。

### 实际技术检查（不等于SOC业务结果）

1. [新提供者回归](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/mcp-group-v2-provider.test.mjs>)先在旧MJS复现3项方法不存在失败；最终4/4通过，包括实际受管提供者+实际受管资产适配器的同任务模板正文闭环。所有fetch固定内存fixture.invalid响应，无真实网络/SOC/FS业务。闭环首次因Mock头缺原生必需字段、其次因Mock业务回执缺code失败，按真实结构补Mock，不放宽实现。
2. [既有资源回归](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/mcp-resources.test.mjs>)明确选OpenAPI/分页/分组/resolve/真实MCP资源6项，6/6通过。v2按现行公开组边界原名及资源转只读工具迁移断言，增加来源meta与离线成员标识检查；v1原名前缀及健康成员隔离断言保留。仅localhost临时SDK fixture，未接SOC；未跑其无关自动化路由用例。
3. 最终资产组19+范围21+附件17共57/57本地Mock由本方复核通过，原Node类型警告保留；报告85/85在提供者升级后复核通过。并行报告300项通过仍按前述受管快照解释。
4. 初次Host测试anchor缺@modelcontextprotocol/server导致导入前失败，未伪称v2业务失败；复用Host现有公开Node依赖路径后才执行上述断言，无安装或新增依赖。Host Mock不证明目标运行时的真实装配。

### 最后一个确证装配缺口

本方只读提取目标实例生成的business.patch.yml非敏感id/name/inject及groups/servers选择字段（不读HOME、不输出headers/token）。该现有装配禁用了mcp-session-manager，实际插入business-mcp-manager=/opt/harness-platform/business/mcp-manager.js、inject businessRuntime。给它的servers为原有八个来源，**没有ai-soc-master/asset-management；groups只有emergency-action，没有asset-management**。故不能把平台已保存6+1目录、候选新方法或Mock闭环，等同目标真实provider已获得此组。

研发本次只读核对与本会话子任务60249e53-9fc9-4920-9897-b64346a7171f的结论一致：[business.ts:135–150](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/business.ts#L135-L150>)定位原manager，[实际禁用/替换:180–186](</home/cmp/work/harness-engineering-platform/runtime/adapters/dsh-container/business.ts#L180-L186>)禁用Candidate manager并传原配置给/opt/harness-platform/business/mcp-manager.js；[管理包装businessRuntime分支:81–87](</home/cmp/work/harness-engineering-platform/platform/plugin/src/mcp/manager.ts#L81-L87>)仅覆盖servers，保留suppliedConfig.groups，不自动追加平台全部组。子任务明确：三源能受管构建与实际业务provider取得asset-management是两件事；种子也不能单独冒称保留HOME后的有效Profile。结合上文实际生成Patch的非敏感配置，现有资产组装配缺口已确证；新私有listGroupTools(asset-management)不能凭编译通过或4项内存闭环推定目标实例可用。未新增第二份平台wrapper或no-op context；共同平台根因整改、构建与唯一最终装载由研发承担。本方不手改HOME或生成Patch、不新增凭据/HTTP代理/全局子助手客户端。尚需通过既有受管装配入口，将平台已保存asset-management六动作+1模板投影到该实例有效provider配置并给非敏感回执（最终入口、group/member选择、来源引用）；此项闭合前不盲重载或声称本地未注册已治愈。源码/生成物与技术结果已经可交，不再扩展报告研究。

### 本会话统一验收冻结交接

根会话现已直接要求“完成当前修改后暂停，统一验收”。本方必要源码、受管产物和上述检查已收口；此后仅补本交接，不继续写Candidate或共用evaluation.md，不发起新构建、重载、评测或业务。自动目标已按本次直接请求暂停（revision13、phase=paused、activation=disarmed），不是完成或回退；待统一验收另行指令，不凭本节旧装载计划自行恢复。

本批实际改动文件（均保留其中他方并行内容；生成物只由受管构建生成）：

- 报告源码/类型：[运行TS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts>)、[来源解析MJS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs>)、[来源声明](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.d.mts>)；[受管报告MJS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs>)；[报告回归](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/security-report-runtime.test.mjs>)。本方只负责INS01/08和省略run_id兼容，保留并行故障/排查交付逻辑，不把整文件他方成果计为本方。
- 提供者：[index.ts](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.ts>)、[openapi.ts](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/openapi.ts>)、新增[connection.ts](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/connection.ts>)；受管[index.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.mjs>)及[openapi.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/openapi.mjs>)；[资源兼容回归](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/mcp-resources.test.mjs>)及新增[提供者闭环回归](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/mcp-group-v2-provider.test.mjs>)。
- 资产仅由本方受管重编[最终MJS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs>)；最终私有TS、组/范围/附件测试、资产Skill归资产方，不计为本方源码修改。本方复核了其57项。
- 文档只补本文对应报告/提供者/冻结交接；本轮未新增共用evaluation.md写入，未修改共享Guard、允许集、模型、端口、网关或运行配置。

在途核对：本次再次只读确认background jobs为空，全部后代只有以下8个直接子助手，均inactive，无运行中后代。本方自动目标仍revision13、paused/disarmed，没有恢复；无本方未完成写入、构建、重载或业务动作，无需强杀/取消他方任务。全部修改及HOME、会话、Run、报告、模型、端口和53105网关原样保留，无回退或覆盖恢复项。

供冻结核对的原生子任务地址（session ID，不伪造未返回的Web深链）：父会话session-6a79ab7e-f558-4cc5-b45d-7cc2e4c52975。以下会话原生仍可再次投递继续，但当前授权已暂停，本方不会再派发；inactive不等于技术撤销其底层文件权限，不把它们说成正在写入。

| 子任务session ID | 原任务 | 当前状态 |
| --- | --- | --- |
| 60249e53-9fc9-4920-9897-b64346a7171f | 公开SDK/提供者源码适配及装配审查，曾受托写3份TS，现已交接停写 | inactive |
| f76ae821-15ac-4560-b045-9587b1de28cc | 重排巡检用例顺序（历史委派） | inactive |
| 8661ebef-5189-457e-8871-520290d235c5 | 后半巡检边界核对 | inactive |
| ee3aee34-6742-41a2-825d-884bb75deec9 | 前半巡检用例核对 | inactive |
| 75ff75de-d687-4ca1-971b-a7a5375e6a54 | 执行范围覆盖核对 | inactive |
| 2f8961dd-ae27-4f95-ab08-11a1e9c285b5 | 报告异常边界核对 | inactive |
| 110c50d8-72b7-45d6-a979-8fa861114ea9 | 候选既有报告交付机制审查 | inactive |
| f60f275d-14e0-40af-9f6b-6b217973078d | 官方原生产物交付合同核对 | inactive |

未验证边界：上节实际provider组投影缺项保留；没有本批新current==loaded真实回执，06:30 observer挂载计划不一致仍未通过，不以Mock/旧成功加载替代。最终平台激活、冻结后统一重载/评测归研发协调，本方不重复执行。根会话提供的故障迁移两包44合同、正式LFX边界及图浏览器通过按其原证据保留，不冒称本方重验；子Guard既有威胁单次断言28/29的失败保留，不改口径或重跑洗掉。
