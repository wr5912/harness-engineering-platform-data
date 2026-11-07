# dsh-decision-engine 接入记录

## 结果：未完成安装，停止依赖步骤

**完整 Client 仍未纳入，插件未取得安装、生效或业务验证证据。** 固定源码可读取，但原位受控装配持续失败；在该步骤恢复前，不激活、重载实例或执行真实决策验收。本任务没有改变现有主模型、Guard、审批、语音或 MCP 配置，没有重启实例或发送真实决策 POST。

已保存二十四个上游原样文件和六个本地适配或说明文件。二十个 Host 模块的相对导入闭包已静态核对，另有未接入的客户端纯策略模块；语法与 AI 静态检查不等于构建、装载或业务通过。固定来源及逐文件摘要见[来源记录](dsh-decision-engine/PROVENANCE.md)。当前 Candidate 未声明完整冻结或完整可恢复。

## 已授权范围

- 原位维护 `EXP-security-operations-expert-027-reab20c48f610`，不擅自切换或另造版本。
- 两个已确认实例及本版本未来新建实例；不恢复六个历史评测容器。
- 决策服务 `http://i-1.gpushare.com:62770/`，无需 API Key，不借用其他 Provider 凭据。已授权工具参数摘要和部分最近对话会通过 HTTP 明文发送。
- 仅工具授权点 shadow/observe，其余七点关闭；保留原模型、安全守卫、人工审批和既有业务能力。

## 最新复核与可复现输入

`2026-11-04T11:19:50Z` 读取目标 Candidate 摘要后，再次预览原位 Client 复用。下列是**已失败预览当时的输入身份**，不是可直接重放的最新执行参数；本记录保存后 Candidate 摘要会改变，恢复时必须重新读取。

```text
target_source: experiment:EXP-security-operations-expert-027-reab20c48f610
candidate_sha256_at_preview: 0e4c461e9c4f929a67cf6262f157e9ba7cb2602b40d651e9b65768efc3c1a3cd
source_id: source-80c0b333-fb0b-4a11-a36f-883c06c4ce6b
source_fingerprint: 1f62a06b2a511693b3732dd133dde1c7005ea8dce2f3b17d5de7a83d7c2e73bc
source_path: lib/client.js
target_path: dsh/managed/dsh-decision-engine/lib/client.js
expected_source_sha256: 24861ab7cbe7b0c6cd1f95ad48ce6cb12906a8650e807ff8b6aa23a98663b96b
expected_target_sha256: null
operation: tasks/assembly-preview
result: asset_operation_failed
filesystem_code: unknown
```

同轮受控分片读取确认来源文件仍可读，160354 字节、摘要匹配；目标文件回读仍不存在。不是源码读取被禁止或需要 API Key。预览失败没有写入，未调用 assembly-apply；不能据此猜定底层故障原因。该阻塞跨连续轮次未恢复，公开迁移合同又仅提供新 Agent/新版本，未取得保持目标不变的成功复用回执。不擅自新建对象作搬运跳板，不用任意 shell、内部实现或逐文件搬运绕过。

## 两实例最新状态

平台详情采样 `2026-11-04T11:22:18Z` 至 `11:22:19Z`：

| 实例 | 登记状态与默认模型 | 会话与访问 |
|---|---|---|
| exp-security-operations-expert-027-cf | running；local / Qwen3.8-27B | HOME 保留，anonymous 统一网关 |
| test-zhouyang-police-exp027 | running；local / Qwen3.8-27B | HOME 保留，anonymous 统一网关 |

两者仍登记到原 EXP027、原 b830ec950 镜像，各自 web_base_path 保持以 `/` 结尾的实例目录。平台新增资产检查均报告 `status: unknown`、`loaded: null`，原因是来源或运行代次尚无法核验；空 changed_files 不能解读为资产已同步或无需重载。本任务没有操作现有会话，未读取其内容或凭据，也没有把模型目录数量当成插件生效证据。顶层 Profile 回读仍无本插件激活引用。

## 已核实的适配与兼容边界

当前基线为 [上游固定提交](https://github.com/zuosus/dsh-decision-engine/tree/146453d1427e2cf27d02cc786f3baff78bf87c6c) 对应 1.1.0，有明确本地差异，非官方完整发行包。首启和 HOME 重载的托管约束、显式匿名、固定目的地和关闭对外统计已写入源码，但未执行验证。

[客户端纯策略](dsh-decision-engine/lib/managed-client-policy.js)已保存、回读、语法检查及 AI 静态审查：未知状态/托管配置禁写，同 Provider 显式匿名、剔除空凭据字段、真实 telemetryLevel、同源文档相对 URL。它尚未被完整 Client 引用或构建，不能当 UI 或 Host 安全边界。

独立 AI Session `3b81b304-4a06-48c1-85a3-57f27da0d30f` 核对 DSH 官方固定提交 `b830ec950faba0a46dda564be3e2d854afed94f1`，没有执行源码、测试或实例操作：

- [公共类型](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/connection/src/rpc.ts#L146-L147)仅列 GET/HEAD/POST；但 [精确 Fetch 实现](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/connection/src/rpc-host.ts#L207-L250)、物理路由和 bridge 没有同样的方法白名单。已注册 PUT 在信任/认证/owner 等条件满足时存在抵达 handler 的分支，未贸然改写；网关和真实实例效果仍待验收。
- [官方 HTTP](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/connection/src/client/rpc.ts#L34-L57)用文档相对路径；[WebSocket](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/connection/src/client/socket.ts#L56-L65)以 document.baseURI 构造。只替换插件 API URL，保留原 init/PUT/header/body/signal，不猜 boot 字段或切割 pathname。网页读取工具拒绝私网，未绕过限制；实际 document.baseURI 尚未读取。

完整 Client 接入还须保持全部上游 UI、i18n、统计、决策点及 ModuleLoader/槽位生命周期；使用成功 status 的最新原始状态，失败时失效旧快照，草稿与实际 patch 一致；所有自动、密钥提交、排队和重试路径发送前检查策略。匿名不伪造 configured=true，两处 draft 补 telemetryLevel，机器错误码交给 locale 展示。辅助 ESM 不能直接代替惰性 factory 注册脚本。

## 恢复条件与后续顺序

1. 平台明确固定迁移来源到**现有指定 Candidate**的有效受控引用方式，或修复本次装配失败；回读目标、来源摘要并取得成功原位复用回执。不能直接重发本记录中的旧 Candidate 摘要。
2. 最小适配完整 Client，核对实际页面基址、完整制品和 Runtime 共享 peer；保留语音依赖和其他并行资产。此前全局依赖准备的 voice-hub 公共依赖声明冲突仍是未解决事项，不删除功能强行通过。
3. 取得受控装载证据，再逐实例应用并核对真实装载回执、真实工具决策请求及必要业务回归。会话、模型、端口和网关身份分别回读；不把探测或 running 当整体通过。

早期 Git 清点故障已恢复，服务早期 GET 证据保存在来源记录，不冒充当前复测。本轮曾看到 npm 标签 1.3.1，但其声明 Git 提交的受控清点失败，未切换或排除该版能力。当前没有训练、发布、Decision 采纳或插件收益结论；没有完整生效证明。
