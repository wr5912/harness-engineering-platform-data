# 修复、溯源与验证边界

## 问题与固定来源

原实例 threat-analysis-003 的 run-c5a9eac5-6650-4b31-9360-ded9fd8de1b8 对事件 INC-20261103-000004 调用 Qwen3.8-27B，第三条事实 F03 直接写“涉及实体 E1、E2、E3”，触发裸内部引用校验。冻结输入已有可读映射；26次取证调用无调用失败。

本修复版本从027主线 EXP-security-operations-expert-027-m-reab20c48f610 @ git:4cf265bc0ad94e29f7d9a8195c553223912dc0be 完整派生。初始平台差异核对表明，原实例分支与该固定来源仅有用途备注不同，其余302个Candidate文件一致。未采纳其他未核对的并行特性，主线未修改。

## 什么时候出现

1. 平台固定读取已确认022版本 EXP-security-operations-expert-022-r41bf6c2f0d3d @ git:c903724269be0ef249182e2fd7024325c7124629 已有同一裸E限制；不是027新增。机制第一次引入的精确提交和日期仍未知。
2. [旧运行结果](<.local/instances/threat-analysis-instance/dsh-home/threat-analysis/run-f3b097f7-c71f-4e15-8795-a3db00ec1673/result.json#L6-L16>)同时记录completed与裸E校验failed；[响应时间](<.local/instances/threat-analysis-instance/dsh-home/threat-analysis/run-f3b097f7-c71f-4e15-8795-a3db00ec1673/model/request-metadata.json#L13-L17>)为北京时间2026-10-27 03:10，提示词摘要与本次相同。旧运行摘要生成并保存，但报告远端存储失败，不能称完整报告保存通过。
3. 当前024/025/026源码仍有校验失败后回捞可解析草稿、改回completed的兜底；027当前源码已删除。[11月5日合同修复记录](</home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/exp027-threat-sync-20261105/README.md#L27-L29>)及其[提交记录](</home/cmp/work/harness-engineering-platform/platform/plugin/test/evidence/exp027-threat-sync-20261105/README.md#L46>)说明短提交5df6a48c堵上这一错误兜底。此记录对应232环境，不单独证明003装载时间；未取得该短值的完整40位提交。

## 修复与静态审查

仅对白名单正文中显式“实体/内部实体”编号列表，按本轮冻结实体表唯一映射展开。命令、路径、引号或原生ID等字面量上下文，以及非显式引用、未知、不可读或任何重复编号，直接失败。保留模型原文、证据field/value、结构化target和规则/技术/事实ID，执行同一个完整原校验；不重试模型、不改模型或温度、不恢复旧completed兜底。

初版静态复核发现正文可能误改字面量及重复编号身份检查不完整两项风险，已收紧并再次只读复核关闭。6个合成组件测试方法及多种子场景已保存回读，未执行，不报测试通过。共用业务口径新增U-NEW-011并回读，选择原事件复验和已有快速分支回归。

## 真实评测阻塞

两次eval/preview通过、缺失环境为空；两次eval/start均返回conflict：预览参数已变化，请重新预览。预留run-1e5b43c5-bc80-40fc-8e74-6525cc833dfc、run-6c1d0acc-659c-4649-9f14-24335e2eb849均回读为run_created=false，均已取消。没有新真实评测Run或业务通过证据；未绕过接口执行shell或另建评测业务实例。

## 用户确认后的原分支同步与重载

用户明确选择“同步原分支并重载原实例”后，将最终运行代码同步到 EXP-security-operations-expert-027-f-r92ea65e6316b，平台保存及回读摘要与本修复版本一致：entity_references.py为a41b7655b2600781c7777d552f6bbb3dfbec762c4ba7ab3eb88117662494612f，model_inference.py为c0b37e2debb5834e9512f95d69c8b7630715de05e9a8d87976cc47a4aadd5b48。组件测试保留在本研究Candidate，未把未执行测试当作已部署能力。原分支静态合同通过且无错误/警告；本研究版本另有active/outcome状态提示，不代表代码或业务检查通过。

只执行一次平台reload，回执operation_failed/status=unknown：未收到本次进程加载回执。随后detail确认实例新进程运行，来源、18500端口、Qwen3.8-27B、原HOME及网关入口保留；asset_status仍unknown。logs显示Web已监听，但instance-confirmation-config插件未激活，原因是实例确认专用配置未就绪。未读取凭据或擅自修改该无关配置，未自动重复重载，也未删除或新建实例。

截至本轮收尾：代码已保存并同步，原实例重载已尝试且新进程运行；实际装载未核验，原事件完整新Run及报告链路未复验。原失败Run不改写。后续需要有效加载回执及新Run证据，不能宣称业务恢复或采纳通过。
