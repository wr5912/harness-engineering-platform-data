# 决策点发现

从已有轨迹审计和边界索引继续；只在需要生成清单时使用 `<core_dir>/scripts/kev_trace.py discover`。`core_dir` 是实际 `kev-trace-pipeline` 目录。执行与恢复边界沿用入口 Skill，不因进入本阶段而重跑已完成步骤。

1. 先描述职责，再描述调用位置：路由、选择候选、继续/停止、重试/转交、结果判定。一次模型响应可承载多项职责，但来源组仍相同。
2. 为每个 site 使用[决策合同草案](../../assets/decision-contract.example.json)，明确 runtime_trigger、state_builder、candidate_builder、parameter_binding、target_rule、fallback、implementation、拟替换调用和 expected_savings。填写模板不等于已实现投影；CLI 没有 `--contract` 参数。
3. 按当前前缀和流程状态判断是否进入该 site，不把历史选中动作作为上线触发条件。
4. 给出 implementation=model/code/hybrid。精确 matchPhrases、复制 runId/taskId/version、稳定 requestId、数字和 URL 绑定优先代码；开放报告正文不伪装成 choice。
5. 估计收益时计入状态整理、候选构造、参数生成、回退和后续重试。只在工具执行前加判定器，不能声称省掉已发生的模型选择。
6. 保留 decision-inventory.json；给用户先展示“决策职责、可见依据、建议由模型还是代码处理、仍缺什么”的中文表格或短段落。脚本 implementation 仅是建议；`requires_review` 时先复核职责和可用投影，不自动抽取或训练。

## 合同复核要点

巡检参考：加载技能是语义路由；加载后先查目录是流程规则；唯一 matchPhrases 可代码匹配；模糊匹配才可能需要决策模型。taskId/version/runId/requestId 的取值和复用由代码管理；PARTIAL、缺报告、链接为空等判断与开放文本生成分开。

按任务选择有区分力的场景：只问目录、空目录、唯一精确匹配、模糊/多匹配、缺参数、工具缺失、版本冲突、提交超时、同请求重试、持续 RUNNING、跨轮续查、终态无链接、PARTIAL、业务异常但执行正常、错误/拒绝及回执矛盾。区分真实观测、合成反事实与未覆盖；同一来源中的多个校验标签不是多个独立任务。

业务智能体路由（如八类 agent_route）、Skill 选择、工具选择和模板选择使用不同 decision_site_id 与动作命名空间。复用旧路由数据时明确映射和职责版本，不能把“安全巡检”直接当作任意工具或模板的标签。
