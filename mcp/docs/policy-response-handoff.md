# 策略与应急迁移：平台更新前交接

> 本文是历史交接快照，不是当前实施指令。八个未发布草稿及其专用测试已删除，原始夹具报告保留；下文的恢复／发布次序和路径不再适用。当前方案见[交互设计](policy-response-interaction-design.md)。

本轮已停止业务资产写入，两名续修子助手已暂停、无剩余后台任务。仅完成文档收尾后等待研发更新；**未发布本次组合、未绑定虚构子版本、未进行真实 SOC 写入或修改任何 Experiment**。

## 已保存与只读声明

八包均已通过 `platform_mcp saveCompositionDraft` 保存成功；原六项巡检未修改。各包的唯一源定义仍为本包 `composition.json`。

| 包 | 成功保存回执 ID |
| --- | --- |
| `soc-target-resolution` | `6066dfcf-46e5-46af-9062-f727f7b4c795` |
| `policy-dispatch-draft` | `96810bcd-971a-4675-8b26-e515c4880b13` |
| `soc-workflow-approval` | `7e86efd8-7f3d-4b0b-98f2-579785670e3c` |
| `policy-response-observe` | `16073143-46ab-4eab-9506-2c08cbd3d69a` |
| `policy-single` | `a93e0bd0-d3df-409c-9d43-0f479e0a5162` |
| `policy-department` | `0e2fcbea-e34d-4c8e-bba8-a8f371dcd932` |
| `emergency-single` | `94a53fc0-d947-485d-8619-860f3aad4695` |
| `disposition-preview` | `54de3fc9-0008-4a5b-a4ce-f5ee06b29185` |

旧运行平台保存时丢弃 `readonly`，不能靠循环保存解决。已按用户授权在八份唯一源定义补回并实际校验：五个含宿主状态或 SOC 写入的入口为 false；解析、观测、纯预览三个为 true。**新平台保存回读及对外 readOnlyHint 待复验**，目前不宣称已经装载生效。

历史八包的公开衔接记录见[共享交接快照](../.local/policy-response-shared-handoff-20261106/README.md)，不作为当前能力入口。

## 最新业务证据

以下均为真实官方 LFX 图执行，SOC 边界为隔离 mock；不是线上 SOC 或设备效果验收。旧失败报告和测试路径迁移中断的报告保留，不改写成通过。

| 范围 | 最新结果 | 证据 |
| --- | --- | --- |
| 单点、审批 | 30/30、4/4 | [稳定源复验](../.local/policy-response-fixtures/suite-ze5n77/report.json) |
| 应急跨 Run 生命周期 | 5/5；修订/取消、一次提交、UNKNOWN 原号、审批、目录变化及纯查询 | [研发最终日志](</tmp/hep-lifecycle-final.tap>) |
| 部门 | 14/14；该合并报告的单点旧失败已由上方新报告取代 | [部门图证据](../.local/policy-response-fixtures/suite-fhd1Az/report.json) |
| 解析、只读观测 | 当前公共 core 上 30/30、18/18 | [共享受影响复验](../.local/policy-response-fixtures/suite-mg8ehF/report.json) |
| 共用草稿 | 55/55，与当前 core 一致 | [草稿图证据](../.local/policy-response-fixtures/suite-wabLsi/report.json) |
| 纯预览 | 5/5 | [应急及预览证据](../.local/policy-response-fixtures/suite-pHNhxX/report.json) |

上表记录历史复验，不代表当前业务验收。历史测试入口 `mcp/tests/test-policy-response-lfx.ts` 及其专用支持文件已随八包删除；历史报告中的旧路径不改写。

本轮修复使用独立终态叶与必要的局部列表汇合，不补丁官方 scheduler；TS 结果函数复用、不复制业务出口。方法统一见[开发方法](../../.agents/skills/mcp-composition/references/development.md#已验证的经验与陷阱)，Skill 仅引用该方法。各包 README 不维护易过期的发布/装载状态。

## 冻结辨别与剩余边界

以下是本轮源码字节 SHA256，**不是发布 versionId**：

| 文件 | SHA256 |
| --- | --- |
| `policy-single/flow.json`（历史已删除） | `3c9c9d3b611c1314679285d381fda881362a2ce04bec1c5d3c013acce5b4ca5d` |
| `emergency-single/flow.json`（历史已删除） | `318ace35d5fbda18f8a326411d4b47600e78887add90ff7d88eca33eb88c9188` |
| `soc-workflow-approval/flow.json`（历史已删除） | `f7ea1a335c65eed25e1dbe571c8d12217a0c0c9be6cbefe37405727599d79a2b` |

- 八份草稿保存不等于装载或发布。本轮实际平台 dry 返回“工作流尚未装载：disposition-preview”；未用实际执行/发布绕过该失败。
- `ai-soc-framework` 已登记，真实发现因访问凭据未配被阻止；[只读验收记录](../.local/policy-response-live-readonly-20261106/README.md)中两个安全 GET 成功，不代表真实审批验收。
- 父包尚未接入真实固定发布的公共子版本；当前内联路径不是固定子复用交付，不把图回归通过冒充整体迁移完成。
- 真实写测试 IP、允许动作与恢复办法尚未提供，不使用旧目标。使用方 Harness 验收由独立会话负责，限定 `EXP-security-operations-expert-027-f-r5efdc136f237`，本会话不修改其他 EXP027。

## 上一轮恢复次序（当前暂停）

用户通知平台更新完成并继续后：

1. 恢复会话目标，重新读取平台当前能力、目录与 revision，核对八包实际装载；对五 false/三 true 做新版保存回读及工具注解核验，不复用旧 revision。
2. 经平台 dry、发布并回读解析、草稿、审批、观测公共组合的真实固定 versionId；凭据或静态检查失败则保留具体回执，不以执行排障。
3. 按公开 Schema 在需要复用的父流程接真实固定 `HepChild`，移除对应重复内联路径；冻结完整 TS 依赖和递归子包，不从当前 child 草稿回退加载。
4. 对固定嵌套包复跑受影响图、跨 Run 生命周期及纯查询零写；再按子先父后发布、回读，并交指定版本验收会话完成端到端使用验证。
5. 真正设备写入仅在用户另给新目标与允许动作后办理；保存、dry、装载、发布、使用方通过和设备效果始终分层判断。

以上保留历史交接依据。当前仅讨论和编写方案，不按上述次序恢复实施或发布；后续以用户对新方案的确认及实际任务范围为准。
