# 可复现训练交接

## 文件与版本

本套原生训练依据 Kev `2074cc44256200bb37540103fa4572901faa10f3`。执行环境需要该完整 Git checkout、其依赖、可用 CUDA/bf16 GPU、固定的基座与 Kev checkpoint。训练计划只生成命令，不安装依赖、下载权重、连接服务器或启动作业。

`training_config.json` 从所选固定 Kev checkpoint 获取。脚本读取 base、base_revision、LoRA/head 参数，核对文件摘要；它不能离线认证文件发布者。来源获取回执应一起保存。base 与 init_from 是不同身份；init_from 必须是 `owner/repo@40位提交`，不要用模型路由字符串代替。完整权重 checkpoint 不使用当前 LoRA recipe。

## 请求合同

`assets/training-request.example.json` 是字段示例，包含无效占位值。只填写本次所需真实值：

- source：固定目标、完整父版和真实 source_run_ids。legacy-native 确实没有来源 Run 时允许空数组，来源绑定在导入文件中；不能填一个虚构 Run 来通过检查。
- dataset：目录与 kind（平台桥接产物 platform-v2，离线 IR 产物 trace-ir，既有数据已复核导入产物 legacy-native）。四份非空文件与 split-manifest.json 必须真实存在。
- checkpoint：init_from、同一固定来源的 training_config_path 与 sha256。
- environment：实际训练环境的 kev_root、新 run_root，以及可选 server_id/credential_ref。路径改变使旧编码报告失效。
- training：epochs/lr/batch/accum/seed/calibration_folds，以及 calibration_policy。默认超参只是初次 LoRA recipe；GPU、显存、时限、费用和效果仍需真实检查。

模型建议不能自行补人员复核。trace-ir 的 verified 只表示其记录的复核/规则依据，不成为平台人工确认。当前准备器采用全部已复核标签的基线，不允许弱标签混入该 recipe。

legacy-native 的准备器重新读取 source.jsonl 和 reviews.jsonl，重放复核、闭包分组与四用途构建，再核对实际派生文件；不只相信先前 report.ok。原文件身份、标签来源、复核方式和来源组保留，不转换成 DSH 来源。缺少可靠独立标签或真实业务测试时，只能说明格式与复核记录符合当前要求。

编码检查前后及生成可执行命令前，还会核对原始文件、复核快照与分区清单的摘要。复核结果发生变化时，必须重新构建数据并准备方案；已有编码报告不能继续放行旧方案。输入重复检查同时比较原始结构与固定 KEV 实际渲染的内容，避免不同 JSON 写法掩盖重复样本。

## 执行顺序

1. `training_plan.py prepare` 核对完整官方文件哈希、分区、来源组、标签、checkpoint 元数据和参数，生成训练计划。
2. `check_encoding.py` 在同一固定 checkout 运行实际原生加载/物化/编码。默认不联网；输出 token 数、拒收和洗牌检查。只有 ready 才继续。
3. `training_plan.py commands` 重新核对计划、编码报告和数据摘要，仅返回训练 command card，不执行。真实执行器按 argv 参数数组调用；不要把不可信输入拼成 shell。
4. 执行器保存命令、环境、开始/结束时间、真实 job_id 或进程身份、日志与退出状态。没有作业 API 时由操作者在已授权训练环境执行；管理助手不伪造平台接口。
5. 成功 checkpoint 至少核对 head.pt、LoRA 权重、adapter_config.json、training_config.json、training_metrics.json 与 tokenizer 文件；记录内容摘要。原生 trainer 不自动生成 train.log，执行器要捕获 stdout/stderr。
6. 用独立 development 和 calibration 阶段核对；最终 test 单独冻结后使用。完成训练不自动生成或装载 Harness 变体。

默认 prepare 输出中文摘要和 report.md；check_encoding 保存 JSON 结果及同名 .md 说明；commands 用中文说明仍未执行并显示准确命令。机器消费 stdout 时使用 --json。人工报告不改动命令参数，也不改写数据行。

`commands.*.env` 是本次设置，`unset_env` 是需清除的继承值。特别固定 `KEV_LORA_SCALE=1` 和 torch 后端，避免意外关闭 LoRA 后还声称在评估训练工件。最终测试不继承 KEV_TEMPERATURE 覆盖。

## 官方 Modal 路径的差别

官方训练 Skill 的 kev_modal.py 默认 KEV_REF 为 fc4a17e194bca35a48c57211392ec49ea54a94ac，可用环境变量覆盖。官方部署 kev_serve.py 把相同值写成常量，环境变量不会覆盖它。两提交当前 kev/*.py 和 pyproject.toml 一致，但实际运行身份仍分开记录。

官方 Modal train 只暴露 p_none_pair；仅把它设为 0 不能关闭另外三项候选增强。本套使用原生 kev.train 并显式把 p_none、p_none_distract、p_distract、p_none_pair 四项设为 0，不向 Modal 猜造参数。需要 Modal 配方时另行核对实际支持与用户环境选择，不把已登记 SSH 服务器静默替换成付费云。

官方 validate 会上传数据到 Modal，不是纯本地校验。官方 convert_data.py 会重建字段，split_data.py 会用自己的分组规则；已经构建好的平台或本套数据不再运行这两个转换步骤。训练器只按传入物理文件读行，_meta.split 不是自动过滤器。

## 完成与失败

读真实报告，不只读退出码。编码超限或训练过滤后统计每个决策点和类别；未经说明丢弃的记录不能从验收分母消失。作业失败保留诊断与已生成文件；状态未知先查原 job，不能重发。模型/数据/候选发生变化就使对应后续证据失效。
