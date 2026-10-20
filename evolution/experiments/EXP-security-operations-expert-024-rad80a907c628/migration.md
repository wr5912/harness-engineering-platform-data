# MCP 分组 v2 迁移记录

## 来源与资产边界

本 Candidate 从 `EXP-security-operations-expert-022-r41bf6c2f0d3d` 在数据提交 `c903724269be0ef249182e2fd7024325c7124629` 的 Candidate 完整派生。历史 Experiment、Run 和当前实例没有改写。`config/sources.json` 新增独立 Experiment 来源，原来源继续可用。

业务指令及 Skills 只描述能力、步骤和失败处理，不写最终 DSH `mcp__` 工具名。威胁研判的 20 项逻辑路由在 `candidate/dsh/managed/threat-analysis/mcp-group-bridge.ts` 维护，以来源 ID、原始工具名或资源 URI/模板发现真实目标；v2 目标摘要变化、缺失或重名会停止调用。策略、应急、巡检、故障取证和结果投递通过实际注册名映射到内部稳定身份，角色 Guard 对未知或缺失能力继续拒绝。三个子 Agent 改用 rc2 `agentPreset` 与各自的权限 Guard。

新实例种子只连接平台生成的 `threat-analysis-runtime` v2 分组入口，没有本地可编辑的同名组、Bearer Header 或 Token 依赖。种子 URL 与当前数据根 `config/business-access.json` 的管理入口及 `config/sites.json` 的平台基址所派生 URL 逐字一致。该连接保持停用，直到平台组、来源及第三方能力经发现确认；既有策略与应急停用来源未伪装成可用。

## 运行模式

受控业务实例由程序 `runtime/adapters/dsh-container/business.ts` 渲染额外 Patch：停用 Candidate 自带的 `mcp-session-manager`，把它的种子配置交给程序侧 `/opt/harness-platform/business/mcp-manager.js`，并装载 `business-runtime`。该 manager 提供 `groupUrl`、`groupFetch` 和 `resolveTool`；每个威胁研判调用、待研判读取及取消清理都取当前 Session ID，通过受信 Runtime 的自定义 fetch 访问平台 v2 组。Python 进程只接收本地临时桥地址与临时密钥，不接收平台签名材料。

普通 eval 模式仍装载 Candidate 自带 manager；其 v2 工具、资源和模板协议与平台实现保持一致，并按本轮实际注册工具解析直连能力，但不提供业务组签名接口。没有受控 Runtime 时，威胁研判桥在预检阶段拒绝访问平台组。不能把普通 eval 模式的装载结果当作受控组接入成功。

## 技术验证与限制

- Candidate Node 合同测试：44/44；Python 3.10 合同测试：11/11。覆盖真实 MCP SDK 的 v2 工具/资源/模板、多级基址、目标漂移、取消、显示名漂移与缺失拒绝、策略与应急确认、Schedule 和研判桥。
- 程序业务实例渲染测试：4/4，确认输出 Patch 指向 `business-mcp-manager.js` 且停用 Candidate manager。这证明配置入口；尚未创建或切换真实受控业务实例。
- `source_contract.py` 与来源 dry-run 解析成功；dry-run 报告缺少三个模型环境变量，未写实例状态。锁定 rc2 镜像采用隔离 HOME、只读 Candidate 卷与断网容器进行技术装载：配置展开成功，三个子 Agent 的 `agentPreset` 进入有效配置，Web 启动。继承的 voice 插件因隔离环境未安装依赖出现警告；没有发起模型 Session 或外部业务调用。
- 数据仓库合同校验：有效，0 项错误、0 项警告；工具链校验不代表研究效果。
- 第三方 MCP 来源与平台组当前未全部就绪；未验证 20 项映射的真实业务效果，也没有声称 Research Release 已完成。
