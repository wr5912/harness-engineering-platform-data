# 平台 v2 已复核导出到 KEV

仅用于后续获授权的离线数据任务，不在固定抽样或算力策划专项执行。

## 取得真实输入

人员在平台逐题复核 decision_time 并分配 train/development/calibration/test 后，保存 datasets/read 返回的 dataset_id/sha256，以及 datasets/export 实际回执。training 模式对应 train；其余三种同名。候选下载不能替代合格导出。

每个回执文件保存以下外壳：

```json
{"dataset_id":"真实批次ID","read_sha256":"实际回读摘要","mode":"training","export":{}}
```

export 必须填原样回执对象，不能使用空对象。里面的 content 是原 JSONL；blocked 和 eligibility.blocked 必须是实际空数组。离线脚本不访问服务器，不认证回执发布者，也不重新构造 source bundle。

输入清单：

```json
{
  "schema_version":"kev-platform-export-manifest/v1",
  "partitions":{
    "train":[{"path":"train-export.json","sha256":"真实文件摘要","dataset_id":"真实批次ID","read_sha256":"实际回读摘要"}],
    "development":[],
    "calibration":[],
    "test":[]
  }
}
```

后三个列表也要填同样结构的真实条目；任何分区为空就阻断。路径相对清单，摘要固定回执文件字节。可在同一分区列多个导出回执；来源组相连的样本必须在同一分区。

## 执行和继续

```text
python3 <core_dir>/scripts/platform_export.py MANIFEST.json --out NEW_DIR
```

输出四个原生 JSONL、split-manifest.json、platform-bridge-report.json。继续条件：报告 status=ready、ok=true，清单 status=ready；实际文件哈希与计数一致。失败非零退出并保留阻断报告，不自动修复复核状态或切分。

另生成中文 report.md，默认 stdout 先说明转换了多少记录、每份用途及还缺什么。机器调用需要原 JSON 回执时加 --json；训练 JSONL 本体不变。转换通过仍需实际编码检查和业务复核，不能称为已完成训练。

## 保留语义

- 原 state/questions 是输入；targets、basis、observed_action、outcome_refs 和来源审计留在元数据侧。
- choice/noul/score 标签保持原类型；软概率保持真实分布，不补 one-hot。
- 原 ID、source_group_id、group_history、split 保留；模型建议经复核仍是 model_suggestion/uncalibrated，不伪装人工原始标注或 gold。
- 派生原生 _meta.group_id 与 bridge_group_id 写入来源/Run/Session/历史组的关联闭包，供 KEV 实际分折读取。原平台组保留在 _meta.platform.original_group_id 和报告 mappings。
- 不重新随机切分。转换结果直接交 kev-training，dataset.kind=platform-v2；不要拿 choice-only IR 的审计字段要求判定这些多题 v2 导出不兼容。
- 结构检查不能发现所有自然语言泄漏或证明语义正确，训练前仍需复核切片与真实编码。
