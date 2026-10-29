# 训练工件接入 Harness 变体

1. 记录训练输出：固定 KEV 代码、base 与 checkpoint 来源、数据/输入构造版本、温度、阈值、权重及 tokenizer 摘要、真实执行日志。只有实际存在的工件才登记。
2. 在用户明确选择的执行环境部署推理服务。交给本地 kev-deploy 入口，按需读取其完整官方参考；Modal 示例不是 SSH 服务器通用部署命令，部署、远端上传、付费资源和清理各按当前授权办理。
3. 核对真实返回合同：state/questions、choice/noul/score、概率键、延迟、超限和失败。服务端合法候选校验、参数绑定、确定性规则及低置信回退保留在代码中。离线与在线复用相同状态/候选构造器。
4. 从当次 generation_contract 核对混合执行的 model_roles、context.decide 和决策工件摘要合同，再从平台能力目录取得实际已注册的类型化工具 schema。按合同冻结语言与决策角色及实际工件，通过运行库调用已部署的 KEV 服务；不要猜工具名或用任意 HTTP 绕过运行库。角色与摘要登记不等于推理服务可达、业务版本已装载或效果通过。
5. 从完整固定父版派生独立 Candidate。按 compute-variant-research 完成 generated、built、frozen、loaded、compared；只编译成功不证明新 Run 装载了它。
6. 比较父版、代码基线和 KEV 变体的新 Run。计入特征整理、推理、回退、重试和恢复成本；两侧都失败不能证明等效。满足计划后由用户页面复核 end，训练脚本不代填人员确认。

训练作业 start/status/cancel/collect、可恢复作业身份及 KEV 服务适配仍须按程序当前实际能力办理；已有的变体角色与工件合同不自动提供训练或推理部署服务。缺口属于程序仓库工作，不通过数据 Skill 修改权限或伪造 API 实现。
