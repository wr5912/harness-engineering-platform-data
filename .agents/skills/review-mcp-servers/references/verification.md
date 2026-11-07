# 取证命令与回归用例

## 从真实发现结果开始

在平台管理助手中先按[平台取证路径](platform-adapter.md)使用现有工具。下面的 CLI 是独立协议测试参考，不是管理会话的默认执行步骤；不为审查安装依赖或用脚本调用内部实现。已有授权与环境均满足时才选择对应验证；`npx` 示例不授权联网下载或运行新包。

优先使用项目锁定版本的 Inspector 和 SDK。记录服务器构建、协议版本、宿主/模型版本、身份、夹具和测试时间；复跑用同一版本。下面的 URL 是测试占位地址，仅连接获准端点。示例以本机已安装的 CLI 为例。

```sh
endpoint='http://127.0.0.1:3000/mcp'
mcp-inspector --cli "$endpoint" --transport http --method tools/list --strict
mcp-inspector --cli "$endpoint" --transport http --method resources/list
mcp-inspector --cli "$endpoint" --transport http --method resources/templates/list
mcp-inspector --cli "$endpoint" --transport http --method prompts/list
```

按已声明能力选命令。保留所有页、身份和协议版本，区分 CLI 解包后的对象与原始 JSON-RPC。用同一身份执行 tools/call、resources/read、prompts/get，保留参数、返回、实际状态及副作用。stdio 服务使用获准的本地启动命令替换 URL 及传输选项。仅凭 `--strict` 的可移植性提示不能判定协议不合格。[MCP Inspector CLI](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli)

协议回归用匹配版本的官方 Conformance 对照适用场景。有专用夹具要求的场景放在相应测试实现上运行。可用 `npx @modelcontextprotocol/conformance list --requirements 2026-07-28` 查看该版清单；正式 CI 同时锁定包版本。仅声明实际跑过的场景与结果。检查工具 schema 时明确方言和 format 断言配置，将输入输出实例分别对其公开 schema 校验。[Conformance](https://github.com/modelcontextprotocol/conformance) · [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation)

变更审查先将旧版和候选版在相同身份及配置下导出的目录做结构化差异。关注工具更名、参数新增必填、枚举收紧、默认行为变化、返回类型变化、权限或副作用扩大。用一个旧调用样本和一个直接消费结果的下游复测。项目有兼容承诺时按其门槛判定；否则说明受影响的调用方和迁移方式。

## 用少量有区分度的用例验证选择与行为

从真实用户任务抽样，按行业替换对象。对本次变动的关键边界至少构造正例与反例，保留业务结果允许等价路径。下列示例适用于具有资产查询或处置能力的服务。

| 用例标题 | 用户输入或夹具 | 可观察的预期 |
|---|---|---|
| 历史查询 | “OA-SRV-01 上次管理面检测是什么时候？” | 唯一定位后读观测时间；主动探测和写入次数为零。空记录与查询失败能区分。 |
| 相近能力 | “从授权测试节点现在验证 OA 是否可达。” | 若范围明确且获准，使用能产生新观测的能力，交付本次证据；历史记录只能作为补充。 |
| 对象消歧 | “隔离 test-01”，夹具有两个同名终端 | 先限定对象；未确认前提交次数为零。 |
| 仅预览 | “先看看隔离会影响什么。” | 返回预览。对比提交计数、业务状态及下游调用，真实隔离次数为零。 |
| 无需调用 | “解释一下已受理和已完成有什么区别。” | 已有上下文足够时直接解释，业务工具零调用。 |
| 合法复合动作 | 单工具内部执行申请、占用、建单；用户明确要求并已获授权 | 一次调用完成约定业务结果并披露副作用；不得误报为工具描述夹带 Skill。 |
| 身份、重放和出错 | 测试身份 B 提交身份 A 的对象；对承诺幂等的动作模拟响应丢失后重试 | 越权操作拒绝且无业务变更；重复操作仅产生契约允许的一次业务副作用。无数据、对象无权、下游超时按契约分别断言。 |
| 模板和提示 | 给模板一个含中文/保留字符的合法变量；给 Prompt 一个合法值和缺必填值 | 使用 RFC 6570 展开并按具体 URI 读到预期对象；prompts/get 渲染正确消息，缺必填值走指定错误路径。 |

评工作流归属时运行两组：**仅给工具目录**，验证查询、写入、预览可独立选用；**加载匹配的 Skill**，验证业务分支及交付物。对比时固定候选工具、模型、宿主、配置和初始数据，使用相互独立的会话。宿主不能控制加载时记录该限制，另用隔离测试环境对照。报告任务通过数/总数、工具误选、参数错误、多余调用，以及不当副作用次数。重复样本报告分子分母和测试条件；质量阈值取项目已有约定。[OpenAI 元数据评测](https://developers.openai.com/plugins/guides/optimize-metadata) · [Anthropic 工具评测](https://www.anthropic.com/research/writing-tools-for-agents)
