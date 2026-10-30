# Evaluation Observations

本轮使用两个新建独立Run，各执行预先冻结的14Case；运行程序为35ac5e6182b2635a7f8b66a7d8bbd67b27a172f9。固定父版1f162，固定变体b49b83，双方MCP连接映射SHA为1005aaf302af4a729c29dde6f8ecf7cee491c160f9b12875ebb09fcea5c4eefd。

| 对象 | passed | failed | inconclusive | 原始Run |
|---|---:|---:|---:|---|
| 父版 | 6 | 2 | 6 | `run-29c51dee-fadf-47e2-a4c3-d0fc6747a04e` |
| 变体 | 6 | 4 | 4 | `run-3c1aebe1-ad0d-4869-80e6-9a52213e4421` |

应急和策略用例均因Mock目录不含冻结Case的目标而返回404，不能解释为小模型退化；应急固定交付文本还丢失了明确的资产缺失原因。变体U-INS-004缺少对巡检项和范围的确认，U-SCHED-007未满足对应验收。SCHED-007要求统一网关受控实例，而本轮运行于隔离研究实例，其结果不能证明实际网关与到期投递能力。逐Case原始输出、工具及judge结论均保留在上述Run。双方U-FLT-001的原生后代会话在评测快照之后仍继续执行，固定程序只等首个根turn/end便导出，遗漏子任务完成与根会话后续回执；该Case的质量与资源不能据当前快照比较模型优劣，需修正评测等待后以新Run补采。其余13Case未发现同类未结束请求证据。

已观测到父版57次请求（target43、judge14）、变体85次（target71、judge14）。完整调用与Token均未知，不能用下界计算资源收益；故障分析会话的未完成生命周期已在原生持久日志定位为提前采集；标题只有fallback事件而无完整请求终态证据，保持原始unknown，不补零。

[机器比较回执](compute-comparison-a2bf60f303b49453c19910806b7c0468894874fc46d8efec39872c96baf752cd.json)判定eligible_for_end=false，质量、可比性及资源证据不满足门槛。当前方案把外层会话交回MiMo，也不符合现有hybrid必须保持外层本地派发的合同；不降低合同要求来接受本方案。

真实训练、冻结测试、部署和原生图预检见[训练研究记录](compute-training/report.md)。本轮只形成受限的否定性/证据不足结论，不声明全部任务等效或成本下降。
