# 工具组合编排

组合登记以 [`../compositions.json`](../compositions.json) 为唯一入口，当前状态由 [`../current-manifest.json`](../current-manifest.json) 生成。各组合的定义、实现、版本和测试材料只保存在对应目录中。

运行以下命令重新校验并生成当前清单：

```bash
python3 mcp/validate_catalog.py --write
```

没有 `composition.json` 的目录会标记为 `unregistered`，不会被平台组合目录加载。`published`、`draft`、依赖闭包、LLM 需求、外部依赖和副作用以清单字段为准；历史 Run 与历史资料保持原样。
