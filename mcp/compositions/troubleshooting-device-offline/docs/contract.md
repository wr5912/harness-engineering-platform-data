# 输入与执行边界

输入Schema与组件接口唯一维护于[TS入口](<../src/index.ts>)：必填`asset:{ip,assetId?}`、带明确时区且递增的`from/to`；可选`observer:{ip,assetId?}`只用于已有配置路径。缺观察源返回路径unavailable，不猜网络位置、不发探测。定义及连接见[组合定义](<../composition.json>)，管理保存/dry以[原回执](<management-receipts.json>)为准。

输入示例（不是已执行的诊断）：

```json
{"asset":{"ip":"172.16.200.11","assetId":3617609},"observer":{"ip":"172.16.138.226","assetId":3617426},"from":"2026-11-07T00:00:00Z","to":"2026-11-07T03:00:00Z"}
```

## 冻结输入与原生控制流

`prepare`先`structuredClone(input)`，再独立克隆`scope.requested`并冻结两份请求；不访问上游。`resolve`只读取`shared.input`，忽略后改的调用输入；限定IP完整读页并精确核对资产身份。同Run的TS共享对象只存本Run事实和回执，节点ID/路径保留原生`root/offline-batch[index]/…`及嵌套前缀；汇总核对`run_id`，不跨Run复用。

[唯一原生流程](<../flow.json>)根图为Input→resolve→身份条件→blocked独立终态，或现有官方HepBatch→summary。解析成功由TS固定`items=['soc-state','alerts','management']`，批次body按内部`item`只选一个独立分支及独立`is_output`终态，不在互斥分支间共享消费者。根summary严格核对三项身份、索引顺序、数量、独立终态路径、事实引用及本Run事实闭包后才生成报告；失败不得去重、补空或猜测收口。

管理分支为管理观察→真实响应条件。当前管理原子仍固定`unavailable / response_verified=false / branch=unknown`，只写缺口；SOC在线、历史探测和用户/模型自填响应都不能触发采集。组件还核对本Run已保存的真实管理响应及SOC回执来源，不仅检查布尔值。真实响应路径保留：采集适用性→绑定→绑定条件；唯一绑定时进入现有本地HepBatch，其body按`run-state/config/heartbeat/synchronization`各选独立分支与终态，严格核对四项后结束管理分支。适用性空目录/失败保留unknown，不猜硬件不适用；在真实响应门禁满足时绑定仍可独立取证。原始心跳和同步原子缺失只记未执行。无回复及未知各走自己的实际缺口→已有配置IP对路径→独立终态，不冒充真实响应、端口、断电或设备健康结论。

Python只使用公开HepInput/HepBatch、原生条件端口及`component(name,payload(self.value),self._id)`薄桥；业务判断在本包TS，不写调度器、执行器、Promise调度层或官方scheduler补丁。HepBatch的`body`应承载完整原生flow；模板保留研发确认的`NestedDict / NestedDictInput`类型及必需的`show:true`，常量items_key/concurrency和其余非code输入同样显式保留show，不修改运行器。输入`value`、`items_key`及有界`concurrency`沿已有合同，结果按输入索引返回。

## 告警完整性与错误

告警先固定快照及组总数，再读全部组和成员页。成员只能从`members/alerts/items/records/rows`中明确选择唯一数组，多个数组拒绝歧义。返回的`groupKey/snapshotId`必须与请求一致；`total/totalAlerts/totalMembers`若返回必须为非负安全整数、同时字段无冲突且跨页稳定。成员必须有可核对的`alertId/id/eventId/uuid/_id`稳定身份；跨页或跨组重复直接保留不完整，不去重凑数。

支持显式游标或稳定total页码：即使成员页只提供cursor，也受固定快照totalAlerts上界约束，累计超界保留原页并停止续读；非终点cursor必须非空字符串、有进展且不重复；进入游标模式后须有显式终点，显式终点和total终点必须一致。零成员页、重复组、快照变化和总数不符均保留`complete:false`、原`error/message`、已收到的成员及原始页/回执，不猜空、不截断。仅固定快照确认零组且零告警时可返回完整空结果；这不证明无故障。

各事实先调用既有`context.progress`，再写本Run共享事实并返回。调用顺序不替代实际持久化可见性取证；progress抛错原样保留消息及cause并向外传播，不能被业务catch改成成功。外部只读调用经过`context.call`，单次30秒超时；不新增存储或flush。保留来源、原始错误、节点引用、请求/接收时间和未知源时区；回执按敏感键脱敏，不把记录时间、SOC评估时间当本次源观测时间。

## 报告、依赖与验证状态

沿既有artifacts合同生成UTF-8 HTML与JSON。HTML保留对象、状态、证据表、实际数量、缺口和下一步，raw JSON只在`details`中折叠展示并转义。总状态仍为`incomplete`，不表示恢复。查原进度或原报告不重跑；不主动TCP/ICMP/HTTP、扫描、修复、写配置、重启或调用Java旧服务。

运行时公开共享依赖包括 MCP action-api.ts、src/reports/common.ts 和 src/reports/troubleshooting.ts，以及平台 workflow/LFX 桥，不导入兄弟包私有模块。组件测试见[测试说明](<../tests/README.md>)，仅替换 SOC 外部边界。HTML 使用公共报告组件及带摘要的受信脚本；原始完整事实另存 details 产物，HTML 折叠区采用脱敏投影。

正式模板保留官方 show、原类型及常量值；端口原 name/method 与中文 display_name 分别用于执行与显示。[管理回执](<management-receipts.json>)保留各轮实际保存与历史 dry，按记录时间解释。官方运行、实例绑定、真实 SOC 取证与原报告下载分别核对；异步启动后使用真实 Run 查询，未知启动不重放。

管理原子仍不可用，不能把受控流程运行、SOC 在线或模型自填响应当作本次真实管理响应；真实响应后的采集链须取得外部能力后另验。未实施正式工具发布、主动探测或设备修复。
