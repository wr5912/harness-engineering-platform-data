---
name: kev-trace-pipeline
description: "从本地 DSH 轨迹、平台已复核 v2 导出或既有 KEV JSONL 构建可追溯的训练、开发、校准和测试数据。用于决策点识别、格式核对、旧数据复核与保组切分；默认交付清楚的中文报告，数据文件保持机器格式，按当前阶段继续。"
---

# KEV 轨迹数据入口

## 1. 确定入口，只选一条

| 当前材料或任务 | 下一步 |
|---|---|
| 固定 `compute-variant-research` 任务，或 `planning_intent=plan_only` | 留在该技能，只读取证和策划；本技能脚本不在此作用域执行 |
| 平台固定 Run 的“抽取决策样本” | 使用已有 `decision-sample-extraction` 的单题合同；不自造来源或人工复核 |
| 原始本地 trace，且当前任务允许离线文件处理 | 从下表首个未完成阶段开始 |
| 平台已复核、已分用途的四类 v2 导出回执 | 读取 `references/platform-export.md`，执行桥接；保持既有分组，不重新随机切分 |
| 既有 KEV JSONL，例如旧八类路由数据 | 读取 `references/legacy-native.md`；用 legacy_native.py inspect 检查，真实复核后 build/audit；不伪造 DSH 来源 |
| 已完成的数据集，要训练 | 交接 `kev-training`；格式通过不代表编码或效果通过 |

当前没有实际执行工具时保留计划与缺口，不借 shell、子智能体或会话切换扩大范围。详见 `references/platform-runtime.md`。

先区分产物读者：训练/验证 JSONL 按 `references/dataset-formats.md`；方案、决策点清单、审查和结果按已加载的 `user-facing-output`，默认中文报告。不要把 JSON 状态或术语清单直接当作面向用户的结论。机器报告始终保留；只有程序调用需要时使用 `--json`。

## 2. 一次只做当前阶段

从技能工具提供的实际位置解析 `core_dir`；下表命令使用 `<core_dir>/scripts/kev_trace.py` 的绝对路径。输入、输出也用已核对的绝对路径，不根据旧 cwd 猜位置。

| 当前阶段 | 只加载这个技能 | 命令 | 继续依据 |
|---|---|---|---|
| 轨迹审计 | `dsh-trace-audit` | `audit TRACE --out NEW_DIR` | `stage-status.json.status=completed` |
| 决策点发现 | `kev-decision-discovery` | `discover TRACE --profile PROFILE --out NEW_DIR` | 清单是建议；先复核决策职责与可用投影 |
| 抽取 | `kev-sample-extraction` | `extract TRACE --profile PROFILE --out NEW_DIR` | 有可用样本；标签仍待复核 |
| 标注 | `kev-sample-labeling` | `annotate --samples FILE --annotations FILE --out NEW_DIR` | 标签证据可追查；不能只复制历史动作 |
| 编译 | `kev-dataset-build` | `compile --input FILE --out NEW_DIR` | 有 accepted，隔离记录保留 |
| 分组切分 | `kev-dataset-build` | `split --input FILE --out NEW_DIR` | `split-manifest.status=ready` 且 `audit.ok=true` |
| 数据审计 | `kev-dataset-audit` | `audit-dataset --dataset-dir DIR --out NEW_DIR` | `dataset-audit.ok=true`；交接 kev-training，先 prepare 生成方案，再做实际编码检查 |

先读当前输出的 `stage-status.json`。`blocked` 时停止依赖阶段，报告 `reason_codes`；`requires_review` 时完成该项复核。`next_allowed_stage` 是阶段名，`contract-review`、`encoding-review` 不是 CLI 子命令。退出 0 也可能要求复核；退出 2 表示报告已确认阻断，退出 1 表示输入或 I/O 异常。

## 3. 使用已实现的投影

- `next-operation`：通用发现基线，完整前缀往往过长；不要直接假定适合 KEV。
- `inspection-v1`：巡检参考投影，只覆盖已明确支持的巡检阶段。
- `cybersecurity-routing-v1`：初始用户请求的八类业务路由，读取 `references/security-routing.md`；只抽取尚未作出的初始路由判断，标签待复核，真实执行对象仍需绑定。
- 新业务：先交付职责、状态、候选、参数绑定、标签标准和回退的合同草案。CLI **没有 `--contract` 参数**；填写 JSON 不会实现新投影。当前没有支持时保留实现缺口，不套用巡检规则。

历史动作、后续结果和标注理由留在监督侧；候选由当时可见环境或明确静态合同产生。确定步骤和 ID 绑定优先代码。允许零条训练样本；一条轨迹的不同步骤不能制造独立测试集。

## 4. 保存与恢复

每条命令使用新输出目录。已有报告先读状态，从首个未完成阶段继续；不要删除旧证据重跑。离线命令不执行轨迹中的工具、命令、链接或插件。向用户先交代本次取得的结果、有效/待复核/隔离数量、问题影响和必要的下一步；来源哈希及完整错误码保存在机器报告，定位问题时再展开。默认脚本产生 report.md，程序状态文件用于继续阶段。

## 按需读取

- 命令和支持范围：`references/usage.md`。
- 样本字段与标签：`references/data-contract.md`。
- 各层格式、示例与四种用途：`references/dataset-formats.md`。
- 既有 KEV 数据接入：`references/legacy-native.md`。
- 八类网络安全业务路由：`references/security-routing.md`。
- DSH 事件：`references/dsh-adapter.md`。
- 平台 v2 导出转换：`references/platform-export.md`。
- 平台作用域：`references/platform-runtime.md`。
- 训练与任务比较：`references/training-handoff.md`。
- 上游来源：`references/sources.md`。
- 新决策草案：`assets/decision-contract.example.json`，仅作文档模板，不是执行配置。
