# 协议与互操作审查规则

本表以 2026-07-28 和 2025-11-25 两个正式修订版为基线。使用前先确认目标修订版、传输方式、能力声明、调用身份以及材料是否为协议层原始报文。遇到其他版本，打开该版本规范的同名章节重新取证。以带日期的规范正文和官方 TypeScript schema 为准，保存核对日期与链接。仅凭 SDK 版本或文档发布日期不能判定实际使用的协议版本。[版本状态](https://modelcontextprotocol.io/specification/versioning) · [规范及权威 schema](https://modelcontextprotocol.io/specification/2026-07-28)

“必须”对应协议 MUST、MUST NOT 和 schema 必填约束。“推荐”对应 SHOULD，评估偏离理由及实际后果。“可选”对应 MAY 或可选字段，启用后须满足对应条件。“取证”列给出本审查的验证方法，报告应指出具体违反了哪项要求。

## 版本、传输与发现

| ID | 适用条件与标准层 | 判定与最小证据 |
|---|---|---|
| P01 | 所有目标。版本化协议必须 | 对照同一版本的一次完整请求和响应。2026-07-28 要求服务器实现 `server/discover`，客户端可直接发业务请求；请求通过 `params._meta` 携带协议版本和客户端能力，结果带 `resultType`。2025-11-25 使用 `initialize` 握手协商再发 `notifications/initialized`。声称同时支持两版时分别运行。SDK 已解包样本无法证明原始报文缺字段。[版本交互](https://modelcontextprotocol.io/specification/2026-07-28/changelog) · [旧版生命周期](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) |
| P02 | 对应传输。必须；本地绑定是推荐 | stdio 抽查启动与运行的 stdout，每行只允许一条 MCP 消息，日志可写 stderr。2026-07-28 Streamable HTTP 检查 POST、`MCP-Protocol-Version`、`Mcp-Method` 和指定方法的 `Mcp-Name` 与消息体一致；服务器处理镜像字段不符的请求时应返回 HTTP 400 和 `-32020`。传入非法 Origin 应返回 403。本地 HTTP 服务推荐只绑定回环地址。自定义传输按自己的绑定及 MCP 基本要求核验。[stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio) · [HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) |
| P03 | 提供 tools、resources、prompts 时，能力声明必须；通知、订阅可选 | 对照发现结果、路由与同身份目录。`resources` 同时承载具体资源和 URI 模板。支持的能力按其章节验 list/read/get/call，记录空列表和只提供模板的情况；只有声明通知、订阅等能力时才查其交付语义。能提供能力却漏声明或已声明必需方法无法调用，附双方报文。[工具](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [资源](https://modelcontextprotocol.io/specification/2026-07-28/server/resources) · [提示](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/prompts.mdx) |
| P04 | 返回分页或 2026-07-28 可缓存结果。必须与推荐按右栏 | 用服务器给出的不透明 `nextCursor` 遍历至其缺失，空字符串也可为有效游标。该版本的四类目录及 `resources/read` 的完整完成结果需要 `ttlMs`、`cacheScope`；`private` 缓存严禁跨授权上下文复用。工具目录相同权限、相同数据时推荐确定性排序，允许因权限改变工具集合。对照两个身份的完整分页轨迹及缓存设置。[分页](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/pagination) · [变更记录](https://modelcontextprotocol.io/specification/2026-07-28/changelog) · [缓存字段](https://modelcontextprotocol.io/specification/2026-07-28/schema) |

## 工具调用与数据契约

| ID | 适用条件与标准层 | 判定与最小证据 |
|---|---|---|
| P05 | 每个 Tool。schema 必填；命名推荐 | `name` 与 `inputSchema` 必填。工具名推荐在本服务器唯一、区分大小写，长度 1–128，以 ASCII 字母、数字、下划线、连字符、点组成。对照全量目录及目标宿主的名称映射。平台前缀、动词风格、描述字数按项目约定判断。工具、资源、资源模板、提示的 `description` 都是协议可选字段；遗漏描述的发布问题按工程规则归因。[命名](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [schema](https://modelcontextprotocol.io/specification/2026-07-28/schema) |
| P06 | 每个 Tool。MCP 输入 schema 必须；JSON Schema 按声明方言验证 | `inputSchema` 必须为 schema 对象且要求根 `type: "object"`，无参数也要声明。未写 `$schema` 时默认 2020-12。核对一条有效输入及缺必填、错型或越界输入，服务端须校验。只在契约要求封闭字段时判未知键违规。JSON Schema 的 `default` 是注解；格式断言需核实验证器或处理函数。2026-07-28 实现禁止默认自动联网解引用 `$ref`，用本地映射或受控夹具取证。[MCP schema 用法](https://modelcontextprotocol.io/specification/2026-07-28/basic) · [JSON Schema Validation](https://json-schema.org/draft/2020-12/json-schema-validation) |
| P07 | 声明 `outputSchema` 时服务端必须匹配；字段本身可选 | 对正常完成结果中的 `structuredContent` 运行输出 schema 校验。只给文本、少必填字段、实际枚举越界均应留具体样本。2025-11-25 的输出 schema 要求对象根；2026-07-28 的结构化值可为数组、标量或空值等。双版本服务按两个协议版本的契约分别测试。文本兼容副本属推荐。[2026 工具输出](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [2025 工具输出](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) |
| P08 | 提供 tools/call。按版本的错误语义 | 对比未知工具名或畸形 RPC 与合法调用中的业务拒绝、参数值无效或下游失败。前类走 JSON-RPC error；后类用完成结果的 `isError: true` 返回可修正的反馈。检查下游超时样本是否被包装为成功的空数据。现代版 `input_required` 属继续交互的结果，切勿当成最终成功。记录原始封包和动作是否生效。[错误处理](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [结果类型](https://modelcontextprotocol.io/specification/2026-07-28/basic) |
| P09 | 工具行为提示可选；提示的语义由 MCP 定义 | 对照 `readOnlyHint`、`destructiveHint`、`idempotentHint`、`openWorldHint` 的字段语义、处理函数及下游调用。以相同参数重复调用会产生额外副作用时，幂等声明与实现矛盾；开放世界描述的是可触达的实体范围。破坏性与幂等提示均只在非只读时有意义。不得以未填提示本身判协议失败。若声称只读而实施写入，按实际后果评定风险。[ToolAnnotations](https://modelcontextprotocol.io/specification/2026-07-28/schema#toolannotations) · [维护者解读](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) |

## 资源、模板、提示与扩展

| ID | 适用条件与标准层 | 判定与最小证据 |
|---|---|---|
| P10 | 发布具体资源。schema 和资源 URI 验证必须 | 目录项需有 `name`、`uri`；用该 URI 调 `resources/read`，核对 `contents` 中的 URI 与内容类型，二进制 `blob` 使用 Base64。声明 `size` 时比较原始字节数。所有读取校验 URI；服务 `file://` 时校验路径防越界。工具返回的 `resource_link` 可未在目录枚举，须按可读取性单独复证。[资源](https://modelcontextprotocol.io/specification/2026-07-28/server/resources) · [资源链接](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [URI 语法](https://www.rfc-editor.org/rfc/rfc3986) |
| P11 | 发布资源模板。schema 必须；统一 MIME 为推荐条件 | 取 `resources/templates/list`。每项需有 `name` 与 RFC 6570 `uriTemplate`，用标准展开器代入具体值后再读取；适用时测试空格、斜杠或非 ASCII。遵循所用操作符的转义语义。模板未定义通用参数 `inputSchema`，自定义元数据不能充当跨客户端变量契约。只有所有匹配资源类型一致时才应填写模板 `mimeType`。[ResourceTemplate](https://modelcontextprotocol.io/specification/2026-07-28/schema#resourcetemplate) · [RFC 6570](https://www.rfc-editor.org/rfc/rfc6570) |
| P12 | 发布 Prompt。schema 必须；可选参数依声明 | `prompts/list` 每项需有 `name`。声明 `arguments[]` 时每项需有 `name`，`required` 等按声明验证。检查合法 `prompts/get` 的参数是字符串映射，完成结果含 `messages`，角色是 `user` 或 `assistant`。复测缺必填参数，核对正文与输入是否正确对应。SDK 内部强类型配置以序列化后的实际报文为准。[Prompt 与参数](https://modelcontextprotocol.io/specification/2026-07-28/schema#prompt) · [官方提示协议](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/prompts.mdx) |
| P13 | 服务声明 Skills 扩展才适用。扩展可选，声明后相应方法必须 | 现行稳定扩展 `io.modelcontextprotocol/skills` 要求同时声明 `resources`，实现 `skills/list`、`skills/get`，并通过 `resources/read` 提供技能文件。抽取一个条目、文件清单及正文，对照 `SKILL.md` 的元数据与摘要。仅当 `directoryRead: true` 时要求 `resources/directory/read`。仅由本地宿主装载 Skill 的服务不承担此扩展义务。其他扩展按其正式标识、实现的协议版本及声明逐项核验。[Skills 稳定扩展](https://skills.extensions.modelcontextprotocol.io/specification/stable/skills) · [Agent Skills](https://agentskills.io/specification) |

## 取证界限

若只有目录 JSON，可以确定字段是否缺失、输入结构是否无效、文案在要求谁做什么。处理函数副作用、实际授权、运行时输出与客户端行为需要各自的证据。约束来自宿主 SDK、模型供应商或团队发布约定时，在报告中写明该来源、适用宿主或项目，按其实际影响判断。
