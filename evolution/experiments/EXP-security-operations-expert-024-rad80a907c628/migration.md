# MCP 分组 v2 与并行能力融合记录

## 来源与资产边界

本 Candidate 从 `EXP-security-operations-expert-022-r41bf6c2f0d3d` 在数据提交 `c903724269be0ef249182e2fd7024325c7124629` 的 Candidate 完整派生。历史 Experiment、Run 和当前实例没有改写。`config/sources.json` 新增独立 Experiment 来源，原来源继续可用。

业务指令及 Skills 只描述能力、步骤和失败处理，不写最终 DSH `mcp__` 工具名。威胁研判的 20 项逻辑路由在 `candidate/dsh/managed/threat-analysis/mcp-group-bridge.ts` 维护，以来源 ID、原始工具名或资源 URI/模板发现真实目标；v2 目标摘要变化、缺失或重名会停止调用。策略、应急、巡检、故障取证和结果投递通过实际注册名映射到内部稳定身份，角色 Guard 对未知或缺失能力继续拒绝。三个子 Agent 改用 rc2 `agentPreset` 与各自的权限 Guard。

新实例种子只连接平台生成的 `threat-analysis-runtime` v2 分组入口，没有本地可编辑的同名组、Bearer Header 或 Token 依赖。种子 URL 与当前数据根 `config/business-access.json` 的管理入口及 `config/sites.json` 的平台基址所派生 URL 逐字一致。该连接保持停用，直到平台组、来源及第三方能力经发现确认；既有策略与应急停用来源未伪装成可用。

## 运行模式

受控业务实例由程序 `runtime/adapters/dsh-container/business.ts` 渲染额外 Patch：停用 Candidate 自带的 `mcp-session-manager`，把它的种子配置交给程序侧 `/opt/harness-platform/business/mcp-manager.js`，并装载 `business-runtime`。该 manager 提供 `groupUrl`、`groupFetch` 和 `resolveTool`；每个威胁研判调用、待研判读取及取消清理都取当前 Session ID，通过受信 Runtime 的自定义 fetch 访问平台 v2 组。Python 进程只接收本地临时桥地址与临时密钥，不接收平台签名材料。

受控模式下，Candidate 种子限定服务 ID、原生注册名、启用和工具范围；与平台 MCP 管理同 ID 的连接地址及鉴权由平台当前配置提供，启用与工具范围只会收紧。平台独有服务不自动进入此 Agent，Candidate 专有的 v2 分组链接保持原样。平台修改连接后新 Session 重新装载，旧 Session 的目标变化调用拒绝；平台删除已纳管连接时不会回退种子中的旧地址。种子仍是研究版本的固定初始资产，普通 eval 模式按它独立装载，不以平台当前连接替换研究来源。

普通 eval 模式仍装载 Candidate 自带 manager；其 v2 工具、资源和模板协议与平台实现保持一致，并按本轮实际注册工具解析直连能力，但不提供业务组签名接口。没有受控 Runtime 时，威胁研判桥在预检阶段拒绝访问平台组。不能把普通 eval 模式的装载结果当作受控组接入成功。

## 技术验证与限制

- Candidate Node 合同测试：44/44；Python 3.10 合同测试：11/11。覆盖真实 MCP SDK 的 v2 工具/资源/模板、多级基址、目标漂移、取消、显示名漂移与缺失拒绝、策略与应急确认、Schedule 和研判桥。
- 程序业务实例渲染测试：4/4，确认输出 Patch 指向 `business-mcp-manager.js` 且停用 Candidate manager。这证明配置入口；尚未创建或切换真实受控业务实例。
- `source_contract.py` 与来源 dry-run 解析成功；dry-run 报告缺少三个模型环境变量，未写实例状态。锁定 rc2 镜像采用隔离 HOME、只读 Candidate 卷与断网容器进行技术装载：配置展开成功，三个子 Agent 的 `agentPreset` 进入有效配置，Web 启动。继承的 voice 插件因隔离环境未安装依赖出现警告；没有发起模型 Session 或外部业务调用。
- 数据仓库合同校验：有效，0 项错误、0 项警告；工具链校验不代表研究效果。
- 第三方 MCP 来源与平台组当前未全部就绪；未验证 20 项映射的真实业务效果，也没有声称 Research Release 已完成。

## 并行来源取舍

Downloads 快照的 `EXP-security-operations-expert-021-r1fd668bb595b/candidate` 按 `candidateDigest` 固定为 `15414e798a918d2fa3368fff91ef58087617cfb6e05ea3aa2cb09ca2446f27d4`，计入 203 个文件；快照不含可核对的 Git 身份。逐文件差异后，只融合仍需保留的自然语言 Schedule 映射、应急防火墙 `block-ip/unblock-ip` 与规则 UUID 语义、`recommended_actions.target` 结构和报告卡片、证据附录、UTC 时间；调用方、模型输出合同、结果投递及 Case 同步调整。

| 旧快照文件（相对 Candidate） | EXP024 对应资产与处理 |
|---|---|
| `dsh/workspace/AGENTS.md` | 当前同名文件融合自然语言 daily/every/cron、列表更新删除与边界说明；按 DSH 原生输入结构修正 09:00–18:00 窗口。巡检的 `dsh/workspace/.agents/skills/security-inspection/SKILL.md` 补充受控实例禁用判断。 |
| `dsh/workspace/.agents/skills/emergency-action/SKILL.md`、`dsh/managed/operation-result-delivery.mjs` | 当前同名文件保留防火墙和主机动作区分、`rule_name` 与解封 UUID 检查；沿用 EXP024 的受控草案与确认链。 |
| `dsh/managed/threat-analysis/prompts/threat-analysis-system.txt`、`dsh/managed/threat-analysis/forced_output_contract.py` | 当前同名文件融合 `recommended_actions.target` 对象及校验，同时保留当前证据原值和内部实体引用限制。 |
| `dsh/managed/threat-analysis/result_delivery.py`、`report.css`、`dsh_runner.py` | 当前同名文件融合报告卡片、攻击链、证据附录和同一 UTC 研判时间；保留当前运行 ID、保存与下载状态及取消清理路径。 |

对应的静态与模型行为用例维护在当前 Candidate `tests/` 和 `agents/security-operations-expert/evaluation.md`；旧快照测试与历史 Run 不作为融合后的通过证据。

保留本 Candidate 较新的 MCP v2 来源身份与动态工具解析、受控业务 Session 绑定、子 Agent Preset、模型证据原值与内部实体校验、取消后的 SOC 清理、语音能力和既有 Mock 合同。旧快照中的直接 MCP 名称、Token 连接、旧 Guard、旧研判运行器及本地 MCP 种子不覆盖这些当前能力；旧 MCP 数据由平台唯一配置独立迁移。EXP023 的并行只读工具未合入。

旧窗口示例的单条 `*/30 9-18 * * *` 会在 18:30 额外触发；Candidate 改用两条原生 cron 规则准确覆盖 09:00 至 18:00，逐条报告创建结果，不实现新的调度器。统一网关受控实例仍禁用自动定时投递。上文“技术验证与限制”记录的是本次融合前 MCP v2 迁移的历史技术检查；融合后的验证以新 Run、实际装载和本次验收记录为准，不能沿用旧 44/44、11/11 作为新结论。

本次平台入口迁移到 `10.0.160.32:18120/hep` 时，Candidate 的 Web 种子与受控业务 Patch 内的 v2 组 URL 同步改为新入口。`config/business-access.json` 和 `config/sites.json` 由平台接管任务统一更新；新入口的实际可达性、身份签名和业务加载仍以切换后的回执为准。
