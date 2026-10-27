# 上游来源与平台交接

本目录完整保留 Jared Palmer 的官方 `kev-deploy` 技能。3 个上游文件 `SKILL.md`、`README.md` 与 `scripts/kev_serve.py` 均未修改；`LICENSE` 复制自同一提交的仓库根目录，`UPSTREAM.json` 与本文件为本地来源说明。

## 固定版本

- 仓库：<https://github.com/jaredpalmer/kev>
- 提交：`2074cc44256200bb37540103fa4572901faa10f3`
- [固定版本的完整技能目录](https://github.com/jaredpalmer/kev/tree/2074cc44256200bb37540103fa4572901faa10f3/skills/kev-deploy)
- [文件清单、原始 Git blob SHA-1 与 SHA-256](UPSTREAM.json)
- 许可：Apache-2.0；Copyright 2026 Jared Palmer。该提交未包含 `NOTICE` 文件。

官方 `scripts/kev_serve.py` 的 `KEV_REF` 是 Python 常量，固定为 `fc4a17e194bca35a48c57211392ec49ea54a94ac`。**该脚本不读取同名环境变量；设置环境变量 `KEV_REF` 不会改变部署运行版本。** 这与 `kev-finetune/scripts/kev_modal.py` 的环境覆盖方式不同。

核验上述默认运行提交与本次来源提交后，`kev/*.py` 和 `pyproject.toml` 的全部 Git blob 哈希一致。部署仍须记录实际运行提交。若以后需要改变该常量，使用明确标记的独立适配文件或选择相应上游版本，保留本目录官方副本不变。

## 推理交接

该技能提供 Modal 上的 TypeSafe System One 推理端点，不包含平台业务 Variant 的构建和效果验收合同。平台阶段负责选择并冻结 checkpoint、数据/候选构建规则、温度、回退阈值和目标实例，再决定是否进入部署。

部署模型由 `KEV_MODEL` 指定，可包含 `@revision`；这是模型 checkpoint 版本，和 Kev 代码的 `KEV_REF` 不同。私有或自定义 checkpoint 需明确访问条件；自定义模型名没有自动 GPU 映射时必须提供 `KEV_GPU`。原脚本会使用环境中的 `KEV_API_KEY` 与 `HF_TOKEN` 创建 Modal secret，因此本次只复制和静态核验脚本，不导入或运行部署入口。

官方服务加载 checkpoint 已保存的温度。接入前核对 `/v1/models` 返回的模型、温度和实际环境，比较线上服务与冻结离线结果；不能从托管成功推定平台业务效果通过。脚本的默认普通端点可缩容至零；`KEV_FLASH=1` 至少保持一个付费 GPU 容器。具体预算、认证和实例接管由平台流程办理。

## 保留与执行

这次引入没有安装 Modal、读取凭据、下载模型、部署服务、创建 secret、发布权重或删除任何外部资源。官方文档的价格、性能及示例命令是该上游版本的说明。上游文本中的仓库外相对链接与 `main` 下载示例应结合本页固定来源理解，不能代替版本记录。

后续更新先选择新的上游提交，再完整替换官方文件并更新清单。平台适配和行为变更放在单独入口或新文件；不得静默修改官方副本。分发时保留本目录 `LICENSE` 与原始署名。
