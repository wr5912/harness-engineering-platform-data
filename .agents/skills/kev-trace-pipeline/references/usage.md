# 使用与扩展

## 目录

1. 七个阶段与共享实现
2. 本地命令
3. 当前支持边界
4. 添加新领域
5. 示例轨迹的正确用法

## 七个阶段与共享实现

将七个同级技能一起保留。kev-trace-pipeline 是总入口及唯一脚本所有者；其余技能只描述阶段职责和引用，避免复制解析器、分割器和格式规则。Python 标准库即可运行数据工具；模型训练与 tokenizer 检查在明确选择的 Kev 环境执行。

入口提示：使用 $kev-trace-pipeline 审计这批 DSH trace，识别 model/code/hybrid 决策点。只从当时可见信息抽取样本，保留未定标签；有足够独立来源后再编译和切分，交付缺口和训练交接报告。

## 本地命令

下列相对路径仅用于展示各阶段关系；执行时从实际 Skill 位置解析脚本绝对路径，输入输出也用绝对路径。一次只执行当前一条，读取 stage-status.json 后再决定下一条，不把整段作为连续批处理。每个输出目录用新名字。

```bash
python3 scripts/kev_trace.py audit trace.jsonl --out work/01-audit
python3 scripts/kev_trace.py discover trace.jsonl --profile inspection-v1 --out work/02-discovery
python3 scripts/kev_trace.py extract trace.jsonl --profile inspection-v1 --out work/03-extract
python3 scripts/kev_trace.py annotate --samples work/03-extract/samples.jsonl --annotations reviewed-labels.jsonl --out work/04-labels
python3 scripts/kev_trace.py compile --input work/04-labels/samples.labeled.jsonl --out work/05-compile
python3 scripts/kev_trace.py split --input work/05-compile/compiled.jsonl --out work/06-split
python3 scripts/kev_trace.py audit-dataset --dataset-dir work/06-split --out work/07-audit
```

annotations.todo.jsonl 是待填监督侧，不是已有答案。未标注样本进入 quarantine 属于预期行为。split blocked 后不运行 audit-dataset 假装有四份数据。

## 当前支持边界

- 输入：DSH session.v4 原始事件或 {session_log,event} 包装。按已经验证的事件和 block 子集解析。
- profile next-operation：每个真实模型边界的完整前缀与当前工具候选，主要用于发现与后续投影；大状态不保证适合 Kev 默认预算。
- profile inspection-v1：用户/技能目录路由、加载巡检后的目录发现、模板选择、沿既有运行查询、结果表达方式。阶段由前缀判断，历史动作只附在监督侧。
- 没有 trace 执行器、自动教师调用、GPU训练、外部工具回放和完整性能验收。规则建议始终只是建议。
- 使用新领域时先定义合同与投影；不能把巡检规则套到任何业务。

## 添加新领域

在 trace_adapter.py 中增加明确命名的纯投影函数或 profile 分支，只接收 snapshot.surface/request_header。先生成 state/question/bindings，再单独附 observed_action。不得让观测答案影响 candidate 构造。为新 builder 记录版本；在运行时复用相同逻辑。

至少用两个最小差异场景、一个缺上下文场景、一个未来变更场景验证输入行为。若要新增 DSH 事件类型，使用固定 DSH 源码与最小脱敏夹具验证 surface 语义；未知事件不可简单设为忽略。

## 示例轨迹的正确用法

一个巡检请求的五个模型步骤属于同一来源组，可用于解析器与抽取器回归。只有属于模型任务且完成所需复核的记录才可考虑训练；该来源家族只能放在一种用途，不能同时拥有其训练改写和“独立”测试副本。参数绑定、轮询状态和数字/URL呈现通常先由代码实现。业务 PARTIAL 不等于智能体执行失败。

## 既有 Kev 数据

compile/split/audit-dataset 的自动检查面向本套 IR 与编译产物。外部已有的合法 Kev JSONL 不必伪造本套 provenance；先走原生 loader 兼容性审查，再补真实来源与分组映射。缺少本套审计元数据不能直接解释为 Kev 格式不合法。
