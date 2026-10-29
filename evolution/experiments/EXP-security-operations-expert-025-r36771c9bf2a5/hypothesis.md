# EXP-security-operations-expert-025-r36771c9bf2a5

固定父版与继承来源见 [change.yaml](change.yaml)。

研究问题：本轮仅验证主路由 functional E2E：使用固定父版原两 Case（U-INS-002、U-QA-001）与真实诊断 Run-f62533d0 验证生成、实际装载、独立两侧 Run 与比较。语言理解及必要文本由 Qwen3.5-2B 承担，类型化决策由 KEV 0.8B 经原生 typed_decision 产生，主路由由 LangGraph 编排；四 semantic 源码保持冻结。其他 12 个站点未覆盖。沿用公开默认 10% 资源降幅仅作待检验比较条件，绝不预称达成；失败或不可比较如实记 inconclusive 或 failed，不提交 end/human_confirmed。正式 final test 仅 2/4=0.5（T=0.25），不证明业务等效。
