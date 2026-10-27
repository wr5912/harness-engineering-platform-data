---
name: dsh-business-plugin-development
description: 为指定业务智能体设计、开发、适配、修复或审查 DSH 插件；在现有能力不足而需要插件扩展时使用。复用匹配版本的官方插件开发 Skill，衔接目标 Candidate、装配和验证；已有 MCP 接入交给 mcp-composition，平台程序研发不在本技能范围。
---

# 为业务智能体开发 DSH 插件

保持平台管理身份。承接 `task-builder` 或 `harness-evolution` 时，沿用已固定的目标、授权、Case 和预算，结束后回到原任务，不重复创建 Experiment。本技能只补目标与资产交接；插件 API、实现、安装及验证要求以匹配版本的官方 Skill 为准。

## 1. 确定目标和执行范围

读取目标详情，确认业务 Agent、Experiment/Candidate、预期能力、代表输入和可核对结果。已有版本的语义变更沿用 `harness-evolution` 派生；只有用户明确选择继续修改的独立 Candidate 才直接编辑。仅设计或审查时保持只读。

先核对已有插件、配置、Skill 和 MCP 能力。已有能力能满足就复用；MCP 接入或组合使用 `mcp-composition`，不因为官方含 MCP 模板就另建连接管理。确需插件代码时，说明要补的具体缺口，并确定 Host 服务或 Preset 内能力的放置范围。

分清两个环境：当前管理助手负责办理任务，目标业务 DSH 环境负责运行插件。读取真实的实例、Profile、Preset 和来源信息；当前目录、会话名称或用户提到的 Agent 名不能代替目标装载证据。

## 2. 读取对应的官方 Skill

从受信任的 `program_root` 读取 `runtime/adapters/dsh-container/source.lock.json`，再核对目标实际运行来源。前者是平台运行时版本声明，后者说明执行环境；不把本技能的上游固定提交当成所有实例的当前版本。

优先使用目标安装中已核实来源和版本的官方 Skill。不可直接加载时，读取下表中的完整原文；先比对 [UPSTREAM.json](references/upstream/UPSTREAM.json) 的固定提交与目标版本。副本是离线参考，不自动提供同名工具或运行能力。版本不匹配时先取得匹配资料并核对差异；取不到就说明受影响步骤，不凭记忆编造 API 或修改官方要求来迁就环境。

| 任务 | 官方原文 |
|---|---|
| 插件设计、实现、安装、调试和验证；进入插件任务先读 | [cordis-plugin-development](references/upstream/cordis-plugin-development/SKILL.md) |
| 决定 Host/Preset 放置、创建或修改 Preset | [editing-cordis-compositions](references/upstream/editing-cordis-compositions/SKILL.md) |
| 编写 Patch、核对 Loader 方言或查插件包 | [cordis-composition-reference](references/upstream/cordis-composition-reference/SKILL.md) |

上游要求加载另一项官方 Skill 时，优先加载已核实的同版本技能；否则按本表读取相应原文，不调用未注册的技能名。每份原文里的 `references/` 和 `templates/` 都相对该官方 Skill 自己的目录解析，不能相对本入口。按原文的任务索引补读所需参考，不一次读取全部包目录。

官方机制说明入口：[DSH 开发文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)。网站当前内容可能更新，具体实现仍核对目标版本。依照官方顺序查证目标运行时 inspection、已解析包的 README、类型或源码；管理 Profile 的查询结果不能直接证明业务实例具有同一接口。

## 3. 实现与目标装配

按官方 Skill 选择模板并完成开发；模板复制到目标工作区后按真实任务填写，官方参考副本保持原样。沿用其 Config、依赖、生命周期、工具结果、UI、元数据和资源要求，不在这里另写一套规范。程序仓库的 TypeScript/构建约定用于本项目新增代码，不据此改写上游模板；生成物不成为第二份可编辑源码。

源码、必要配置和可恢复的依赖来源归入目标 Candidate，沿当前平台合同保持 Preset/Plugin 引用一致。编辑和装配使用实际可用的平台入口及返回的摘要；缺少创建、构建或检查入口时说明具体缺口，不能因本技能出现就调用任意 shell、安装依赖或导入程序内部实现。已获授权且具备目标开发能力的执行环境按官方流程继续。Candidate 内的源码和声明是交付源，写入本身不证明运行中的插件已更新。

官方 `plugin_manager install_bundle` 安装到执行该工具的**当前 Profile**，并影响其中的会话。只有核实执行环境就是本次目标且已有相应授权，才按官方流程安装；不要在管理会话安装后声称业务实例已获得能力，也不要给工具编造目标实例参数。需要另一目标环境但没有对应执行入口时，保留已完成的目标资产和交接信息，明确构建或装载尚未完成。

沿用官方安装入口和原生访问策略，不手工写运行 Profile 的 `package.json`、`cordis.patch.yml`，不在 `$DSH_HOME` 创建开发包，不用 shell 重现安装器步骤。遇到原生待确认或待批准构建脚本时遵循真实回执；既有授权范围内继续办理，不增加另一套审批。

数据根 `workspace.json` 的 `extensions` 用于工作区扩展，不能自动作为业务 Agent 的安装目的地。需要复用时保留固定来源和实际引用，不复制整个 Runtime HOME、Session 或缓存。目标业务 MCP 配置继续遵循平台连接合同；官方模板的示例配置不能未经核对直接当作目标运行参数。

## 4. 验证与交付

执行官方要求且与本次能力有关的检查，沿用原任务的业务 Case 和修复预算。分别取得以下证据：

- **实现与产物**：适用的配置、类型/语法、依赖和构建检查；源码与实际交付入口、资源相符。
- **目标装载**：目标实例与来源正确，实际插件/工具/服务已激活；按官方回执区分失败、被覆盖、需重启和已应用。使用适合当前装载方式的重载或重启，不把保存成功当作生效。
- **业务效果**：用新 Session 验证变化后的行为、代表任务及必要回归；有 UI 时遵循官方视觉验证要求，缺少浏览器控制就说明可见效果未验证。按修改范围检查停用清理或相关异常，不为简单插件预设固定数量的测试。

`research/validate` 只验证平台确定性合同，不能替代插件构建、实际装载或业务通过。Mock 只证明标明的模拟边界。将需要保留的资产写回目标 Candidate，验证结果交给原任务的 Run/Decision 流程；不另建评测事实副本，不把完成开发等同于已发布。

向用户说明新增能力、目标版本与使用入口、已通过的验证及影响使用的剩余限制。程序字段按其合同返回，其他说明遵循 `user-facing-output`。

## 上游维护

`references/upstream/` 保存三个官方 Skill 的完整原文、参考和模板，以及原许可证；来源和逐文件摘要只维护在 `UPSTREAM.json`。它们作为参考资料保留，不另行登记成管理任务。升级时核对目标 DSH 来源，再整体更新相应官方子树和清单，保留许可；不直接修改官方副本补平台规则。本入口或现有平台技能负责平台适配。
