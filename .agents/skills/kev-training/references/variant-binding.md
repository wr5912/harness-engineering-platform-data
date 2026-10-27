# 训练工件接入 Harness 变体

1. 记录训练输出：固定 KEV 代码、base 与 checkpoint 来源、数据/输入构造版本、温度、阈值、权重及 tokenizer 摘要、真实执行日志。只有实际存在的工件才登记。
2. 在用户明确选择的执行环境部署推理服务。交给本地 kev-deploy 入口，按需读取其完整官方参考；Modal 示例不是 SSH 服务器通用部署命令，部署、远端上传、付费资源和清理各按当前授权办理。
3. 核对真实返回合同：state/questions、choice/noul/score、概率键、延迟、超限和失败。服务端合法候选校验、参数绑定、确定性规则及低置信回退保留在代码中。离线与在线复用相同状态/候选构造器。
4. 从平台当前能力目录取得实际已注册工具或插件 schema，再由 LangGraph context.callTool 使用；不要猜 KEV 工具名或用任意 HTTP 绕过运行库。当前 generation_contract 只有 LangGraph AOT、工具与文本 infer，没有专门 KEV checkpoint/概率路由绑定字段；需要真实服务适配后才能声称已接入。
5. 从完整固定父版派生独立 Candidate。按 compute-variant-research 完成 generated、built、frozen、loaded、compared；只编译成功不证明新 Run 装载了它。
6. 比较父版、代码基线和 KEV 变体的新 Run。计入特征整理、推理、回退、重试和恢复成本；两侧都失败不能证明等效。满足计划后由用户页面复核 end，训练脚本不代填人员确认。

需要程序补齐的能力：训练作业 start/status/cancel/collect 与可恢复作业身份、阶段和权限合同、实际模型服务/工具注册与工件绑定。这是程序仓库工作，不通过数据 Skill 修改权限或伪造 API 实现。
