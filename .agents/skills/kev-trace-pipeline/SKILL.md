---
name: kev-trace-pipeline
description: "从本地 DSH 轨迹、平台已复核 v2 导出或既有 KEV JSONL 构建可追溯的数据。用于发现决策点、抽取、标注、标签冲突裁决、编译、旧数据复核和保组切分；可从已有产物只做一个阶段，交付中文报告及机器格式数据。"
---

# KEV 轨迹数据入口

## 1. 确定入口，只选一条

| 当前材料或任务 | 下一步 |
|---|---|
| 算力任务按 `compute-variant-research` 判断为只读策划 | 留在该技能，只读取证和策划；不执行本技能脚本 |
| 算力任务按上述意图表判断为实施 | 沿用固定来源与已有产物，按当前材料进入下表对应阶段，不扩大原授权 |
| 平台固定 Run 的“抽取决策样本” | 使用已有 `decision-sample-extraction` 的单题合同；不自造来源或人工复核 |
| 原始本地 trace，且当前任务允许离线文件处理 | 从下表首个未完成阶段开始 |
| 平台已复核、已分用途的四类 v2 导出回执 | 读取 `references/platform-export.md`，执行桥接；保持既有分组，不重新随机切分 |
| 既有 KEV JSONL，例如旧八类路由数据 | 读取 `references/legacy-native.md`；用 legacy_native.py inspect 检查，真实复核后 build/audit；不伪造 DSH 来源 |
| 已完成的数据集，要训练 | 交接 `kev-training`；格式通过不代表编码或效果通过 |

当前没有实际执行工具时保留计划与缺口，不借 shell、子智能体或会话切换扩大范围。详见 `references/platform-runtime.md`。

先区分产物读者：训练/验证 JSONL 按 `references/dataset-formats.md`；方案、决策点清单、审查和结果按已加载的 `user-facing-output`，默认中文报告。不要把 JSON 状态或术语清单直接当作面向用户的结论。机器报告始终保留；只有程序调用需要时使用 `--json`。

## 2. 一次只做当前阶段

从平台 context 的 program_root 解析公开工具目录 `<kev_data>`；下表命令使用 `<kev_data>/kev_trace.py` 的绝对路径。输入、输出也用已核对的绝对路径，不根据旧 cwd 猜位置。已有审计、样本、标签或编译产物时直接进入相应阶段，先核对其状态和来源，不为补齐流程重跑已完成步骤。只读取当前阶段的参考。

| 当前阶段 | 按需读取或独立入口 | 命令 | 继续依据 |
|---|---|---|---|
| 轨迹审计 | `dsh-trace-audit` | `audit TRACE --out NEW_DIR` | `stage-status.json.status=completed` |
| 决策点发现 | [发现方法](references/stages/discovery.md) | `discover TRACE --profile PROFILE --out NEW_DIR` | 清单是建议；先复核决策职责与可用投影 |
| 抽取 | [抽取方法](references/stages/extraction.md) | `extract TRACE --profile PROFILE --out NEW_DIR` | 有可用样本；标签仍待复核 |
| 标注 | [标注与裁决](references/stages/labeling.md) | `annotate --samples FILE --annotations FILE --out NEW_DIR` | 标签证据可追查；不能只复制历史动作 |
| 编译 | [编译与切分](references/stages/build.md) | `compile --input FILE --out NEW_DIR` | 有 accepted，隔离记录保留 |
| 分组切分 | [编译与切分](references/stages/build.md) | `split --input FILE --out NEW_DIR` | `split-manifest.status=ready` 且 `audit.ok=true` |
| 数据审计 | `kev-dataset-audit` | `audit-dataset --dataset-dir DIR --out NEW_DIR` | `dataset-audit.ok=true`；交接 kev-training，先 prepare 生成方案，再做实际编码检查 |

先读当前输出的 `stage-status.json`。`blocked` 时停止依赖阶段，报告 `reason_codes`；`requires_review` 时完成该项复核。`next_allowed_stage` 是阶段名，`contract-review`、`encoding-review` 不是 CLI 子命令。退出 0 也可能要求复核；退出 2 表示报告已确认阻断，退出 1 表示输入或 I/O 异常。

## 3. 使用已实现的投影

决策点发现先按 `references/stages/discovery.md` 对照固定版本的目标 Skill 与执行轨迹，记录规范分支及实际覆盖；后续抽取、标注和交接沿用该合同。discover 只提供观测边界建议，不自动读取全部 Skill 或补齐未覆盖分支。

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
- DSH 事件：[DSH 轨迹审计入口](https://github.com/wr5912/harness-engineering-platform-data/blob/main/.agents/skills/dsh-trace-audit/SKILL.md)。
- 平台 v2 导出转换：`references/platform-export.md`。
- 平台作用域：`references/platform-runtime.md`。
- 训练与任务比较：`references/training-handoff.md`。
- 上游来源：`references/sources.md`。
- 新决策草案：`assets/decision-contract.example.json`，仅作文档模板，不是执行配置。

## 公开研究工具依赖

数据转换与检查复用程序根的 [kev-data 工具合同](https://github.com/wr5912/harness-engineering-platform/blob/main/runtime/research/kev-data/README.md)。通过平台 context 返回的 program_root 设置 HARNESS_PROGRAM_ROOT，`<kev_data>` 指该根下 runtime/research/kev-data；工具源码只在程序仓库维护。技能自带的方法、输入合同、模板与阶段说明保留在本包。工具缺失时停止执行并说明依赖，不读取兄弟技能私有脚本兜底。

## 数据准备与审计交接

接受真实轨迹、平台 v2 冻结回执或原生 KEV JSONL，以及当前阶段、固定目标 Skill、来源身份和授权范围。按本包资料完成该格式的必要阶段，返回 report.md、stage-status.json、四分区文件及来源/分组/复核证据；缺失标签、来源或独立性时保留阻断，不交付“已可训练”结论。需要独立审计时交给 kev-dataset-audit 的公开入口，编码与训练交给 kev-training；接收方只消费产物，不加载本包私有 references。
