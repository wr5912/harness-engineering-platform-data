# Evaluation Observations

## 当前结论

用户已确认代表事件为INC-20261029-000016，并改用指定实例手工回归，不再将全部进展绑定到不可用的独立自动评测入口。当前已核验两条核心程序路径：完整研判后的受限规则建议技术链，以及单侧白名单直接命中的快速分类。后者的程序路由、内层未调用模型、新规则阶段未进入和交付保存核验通过。

这不是整体验收、规则有效性或安全准确性通过。完整研判仍有证据值匹配警告，规则上下文partial、当前版本未知；新基础failed降权分支及其他未覆盖项仍按下文保留。研究结论保持inconclusive，不作adopt，不更改启用EXP024或未经核对的并行版本026/027。

## 范围、保存和静态检查

用户授权直接在独立EXP025 Candidate续作并接受共享实例影响，仅主动重载threat-analysis-test001。阶段0–2的基础提示词、取证、快速路由及原校验器未改；仅纠正新增后置分支的一刀切门槛，原基础failed仍保留，规则上下文降权为partial/confirmation_only，未通过校验的模型事实ID不得作为独立证据，禁止候选修改。采集failed仍不调模型，not_applicable不表示基础通过。

新增/接入Python的AST语法检查通过；runner相对门槛修正前仅_attach_rule_stage变化，整个_analyze和CLI未变。重载前发现的CLI多余参数已纠正。基础20个桥接映射不变，新增7个只读映射不进入MANUAL_REQUIRED；TS/MJS映射结构一致，平台MJS语法检查通过。未执行编译或直接运行Candidate/程序测试，TS没有编译验证；只读代码复核不当业务通过。

最终模块摘要：runner `51d20d03e6c0034577088287d05a8dc6265fe136362bc1de4bb26942ff6d42bf`；规则模型 `a51abad82ea88534514b5c3adacdc7a070c339404fadbe45d95b20a9576c3266`；规则阅读投影 `780a5899c78ef49e7b83f330909e825c846669f029ccfa9e61250c5a0d2c6e16`。基础校验器仍为 `63f75630c8cbbd6dc98bf6364bf1de5864cdc4fb6eff81b6bd5d47927bd1bdfc`，基础提示词仍为 `13371c8ada5e688cfe2de8d02fe058d3fdb97d35dcaa74b5f34d0ee8acf12e6b`。

指定实例已通过平台重载（最近回执09a1ef89-4931-4daf-8bd2-5424c95a5850）并回读running、EXP025只读挂载、HOME保留、原local/Qwen3.8-27B策略。白名单本轮核验再次确认相同来源及策略，未改源码、配置或再重启。Candidate观察摘要仍为 `15bfdc6756a65ae9546c7a430d805e752d12480156c1645b20763ccc27f32c8e`，工作树未固定，不称可完整恢复或已发布。备份、静态检查和各Run的机械核验制品存于工作区 `.local/artifacts/rule-opt-implementation-20261029/`，不是另一份Harness。

## 真实业务运行证据

### 旧门槛下的基础失败隔离

业务Run `run-39830738-f141-4153-b4f3-a10a26864e4c`：事件INC-20261029-000016，响应Qwen3.8-27B；基础38次MCP、0失败，validation failed，错误secondary_findings.type lacks attack semantic。旧新增guard因此未进入规则收集/模型，JSON not_run、效果未评估；这是发现一刀切门槛问题的证据，不能作为修正版failed降权分支通过。

已比较冻结摘要、基础原结果及validation，除建议字段外均保持不变；null规则诊断正常展示，不退为全字段原文；摘要JSON、SOC resultJson建议相同，报告HTML与提交相同。结果与报告保存回执saved，结果终态请求1次。保存成功不替代基础通过。用户随后确认代表事件改为29日，原28日Case/历史Run不改。

### 补充完整事件000015

业务Run `run-8198ae2b-3acd-4f67-93b6-f7a1d268aa0a`：INC-20261029-000015；基础及第二模型响应均Qwen3.8-27B，基础passed_with_warnings、8条证据值匹配警告。规则新增5次读取均成功（列表1、详情3、推理完整定义1），17互异命中去重为1个推理身份，0个SOC检测身份，34外部告警排除。上下文partial，程序记录34条引用差异和1条当前版本未知；引用差异是否仅EDR命名空间表记尚未归因，不直接当SOC规则缺陷。

第二模型实际运行、JSON pass、1条needs_confirmation且无candidate_changes。原始模型建议未静默改写，有效输入与保存上下文相同；基础除建议外不变、validation不变，摘要/SOC建议相同、报告HTML同源，两项保存saved。仅确认not-before时序语义和当前版本，不当成已发现可执行优化；效果not_evaluated。此补充事件不替代000016或固定版比较。

### 代表完整事件000016

业务Run `run-ff4432e7-f6dd-4702-a2f2-4b87fc39cc59`：INC-20261029-000016；基础及第二模型响应均Qwen3.8-27B。基础56次MCP、0失败，passed_with_warnings、4条证据值匹配警告。基础提示词未改、输入已变化，不将相对旧Run的状态变化归因于门槛修正，也不说本轮触发了基础failed降权分支。

规则新增5次读取均成功，17互异命中按家族/业务ID/命中版本归并为1个reasoning身份，16次重复规则命中折叠；只读取3个代表详情，不宣称全求值路径分布。34外部告警未被当作SOC检测规则查询，检测身份0。历史版本保留，当前version=null，没有套用历史版本；当前定义enabled=0仅为配置观察，不证明运行端都已停用。

有效上下文为完整JSON、32706 UTF-8字节，与保存的第二请求内容相同；规则阶段completed、JSON pass、上下文partial。输出1条needs_confirmation、无candidate_changes，引用3个已采集命中ID和当前版本缺口，均属于冻结白名单。原始建议=最终=摘要/SOC；基础除建议字段外不变、validation不变，冻结摘要匹配；报告HTML与提交内容相同，结果与报告保存回执saved、终态结果请求1次。

该建议仅为确认版本和时序，不是已证实规则缺陷；当前描述已说明启动不早于创建、同毫秒不证明严格先后，所谓当前生效状态仍需核实。未执行SOC规则写入、启用或DSL验证，效果not_evaluated。业务Run没有冻结完整源码身份，不作固定版本比较。

### 手工白名单快速分支：程序回归通过

用户提供业务Run `run-e46f10d3-313f-4d96-9a03-d11d3c0fc27c`；从实例HOME回读确认事件INC-20261027-000038。原始名单回执成功：启用的SRC_IP白名单条目 `wl-21c59177-68d9-4f24-b2f2-8f99625c07ab`，值172.16.2.110、level=SOFT、scopeRuleIds为空；黑名单total=0且rows为空。该IP等于事件sourceIp，不依据操作者口头标签推断。审计complete=true、errors为空、reason=one_sided_match，6个关联告警均回查，合计9次取证调用零失败。

结果为fast_classification、按名单规则给误报；内层llm_invoked=false、model=null，模型制品不存在，规则阶段包络/规则目录/基础后置冻结制品均未产生。原快速业务结果仅verdict/matches，没有新规则字段。快判原始输出=本地结果=SOC resultJson；matches等于审计，摘要与原投影一致，报告HTML等于提交内容；结果与报告保存回执均saved，结果请求1次。

名单接口未返回版本，list_version=null原样保留；记录查询时刻2026-10-29T09:34:43.317064+00:00及原始快照，不自造版本。摘要明确该结论由名单规则生成、未作完整行为研判。本结论仅证明原策略和新模块隔离符合该分支预期，不证明事件已从行为层面排除威胁，也不评判SOFT白名单策略本身是否合理。主会话实际模型/界面展示和浏览器下载内容未由本业务制品证明。

用户已先完成手工运行，后补录U-THREAT-FAST-MANUAL-WHITELIST作为后续规范化复测模板；预期沿用会话测试前说明与既有U-THREAT-FAST，不声称新Case事前被该Run选中或重建完整用户消息，不改写已完成Run。Case及预期只在[Agent用例](<agents/security-operations-expert/evaluation.md>)维护；现SHA `d7e25ff5c540d641f3c521010ae8298dc40902438425ff247f522ca4106a9381`。原28日U-THREAT-RULE-REAL、29日U-THREAT-RULE-CONFIRMATION及其他并行用例保留。

## 独立自动评测的历史限制

研究[run-ffd195e5-2fdf-4d66-a8f1-254a50643daa](<evolution/experiments/EXP-security-operations-expert-025-r3f8a8b3da3f1/runs/run-ffd195e5-2fdf-4d66-a8f1-254a50643daa/report.md>)选择U-THREAT-FAST、U-THREAT-CONTRACT，api/review=none；来源matched、当时Candidate摘要9924b2b487e3d4d21635a2bbe075c8292a79a3fffaae809794dbb6624a998e57。独立实例security-operations-expert-eval-0fac2afa实际qwen/Qwen3.5-4B，Turn错误、无工具调用，发现后取消且实例已停。job 96f56791-0d8c-413d-9a56-096b552bdbd1为cancelled；2 Trial、0完成、1错误、1跳过、0通过、0失败、2无法判定。观察10次失败模型尝试，完整调用数/Token费用未知，不能将结算下界0当作实际0消耗，也不归因到新规则模块或断言指定实例模型不可用。

后续明确Qwen3.8-27B的full/api预览仍被拒绝，model参数只检查预期、不切Runtime，没有再启动错误模型。该限制只涉及自动入口，不是指定实例有问题，也不阻止用户授权的手工回归。此次白名单手工证据不改写原自动Trial为通过，不代表独立基本Mock合同已执行。

## 仍未覆盖与使用边界

新基础failed后的降权、基本Mock输出合同、正向SOC检测定义、窗口家族、取消/超时注入及效果回放仍未充分验证；名单不完整或双侧冲突的实际分支也不由本次单侧白名单覆盖。完整事件保留4/8条基础警告和规则上下文缺口，不以JSON通过替代基础真实性验证。

SOC存储已返回真实下载ID/URL；网页工具拒绝内网地址，未回读下载内容，不记成SOC存储或下载端点失败，也不换网络方式绕过。当前已通过的程序路径与未覆盖部分分别保留，不再反复测正常分支冒充失败覆盖，不宣称生产效果或完整业务验收通过。

## 2026-10-30 续办本地路由未登记导致“当前不可使用模型”

实例 emergency-action2 会话 `session-ae674b35-02dc-4d15-b203-c032d2850662` 第2轮运行失败，报 `security-operations-expert 当前不可使用模型 threat-analysis-continuation/bound-recommendation`。该轮此前收到子任务 `9548cb9b-be37-44ff-beab-ac164d25a559` 的完成通知（研判在运行前置检查阶段失败，缺少必需的 SOC 映射）。会话 `request/header` 记录 provider=threat-analysis-continuation、model=bound-recommendation，`assistant/attempt` 空流后轮次结束。

定位：threat-analysis.mjs 的 resumeProvider（研判后处置准备的本地固定适配器）发起该路由，但未登记在 role-tool-matrix.yaml 的 `runtime_capabilities.local_model_routes`；实例启动生成的 model.patch.yml 只有 automation、delivery、security-operation-delivery 三条，harness-model-runtime 在 llm/stream 前按 allowed∪localRoutes 校验并抛出该错误。threat-analysis.mjs 于 2026-10-29 07:30 引入该路由，矩阵最后修改为 10-26 18:34，实例 10-29 18:08 重启仍按旧矩阵生成，故装载 EXP025 的实例进入该分支必然失败。插件本意是交付停止或摘要说明，路由被拦后只余模型错误，真实失败原因被覆盖。

修复：role-tool-matrix.yaml 增加 `threat-analysis-continuation` / `bound-recommendation`，写入后 SHA 为 `bea55e216f2e7a8bc7fb1de36d8117573bce69f40c81feb417d0f06aa89bb18c`；以平台 restart 重启 emergency-action2，回读 model.patch.yml 的 localRoutes 为 4 条、allowed 仍 19 条、model_policy sha256 未变（`16ac3f6640478108a1ed64c8dbbb0f96839b0858a3ab0dac8fbab94f37ac3bba`），实例登记 source_digest 变为 `sha256:ae26db04cedc5f4d24a46fd077c8d1ae27bb2caac3e7b7f7c4e563dbe4dcc0a8`，容器 dsh_running=true、监听正常。

本次未创建业务 Run，未重放研判→处置链路：续办分支的实际交付文本、处置准备与后续确认仍待真实事件重放验证，配置生效不等于业务通过。上文 decision 中“未改源码、模型配置或再重启”是当次事实，本次修改不改写该历史记录；Candidate 观察摘要随之变化，不再沿用 `15bfdc…` 作为当前摘要。
