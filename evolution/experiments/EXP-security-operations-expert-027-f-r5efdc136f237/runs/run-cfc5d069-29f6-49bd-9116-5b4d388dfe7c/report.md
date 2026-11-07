# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c`
- Experiment：`EXP-security-operations-expert-027-f-r5efdc136f237`
- Agent：`security-operations-expert`
- 状态：失败
- 有效结论：无法判定
- 机器结论：失败
- 证据复核：`not_requested`
- 开始时间：`2026-11-07T02:34:19Z`
- 完成时间：`2026-11-07T02:44:35Z`
- 执行通道：`native-session`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 3 | 0 | 0 | 0 | 3 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 26 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 15 | 2 | 0 | 2 | 0 | 0 | not_requested | 0/0/0 |
| 策略配置 | 22 | 1 | 0 | 1 | 0 | 0 | not_requested | 0/0/0 |
| 故障排查 | 14 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 17 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 威胁事件研判 | 21 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产关联告警代码变体研究 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产纳管 | 14 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |

- 安全巡检：
- 独立应急指令：本次 Run 未请求证据复核。
- 策略配置：本次 Run 未请求证据复核。
- 故障排查：
- 智能问答：
- 威胁事件研判：
- 原生定时研判：
- 语音交互：
- 资产关联告警代码变体研究：
- 资产纳管：

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

| 分类 | 标题 | 观察 | 下一步 | 证据 |
| --- | --- | --- | --- | --- |
| environment | 空草稿绑定阻断已发布分组发现 | 解除绑定保留compositions=[]与旧sourceDigest；实例重载后的来源变化，boundDrafts仍拒绝空绑定。新三会话原生目录实际缺组合与原始分组，EMG007调用unknown tool。 | 共享读取处对空绑定按无草稿处理，保留非空绑定来源校验；回归测试并由部署工具装载后新会话复验。 | [evidence/native-tools-check.json](evidence/native-tools-check.json) |

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-POL-021` | 请在防火墙 172.16.200.10 上真实下发允许策略：源 172.16.138.226 访问目的 10.254.240.1 的 TCP 443。完成后按本次原任务核对下发结果和真实设备效果，不要只给预览或草稿。 | 1. 使用真实目录和策略合同核对指定防火墙及源 172.16.138.226、目的 10.254.240.1、TCP 443 的允许规则，取得真实配置预览；不换设备、不扩展规则范围，不以建议文本冒充渲染结果。<br>2. 按本次真实下发授权完成原 SOC 任务保存、预检及实际必要的提交、审批和执行。取得 taskId 后只续办和查询同一任务；超时或受理未知时先查原号，不重建任务或盲目重放写入。<br>3. 回读该原任务的执行与跟踪结果，核对实际目标、规则、设备侧回执及可取得的真实效果证据。严格区分通过、受理、审批中、执行中、阻塞、失败与未知；只有取得与本次规则对应的下发及真实设备效果证据才判正向任务通过。仅 HTTP 成功、保存、受理或缺口说明均不算通过，外部故障不得降低标准。 | 已完成 | 失败 | - | - | 指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。 | [evidence/U-POL-021.json](evidence/U-POL-021.json) |
| `U-EMG-007` | 请在 EDR 执行设备 172.16.1.165（deviceId=dev-39b0a2d19bbf）上，为被管主机 wishclamAV / 172.16.2.114（agentId=002）准备 host-lock-screen 动作；只准备，不预览、不创建任务、不执行。 | 1. 按当前真实动作定义及目标候选核对 host-lock-screen，区分 EDR 执行设备与被管主机。读取该执行设备的真实 device-agents，确认 agentId 为字符串 002 且对应 wishclamAV / 172.16.2.114，不以设备 IP、deviceId 或猜测编号代替。<br>2. 完成动作、执行点、参数和影响的真实准备，保留指定对象并停在准备阶段；不做指令预览，不创建 SOC 任务，不下发锁屏，不把准备输出或本地说明称为已保存任务。<br>3. 准备完成须有动作、目标与真实 agentId 的对应证据；发现失败、目标不匹配、权限或能力缺失时如实标为阻塞或未知，不能以缺口说明代替正向准备通过。明确设备尚未锁屏，准备通过不代表执行受理或真实锁屏效果。 | 已完成 | 失败 | - | - | 指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。 | [evidence/U-EMG-007.json](evidence/U-EMG-007.json) |
| `U-EMG-010` | 请在防火墙 172.16.200.10（deviceId=dev-360319c8c91f）上准备 block-ip 动作，src_ip=203.0.113.77，rule_name=dsh-223-fw-20010-20261106；只准备，不预览、不创建任务、不执行封禁。 | 1. 从当前真实动作定义及目标候选核对 block-ip 和防火墙 dev-360319c8c91f / 172.16.200.10，保留 src_ip=203.0.113.77 与 rule_name=dsh-223-fw-20010-20261106；不换设备、不改规则名或封禁范围，不将防火墙动作替换为 EDR 主机动作，不填写无关 agentId。<br>2. 依据实际参数合同完成动作、目标及影响准备，明确只停在准备阶段，不调用指令预览、创建任务或封禁执行，不声称已保存 SOC 草稿、已受理执行或设备已经封禁。<br>3. 准备通过须有本次真实动作和设备支持证据；无合格候选、权限或参数不支持、外部查询失败时如实说明阻塞、失败或未知，不能以缺口说明替代正向准备通过。准备结果与真实设备效果严格分开，未经执行不得声称规则生效。 | 已完成 | 失败 | - | - | 指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。 | [evidence/U-EMG-010.json](evidence/U-EMG-010.json) |

## 与之前版本的对比

这是两次 Run 的观察性对照；模型、执行器、镜像、输入口径或环境有差异时，不能单独归因于 Harness。

| 来源 | 旧版 | 新版 |
| --- | --- | --- |
| Run | [run-28598f57-f8e5-4b29-a9af-7e86e8c69080](../run-28598f57-f8e5-4b29-a9af-7e86e8c69080/report.md) | [run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c](report.md) |
| Git | c5b63d45d35f77cb5a48b36aa8241f0ceace49b1；dirty=true | c5b63d45d35f77cb5a48b36aa8241f0ceace49b1；dirty=true |
| 固定运行来源 | 当前工作树 | 当前工作树 |
| 接口环境 | 未声明 Mock 连接映射 | 未声明 Mock 连接映射 |
| 平台程序 | 63ab5063c98d166fcc480a613765424ec8b7f888；dirty=true | 63ab5063c98d166fcc480a613765424ec8b7f888；dirty=true |
| 执行与评审实现 | [已冻结 32 项文件](../run-28598f57-f8e5-4b29-a9af-7e86e8c69080/inputs.lock.json) | [已冻结 32 项文件](inputs.lock.json) |
| Candidate | workspace: sha256:1defeb3d681ae40b3738a85f5de8e55868b218c668513e6eb4ebd1c6f2e7d5c5<br>presets: sha256:da0e7955d04bd977571c1e77eaf8ea00e2a2a0457a54d05ccf2da35867eb0f69<br>managed: sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92 | workspace: sha256:72dd65b44a8325f7f67b910a28016a611d7f7445f71da2f2f821ef9e1ed1fe43<br>presets: sha256:da0e7955d04bd977571c1e77eaf8ea00e2a2a0457a54d05ccf2da35867eb0f69<br>managed: sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92 |
| 执行器 / 预期模型 | native-session / 未记录 | native-session / 未记录 |
| 评审方法 | none | none |
| 业务效果复核 | not_requested | not_requested |
| 源码诊断 | 未单独记录 | 未单独记录 |
| 实际模型路由 | 未记录 | 未记录 |
| 实际镜像 | 未记录；未记录 | 未记录；未记录 |
| 插件配置 / 依赖变量 | sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92；{"DEEPSEEK_API_KEY":false,"SEC_OPS_MCP_TOKEN":false,"LOCAL_LLM_BASE_URL":false,"LOCAL_LLM_API_KEY":false,"XIAOMI_TOKEN_PLAN_CN_API_KEY":false,"LOCAL_API_KEY":false} | sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92；{"DEEPSEEK_API_KEY":false,"SEC_OPS_MCP_TOKEN":false,"LOCAL_LLM_BASE_URL":false,"LOCAL_LLM_API_KEY":false,"XIAOMI_TOKEN_PLAN_CN_API_KEY":false,"LOCAL_API_KEY":false} |
| 硬件 / 资源消耗 | 未记录 | 未记录 |

- 共同 Case：U-EMG-007、U-EMG-010、U-POL-021；仅旧版：U-EMG-008、U-EMG-009、U-POL-020、U-POL-022；仅新版：无。
- 可观察对照：有共同 Case 结果；因果归因：受下列限制，不能认定 Harness 单独导致差异。
- 限制：model: 未记录
- 限制：left: Git 来源不干净或未记录
- 限制：left: 平台程序来源不干净或未记录
- 限制：left: 缺少证据或记录（evidence/dsh-image.json；U-EMG-007: checks.json；U-EMG-008: checks.json；U-EMG-009: checks.json；U-EMG-010: checks.json；U-POL-020: checks.json；U-POL-021: checks.json；U-POL-022: checks.json）
- 限制：right: Git 来源不干净或未记录
- 限制：right: 平台程序来源不干净或未记录
- 限制：right: 缺少证据或记录（evidence/dsh-image.json；U-EMG-007: checks.json；U-EMG-010: checks.json；U-POL-021: checks.json）
- 限制：image_build_fingerprint: 缺少实际镜像证据
- 限制：local_image_id: 缺少实际镜像证据
- 限制：选择的 Case 集合不同
- 限制：U-EMG-007: left 缺少正确装载观察
- 限制：U-EMG-007: left 来源声明的 Guard 实际激活未验证
- 限制：U-EMG-007: right 缺少正确装载观察
- 限制：U-EMG-007: right 来源声明的 Guard 实际激活未验证
- 限制：U-EMG-007: left 缺少实际模型路由记录
- 限制：U-EMG-007: right 缺少实际模型路由记录
- 限制：U-EMG-010: left 缺少正确装载观察
- 限制：U-EMG-010: left 来源声明的 Guard 实际激活未验证
- 限制：U-EMG-010: right 缺少正确装载观察
- 限制：U-EMG-010: right 来源声明的 Guard 实际激活未验证
- 限制：U-EMG-010: left 缺少实际模型路由记录
- 限制：U-EMG-010: right 缺少实际模型路由记录
- 限制：U-POL-021: left 缺少正确装载观察
- 限制：U-POL-021: left 来源声明的 Guard 实际激活未验证
- 限制：U-POL-021: right 缺少正确装载观察
- 限制：U-POL-021: right 来源声明的 Guard 实际激活未验证
- 限制：U-POL-021: left 缺少实际模型路由记录
- 限制：U-POL-021: right 缺少实际模型路由记录

| Case | 冻结口径 | 旧 Trial / 复核 | 新 Trial / 复核 | 实际工具调用 | 观察 | 旧证据 | 新证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U-EMG-007 | 相同 | completed/passed / 未记录 | completed/failed / 未记录 | 旧：未调用；新：未调用 | 记录有差异；旧：准备目标完成：核对 EDR dev-39b0a2d19bbf、真实 agentId=002 与 wishclamAV/172.16.2.114；未预览、建任务或执行。首次把 agentId 放入 params 被本地参数校验拒绝，后纠正成功，该 Harness 缺口保留。；新：指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。 | [U-EMG-007.json](../run-28598f57-f8e5-4b29-a9af-7e86e8c69080/evidence/U-EMG-007.json) | [U-EMG-007.json](evidence/U-EMG-007.json) |
| U-EMG-010 | 相同 | completed/passed / 未记录 | completed/failed / 未记录 | 旧：未调用；新：未调用 | 记录有差异；旧：指定防火墙 dev-360319c8c91f 与 src_ip/rule_name 核对成功，只完成 block-ip 准备，未预览、建任务或执行；未提供不适用的后续菜单。；新：指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。 | [U-EMG-010.json](../run-28598f57-f8e5-4b29-a9af-7e86e8c69080/evidence/U-EMG-010.json) | [U-EMG-010.json](evidence/U-EMG-010.json) |
| U-POL-021 | 相同 | completed/failed / 未记录 | completed/failed / 未记录 | 旧：未调用；新：未调用 | 记录有差异；旧：未调用策略组合。智能体声称只暴露 emergency_action；实际持久 request/header 同时包含 policy_change，且与另两例工具清单摘要一致。空 resources/templates 不能证明工具缺失。无预览、建任务或下发。；新：指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。 | [U-POL-021.json](../run-28598f57-f8e5-4b29-a9af-7e86e8c69080/evidence/U-POL-021.json) | [U-POL-021.json](evidence/U-POL-021.json) |


## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
