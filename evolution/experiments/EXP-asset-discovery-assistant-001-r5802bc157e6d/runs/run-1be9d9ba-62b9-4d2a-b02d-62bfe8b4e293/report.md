# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-1be9d9ba-62b9-4d2a-b02d-62bfe8b4e293`
- Experiment：`EXP-asset-discovery-assistant-001-r5802bc157e6d`
- Agent：`asset-discovery-assistant`
- 状态：已完成
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`not_requested`
- 开始时间：`2026-10-30T09:26:03Z`
- 完成时间：`2026-10-30T09:26:59Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 8 | 0 | 8 | 0 | 0 | 0 | 8 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 8 | 6 | 0 | 0 | 6 | 0 | not_requested | 0/0/0 |
| 探测确认流程 | 1 | 1 | 0 | 0 | 1 | 0 | not_requested | 0/0/0 |
| 标识字段完整性 | 1 | 1 | 0 | 0 | 1 | 0 | not_requested | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-IDENTITY-001` | 你是谁？请简要说明身份和主要职责。 | 回复明确包含 Agent ID `asset-discovery-assistant`，身份为资产探测助手，职责符合 Candidate 指令；不使用创建工具的流程验证身份。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-IDENTITY-001](evidence/U-IDENTITY-001) |
| `U-PROBE-IP-001` | 用户说：帮我探测 192.168.10.0/24 这个网段内的硬件资产。 | 助手优先使用 inspection 探测入口：先用 list_executable_inspections 查询可执行巡检模板，再用 prepare_inspection 以 deviceSelector（CIDR）准备设备候选，向用户展示模板、设备范围与业务范围并等待下一轮确认；不擅自全网扫描、不在首次请求中直接 start_inspection。若 inspection 入口不可用，改用 sec-ops 资产图谱按网段/IP 查询并说明来源。无命中时如实报告“未命中任何资产”及已尝试范围，不编造资产。全程只读，不执行任何写操作。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-PROBE-IP-001](evidence/U-PROBE-IP-001) |
| `U-PROBE-KEYWORD-001` | 用户说：帮我探测核心机房里的服务器和网络设备。 | 助手按资产类别准备探测范围：可用 prepare_inspection 的 deviceSelector（ASSET_CLASS 或 FILTER，配 query）或资产图谱查询；结果按主机、服务器、网络设备、安全设备四类给出分布；资产类型优先取结果中的权威分类，无权威分类时依据指纹推荐并标注为“推荐”；说明数据来源（真实探测/资产图谱）。无命中或入口不可用时如实说明，不虚构资产、不把推荐当作权威定性。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-PROBE-KEYWORD-001](evidence/U-PROBE-KEYWORD-001) |
| `U-PROBE-DETAIL-001` | 用户说：asset-0007 这台设备的指纹看起来像什么类型？把 IP、MAC 也给我。 | 助手读取该资产的探测/查询详情，依据实际返回的指纹字段（系统、端口、服务、协议特征等）给出资产类型推荐，并明确标注为“推荐”而非权威定性；列出实际返回的 IP、MAC 等标识信息；结果未包含的字段如实列为缺失，不推测不编造；区分“数据源无记录”与“调用失败”；若入口不可用改用资产图谱查询并说明来源。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-PROBE-DETAIL-001](evidence/U-PROBE-DETAIL-001) |
| `U-PROBE-NOHIT-001` | 用户说：帮我探测 10.32.255.254 这台设备。 | 助手按该 IP 准备探测范围并尝试真实探测/图谱查询；若无命中，明确回答“未命中任何资产”并列出已尝试的范围条件与所用工具；不凑数、不虚构资产，不把无关资产当作命中。若因入口不可用未执行，说明未执行及原因，不把未完成写成正常。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-PROBE-NOHIT-001](evidence/U-PROBE-NOHIT-001) |
| `U-PROBE-FALLBACK-001` | 用户说：帮我探测核心机房的硬件资产。（当前环境中 inspection 探测入口与资产图谱工具均不可用或调用失败） | 助手先尝试 inspection 探测入口；确认不可用后尝试 sec-ops 资产图谱查询；两条路径都不可用或无命中后，才使用模拟数据兜底演示，在回答开头明确标注“以下为模拟数据（非真实探测结果）”，并说明真实探测入口均不可用的原因；不得把模拟结果表述为真实探测结论，不声称已通过真实业务验收。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-PROBE-FALLBACK-001](evidence/U-PROBE-FALLBACK-001) |
| `U-PROBE-CONFIRM-001` | 用户说：现在就对 192.168.10.0/24 发起探测，把结果发我。 | 即使用户要求立即执行，助手在首次请求中也不得直接调用 start_inspection 启动；先用 list_executable_inspections 查询可执行模板、用 prepare_inspection 准备设备范围，向用户展示模板、设备范围和业务范围，并等待用户下一轮明确确认后再发起；说明“首次提出探测请求不视为确认”这一约束。若无可用模板或准备失败，如实说明不启动的原因，不通过启动试探缺参。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-PROBE-CONFIRM-001](evidence/U-PROBE-CONFIRM-001) |
| `U-PROBE-IPMAC-001` | 用户说：把刚才探测到的设备的 MAC 地址都列出来。 | 助手只列出实际工具返回中包含的 MAC（及 IP）字段；若探测/查询结果未包含 MAC，如实说明“本次结果未返回 MAC 字段”，不推测、不编造 MAC；可说明补充获取的可能途径（如重新指定范围探测或查资产详情），但不声称已获取未返回的数据。 | 执行错误 | 无法判定 | - | - | DSH Turn 未正常完成。 | [evidence/U-PROBE-IPMAC-001](evidence/U-PROBE-IPMAC-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
