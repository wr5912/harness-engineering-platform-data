# 融合版 Evaluation 观察

本 Candidate 从固定 EXP022 派生，并融合 Downloads 并行快照的调度说明、应急防火墙语义、结构化处置目标和研判报告呈现。逐项取舍与来源摘要见 [migration.md](../migration.md)。本次只验证资产合同、实例装载及普通聊天；专有安全运营业务效果留待专项真实环境验证。

2026-10-21，在标准 DSH `0.2.1-rc.2` 镜像 `ai-agent-harness/dsh:687f282e8-b9bce5f1fe5f` 中，以三棵只读 Candidate 挂载启动 `security-operations-expert-fusion-v2`，来源为 `experiment:EXP-security-operations-expert-024-rad80a907c628`，实例固定来源摘要 `sha256:12ed00935b93ee0e5e0982a8b8044a1459421d73ad35d80ac0b17ae971110c41`。实例占用本机回环端口 18502；访问经统一网关的实例深链，选择开发调试阶段与匿名访客方式。网关至 Runtime 的签名通道和来源固定仍生效，发布身份签名尚不适用于此实例。

首次 `session/create` 因两个私网 MCP 来源在当前环境不可达而返回 `fetch failed`。程序侧受管 MCP 自动挂载改为按来源处理连接与发现失败：不可达来源不注册工具，可达来源仍装载，DSH 原生 MCP 桥沿用其启动失败容错；本地配置错误继续报错。重建插件并重启同一实例后，匿名浏览器从真实网关页面创建 DSH 工作区和新 Session，发送一次“你好。请用一句话介绍你能提供的帮助，不调用工具。”；收到中文助手回复，`turn/end` 为 `completed`，`session/list` 可回读。同一入口的另一独立访客看不到该 Session，读取其页面返回 403；页面脚本错误为零。实例登记默认模型为 `xiaomi-token-plan-cn / mimo-v2.6-flash`，本次未独立抓取实际模型提供方请求，不把登记值写成调用事实。

本 Candidate Node 合同测试 45/45、Python 3.10 合同测试 15/15 通过；数据工作区合同校验 0 错误、0 警告。当前 MCP 管理配置保存 14 个服务、4 个分组，其中 12 个服务启用；私网 SOC 目标在本环境连接超时，配置已从临时 Mock 联调值恢复原值。上述合同与普通聊天观察不能证明安全运营工具、SOC 查询与回写、调度执行、语音、报告质量或 Research Release 可复现。

随后清理 Candidate 专有界面中重复的工作区／Preset 初始化和过宽的隐藏样式，当前来源摘要变为 `sha256:b3bbbea7814eddfa9deea4cb7d8e08710d5a486a0d3ce6c53edbaa9c4884c20f`。启动器保留 v2 的固定摘要和 Session，拒绝以新内容重启旧实例；因此另建 `security-operations-expert-fusion-v3`，本机回环端口 18505，仍经 53105 统一网关匿名访问。v3 的新 HOME 在业务 Runtime 开放连接前由 DSH 原生注册表登记唯一固定目录 `/work/harness/workspace`。真实浏览器完整加载后没有“选择工作区”或“选择预设”按钮，模型按钮仍可用；从编辑器发送普通问候，`session/prompt` 返回 200，页面显示中文助手回复，`turn/end` 为 `completed`，浏览器无脚本错误。经网关 API 的另一次普通问候也完成，同访客可回读 Session，另一匿名访客不能列出或读取。v3 页面显示语音连接不可用；语音接入和专项安全运营能力未纳入这次普通聊天验收。
