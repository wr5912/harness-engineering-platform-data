# 上游来源与平台交接

本目录完整保留 Jared Palmer 的官方 `kev-finetune` 技能。13 个上游文件的正文、脚本、元数据和相对路径均未修改；`LICENSE` 复制自同一提交的仓库根目录，`UPSTREAM.json` 与本文件为本地来源说明。

## 固定版本

- 仓库：<https://github.com/jaredpalmer/kev>
- 提交：`2074cc44256200bb37540103fa4572901faa10f3`
- [固定版本的完整技能目录](https://github.com/jaredpalmer/kev/tree/2074cc44256200bb37540103fa4572901faa10f3/skills/kev-finetune)
- [文件清单、原始 Git blob SHA-1 与 SHA-256](UPSTREAM.json)
- 许可：Apache-2.0；Copyright 2026 Jared Palmer。该提交未包含 `NOTICE` 文件。

官方 `scripts/kev_modal.py` 默认运行代码提交为 `fc4a17e194bca35a48c57211392ec49ea54a94ac`，支持通过环境变量 `KEV_REF` 显式覆盖。核验两次提交后，`kev/*.py` 和 `pyproject.toml` 的全部 Git blob 哈希一致；技能脚本和说明存在更新。来源提交与实际训练运行提交仍须分别记录。

## 预切分轨迹数据的交接边界

平台的原生 JSONL 已带有来源与标签审核信息，直接使用实际的 `train.jsonl`、`calibration.jsonl`、`development.jsonl` 与独立 `test.jsonl`。官方 `convert_data.py` 会重建记录；`split_data.py` 按 state 分组，不继承平台的完整同源关系。不要以这两个通用步骤替换已审核的编译与切分结果。

官方 Modal `train` 可以原样上传前三个分区文件，但仅暴露 `p_none_pair`，无法直接配置其余候选增删增强。平台固定闭集首轮交接使用原生 `kev.train`，明确设置 `--p_none 0 --p_none_distract 0 --p_distract 0 --p_none_pair 0`，保留选项洗牌；此配置由平台交接文件生成，不修改本目录的官方脚本。

原生 loader 位于固定版本的 [`kev/data.py`](https://github.com/jaredpalmer/kev/blob/2074cc44256200bb37540103fa4572901faa10f3/kev/data.py)：`load_records()` 保留 `_meta`，但不依据 `_meta.split` 筛选训练行。原生训练只传实际 `train.jsonl`；校准仅使用校准分区，开发分区用于迭代，冻结 checkpoint、温度和回退阈值后再进行最终测试。`python -m kev.calibrate` 只写报告，不将温度写入 checkpoint。具体执行命令、审查状态与环境检查由平台交接入口负责。

## 保留与执行

这次引入只保存来源文件，没有安装 Modal、读取凭据、生成样本、下载模型、加载 tokenizer、运行训练、部署服务或发布权重。官方文档的价格、性能及示例命令是该上游版本的说明；后续执行使用已核对的环境、预算和平台阶段。上游文本中的仓库外相对链接与 `main` 下载示例应结合本页固定来源理解，不能代替版本记录。

后续更新先选择新的上游提交，再完整替换官方文件并更新清单。平台适配和行为变更放在单独入口或新文件；不得静默修改官方副本。分发时保留本目录 `LICENSE` 与原始署名。
