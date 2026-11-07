# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-d0b97ad9-9b5a-4642-8228-ffda70712586`
- Experiment：`EXP-security-operations-expert-027-f-r5efdc136f237`
- Agent：`security-operations-expert`
- 状态：失败
- 有效结论：无法判定
- 机器结论：失败
- 证据复核：`not_requested`
- 开始时间：`2026-11-07T02:51:35Z`
- 完成时间：`2026-11-07T02:55:12Z`
- 执行通道：`native-session`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 3 | 0 | 0 | 2 | 1 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 26 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 15 | 2 | 2 | 0 | 0 | 0 | not_requested | 0/0/0 |
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
| unknown | 策略协议参数未取得型号允许值 | U-POL-021 发送 protocol=TCP，真实预览返回601 acl-protocol-choices；当前 input-fields 中 protocol.enumValuesJson=null，未获得映射允许值，未走后续写步骤。先前500具体根因仍未知。 | 由 AISOC 合同与型号映射配置责任方核对 traceId、真实允许值及字段合同，具备明确依据后按原授权新 Run 复验；不猜测枚举、不改外部源码或放宽校验。 | [evidence/U-POL-021.json](evidence/U-POL-021.json) |
| harness | 参数合同不足后的责任表达不够准确 | 最终答复将型号protocol允许值缺失笼统称为平台侧需修复；当前证据仅指向 AISOC 字段合同与型号校验，不能判为本平台故障。 | 后续优化只在指定 Candidate；明确外部合同责任与本平台接入边界，不能以更多提示语替代可用参数来源。 | [evidence/U-POL-021.json](evidence/U-POL-021.json) |

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-EMG-007` | 请在 EDR 执行设备 172.16.1.165（deviceId=dev-39b0a2d19bbf）上，为被管主机 wishclamAV / 172.16.2.114（agentId=002）准备 host-lock-screen 动作；只准备，不预览、不创建任务、不执行。 | 1. 按当前真实动作定义及目标候选核对 host-lock-screen，区分 EDR 执行设备与被管主机。读取该执行设备的真实 device-agents，确认 agentId 为字符串 002 且对应 wishclamAV / 172.16.2.114，不以设备 IP、deviceId 或猜测编号代替。<br>2. 完成动作、执行点、参数和影响的真实准备，保留指定对象并停在准备阶段；不做指令预览，不创建 SOC 任务，不下发锁屏，不把准备输出或本地说明称为已保存任务。<br>3. 准备完成须有动作、目标与真实 agentId 的对应证据；发现失败、目标不匹配、权限或能力缺失时如实标为阻塞或未知，不能以缺口说明代替正向准备通过。明确设备尚未锁屏，准备通过不代表执行受理或真实锁屏效果。 | 已完成 | 通过 | - | - | 当前会话实际发现并调用已发布 emergency_action，一次正确传入顶层字符串 agentId=002；真实核对执行设备 dev-39b0a2d19bbf 与 wishclamAV/172.16.2.114 归属，stage=prepared，receipts=[]。未预览、建任务或执行；最终答复准确区分组合运行号与 SOC 回执，无继续操作菜单。 | [evidence/U-EMG-007.json](evidence/U-EMG-007.json) |
| `U-EMG-010` | 请在防火墙 172.16.200.10（deviceId=dev-360319c8c91f）上准备 block-ip 动作，src_ip=203.0.113.77，rule_name=dsh-223-fw-20010-20261106；只准备，不预览、不创建任务、不执行封禁。 | 1. 从当前真实动作定义及目标候选核对 block-ip 和防火墙 dev-360319c8c91f / 172.16.200.10，保留 src_ip=203.0.113.77 与 rule_name=dsh-223-fw-20010-20261106；不换设备、不改规则名或封禁范围，不将防火墙动作替换为 EDR 主机动作，不填写无关 agentId。<br>2. 依据实际参数合同完成动作、目标及影响准备，明确只停在准备阶段，不调用指令预览、创建任务或封禁执行，不声称已保存 SOC 草稿、已受理执行或设备已经封禁。<br>3. 准备通过须有本次真实动作和设备支持证据；无合格候选、权限或参数不支持、外部查询失败时如实说明阻塞、失败或未知，不能以缺口说明替代正向准备通过。准备结果与真实设备效果严格分开，未经执行不得声称规则生效。 | 已完成 | 通过 | - | - | 当前会话实际发现并调用已发布 emergency_action，核对 dev-360319c8c91f/172.16.200.10、block-ip 与原参数，stage=prepared，receipts=[]。未预览、建任务或执行；最终答复没有不适用的创建任务建议。 | [evidence/U-EMG-010.json](evidence/U-EMG-010.json) |
| `U-POL-021` | 请在防火墙 172.16.200.10 上真实下发允许策略：源 172.16.138.226 访问目的 10.254.240.1 的 TCP 443。完成后按本次原任务核对下发结果和真实设备效果，不要只给预览或草稿。 | 1. 使用真实目录和策略合同核对指定防火墙及源 172.16.138.226、目的 10.254.240.1、TCP 443 的允许规则，取得真实配置预览；不换设备、不扩展规则范围，不以建议文本冒充渲染结果。<br>2. 按本次真实下发授权完成原 SOC 任务保存、预检及实际必要的提交、审批和执行。取得 taskId 后只续办和查询同一任务；超时或受理未知时先查原号，不重建任务或盲目重放写入。<br>3. 回读该原任务的执行与跟踪结果，核对实际目标、规则、设备侧回执及可取得的真实效果证据。严格区分通过、受理、审批中、执行中、阻塞、失败与未知；只有取得与本次规则对应的下发及真实设备效果证据才判正向任务通过。仅 HTTP 成功、保存、受理或缺口说明均不算通过，外部故障不得降低标准。 | 已完成 | 失败 | - | - | 当前会话实际发现并调用已发布 policy_change stop=apply，预览业务 code=601：acl-protocol-choices，traceId=869e878201ac4f0b908497b7861df920。发送 protocol=TCP，当前 input-fields 的 protocol.enumValuesJson=null；真实允许值未取得。停于 preview/blocked，receipts=[]，未进入保存、提交或执行，设备当前规则未知；不能把此处601当作先前500已解决。最终建议含糊称平台侧修复，责任应先由 AISOC 合同/型号配置方核对。 | [evidence/U-POL-021.json](evidence/U-POL-021.json) |

## 与之前版本的对比

这是两次 Run 的观察性对照；模型、执行器、镜像、输入口径或环境有差异时，不能单独归因于 Harness。

| 来源 | 旧版 | 新版 |
| --- | --- | --- |
| Run | [run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c](../run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c/report.md) | [run-d0b97ad9-9b5a-4642-8228-ffda70712586](report.md) |
| Git | c5b63d45d35f77cb5a48b36aa8241f0ceace49b1；dirty=true | f9a9b71acbe7c0922a352448aa7126d8590c909d；dirty=true |
| 固定运行来源 | 当前工作树 | 当前工作树 |
| 接口环境 | 未声明 Mock 连接映射 | 未声明 Mock 连接映射 |
| 平台程序 | 63ab5063c98d166fcc480a613765424ec8b7f888；dirty=true | b498fb3b5e6e1b5c5c09371c1c9e1e1bd7d2dc49；dirty=true |
| 执行与评审实现 | [已冻结 32 项文件](../run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c/inputs.lock.json) | [已冻结 32 项文件](inputs.lock.json) |
| Candidate | workspace: sha256:72dd65b44a8325f7f67b910a28016a611d7f7445f71da2f2f821ef9e1ed1fe43<br>presets: sha256:da0e7955d04bd977571c1e77eaf8ea00e2a2a0457a54d05ccf2da35867eb0f69<br>managed: sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92 | workspace: sha256:72dd65b44a8325f7f67b910a28016a611d7f7445f71da2f2f821ef9e1ed1fe43<br>presets: sha256:da0e7955d04bd977571c1e77eaf8ea00e2a2a0457a54d05ccf2da35867eb0f69<br>managed: sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92 |
| 执行器 / 预期模型 | native-session / 未记录 | native-session / 未记录 |
| 评审方法 | none | none |
| 业务效果复核 | not_requested | not_requested |
| 源码诊断 | 未单独记录 | 未单独记录 |
| 实际模型路由 | 未记录 | 未记录 |
| 实际镜像 | 未记录；未记录 | 未记录；未记录 |
| 插件配置 / 依赖变量 | sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92；{"DEEPSEEK_API_KEY":false,"SEC_OPS_MCP_TOKEN":false,"LOCAL_LLM_BASE_URL":false,"LOCAL_LLM_API_KEY":false,"XIAOMI_TOKEN_PLAN_CN_API_KEY":false,"LOCAL_API_KEY":false} | sha256:a2d2187c855ed0b1ec01de9fe75b587397c603189b26a99dfe41d44e51dd8d92；{"DEEPSEEK_API_KEY":false,"SEC_OPS_MCP_TOKEN":false,"LOCAL_LLM_BASE_URL":false,"LOCAL_LLM_API_KEY":false,"XIAOMI_TOKEN_PLAN_CN_API_KEY":false,"LOCAL_API_KEY":false} |
| 硬件 / 资源消耗 | 未记录 | 未记录 |

- 共同 Case：U-EMG-007、U-EMG-010、U-POL-021；仅旧版：无；仅新版：无。
- 可观察对照：有共同 Case 结果；因果归因：受下列限制，不能认定 Harness 单独导致差异。
- 限制：model: 未记录
- 限制：left: Git 来源不干净或未记录
- 限制：left: 平台程序来源不干净或未记录
- 限制：left: 缺少证据或记录（evidence/dsh-image.json；U-EMG-007: checks.json；U-EMG-010: checks.json；U-POL-021: checks.json）
- 限制：right: Git 来源不干净或未记录
- 限制：right: 平台程序来源不干净或未记录
- 限制：right: 缺少证据或记录（evidence/dsh-image.json；U-EMG-007: checks.json；U-EMG-010: checks.json；U-POL-021: checks.json）
- 限制：program_origin: 平台程序提交不同
- 限制：image_build_fingerprint: 缺少实际镜像证据
- 限制：local_image_id: 缺少实际镜像证据
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
| U-EMG-007 | 相同 | completed/failed / 未记录 | completed/passed / 未记录 | 旧：未调用；新：未调用 | 记录有差异；旧：指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。；新：当前会话实际发现并调用已发布 emergency_action，一次正确传入顶层字符串 agentId=002；真实核对执行设备 dev-39b0a2d19bbf 与 wishclamAV/172.16.2.114 归属，stage=prepared，receipts=[]。未预览、建任务或执行；最终答复准确区分组合运行号与 SOC 回执，无继续操作菜单。 | [U-EMG-007.json](../run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c/evidence/U-EMG-007.json) | [U-EMG-007.json](evidence/U-EMG-007.json) |
| U-EMG-010 | 相同 | completed/failed / 未记录 | completed/passed / 未记录 | 旧：未调用；新：未调用 | 记录有差异；旧：指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。；新：当前会话实际发现并调用已发布 emergency_action，核对 dev-360319c8c91f/172.16.200.10、block-ip 与原参数，stage=prepared，receipts=[]。未预览、建任务或执行；最终答复没有不适用的创建任务建议。 | [U-EMG-010.json](../run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c/evidence/U-EMG-010.json) | [U-EMG-010.json](evidence/U-EMG-010.json) |
| U-POL-021 | 相同 | completed/failed / 未记录 | completed/failed / 未记录 | 旧：未调用；新：未调用 | 记录有差异；旧：指定版本定向重载后，本轮原生请求只有115项工具，实际缺少两个组合及策略应急原始分组，未形成真实业务准备或下发。EMG007尝试组合返回unknown tool。平台管理端能发现工具不能替代实例装载。已定位空草稿绑定在来源变化后仍校验旧摘要，后续另开Run验证修复。；新：当前会话实际发现并调用已发布 policy_change stop=apply，预览业务 code=601：acl-protocol-choices，traceId=869e878201ac4f0b908497b7861df920。发送 protocol=TCP，当前 input-fields 的 protocol.enumValuesJson=null；真实允许值未取得。停于 preview/blocked，receipts=[]，未进入保存、提交或执行，设备当前规则未知；不能把此处601当作先前500已解决。最终建议含糊称平台侧修复，责任应先由 AISOC 合同/型号配置方核对。 | [U-POL-021.json](../run-cfc5d069-29f6-49bd-9116-5b4d388dfe7c/evidence/U-POL-021.json) | [U-POL-021.json](evidence/U-POL-021.json) |


## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
