# reviewing-agent-skills v1.2.0

面向已有 Agent Skills 及技能集合，严格审查官方格式、正文质量、任务覆盖、主/子智能体分工与调用流程。给出有证据的保留、合并、拆分、委派或下沉建议；默认只审查，用户授权后修改指定目标。

## 审查范围

- 逐项核对官方格式：目录入口、YAML、必需/可选字段、命名及引用。
- 区分官方规范、官方参考实现策略、运行时扩展与本地质量要求；固定来源和版本。
- 按任务类型核对正文信息是否充分，再检查标题、列表、术语、表格、代码、示例与链接；不强制官方未规定的统一章节模板。
- 每个 Skill 留覆盖记录；没有证据、缺依赖或未执行的检查不能记为通过。
- 继续检查触发边界、职责冲突、平台 v2 分组 MCP 的公开命名合同与实际编排收益。
- 按用户目标、相邻任务和必需依赖选择审查对象，区分单 Skill、技能集合和执行架构，不把参考目录递归当作独立入口。
- 核对哪些任务留在主智能体、哪些值得委派，以及执行者实际能发现和加载哪些 Skill、工具；Skill 与子智能体可以组合，不是一一替换关系。
- 分开统计仓库资产、作用域可见入口、实际加载和子智能体预加载。根据覆盖、路由和成本判断规模，没有通用最佳数量。
- 区分静态引用、声明控制流与实际 Trace，检查交接、状态责任、失败恢复和停止；分别判断拆参考、拆 Skill、合并或下沉，不靠行数和调用数裁决。

规则见 [SKILL.md](SKILL.md)、[格式与内容检查表](references/format-and-structure.md)、[架构专项](references/architecture-review.md)、[审查量表](references/review-rubric.md) 和 [来源](references/sources.md)。报告使用 [模板](assets/review-report-template.md)。

## 使用

保留完整文件夹，放入目标运行时支持的 Skill 目录；本平台目录为 `.agents/skills/reviewing-agent-skills/`。装载遵循实际运行时发现规则。

示例请求：

> 请严格审查这个 Skill 的官方格式、正文内容完整性和工整性。逐项给出依据、定位、检查状态和最小整改；区分 DSH 扩展与通用规范，不把模板标题当官方必填章节。

集合或架构审查示例：

> 审查这组管理技能：哪些应保留、合并或拆分，哪些独立任务适合交给配有既有 Skill 的子智能体？核对实际入口、工具范围和流程交接，用代表任务说明数量与成本是否合理；没有轨迹的部分明确标注未验证。

## 离线静态检查

人工审查只需读取文件。可选检查器需要 Python 3.9+ 和 **StrictYAML 1.7.3**，与官方参考采用相同的成熟 YAML 解析库，不再用正则提取标量冒充 YAML 验证。依赖列在 [requirements.txt](scripts/requirements.txt)，由执行环境预先提供；有环境准备授权时可按该文件安装。检查器不联网、不自动安装依赖、不执行目标脚本。

```bash
python3 reviewing-agent-skills/scripts/inspect_skill.py /path/to/target-skill --format json --fail-on-error
python3 reviewing-agent-skills/scripts/inspect_skill.py /path/to/target-skill --profile dsh --format json --fail-on-error
python3 -m unittest discover -s reviewing-agent-skills/tests -v
```

- 默认 `agent-skills` 检查通用目录包。`dsh` 额外核对固定 `0.2.1-rc.2` 的已知字段与名称合同，列出扩展和可移植性差异；不证明实际原生加载。
- 输出保留 `findings`，并增加 `basis`、`source_url`、`coverage`、`runtime_extensions` 与 `overall_status`。
- 总状态为 `FAIL`、`BLOCKED` 或 `REVIEW_REQUIRED`；静态检查不会自行宣布全部审查通过。`--fail-on-error` 在错误或阻塞时非零退出，零退出仍需完成内容/工整性与目标验证。
- `coverage.metadata` 通过只说明本检查器已实现的元数据检查通过；资源正则、Markdown 简化扫描及有限深读有边界，未覆盖部分须人工核对。
- 检查器不分析集合数量、任务路由、主/子智能体分工或调用控制流；这些由审查者按架构专项取证，不用静态零命中代替。
- 工整性、MCP 名称或危险命令的 `REVIEW` 是线索，要结合上下文判断；工具动作如 `assets/read-fixed` 不等于包内文件。
- 缺依赖或解析器不支持当前表示时显式报告，不回退到正则后声称已验证。StrictYAML 的表示限制与 DSH 原生解析结果分开记录。
- DSH profile 额外检查精确分隔符和 BOM 合同；涉及必需字符串、`whenToUse` 或数字调用开关的原生隐式类型时保守报告受阻，等待匹配解析器核验，不用 StrictYAML 字符串结果断言原生支持或失败。

## 官方参考与验证边界

优先使用环境中已有的官方 `skills-ref validate /path/to/target-skill` 交叉验证；版本、运行要求与局限见 [固定来源](references/sources.md)。本地脚本没有内置或自动运行该命令，输出的 `official_validator=NOT_RUN` 必须按真实情况保留，再由报告记录实际独立执行的结果。

官方参考当前不完整检查可选字段或正文内容，DSH 合法扩展也可能被其拒绝；两种工具的结果不能互相冒充。合法而未被参考解析器支持的 YAML 表示应交给目标解析器，不仅凭参考错误判定 DSH 必然失败。

[检查器测试](tests/test_inspect_skill.py) 验证工具本身；[触发样例](tests/trigger-cases.json) 和 [架构行为案例](tests/architecture-cases.json) 是任务输入及预期检查点，不是会自动启动目标运行时的测试框架。它们不代替每个目标的格式、正文、原生装载与业务验收。评估方法见 [evaluation-guide.md](references/evaluation-guide.md)。

本包是独立实现的审查规则与补充检查器，复用 StrictYAML 依赖并参考官方规范/参考实现行为；未复制官方验证器源码。官方格式没有规定统一正文章节、强制脚本目录或一律删除 README。
