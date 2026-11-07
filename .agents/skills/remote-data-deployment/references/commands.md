# 远端更新命令

执行前阅读程序根 `docs/platform-design/23_离线一键打包与安装.md` 并核对当前 `platform/dsh-deploy --help`。下列变量必须来自本次只读核对，不能原样执行占位值；命令由普通管理会话已提供的原生 Bash 执行，不落成另一套部署脚本。

## 已安装仓库的增量更新

`hep_tool_root` 是受信任程序根；`hep_source_program_root` 是已准备的程序来源。仅更新数据时，后者的 HEAD 必须与目标程序提交一致，预检若仍包含程序变化则停止。`hep_source_data_root` 是待交付的数据仓库；`hep_remote_program_root`、`hep_remote_data_root` 是现场核实的远端绝对路径，`hep_ssh_target` 是授权的 SSH 目标。

先仅执行预检：

```bash
hep_update_args=(update
  --program-root "$hep_source_program_root"
  --data-root "$hep_source_data_root"
  --ssh "$hep_ssh_target"
  --prefix "$hep_remote_program_root"
  --remote-data-root "$hep_remote_data_root")
```

目标为最小数据安装时，先追加这一项；完整安装不追加：

```bash
hep_update_args+=(--minimal-data)
```

```bash
"$hep_tool_root/platform/dsh-deploy" "${hep_update_args[@]}" --dry-run
```

核对预检回执符合本次授权，且执行参数和来源未变化后再应用：

```bash
"$hep_tool_root/platform/dsh-deploy" "${hep_update_args[@]}"
```

不默认追加 `--install-deps` 或 `--start`；确有需要时按工具合同将选项加入同一参数组，重新预检再应用。不能省略远端目标参数后误用本地源码更新入口。整库更新不包含未提交文件；不要用 `--allow-dirty` 或不存在的 `--data-only` 试图改变该合同。

## 指定实例的 Candidate 更新

先通过实际平台工具核对实例的 Agent、完整 Experiment ID、数据根与装载来源，读取远端拟替换文件 SHA-256。只为已确认的新文件填写 `null`；无法读取不等于不存在。创建本地 JSON 清单，替换全部示意值：

```json
{
  "agentId": "<实际 Agent ID>",
  "experimentId": "<完整 Experiment ID>",
  "instance": "<实际实例名>",
  "files": [
    {
      "path": "candidate/dsh/workspace/AGENTS.md",
      "expectedSha256": "<远端更新前文件的64位SHA256>"
    }
  ]
}
```

文件路径相对 Experiment，只允许当前工具支持的 `candidate/dsh/` 与构建回执 `change.yaml`；管理助手根级 Skill、现场配置、凭据、Session 不在该范围。Managed TypeScript 先通过受控资产构建，再将源码、ESM 与回执作为一致的一组交付。

```bash
hep_agent_update_args=(agent-update
  --manifest "$hep_update_manifest"
  --data-root "$hep_source_data_root"
  --ssh "$hep_ssh_target"
  --prefix "$hep_remote_program_root"
  --remote-data-root "$hep_remote_data_root")
"$hep_tool_root/platform/dsh-deploy" "${hep_agent_update_args[@]}" --dry-run
```

预检通过且仍在授权内，再执行：

```bash
"$hep_tool_root/platform/dsh-deploy" "${hep_agent_update_args[@]}"
```

之后按技能正文核对装载，不因文件传输成功就结束。断线先查该工具回执，`recovery-required` 保留现场和备份交由恢复，不用空摘要或手工覆盖绕过。
