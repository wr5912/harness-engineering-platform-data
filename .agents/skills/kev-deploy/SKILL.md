---
name: kev-deploy
description: "部署或运维已有 Kev checkpoint：获取 TypeSafe/System One API 地址、核对模型与温度、配置认证和保温、接入调用方，或停止指定服务。用于仅部署、验证或停服的独立任务；不要求先训练或准备数据，微调需求交给 kev-training。"
---

# KEV 服务部署与运维

先固定本次 checkpoint 或已有服务、用户所选环境和动作范围。固定算力 plan_only 或 Run 抽样专项继续其指定技能；没有实际执行工具时交付可用步骤和缺口，不猜平台部署接口。已有 checkpoint 可直接部署，不要求 Agent/Experiment、四分区数据或新训练；只有接入 Harness 变体时才核对相应平台目标。

## 选择当前路径

| 当前对象 | 按需读取 | 本次办理范围 |
|---|---|---|
| 公共或自定义 Hub checkpoint，选择 Modal | [官方部署 Skill](references/upstream/kev-deploy/SKILL.md) 与其 scripts/kev_serve.py | 选定模型/版本、资源和认证后部署、验证 |
| 已在官方 Modal 微调卷中的 run | [官方微调部署说明](../kev-training/references/upstream/kev-finetune/references/deploy.md) | 使用同包 kev_modal.py 的 Serve 路径，不假装它是 Hub checkpoint |
| 已有本地 checkpoint，选择本地 CUDA 服务 | 上述官方微调部署说明的 local serving 部分 | 沿用已选环境的真实服务入口，不把 Modal 示例套给 SSH 服务器 |
| 已有服务，只验证、调整保温或停服 | 对应部署路径中的验证/配置/清理部分 | 直接处理指定服务，不重新训练或默认部署另一模型 |
| 需要微调、生成训练数据或评估训练工件 | `kev-training` | 交接所需训练阶段 |

官方部署包完整保存在 `references/upstream/kev-deploy/`，其 SKILL.md 是参考而非第二个注册入口。先读本地边界，再读当前所需上游部分；不连续执行部署、接入和清理的全部示例。

## 执行与核对

1. 读取已有 checkpoint/run、服务身份和实际配置。分别记录模型 revision 与运行代码提交；公共默认模型、GPU、价格和性能表只是固定上游版本的说明，执行时核对当前可用环境与预算。
2. 从实际官方包位置解析脚本绝对路径，使用已核对的本地副本；原文 main 下载示例不替代固定来源。官方部署脚本的 KEV_REF 是常量，环境变量不会覆盖；微调 kev_modal.py 支持环境覆盖，两者不可混淆。
3. 使用既有凭据引用和当前执行环境。按上游要求配置认证；修改 app 名、模型、区域或保温会影响实际端点与费用，执行前核对目标与本次授权。脚本导入也可能创建 Modal 资源，不能将导入当作只读检查。
4. 部署后核对真实回执与 `/v1/models` 的 checkpoint、温度及环境，按上游说明处理冷启动/重定向。验证认证、真实请求和模型输出；服务可用不证明业务效果或 Harness 等效性。状态未知先查原 app/job，不重复启动。
5. 接入现有调用方时保持问题、候选与训练/评估口径一致，核对 URL、API key 引用和实际 schema。若任务是 Harness 变体，再读 [variant-binding.md](../kev-training/references/variant-binding.md)，交回 compute-variant-research 做独立两侧 Run；不把服务 URL 当作已装载或 end。
6. 停服只操作已确认的 app/endpoint。删除运行权重、Hub 仓库、共享 kev-hf-cache 或全部资源分别按本次明确范围办理，不把 `--everything` 当默认停服。读取实际结果，说明哪些资源仍保留。

交付实际服务或操作结果、核对情况和剩余问题。只生成命令、上传成功、部署成功、服务验证与业务验收分别取证，不把未执行步骤称为完成。

## 固定官方来源

完整文件、许可与原始来源说明见 [UPSTREAM.json](references/upstream/kev-deploy/UPSTREAM.json) 和 [UPSTREAM.md](references/upstream/kev-deploy/UPSTREAM.md)。包内相对布局保持不变；官方 `../../runs/...` 等包外链接按 [固定上游目录](https://github.com/jaredpalmer/kev/tree/2074cc44256200bb37540103fa4572901faa10f3/skills/kev-deploy) 解析，报告不在本地 Skill 包中。适配只维护在本入口或单独文件，不改官方原文、脚本或来源记录。
