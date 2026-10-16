# 五源研判输出合同研究

固定父版见 [change.yaml](change.yaml)。直接完整继承 EXP-security-operations-expert-021-rdd331f9f2e30；该父版已融合无后缀 EXP020 的语音延迟能力和有后缀 EXP020 的原生 MCP 组桥接，继续保留其 Preset、Guard、巡检、故障取证、策略应急、资源模板与受信 Schedule 能力。本研究不修改工具权限、实例设置或现有运行来源，不把当前基础 Mock 接入解释成修改业务角色的理由。

创建前核对本地 refs、唯一工作树和远端 heads。当前 data main 固定于 12b6f552d4c15a475d9443c7029276810aafdbf4；旧并行来源的保留和替代遵循父版已记录的融合关系，探索性低算力版本没有等效证据，不用于覆盖主线。平台组合当前独立固定于 6e80f2c92b7983cbe8fc7957685d36338080b134 中无后缀 EXP020；其 model_inference.py、forced_output_contract.py、系统提示词与本次父版逐字节相同。父版另有取证连接、运行级 MCP 和取消收尾差异，这些均原样继承。

真实发现：原平台固定算法在基本模拟事件的完整研判中返回 JSON，但旧运行把事件/规则声明作为事实，新运行在可读事实中使用裸 E1；均被原机械校验拒绝。阶段 completed 和摘要/报告 saved 不代表输出校验通过。

研究假设：只将已有可读实体和证据规则改写为生成前的具体映射步骤与输出前自检，能够使相同五源输入、相同 DeepSeek Flash/max 的真实调用通过原校验器；不得删除校验项、改写原始输入或用固定结论代替模型结果。

Candidate 的业务变化仅为 managed/threat-analysis/prompts/threat-analysis-system.txt；harness.yaml 只登记新身份。若首轮仍失败，根据原始响应和具体校验反馈修订同一活动 Candidate 并重新执行受影响比较，保留每次观察。

最小 Evaluation：以 Agent evaluation.md 的 U-THREAT-CONTRACT 核对基本模拟完整研判的冻结输入、模型原始响应和全部原校验；先对同一失败冻结输入做对照，再以独立现有 Mock 源码进程完成新取证→研判→回写→报告及 HTTP 下载。复用 U-THREAT-FAST 的路由要求核对快判不调用模型，不将所有业务能力都宣称已回归。至少重复一个真实完整模型样例，避免仅一次偶然合格。

实际源码只从本 Candidate 装载；隔离平台的测试装载位置、摘要和原生模型设置随 Run 保存。现有 3090、3081、3084 的配置和来源保持不变。仅在证据足够时建议 adopt，固定新 Git 提交后再评估平台组合引用升级；本研究不创建 Research Release。
