# 输入、证据与执行边界

## 唯一合同与对象

公开输入及固定检查项以[TS入口的inputSchema、branchItems](<../src/index.ts>)为准，组合身份和连接以[定义](<../composition.json>)为准。只接受已确认的源/目标IP、单个协议端口及带时区且递增的证据窗口；不从业务名称、旧Case、NAT候选或历史探测猜对象。prepare纯校验，分别克隆输入、scope.requested和端点；resolve读取本Run已冻结输入，唯一身份失败进入独立blocked终态。

## 原生批次与证据边界

[flow.json](<../flow.json>)是唯一可编辑控制流程。根图解析身份，条件选择blocked终态或既有HepBatch，批次结束后由summary核对冻结检查项的数量、身份和顺序再生成报告。批次body按单个内部item选择源/目标状态、各自告警、原连接路径或TCP分支；五个直接证据分支及TCP四出口各有独立原生终态，不跨item汇合。拒绝连接的监听/服务、超时的源路由/目标观察只在本TCP分支局部汇合，不等待别的item。

本稿sourceTcp只生成unavailable事实并选择UNKNOWN；OPEN、REFUSED、TIMEOUT均有真实图后继，但没有本次真实源TCP结果，不声称已执行这些出口。应用、当前监听、服务与日志、路由等未核原子仅记明确缺口；不接受模型自填结果，不发主动TCP/HTTP/ICMP，不自动修复。

组件返回前调用既有progress；记录异常向外抛出，不把失败转换成完成。事实和原回执仍由既有Run合同承载；这只是组件调用顺序，不是落盘可见性、并发峰值或后继即时推进已经通过验收。SOC调用经现有context.call共享有界额度与取消/超时，不另建调度器、执行器、存储或另一份流程DSL。

正式模板已按研发确认的官方元数据保留`NestedDict / NestedDictInput`，checks的body/items_key/concurrency及其余非code输入均显式`show:true`。缺show导致官方ParameterHandler跳过常量的原失败与根因记录在[回执](<management-receipts.json>)；本包只修模板与回归断言，不修改运行器。

研发提供的官方LFX隔离实验只在冻结bundle的内存副本补齐HepBatch常量show后执行成功，访问快后继比延迟告警早约974ms。该结果支持批次分支隔离方案，但不是正式源文件运行通过，也不是真实SOC业务验收；正式修正后的根流程仍待研发复验。实验来源和选定时序见[回执](<management-receipts.json>)，临时探针不是本包运行依赖。验证事实仅留文档/证据，不作为业务报告的固定开发进度标签。

## 证据、报告与公开依赖

只调用已发现的资产、SOC状态、固定快照告警及配置路径只读操作。告警页覆盖不足或合同不明保留partial及原错误，零告警不判无故障；配置模型UNKNOWN/NO_DATA不被reachable=false覆盖，也不作为源端连接实测。每项保留来源服务/操作、查询起止、原回执及本Run/node引用；源观测和时区缺失保持unknown，不拿查询时间或evaluatedAt补观测。敏感键值脱敏。

既有artifacts输出完整UTF-8 HTML和JSON。HTML正文按对象、状态、已得证据、缺口和下一步呈现，原始JSON仅放默认收起的details；源字符串转义。incomplete不表示修复成功；从原run_id查看报告不会重新诊断，不调用Java旧诊断/报告。

公开依赖为[公共action-api.ts](<../../../src/action-api.ts>)的SOC类型与解包，以及平台提供的WorkflowContext、官方LFX/hep_lfx的HepInput/HepBatch及component/progress桥。包内body复用本包TS模块，不读兄弟组合私有文件、不引用可变子组合或另一份执行入口。程序根只作为研发测试工具依赖，不作为业务配置或临时数据来源。

## 构建交接与验证状态

[最小合同测试](<../tests/README.md>)涵盖冻结、只读边界、进度异常、批次/分支闭包、summary严格核对及HTML安全。本会话未运行测试、构建或探针；已收到研发原有10项合同通过的反馈，但此结果不覆盖原生根流程装配，且后续源码调整须由研发复测。已按研发确认的官方show装载要求修正模板；新增字段断言与正式源文件的官方根流程probe待研发复测，再分别核对分支隔离、即时后继、失败恢复与实际加载。Mock合同测试与真实SOC业务验收分开判断。

[管理回执](<management-receipts.json>)保留各次实际保存和历史dry失败。本次按用户要求仅公开saveCompositionDraft，不启动dry、构建或probe；正式源文件复验由研发执行，保存成功不等于构建、装载或业务通过。不改Candidate/evaluation、不bind/publish、不主动探测，保存收口后停止写入，等待研发统一构建并通知继续验证。
