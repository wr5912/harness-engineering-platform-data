# Evaluation Observations

固定父版为 EXP024@1f162，变体为 VAR002@b49b83，来源Run为 `run-e6ffe4c8-932b-4b6a-b9fb-1f802f536408`。Qwen3.5-2B语言理解、KEV主路由训练部署与模型身份见[训练研究记录](compute-training/report.md)。本轮仅训练main_route，其余12个决策点未训练；冻结测试为1/4，不支持主路由泛化或业务等效。

## 固定14Case

程序35ac5e6、MiMo Flash/off、同一Mock映射 `1005aaf302af4a729c29dde6f8ecf7cee491c160f9b12875ebb09fcea5c4eefd`：

| 对象 | passed | failed | inconclusive | 原始Run |
|---|---:|---:|---:|---|
| 父版 | 6 | 2 | 6 | run-29c51dee-fadf-47e2-a4c3-d0fc6747a04e |
| 变体 | 6 | 4 | 4 | run-3c1aebe1-ad0d-4869-80e6-9a52213e4421 |

应急和策略404来自Mock目录缺少冻结Case目标，不能解释为小模型退化；固定应急交付还丢失了原始原因。变体U-INS-004缺少巡检项及范围确认，U-SCHED-007未满足要求；后者需要统一网关受控实例，本次隔离评测不证明真实到期投递。U-FLT-001原快照早于子任务及根会话后续回执，不能据该快照比较质量和资源；其余13Case未发现同类未结束请求证据。

旧observed记录57（target43/judge14）与85（target71/judge14）包含固定本地交付步骤，不是实际模型调用次数或下界。真实总调用与Token未知，不能推断收益。[原机器比较回执](compute-comparison-a2bf60f303b49453c19910806b7c0468894874fc46d8efec39872c96baf752cd.json)为eligible_for_end=false。当前方案将外层交回MiMo，也不满足现有hybrid外层本地派发合同，不降低合同接受本方案。

## 追加证据

任务树补采使用d31f053、原固定来源及相同Mock：[父版Run](../../EXP-security-operations-expert-024-rad80a907c628/runs/run-71851ee6-512c-420a-9b33-ede51556e3b2/) 与[变体Run](../runs/run-8a1aa32c-7177-4fb1-bea2-ec975478df08/) 均取得完整子任务终态和根第二回合。父版因两个172.16.*目标不在仅含3台192.0.2.*资产的Mock中而保持inconclusive；变体冻结包未支持原生subagent-settled接续，最终failed。后续共用运行时修复不覆盖该冻结包或旧Run。原补采observed 9+1与11+1也不作为完整实际调用证明。

C1单QA的[变体Run](../runs/run-50416fc7-d53d-4877-ac45-7b88b9098c27/)真实执行Qwen、KEV及MiMo，业务判定failed、review:none。原162b144计量漏掉了登记为本地代理的真实Qwen调用；保留原记录，当前计量器只读核同一轨迹为4次（target3/judge1，language1/decision1），不是原记录回填。KEV的470/119分别是编码输入长度和答案JSON的billing-style Token数，后者不是生成Token；上游没有总量或缓存拆分，保持Token未知，不补总量或cache零。

C4历史父版[单QA Run](../../EXP-security-operations-expert-024-rad80a907c628/runs/run-403db09b-c724-4514-96f0-c95a59f1fdd1/)使用dd5f4b5、同1f162/Case/Mock/MiMo：业务效果passed，来源matched；源码真实超时，保留实际Session及12/186个阅读分包，结论incomplete。这是独立评估链验证，尚无同C4方法的变体Run，不能与C1的review:none记录拼接成新比较。

追加变体对照时GPU连接拒绝，新VAR Run未执行；既往训练部署证据不代表当前服务在线。需恢复指定Qwen/KEV链路后才能进行同来源、同Case、同评审方法对照，不能用仅MiMo退化运行替代。当前覆盖及证据均不足以采纳，不声明成本收益或end。
