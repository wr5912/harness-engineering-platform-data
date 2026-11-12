# 网络空间监控实施观察

## 当前判断

仅在 `EXP-security-operations-expert-027-f-r6930a1922fdc` 保存新增监控插件与装配引用。源码、离线检查和上游只读探测已完成。用户后续授权创建该分支实例后，独立实例 `network-space-027-r6930a1922fdc` 已创建并启动；但当前运行代次仍无实际加载回执，继承的实例确认配置插件报告未就绪。专属实例缺失的问题已解决，实际装载、浏览器效果及原生聊天交互回归仍未通过。未创建业务评测 Run，不声明已发布或业务验收通过。

## 已保存的实现

- [监控客户端](../candidate/dsh/managed/security-network-space/client.js)：独立侧栏/主面板键与原生模态顶层覆盖，进入即占满应用视口；返回聊天不选择另一会话。浏览器全屏只由用户点击触发。包含分页、来源与采样时间、二维/本地 WebGL 三维、分类/关系布局、节点与边详情、历史证据、回放控制及沙箱报告查看。
- [只读 Host](../candidate/dsh/managed/security-network-space/index.js)、[MCP 读取器](../candidate/dsh/managed/security-network-space/mcp.js)和[数据适配](../candidate/dsh/managed/security-network-space/data.js)：复用原生 Connection 访问边界及专用只读资源分组；未知结构、权限与超时不转为空成功；限制查询范围、并发、响应和展示配额。按发现的资源模板及目标摘要读取，不向页面暴露凭据或任意 URL/工具执行入口。
- [原生投影](../candidate/dsh/managed/security-network-space/timeline.js)：从公开会话事件投影最近64次工具调用，保留遗漏量和序列水位；按轮次、步骤与原始调用 ID 配对，不返回原始参数。不恢复 Agent 或重新执行历史工具。
- [装配 Patch](../candidate/dsh/managed/security-operations-expert.patch.yml)仅增加新插件行。已通过限定路径的 Git diff 核对：原聊天插件、模型参数与语音配置保持原值。没有修改原聊天客户端或生成制品。

三维采用自写 WebGL 线框几何，不使用 Three.js/CDN。客户端是原生支持的手写 JavaScript 入口，不需要转译，也没有借用原聊天 TSX 的构建脚本。视觉接近程度仍须浏览器核验。

## 已取得的检查证据

| 检查 | 实际结果 | 不能据此证明的事项 |
| --- | --- | --- |
| 平台草稿预检 | 新增/修改的 JavaScript 语法通过；JSON、YAML 草稿格式通过 | 模块在目标容器和浏览器中激活 |
| `research/validate` | `valid=true`，errors/warnings 均为空，exit_code=0 | 实际装载或业务效果 |
| [纯函数合同测试](../candidate/dsh/managed/security-network-space/test-contracts.mjs) | 本地 Node v24.21.0，23项通过，0失败、0跳过；修复后再次运行仍为23项通过 | MCP分组传输、原生UI、GPU、生产效果 |
| 限定本分支的 `git diff --check` | 退出码0；装配差异仅新增监控插件 | 对话草稿、工具审批和语音的交互回归 |

纯函数测试明确使用合成输入，不请求 MCP，不启动 DSH/浏览器，不调用模型；覆盖错误不冒充空数据、精确 ID、未知在线状态、分页口径、图谱字段、关系证据、覆盖率、事件结论、时间保留、历史绑定、脱敏、查询边界和工具结果配对。一次客户端草稿出现括号语法错误，预检拒绝且未写入；修正后预检与保存均成功。

## 真实只读接口探测

使用平台当前目录返回的服务 ID，实际调用 `readResource`。早期目录指向 `.223` 时，图谱/事件查询曾返回 HTTP 401。随后当前配置由外部更新到 `.232`；旧 URI 被范围检查拒绝。重新读取目录后，资产列表、图谱、覆盖率、事件、趋势、等级分布、推理链、历次研判和历史 HTML 报告均取得成功回执。本次没有读取或修改凭据，不将外部配置更新算作本插件修复。

以下为当次观察，而非当前实时台账：

- 默认资产页返回16条设备、total=16；图谱返回21个节点，包含软件单元，不能与设备总数混算。图谱字段为 `props.asset_id/asset_name/asset_type`，已据此适配。
- 覆盖接口返回 `coveragePct=24`、collected=5、registered=16。直接使用上游百分比，不自行算成5/16；`discoveredAvailable=false` 不显示成已验证的发现数0。
- 事件查询窗口为 `2026-11-09T10:35:33Z` 至 `2026-11-10T10:35:33Z`。列表 total=26，等级分布 HIGH=26；按日趋势两个桶为26和11，不能求和当作该精确窗口的事件数。统计接口 activeCount=27 与窗口 total=26 也不宜混为同口径。
- 读取一个真实事件的推理链与历次研判后，发现原始规则主张为主机沦陷，而历史最终结论为 FALSE_POSITIVE。界面因此明确区分规则主张、等级和研判结论，不能以红色节点或历史回放宣称攻击已确认。
- 该事件的推理链只提供一个顶层步骤。按真实数量展示，不补成多步回放；缺少时间戳不自动播放，历史回放不触发业务执行。
- 上游部分时间字符串没有时区，另有毫秒时间戳。未标时区者保持原文，仅对明确时区或毫秒时间戳进行本地格式化。

上述探测通过管理端的原生 MCP 工具完成，不等于目标业务实例已经通过专用分组 SDK 端到端读取成功。

## 后续授权创建实例的回执

用户明确要求“创建该分支的实例”后，经 `instances/list` 确认没有同来源实例，再使用原生 `instances/run` 创建 `network-space-027-r6930a1922fdc`。来源严格为本分支，采用统一网关、anonymous、development；未修改或重载其他实例。

创建回执为 `ok=true`、`dsh_running=true`、`listener_verified=true`，模型为 local / Qwen3.8-27B。回读 `instances/detail` 确认容器运行、三类只读挂载均来自本分支，Runtime 镜像与锁定来源一致，但 `asset_status.status=unknown`、`loaded=null`。不能以端口启动替代实际装载。

本次 [instances/url 入口回执](<http://172.16.138.228:53105/agents/security-operations-expert/instances/network-space-027-r6930a1922fdc/>)。当前入口仍以原生实例工具实时返回为准。

日志报告一项继承入口未激活：`instance-confirmation-config` 报“实例确认专用配置未就绪：需要只对实例用户可读的有效配置文件”。只读核对[该插件源码](../candidate/dsh/managed/security-network-space/instance-confirmation-config.mjs#L36-L46)后，确认同一错误可以覆盖配置不存在、权限或内容不合格等情况，不能进一步断言唯一原因。本次没有读取签发私钥、复制其他实例凭据、生成签发材料或禁用该保护。

随后只做了该实例的 reload 预览，回执仍明确缺少当前运行代次加载回执；未在条件未改变时实际重载或重复创建。

对该实例已知监控 GET 路径的 `web_fetch` 验证，被工具以 `URL hostname ... resolves to a non-public IP address` 拒绝。这是读取工具的网络限制，不是目标接口返回的业务错误，也不是业务查询成功。本次没有改用 curl、其他代理或放宽网关绕过限制。

## 浏览器视觉验证与修复

当前会话没有 Playwright 包，也没有注册的浏览器控制工具；工作区规则不允许为此临时安装依赖。机器已有 Chrome 149，因此使用一次性 Chrome DevTools Protocol（CDP）会话作为浏览器验证替代路径，不将其称作 Playwright。

通过 CDP 访问统一网关入口、点击“网络空间监控”并捕获 1440×1000 截图，实际确认：

- 监控入口已出现在原生侧栏；点击后打开 `dialog.sns-monitor[open]`，白色不透明视口覆盖原生外壳，截图中没有外部导航/聊天组件，符合默认沉浸式结构。
- 页面实际渲染了资产、覆盖、趋势、等级、拓扑、事件、运行记录和底部来源状态；无真实数据时显示明确的 `未接入或查询失败`，拓扑显示“没有可用真实拓扑，不生成演示节点”，没有补模拟节点。
- 点击“返回聊天”后 `dialog.sns-monitor[open]` 关闭，原生 AI-SOC 聊天界面重新出现；未切换会话。该交互已通过 CDP DOM 检查。
- 首次视觉检查暴露真实运行时错误：`Cannot set property status of Error which has only a getter`。原因是读取器将 SDK 错误原地 `Object.assign` 并写入只读 `status`。
- 已修正 [MCP 读取器](../candidate/dsh/managed/security-network-space/mcp.js)：新增可写包装错误，保留 `code`、阶段和状态码，不修改 SDK 原始 Error。修复后重跑23项合同测试通过，`research/validate` 仍为 `valid=true`。
- 修复后的浏览器检查不再出现上述 JavaScript 错误；真实实例当前显示上游 `CLIENT_HTTP_AUTHENTICATION` / HTTP 401，并明确保持空/未知状态。这是实例侧 MCP 认证/配置缺口，不是以空数据冒充成功。

截图证据：[修复后监控界面](../../visual-validation/network-space-027-monitor-fixed-cdp.png)。该截图由 Chrome CDP 生成，不代表 Playwright 或生产数据接入已通过。

## 本轮原型一比一复刻与演示数据

用户要求按附件原型做真正的 1:1 复刻，中央网络空间区域必须先读原型代码再实现，并暂时不接真实数据。本轮已改为直接以原型源码为依据。

### 先取得对照基准

用 Chrome CDP 打开原型 HTML 本体并截图，取得 1440×1000 的真实基准图：[原型基准](../../visual-validation/prototype-reference-3d.png)。原型由 Three.js 渲染 3D 设备空间，SVG 仅用于 2D 视图，这一点与我此前用 CSS 透视模拟 3D 的做法完全不同。

### 中央区域改为移植原型实现

- 从原型内联提取 Three.js（r160，669KB）与 `createSOC6DeviceSpace`（58KB）原样执行，不再自写投影。
- 大脑素材从原型 8×6 精灵图裁出首帧（512×320，119KB）后内联；原型完整动画为 4.2MB 精灵图，本轮未内联。
- 节点、连线、区域数据直接使用原型的 14 个节点、19 条边、6 个区域（含 2D 与 3D 两套坐标），节点图标、类型、状态、编码、地址、版本、归属、说明均照抄。
- 2D 视图按原型的 `asset-node` / `edge-path` / `zone-plane` 结构、坐标与类名生成，未再自创布局。
- 三维场景容器改为独立 `sns-device-host`，调用 `setVisible / resize / layout / setCamera / draw`，实测画布 774×565、14 标签、无异常。

### 补齐此前的结构缺口

- 中央底部由自创的“当前任务过程”改为原型的“安全运营驾驶舱”：三张卡片（全域感知覆盖 100%、智能体协同 8 在线、重点攻击事件 01 横向移动）加智能防御闭环流水线。
- 右栏第二面板由自创的“处置时间线”改为原型的“智能体实时工作状态”：三格智能体状态 + 后台协同任务 + 6 条时间线 + 实时任务页脚。
- 页脚改为原型文案 `AI-SOC ENGINE ONLINE / V6.0 / 非生产实时数据`。

### 体积与代价

- 插件客户端由约 400KB 增至 935KB（Three.js + 场景代码 + 单帧大脑 + 页面代码），首次加载明显变慢，仍是单文件、无 CDN、无外部请求。
- 3D 文字未内联原型 180KB 字体轮廓，改用 HTML 叠加标签；大脑为静态首帧，非 48 帧动画。

### 已验证

- 三维：`window.THREE` 与 `createSOC6DeviceSpace` 加载成功，画布 774×565，14 个标签，无未处理异常。
- 二维：SVG 视图 14 节点、6 区域，切换后对话框不关闭。
- 结构：驾驶舱 3 卡、智能体状态 3 格、时间线 6 条、页脚文案均按原型渲染。
- 截图：[复刻三维](../../visual-validation/sns-1to1-final.png)、[复刻二维](../../visual-validation/sns-1to1-final-2d.png)。

### 智能体实时状态接入真实数据

用户要求右下角“智能体实时工作状态”改用真实运行状态，已接入，只改这一块，其余仍为演示数据。

- 运行概览：轮询 `GET api/security-operations/overview`（5 秒），由同 Candidate 的 [security-operations-ui](../candidate/dsh/managed/security-operations-ui/index.js#L116) 提供，数据来自 `tools/execute`、`tools/result`、`subagent/start`、`subagent/end`、`session/event` 与会话列表。
- 工具时间线：轮询 `GET api/security-operations/network-space/timeline?sessionId=…`，会话取 `overview.parent.recentSessionId`，数据来自 [timeline.js](../candidate/dsh/managed/security-network-space/timeline.js#L28) 的原生投影。
- 三格改为真实的三个委派角色：威胁研判 / 故障分析 / 响应规划（[delegation.js](../candidate/dsh/managed/security-operations-ui/delegation.js#L1)），显示状态、工具调用数、Skill 加载数。
- 时间线按 `startedAt` 倒序取最近 6 条，标题用 `semantic` 的中文语义，时间用开始时间，说明为“状态 · 第 N 轮 / 第 M 步”，不展示原始工具标识。
- 缺数据时显示“状态未知 / — / 当前时间窗暂无工具调用 / 运行数据未接入”，不补 0、不补样例。

实测：`overview` 返回 200，`parent.state=idle`、`sessions=0`，三个角色均为 `idle`、工具调用与 Skill 均为 0，时间线显示“当前时间窗暂无工具调用”。该实例尚无会话，因此这是真实空闲态，不是占位。截图：[真实智能体状态](../../visual-validation/sns-real-agents.png)。

### 动态验证（真实会话触发）

在该实例原生对话中新建会话并发送一条资产查询指令，触发真实运行，随后回读接口与界面。

- `overview`：`sessions=1`、`recentSessionId=session-934c…`、`parent.toolCalls=4`、`parent.skillLoads=2`，`parent.state` 在运行结束后回到 `idle`。
- 子智能体：故障分析子智能体 `toolCalls=5`、`skillLoads=1`，另两个为 0；说明本轮确实派出过一个子智能体。
- `timeline`：返回 4 条真实工具调用，含 2 次 `skill`、1 次 `delegate_fault_analysis`、1 次 `send_message`（该条 `status=failed`）。
- 界面：三格显示「空闲 · 调用 0/5/0 · Skill 0/1/0」，时间线 4 条（1 条失败、3 条已完成），页脚「实时任务持续运行 · 4 条」，与接口一致。截图：[真实运行状态](../../visual-validation/sns-real-agents-live.png)。

同时观察到两点真实情况：

- 本轮 MCP 来源仍 401，模型在回复中明确说明“工具目录中没有资产枚举类只读工具”，并声明不断言资产不存在。这说明工具不可用是真实状态，不是界面伪造。
- 时间线标题在工具返回后统一变成“已完成”：`timeline.js` 在 `tool/result` 时把 `semantic` 覆盖为 `complete` 或 `unknown`，丢失了调用时的语义（scan/analyze/path 等）。当前展示因此信息量偏低，属于投影侧行为，尚未修改。

### 时间线信息增强

用户反馈时间线只有“工具名 + 状态”，信息量不足。已按数据来源补齐，并把内部信息挡在外面。

投影侧（[timeline.js](../candidate/dsh/managed/security-network-space/timeline.js)）新增并保留：

- `durationMs`：`endedAt - startedAt`，`turn/end` 时对未返回的调用也计算。
- `args`：只保留白名单参数（assetId/assetIds/keyword/分页/时间窗/等级/事件与研判 ID 等），不保留原始 `arguments`。
- `result.summary`：工具返回的可读摘要，上限 160 字符，超出标 `truncated`。
- `error.code / error.reason`：失败时保留有界错误码；业务工具把状态码放在文本里的，只提取三位数字码。
- `semantic` 不再在成功返回时被覆盖为 `complete`，保留调用时的 scan/analyze/path 等语义。

内部信息过滤：UUID 替换为 `[标识]`、连续绝对路径替换为 `[路径]`、疑似凭证片段替换为 `[已脱敏]`；MCP 资源目录类返回不再展示 `_meta`、digest、group-target 等内部结构，统一显示“MCP 资源目录已读取”；`skill`、`send_message`、`delegate_*` 使用固定可读摘要。

前端展示：标题按工具名映射中文（加载技能 / MCP 资源目录 / 委派故障分析 / 资产查询等，`mcp__*` 取末段映射），副行显示“状态 · 耗时 · 结果摘要”或“状态 · 耗时 · 错误码”，失败行红色标记，摘要两行截断。

合同测试由 23 项增加到 25 项，新增“结果保留耗时、摘要与语义”和“失败保留有界错误并脱敏”两条，全部通过。

实测（新建会话触发一次查询）：时间线显示“加载技能 · 51ms · 技能已加载”“MCP 资源目录 · 198ms · MCP 资源目录已读取”，无内部 digest、路径或凭证。截图：[增强后的时间线](../../visual-validation/sns-timeline-rich.png)。

仍未接入：审批事件（`approval/asked/decided`）、token 用量（`assistant/message.usage`）、`turn/end.reason`。标题与摘要对固定结果存在轻微重复。

### 视觉复核（2026-11-11）

重新截图核对 3D 与 2D 两种视图：[三维](../../visual-validation/sns-visual-check-3d.png)、[二维](../../visual-validation/sns-visual-check-2d.png)。

复核中发现并修复一处布局错误：设备分类视图里 `POS_2D` 把智能体/模型放在下排、终端与业务放在上排，与分区标题正好相反，2D 里“研判智能体”落在“终端接入区”。已按分区语义对调，智能体与模型回到“智能体协同区 / 智能访问边界 / 模型与知识服务区”，终端与业务回到下排三个分区。3D 坐标不受影响。

### 审批记录接入

按要求补充审批展示，不显示 token。

- 投影订阅 `approval/asked` 与 `approval/decided`，记录 `id / toolName / callId / reason / askedAt / decidedAt / outcome`，上限 20 条；未决审批保留在列表中。
- `outcome` 映射为中文：`allowed-once → 已批准（单次）`、`rejected → 已拒绝`、`cancelled → 已取消`、`unavailable → 无法审批`，缺失时显示“待确认”。
- 审批理由做清洗：沙箱升级类描述统一显示“需要一次性工作区写权限”，不展示英文原文；工具名映射中文（如 `write → 文件写入`）。
- 时间线把工具调用与审批按时间合并排序，审批行使用琥珀色标记独立样式。
- 错误码改为中文映射（`FS_SANDBOX_DENIED → 沙箱拒绝写入`、`TOOL_OUTCOME_UNKNOWN → 结果未知` 等），不再显示内部大写常量。

实测：在实例中要求写入文件，触发真实审批事件 `approval/asked`（`toolName=write`，理由为提升到 workspace-write），界面出现“工具审批 · 待确认 · 文件写入 · 需要一次性工作区写权限”；实例重载后该审批变为“已取消”，对应工具调用显示“失败 · 结果未知”。截图：[审批与工具时间线](../../visual-validation/sns-approval.png)。

合同测试增加到 27 项，新增“审批请求与决定配对”和“审批历史上限与未知决定忽略”两条，全部通过。

### 时间线密度调整

用户反馈时间线行距过于稀疏。已压缩：单行最小高度由原型继承的 62px 降为内容自适应（实测 31px），容器内边距 8/12 改为 5/10，摘要行距 1.45 改为 1.32、上边距 2px 改为 1px，节点标记 9px 改为 7px 并对齐竖线。同样面板高度下可容纳约两倍的条目。截图：[紧凑时间线](../../visual-validation/sns-timeline-compact.png)。

### 跨会话聚合

用户要求页面上呈现的是“所有会话中的智能体状态”，而此前三格状态来自 `overview`（全实例统计）、时间线却只读最近一个会话，两者范围不一致，因此时间线经常只剩 2–3 条。

已把时间线改为跨会话聚合：

- 宿主新增 `readTimelineAll`：经 `sessionController.list` 取会话（上限 20 个），并发读取各会话的同名投影，按时间合并；`mergeTimelines` 为纯函数，单会话上限 30 条、审批 10 条，并返回 `omitted`。
- `timeline` 资源新增 `scope` 参数：`scope=all` 表示聚合，缺省仍按 `sessionId` 读单会话；同时指定两者、或传其它 scope 值均拒绝。
- 前端改用 `scope=all`，展示上限由 6 条提高到 20 条；三格状态继续来自 `overview`，范围与时间线一致。

实测：`scope=all` 返回 `sessions=5`、`rows=20`、`approvals=1`、`omitted=0`；页面时间线从 3 条变为 20 条，底部显示“20 条”，可滚动。截图：[跨会话聚合](../../visual-validation/sns-timeline-aggregate.png)。

合同测试增至 29 项，新增跨会话合并排序与截断、以及 scope 参数校验两条。

### 重点威胁列表（方案 A）

按“界面最多一个筛选、只呈现最需要关注的威胁”的要求，选定方案 A：条件全部固定在服务端，前端零筛选控件。

- 新增 `threats` 只读资源（`ai-soc-correlate` `/correlate/incident`），固定 `judgeStatus=DONE`、`judgeVerdict=TRUE_POSITIVE`、`severity=CRITICAL`、`pageSize=50`；页面传入任何参数一律拒绝，避免前端扩大范围。
- 适配层 `threatsView` 只保留研判相关字段并截断摘要，按 `riskScore` 降序。
- 右栏面板改为“重点关注”，卡片展示等级、需复核标记（`judgeValidationStatus=failed`）、来源、研判时间、标题、摘要、风险分/告警数/技术数；无任何筛选控件。

管理端实测（可直接调用）：

- 全部事件 3166，已研判 678，其中真实告警 646、误报 14、可疑 18。
- 已研判中 CRITICAL 23 条、HIGH 610 条；`judgeValidationStatus=failed` 374 条。
- `orderBy=riskScore desc` 未生效，返回仍是默认顺序，因此排序放在适配层完成。
- CRITICAL + 需复核仅 4 条；最终采用 23 条这一粒度。

实例侧结果：`api/security-operations/network-space/threats` 返回业务状态 `unavailable`，错误为 `CLIENT_HTTP_AUTHENTICATION`（HTTP 401，阶段 connect）。界面正确显示“威胁数据暂不可用 / 数据未接入”，没有把 401 显示成已读取，也没有补样例数据。截图：[重点威胁未接入](../../visual-validation/sns-threats-blocked.png)。

阻塞原因与既有缺口相同：实例内插件连接业务 MCP 分组缺少有效令牌（`DISPOSITION_MCP_TOKEN` 或等价注入），而管理端通过平台凭据调用同一接口是成功的。该凭据注入需要平台或运维侧提供，本次未读取、未复制任何凭据，也未绕过鉴权。

合同测试增至 30 项，新增威胁视图排序与字段截断一条。

### 平台令牌已生效（2026-11-12 复查）

按要求重新复查，此前 401 已解除，业务数据可以读取：

- `threats`：`status=ok`、`total=8`，返回真实 CRITICAL 真实告警，含 `riskScore=1.00`、`contributingAlertCount=6811`、`techniques=33`、`judgeValidationStatus=failed` 的样本，与平台侧样本一致。界面显示 8 条「重点关注」，卡片包含等级、需复核、来源、研判时间、摘要、风险分/告警数/技术数。
- `assets`：`status=partial`、`total=108`，返回真实资产（如 `3617627 设备-138-47`、`3617626 Web-服务器-138-253`）。
- `topology`：仍失败，但原因已不是鉴权，而是 `stage=read`、`code=-32603`、`message=上游响应超过 1048576 字节上限（已读取 1051639 字节）`。

配置文件中仍未见令牌：`compose.yaml` 环境变量仅 `DSH_HOME`，`business.patch.yml` 的 `apiKey` 仍为空，`mcp_connection_sync` 也未变化。因此令牌的实际下发方式未在本机配置中体现，可能由平台网关按实例身份授权；本次未读取任何凭据，仅确认接口已可用。

平台侧与管理端口径差异：同一固定条件下，管理端统计为 23 条，实例分组返回 8 条，说明两个分组看到的上游范围不同，需在后续核对，不将任一数字当作全量。

截图：[真实重点威胁](../../visual-validation/sns-threats-live.png)。

### 多分辨率适配

用户指出此前未按原型媒体查询动态调整字号。已从原型 25 个媒体查询中提炼出 7 组断点并映射到 `sns-*` 类名：

- `min-width:1800px`：放大（左栏 300 / 右栏 360、gap 20/24、面板标题 14px、资产数字 43px、威胁标题 12px），并补了左栏两面板高度（262/205）避免大屏溢出。
- `max-width:1450px and min-width:1051px`：缩小（230/286、顶栏 90、工作区高度 `calc(100dvh - 122px)`、面板标题 12px、资产数字 33px、威胁标题 9px）。
- `max-width:1250px and min-width:1051px`：驾驶舱卡片改为纵向排版、字号再降。
- `max-width:1050px`：两栏（左 215 / 右 275），右栏下沉为两列网格、中栏 `min-height:800px`。
- `max-width:700px`：单列堆叠，左栏改 2 列网格、顶栏 110px、标题下移、拓扑 360px。
- `max-height:950px / 850px and min-width:1051px`：按高度压缩资产、环图、评分、趋势、顶栏与工作区高度。

实测（CDP 逐档切换视口）：

| 视口 | 栅格 | 主标题 | 面板标题 | 资产数字 | 威胁标题 |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | 300 / 1172 / 360 | 29px | 14px | 43px | 12px |
| 1440×1000 | 230 / 872 / 286 | 26px | 12px | 33px | 9px |
| 1280×900 | 230 / 712 / 286 | 26px | 12px | 33px | 9px |
| 1024×900 | 215 / 769（两栏） | 22px | 13px | 34px | 10px |
| 700×900 | 单列堆叠 | 21px | 11px | 34px | 10px |

截图：[1920](../../visual-validation/sns-responsive-1920x1080.png)、[1440](../../visual-validation/sns-responsive-1440x1000.png)、[1280](../../visual-validation/sns-responsive-1280x900.png)、[1024](../../visual-validation/sns-responsive-1024x900.png)、[700](../../visual-validation/sns-responsive-700x900.png)。

仍存在的限制：1024 与 700 下右栏下沉到页面下方，需要滚动才能看到；这一点与原型一致，但未做独立的移动端交互回归。

### 全屏按钮修复

用户反馈右上角全屏按钮点击无反应。复现后定位到两个原因：

1. 目标元素错误：原实现对 `<dialog>` 调 `requestFullscreen()`，Chrome 直接抛 `TypeError: Dialog elements are invalid`，而代码里 `.catch(() => {})` 把错误吞掉，表现为“点了没反应”。
2. 顺序问题：改为对 `document.documentElement` 请求后，全屏元素后进入 top layer，会盖住同为 top layer 的 dialog，截图确认页面被遮成空白。

修复方式：对整个文档请求全屏，成功后 `close()` + `showModal()` 重新把 dialog 入栈，保持其在最上层；失败时显示提示条而非静默。按钮增加全屏状态（`aria-pressed` 与「全屏 / 退出全屏」标签），并监听 `fullscreenchange` 同步。

验证（真实鼠标事件，非程序化 `click()`）：进入全屏后 `document.fullscreenElement=HTML`、`dialog` 仍打开、屏幕中心命中 dialog 内部、按钮变为「退出全屏」；再次点击后 `fullscreenElement=null`、dialog 仍打开。截图：[全屏状态](../../visual-validation/sns-fullscreen-on.png)。

### 网络空间双态视图（全景 + 威胁调查回放）

按“初始突出智能体、点击威胁再展开攻击链”的要求改造中栏：

- 全景态：智能体与模型来自运行时 `agentPresets` 与 `llm`（当前 4 个智能体、7 个模型，界面展示前 4 个智能体与 2 个模型，并标注“共 10”）；设备按 `asset_type` 聚合为 4 个节点（终端 40 / 服务器 31 / 网络交换 28 / 安全防护 1），在线状态来自资产接口；覆盖来自 `/graph/coverage`（38%、46/74）。
- 调查态：点击右栏威胁后，按研判报告提取链路设备（`172.16.1.155`、`EDR Agent 10.10.10.10`、`web PC 172.16.2.99`），并在下方展示逐步回放。
- 回放数据源为 `judgement_report` HTML，新增 `parseReportHtml` 解析出：结论、置信度（0.86）、8 条事实、3 条主张、8 步攻击链（5 步已观察 + 3 步推测）、2 条处置建议；步骤顺序与“事实/推测”类型均来自报告原文。
- 回放控制：播放/暂停、上一步/下一步、退出调查，单步 1200ms；推测步骤用琥珀虚线标识，已观察用蓝色实线。
- 节点坐标沿用原型设备槽位，标签投影改用与节点一致的 `project3d`，修复了此前依赖场景 `project` 导致的越界（原报错 `Cannot read properties of undefined (reading 'x')`）。

合同测试增至 33 项（1 项因本机缺少实例容器内的 MCP client 包而按条件跳过），新增报告解析与平台视图两条。

截图：[全景态](../../visual-validation/sns-overview-real3.png)、[调查回放](../../visual-validation/sns-investigation-replay3.png)、[2D 调查链路](../../visual-validation/sns-investigation-2d.png)。

已知限制：三维场景仍为原型固定建筑群，设备标签只覆盖原型槽位，未与建筑一一对应；2D 模式下三维画布未完全隐藏，会与 2D 链路图上下并存。

### 三维文字与模型对应（未完成）

按“文字必须跟随模型”的要求核对原型源码，确认两点：

- 原型标签位置由 `scene3d.project(x, y, 0)` 计算，x/y 取自 `layout()` 同一份 positions（像素坐标），与模型共用同一 Three.js 相机；旋转、缩放时自然跟随。
- 原型 `layout()` 遍历 `DATA.nodes` 并逐个 `devices.get(n.id)`，因此传入的 id 必须是原型 14 个槽位（analyst/inspector/…），否则 `undefined` 报错。

据此改造：真实节点绑定原型槽位 id，`layout` 传槽位坐标，标签改用 `instance.project`。当前结果：标签能渲染（10 个），但全部压在同一水平线（y≈473），旋转后坐标完全不变，说明相机应用或拖拽链路仍未打通，未达到“文字贴模型”的目标。

黑色长方形：原型场景内部还有一层 3D 文字/贴面，与我们叠加的 HTML 标签并存，需对照原型确认后再决定隐藏哪一层。

下一步：读回场景相机矩阵，确认 `setCamera` 是否真正改变相机；再验证拖拽是否更新 `camera` state 并触发 `setCamera`。本轮未修复。

### 三维标签诊断进展（初始相机仍未生效）

实测证据：

- 初始状态 `project(70,480,0) = (118.3, 295)`、`project(820,280,0) = (775.4, 295)`，两点屏幕 y 完全相同，说明此时相机仍在默认位置（世界 y=0 的点全部投影到画布中心线），`setCamera` 未生效。
- 拖拽一次后 `project(70,480,0) = (167.6, 415.5)`，标签分散为 `standard@233,440 / ptc@343,420 / 终端接入@478,645` 等，说明相机生效后投影正确、标签跟随模型。

已尝试但无效：立即 apply、`requestAnimationFrame` 再 apply、350ms 延时再 apply、`setCamera` 前调用一次 `instance.update({})`。初始仍用默认相机，只有 camera state 变化（拖拽）才真正应用。

推断：场景内部的渲染循环与尺寸初始化早于我们的 `resize/layout/setCamera` 调用，`setCamera` 的包围盒 fit 在首轮被跳过；需要对照原型页面在创建后的首帧调用顺序（`update` + `draw` 均在动画帧内）再对齐。

下一步：把 `resize/layout/setCamera/draw` 放进场景自身的首帧回调（或轮询 `getStats()` 就绪后再调用），并在应用后回读 `project` 断言两点 y 不同，作为验收条件。

### 三维文字跟随模型（已修复初始相机）

根因确认：场景创建后的首帧，`setCamera` 的包围盒 fit 尚未包含已布局的模型，首次调用被跳过，相机停在默认位置，于是所有标签被投影到同一条中心线（`project(70,480)` 与 `project(820,280)` 的 y 都是 295）。手动调用 `layout` 能把模型移到不同位置（`analyst(38.6,44.8)`、`switch(150,45)`、`database(261.4,45)`），说明布局接口本身正常。

修复：初始化稳定后触发一次极小视角变化（等价于用户轻拖），使 `setCamera` 真正生效。验收断言改为读投影结果而非看截图：

- 修复后 `project(70,480) = (139.8, 269.2)`、`project(820,280) = (786.0, 362.8)`，两点 y 不同。
- 标签位置随之分散：`standard@467,294`、`ptc@562,324`、`minimal@649,354`、`cordis@532,435`、`DeepSeek-V4.1-Flash@868,439`、`终端接入@348,512`、`业务服务@461,548`、`网络交换@525,596`、`安全防护@605,623`。
- 拖拽旋转后标签随模型移动，不再是固定坐标。

截图：[文字与模型对齐](../../visual-validation/sns-3d-applied.png)。

遗留：场景内仍有几处黑色矩形（位于模型之间），初步判断是原型场景自带的 badge/贴面层，本轮未清除，需要对照原型确认是哪一层后再处理。

### 三维文字显示在黑色矩形内（已修复）

用户判断正确：黑色矩形是三维标签的背板，文字本应画在它上面。核对原型源码：

- `label()` 先建 `panel`（`MeshBasicMaterial` 深色背板，`0x020d1e`），再把 `textGeometry(text)` 生成的文字网格放在面板前方。
- `textGeometry()` 依赖全局 `window.SOC6_FONT`；缺失字形时 `x += size * .6` 直接跳过，几何体为空，于是只剩背板。

根因：此前只内联了三维库、设备场景与大脑首帧，**没有内联矢量字体**，所以 14 个标签全部只画出黑色面板。

修复：把原型第 1604 行的 `window.SOC6_FONT`（180,479 字节、230 个字形）在模块加载时注入，并把构建流程固化为 `visual-validation/build-client.mjs`，避免后续重建再漏。

验证：

- `window.SOC6_FONT` 为 object、230 个字形；`getStats().vectorLabels` 由 18 增至 24。
- 文字显示在黑色矩形内：`standard`、`ptc`、`minimal`、`cordis`、`DeepSeek-V4.1-Flash`、`DeepSeek-V4-Pro`、`终端接入`、`业务服务`、`网络交换`、`安全防护`、`AI 安全大脑`。
- 移除叠加的 HTML 标签（`htmlLabels: 0`），二维视图仍保留 HTML 标签。
- 空槽位显示 `IDLE / SPARE SLOT`，不再因缺字只显示半个词。

截图：[三维文字与背板](../../visual-validation/sns-3d-text-final.png)。

### 三维标签缺字与背板宽度

逐字核对内联字体（230 个字形）后发现：

- 原型 13 个标签名称所需字形全部存在；
- 当前数据中只有「安全防护」的「护」缺失，其余名称无缺字。缺字时 `textGeometry` 仍按 `size * .6` 推进宽度，于是背板按完整文本计算、文字却少一个字，表现为“背板偏宽、文字不完整”。

已把该分区改名为「安全边界」（字形完整），文字与背板恢复一致。

背板宽度本身由 `max(主名称宽度, 副标题宽度) + 0.32` 决定；由于副标题（`ENDPOINTS · 40 项`、`SERVERS · 31 项` 等）长度接近，各背板宽度差异很小，看起来像是“不随文字长度变化”。若要贴合主名称，需要同时缩短或隐藏副标题。

截图：[改名后的三维标签](../../visual-validation/sns-3d-names.png)。

### 空槽位占位（SPARE）

原型三维场景固定 14 个设备槽位，当前真实数据只占 10 个（4 智能体 + 2 模型 + 4 聚合设备），余下 4 个（知识库、服务器 A/B、数据库）无对应实体。

先尝试只保留 10 个槽位（让场景按 `DATA.nodes` 建模型），结果包围盒与布局失配：画面被放大裁切，并报 `Cannot read properties of undefined (reading 'group')`。因此保留 14 个槽位，空位命名为 `SPARE / EMPTY SLOT`（中文字形缺「空」「闲」「备」等，无法完整显示）。

截图：[空槽位标记](../../visual-validation/sns-3d-spare.png)。若要彻底隐藏空槽位，需要改内联的原型场景源码（跳过无数据槽位的模型与标签），风险中等，尚未进行。

### 场景元素数据驱动（无固定空位）

按要求改为“场景元素随数据变化，只参考原型分类摆放”：

- `DATA.nodes` 只包含真实数据映射到原型模型槽位的节点（当前 10 个：4 智能体、2 模型、4 聚合设备），不再补 `SPARE` 空位。
- 场景布局 `stageLayout.positions` 只覆盖实际存在的槽位，位置沿用原型分类坐标（智能体左上、模型右上、设备下排）。
- 减少节点后相机 fit 偏紧导致边缘裁切，已在初始化后把视角留白放大一档（`zoom * 0.86`），画面恢复完整。

验证：`models=10`、`vectorLabels=18`，画面中 10 个标签与模型一一对应，边缘不再被裁。截图：[数据驱动场景](../../visual-validation/sns-3d-fit.png)。

遗留两点：场景重建时旧实例仍有残留报错 `Cannot read properties of undefined (reading 'group')`（不影响新场景渲染）；区域框仍按原型固定的 6 个分区绘制，节点变少后会出现空区，后续可按数据生成区域。

### 分区随数据生成

分区不再使用原型固定的 6 个区域，改为按真实数据生成：

- 按 `kind` 分组（智能体 / 大模型 / 设备），只有存在节点的分类才生成区域；
- 区域位置取该类节点坐标的外接范围，尺寸按 `节点跨度 + 边距` 计算（设备区 padX 90、其它 110；高度至少 132）；
- 区域标题随分类给出：`智能体协同区 n AGENTS` / `模型与知识服务区 n MODELS` / `终端接入区 n ASSETS`；
- 节点数量变化时区域自动增减与缩放。

验证：`models=10`，`vectorLabels=15`（10 个节点 + 3 个区域 + 大脑），画面只剩 3 个有效区域，原型里多出来的空区不再出现。截图：[动态分区](../../visual-validation/sns-3d-zones.png)。

遗留：三维区域标题文字在当前视角下不明显；场景重建时仍有旧实例的残留报错。

### 场景残留报错与加载态（已修复）

残留报错根因定位到连线：`D.edges.forEach` 里 `lightRoute(e)` 访问 `devices.get(e.from).group`，而边端点写成了 `agents[0].slot` / `device.slot`——这些对象上没有 `slot` 字段（`slot` 只存在于渲染节点上），端点为 `undefined`，于是取到 `undefined.group`。改用 `SLOT_IDS_*` 常量直接生成端点后，报错消失（`window.__SNS_SCENE_ERROR__` 为 null）。

同时移除模块级 `DATA.nodes = NODES` / `DATA.edges = EDGES`，避免原型 14 节点、19 条边在场景创建时覆盖真实数据。

加载态：三维舞台增加全屏遮罩（深色径向渐变 + 旋转指示 + “正在装载三维网络空间…”），并在进入/换数据后至少显示 1.6 秒，覆盖首帧渲染与相机生效窗口，不再出现空白深蓝画布。

验证：加载中 `loading=true`；就绪后 `loading=false`、`models=10`、`err=null`。截图：[加载态](../../visual-validation/sns-3d-loading-state.png)、[就绪态](../../visual-validation/sns-3d-clean.png)。

### 仍未做到

- 悬浮 AI 助手（`assistant-fab` / 面板）、巡检报告弹窗、攻击路径标注层未移植。
- 智能体面板已完成真实动态回归；时间线已保留语义、耗时、参数白名单、结果摘要与错误码，并过滤内部元数据。
- 节点扫描环动画、语义动效、拖拽旋转与缩放虽调用原型接口，但未逐项回归。
- 全部数据为原型模拟数据，未接真实来源；实例侧 MCP 仍 401。
- 实例 reload 仍返回 `unknown`，有效加载由浏览器实渲染反证。

## 仍待完成的验收

创建前 `detail` 在 `2026-11-10T12:55:55Z` 附近曾返回本目标 `loaded_instance.instances=[]`；该历史情况已由后续创建更新。当前缺口是实际加载、实例侧认证和真实数据验证，不再需要重复授权创建同名实例。

1. 通过既有安全配置机制修正本实例继承的确认配置，取得当前运行代次的实际加载回执；不要在聊天中发送私钥，不以删除保护代替修复。现有实例工具合同未提供该专用配置的补齐动作。
2. 在目标环境的受控读取入口或浏览器中核对专用 MCP v2 分组、认证、取消、超时、部分/过期数据和不存在对象的行为。
3. 在真实浏览器继续检查会话草稿、模型和运行任务不变，以及审批、附件、语音等原生交互不回归；当前已验证默认沉浸和返回聊天，未完成其余原生交互。
4. 继续补充真实数据下的拓扑/趋势/历史证据/报告回放，以及隐藏/退出后的计时器、请求与资源释放核对；2D/3D 切换、暂停动效、刷新与返回聊天已通过 CDP 核对。

当前结论保持 inconclusive；不合并主线、不提交推送、不发布。
