# 决策合同与覆盖

使用 core assets/decision-contract.example.json。至少明确 runtime_trigger、state_builder、candidate_builder、parameter_binding、target_rule、fallback、implementation 与 expected_savings。

巡检参考：加载技能是语义路由；加载后先查目录是流程规则；唯一 matchPhrases 可代码匹配；模糊匹配才可能需要决策模型；taskId/version/runId/requestId 的取值和复用由代码管理；PARTIAL、缺报告、链接为空等要与开放文本生成分开。

补充场景：只询问目录、空目录、唯一精确匹配、模糊匹配、多匹配、缺必填参数、工具缺失、版本冲突、提交超时、同请求重试、持续 RUNNING、跨轮续查、终态无链接、PARTIAL、业务异常但执行正常、错误/拒绝、回执矛盾。把真实观测、合成反事实和未覆盖分别列出。单个来源中的多个校验标签不等于多个独立任务。


业务智能体路由（如八类 agent_route）、Skill 选择、工具选择和模板选择使用不同 decision_site_id 与动作命名空间。复用旧路由数据时明确映射和职责版本，不能把“安全巡检”直接当作任意工具或模板的标签。
