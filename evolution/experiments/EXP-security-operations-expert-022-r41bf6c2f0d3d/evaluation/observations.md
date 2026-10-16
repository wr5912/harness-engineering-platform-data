# 五源研判输出合同观察

最终提示修订在两次真实新运行中通过原校验器；结论和范围见 [Decision](../decision.md)。完整父版来源、研究假设及保留能力见 [hypothesis.md](../hypothesis.md)。

| 观察 | 实际结果 | 证据 |
| --- | --- | --- |
| 原固定算法 | 裸 E1 出现在可读事实中，validation failed；四阶段和存储完成不能替代输出合格 | [原始观察](baseline-evidence/execution.json) |
| 初次平台适配 | 新父版 MCP 客户端与旧协调器不兼容，认领前 AttributeError，未调用模型 | [run-8f2f2faf](../runs/run-8f2f2faf-1e01-4e0e-aae4-11f9e2ea36b8/run.yaml) |
| v1：实体映射和证据自检 | 消除裸内部编号；误报却含 observed_path，原校验失败 | [run-13b7c15c](../runs/run-13b7c15c-f4ff-4142-8b8e-c24831696e94/run.yaml) |
| v2：原有分支规则明确化 | passed_with_warnings；count 数值 1 被写成字符串，保留原警告 | [run-d2de7f5f](../runs/run-d2de7f5f-a404-47c1-ae5d-267b6b31b534/run.yaml) |
| v3：原 JSON 值与类型 | graph 实际观察中的“事件类型”措辞被旧词法标记拒绝；保留 failed，不称为模型虚构事实 | [run-39131950](../runs/run-39131950-61f4-4859-8309-ca164c4b96f3/run.yaml) |
| v4：事实与分类标签分开表达 | 真实四阶段完成，validation passed、warnings=[]，摘要/报告 saved、下载 200 | [run-0319d79f](../runs/run-0319d79f-aa9b-40c4-aeff-ec8934cd8ba2/run.yaml) |
| v4 不变：完整组合重复 | 父组合实际执行四个子阶段，再次真实调用模型；passed、warnings=[]，保存与下载通过 | [run-bba792ca](../runs/run-bba792ca-42b7-4ee8-9935-b7b5deb09d06/run.yaml) |

最终两次完整研判均使用 deepseek-official/deepseek-flash/max；模型调用真实发生，路由冻结于各 Run 的 context.json。每次使用新启动的现有 Mock 服务进程，事件、资产、告警均为基础模拟数据。快判事件在两次最终运行中均走固定名单规则，不调用模型；完整事件执行取证、研判、模拟回写、报告交付。同一运行身份贯穿各阶段，未把重放算成新的模型样例。界面实际回读显示 passed 且无人工复核警告，见 [UI 回读](candidate-v4-ui-validation.json) 和 [截图](candidate-v4-validation-passed.png)。此前失败运行实际显示需要人工复核。

## 比较与限制

初始假设计划使用同一失败冻结输入对照，实际没有执行字节完全一致的冻结输入重放。各轮均由独立 Mock 进程重新取证。[输入比较](input-comparison.json) 保存每轮原文件 SHA-256、采集耗时和差异路径；所有五个模型试次相对原固定算法输入的差异只有 `/enrichment_latency_ms`。名单查询时间和运行 ID 也随实际新运行变化，不伪装为同一个 Run。固定父算法与新父版 MCP 网关存在实现差异，因此这里只证明这些基本模拟链路在最终 Candidate 的可用效果，不声称严格单变量 A/B 或跨类型泛化。

旧 validator 对分类标签存在词法误拒。v4 让 verified_facts 描述实体、活动、结果、时间、计数，分类标签仍可留在带真实 field/value 的 key_claims evidence 中，不删除原始观察，也不允许标签单独承担行为论据。独立同行逐字节核对 validator 与固定父版相同，并审查各轮提示没有放宽判断标准。提示改善不能反向证明 validator 已具备通用语义区分能力。

来源继承检查见 [inheritance.txt](inheritance.txt)：父 Candidate 214 文件，0 缺失、0 新增，只有系统提示词和版本身份变化。Decision 前重新核对远端 main 仍为 12b6f552d4c15a475d9443c7029276810aafdbf4，没有新增待融合来源。完整业务实例的委派、语音、策略应急及默认 off 模型未重新评估；3081/3084 来源与配置保持原样。

## 装载证据边界

本轮隔离平台直接装载按轮冻结的 Candidate snapshot，以 worktree 标识和摘要记录，没有宣称固定提交已生效。临时平台协调器仅适配完整父版已有的 RuntimeMcpGateway，不复制修改业务算法。正式接入须先固定完整新 Git 提交，再恢复 Git 只读缓存装载并执行扩展回归。

一次临时缓存测试改写了 v3 snapshot 的 dsh_runner.py；已逐字节恢复，最终摘要与 Run 冻结摘要一致。实际模型在改写前已加载模块，随后四阶段完成；该临时测试的 34/40 不能作为完整回归通过证据。v4 两次最终模型运行未并行执行该类缓存测试。研究 Candidate 和旧历史来源均未被该测试改写。
