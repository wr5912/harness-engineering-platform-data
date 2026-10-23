# 融合版 Evaluation 观察

本 Candidate 从固定 EXP022 派生，并融合 Downloads 并行快照的调度说明、应急防火墙语义、结构化处置目标和研判报告呈现。逐项取舍与来源摘要见 [migration.md](../migration.md)。以下按时间保留技术检查和实际业务观察，各次结果仅适用于所列来源与环境。

2026-10-21，在标准 DSH `0.2.1-rc.2` 镜像 `ai-agent-harness/dsh:687f282e8-b9bce5f1fe5f` 中，以三棵只读 Candidate 挂载启动 `security-operations-expert-fusion-v2`，来源为 `experiment:EXP-security-operations-expert-024-rad80a907c628`，实例固定来源摘要 `sha256:12ed00935b93ee0e5e0982a8b8044a1459421d73ad35d80ac0b17ae971110c41`。实例占用本机回环端口 18502；访问经统一网关的实例深链，选择开发调试阶段与匿名访客方式。网关至 Runtime 的签名通道和来源固定仍生效，发布身份签名尚不适用于此实例。

首次 `session/create` 因两个私网 MCP 来源在当前环境不可达而返回 `fetch failed`。程序侧受管 MCP 自动挂载改为按来源处理连接与发现失败：不可达来源不注册工具，可达来源仍装载，DSH 原生 MCP 桥沿用其启动失败容错；本地配置错误继续报错。重建插件并重启同一实例后，匿名浏览器从真实网关页面创建 DSH 工作区和新 Session，发送一次“你好。请用一句话介绍你能提供的帮助，不调用工具。”；收到中文助手回复，`turn/end` 为 `completed`，`session/list` 可回读。同一入口的另一独立访客看不到该 Session，读取其页面返回 403；页面脚本错误为零。实例登记默认模型为 `xiaomi-token-plan-cn / mimo-v2.6-flash`，本次未独立抓取实际模型提供方请求，不把登记值写成调用事实。

本 Candidate Node 合同测试 45/45、Python 3.10 合同测试 15/15 通过；数据工作区合同校验 0 错误、0 警告。当前 MCP 管理配置保存 14 个服务、4 个分组，其中 12 个服务启用；私网 SOC 目标在本环境连接超时，配置已从临时 Mock 联调值恢复原值。上述合同与普通聊天观察不能证明安全运营工具、SOC 查询与回写、调度执行、语音、报告质量或 Research Release 可复现。

随后清理 Candidate 专有界面中重复的工作区／Preset 初始化和过宽的隐藏样式，当前来源摘要变为 `sha256:b3bbbea7814eddfa9deea4cb7d8e08710d5a486a0d3ce6c53edbaa9c4884c20f`。启动器保留 v2 的固定摘要和 Session，拒绝以新内容重启旧实例；因此另建 `security-operations-expert-fusion-v3`，本机回环端口 18505，仍经 53105 统一网关匿名访问。v3 的新 HOME 在业务 Runtime 开放连接前由 DSH 原生注册表登记唯一固定目录 `/work/harness/workspace`。真实浏览器完整加载后没有“选择工作区”或“选择预设”按钮，模型按钮仍可用；从编辑器发送普通问候，`session/prompt` 返回 200，页面显示中文助手回复，`turn/end` 为 `completed`，浏览器无脚本错误。经网关 API 的另一次普通问候也完成，同访客可回读 Session，另一匿名访客不能列出或读取。v3 页面显示语音连接不可用；语音接入和专项安全运营能力未纳入这次普通聊天验收。


## 2026-10-23 冻结 Run 独立复核

复核对象为已封存的 [run-6544173e-0670-4cfd-af86-f0d27cad77d2](../runs/run-6544173e-0670-4cfd-af86-f0d27cad77d2/report.md)。核对各 Case 的 `checks.json`、`tools.jsonl`、`response.json` 与 `judge.json`，不改写原始 Run。

| Case | 复核结论 | 证据与适用范围 |
|---|---|---|
| U-INS-005 | inconclusive | 目录查询和 `schedule_create` 回执支持提醒创建；没有真实到期消息、`start_inspection` 和结果回执，不能判定周期巡检通过。原评审自行缩小为创建阶段，其 passed 不作为周期执行证据。 |
| U-POL-011 | inconclusive | 仅加载 Skill、枚举资源并说明无法准备草案；没有真实路径、设备或阻断策略 Preview。准确说明能力缺口不能替代冻结预期，原 passed 不作为路径阻断能力证据。 |

原 summary 已为 `inconclusive`，研究 Decision 继续保持 `continue`。后续评审按冻结的全部预期逐项引用正文或真实工具回执；目标 Skill 只用于解释限制，不改变通过标准。

## 2026-10-23 当前 Candidate 与业务观察

Candidate 的证据引用解析支持点号数组下标、方括号下标及混合路径，仍要求引用存在、值非空并匹配输入。Python 检查 17/17、标准 Runtime 容器中的威胁研判与桥接 Node 检查 19/19。将当前解析器用于 INC41 原始输入和模型输出，重新校验通过且无警告；原 Run 保持原样，派生校验不追溯改写历史结果。

管理助手已从当前 Candidate 创建新的验收实例，真实页面“打开 Web”和普通聊天通过。当前无需认证语义为同实例共享数据与会话；上文 10 月 21 日的访客隔离是当时观察，不再作为当前访问规则。规则由程序仓库业务访问规范维护。

本次另执行了真实巡检、威胁研判、SOC 保存和报告下载检查。逐次参数、Runtime Run、实例来源、错误与截图统一维护于程序仓库 `platform/plugin/test/evidence/platform-exp024-20261023/README.md`。巡检尚未取得运行标识，INC41 的报告保存失败，INC42/43 虽能下载报告但仍存在证据校验警告或失败。结果不能支持专有业务全部通过；保留 `continue`，不以任务完成状态或报告下载成功替代研判证据质量。

同日补充：原生每 60 秒 Schedule 已取得真实到期、单事件研判、SOC 保存和报告保存回执；本地能力声明与实际插件注册、三条受信模型路由，以及积压心跳在运行中和 Session 恢复后的处理均已定向验证。任务和 Run 定位、并发会话取消、当前任务状态及证据质量限制仍以同一份程序仓库实机记录为准，不据单次自动研判改写本 Experiment 的 `continue`。
