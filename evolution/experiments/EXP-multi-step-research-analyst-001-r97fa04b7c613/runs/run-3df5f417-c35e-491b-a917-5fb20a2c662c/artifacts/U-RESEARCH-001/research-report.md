# 多步骤业务资料调研报告

本报告依据已校验摘要的官方固定提交资料快照；资料时点以各原始链接中的提交为准，本次没有实时访问网站。

## 资料 1

autoresearch 是由 karpathy 发起的自主训练研究项目，核心业务用途是把一个「小但真实」的 LLM 训练装置交给 AI agent，让它在夜间自主做实验：修改代码、训练 5 分钟、检查结果是否变好，保留或丢弃，然后重复，人早上醒来得到实验日志和（期望中）更好的模型。训练代码是 nanochat 的单 GPU 简化实现。

执行方式：人不再直接改 Python 文件，而是编写 program.md 这类 Markdown 来给 agent 提供上下文、组建自主研究组织。仓库刻意保持很小，只有三个关键文件：prepare.py（固定常量、一次性数据准备含下载数据与训练 BPE 分词器、运行时工具如 dataloader 与评估，不修改）、train.py（agent 唯一编辑的文件，含完整 GPT 模型、Muon+AdamW 优化器与训练循环，架构、超参、优化器、batch size 等都可改）、program.md（面向单个 agent 的基线指令，由人来编辑迭代）。

使用边界与限制：训练固定 5 分钟墙钟时间预算（不含启动/编译），与算力无关，指标为 val_bpb（每字节验证比特数，越低越好，且与词表大小无关以便公平比较架构改动），因此约每小时 12 次实验、睡一觉约 100 次实验；该设计使同一平台内实验可直接比较，但与其他算力平台上的运行结果不可比较。

运行前提：需要单张 NVIDIA GPU（在 H100 上测试过）、Python 3.10+ 与 uv；需要先装 uv、uv sync 装依赖、uv run prepare.py 做一次性数据与分词器准备（约 2 分钟）、uv run train.py 手动跑一次约 5 分钟的单次实验，之后才能进入自主研究模式；运行 agent 的方式是在仓库中启动 Claude/Codex 等并禁用所有权限，再提示它读 program.md 开始实验，program.md 相当于一个超轻量 skill。

其他边界：目前仅支持单张 NVIDIA GPU，虽然理论上可支持 CPU、MPS 等平台但会让代码膨胀，作者表示当下不打算亲自做；面向小算力平台（如 Macbook）建议使用其列出的 fork（miolini/autoresearch-macos、trevin-creator/autoresearch-mlx、jsegov/autoresearch-win-rtx、andyluo7/autoresearch），并给出调参建议（用 TinyStories 这类低熵数据集、降低 vocab_size 甚至到 1024/256、大幅下调 prepare.py 中的 MAX_SEQ_LEN 甚至到 256 并相应提高 train.py 的 DEVICE_BATCH_SIZE、降低 EVAL_TOKENS、把 train.py 的 DEPTH 从默认 8 降到如 4、WINDOW_PATTERN 用 "L"、把 TOTAL_BATCH_SIZE 大幅下调但保持 2 的幂如 2**14）。设计取向是自包含：除 PyTorch 与少量小包外无外部依赖，无分布式训练、无复杂配置，一张 GPU、一个文件、一个指标。许可证为 MIT。

来源：[原始资料](https://raw.githubusercontent.com/karpathy/autoresearch/228791fb499afffb54b46200aca536f79142f117/README.md)；读取时间：2026-10-16T08:53:51.209Z；摘要：3958fd4195ac2f98ed35c4eaa4f3028a335165ee24945e96426c408d25793a41

## 资料 2

EvoFlow 由 EvovexAI（景银泰）打造，定位是面向长任务的原生 Agent Runtime 与控制平面，业务用途是把长任务交给可协作的 Agent Teams：先澄清与规划，再在隔离上下文中执行工具与沙箱作业，失败可恢复，过程可验收；控制平面覆盖对话、Plan、Goal、任务中心、工作流与可观测性，强调多 Agent 协作全程可观测、可干预。

能力范围：对话/Plan/Goal（先出可修订计划再执行，长任务后台挂起）；Agent Teams 与智能体员工（多 Agent 分工、岗位值班与关键审批、汇报）；应用中心/自动化（多节点固定业务工作流产品化，定时与 IM 派发）；工作空间与代码索引（项目目录边界，符号/引用图谱供 Agent 检索）；自我进化（资产中心：经验沉淀、反思过程、画像与记忆）；治理套件（多账号/SSO、费用统计、运维观测、安全中心）；资源市场（资源包与扩展应用安装，技能与 MCP 扩展）；沙箱与可观测（隔离执行，任务、工具调用与用量可见）。

执行方式有两条：一是桌面安装包，从 Releases 下载安装后，在「设置 → 模型」添加服务商与 API Key、测试后设为主模型，再开始对话，复杂任务用 Plan、长任务用 Goal；macOS 因尚未 Apple 公证可能提示「已损坏」或无法验证，可用 xattr -cr /Applications/EvoFlow.app 或到「系统设置 → 隐私与安全性 → 仍要打开」处理。二是从源码运行，适合二次开发、贡献代码或自托管：git clone 仓库、cd EvoFlow、复制 config.example.yaml 为 config.yaml（沙箱/工具/渠道等，模型在启动后界面配置），依赖 Git、Python 3.12+、Node.js 22+、uv、pnpm 9+，执行 make check && make install && make dev，Windows 用 .\scripts\windows\dev-stack-isolated.bat，启动后打开入口地址并在界面完成模型配置再验证对话。

使用边界与授权：版权所有 © 2026 景银泰（EvovexAI），采用 PolyForm Noncommercial License 1.0.0，源码可见（source-available），允许个人学习、研究与非商业使用，商业使用须书面授权（cloud@evovexai.com），该许可证并非 OSI 意义上的「开源」许可证；第三方组件见 NOTICE，商业化与第三方许可证（含 zcode Apache-2.0）的影响见 docs/legal/zcode-license-impact.md；贡献需先读 CONTRIBUTING.md、同意 CLA.md 并遵守 CODE_OF_CONDUCT.md，安全问题按 SECURITY.md 私密报告、勿在公开 Issue 粘贴密钥。项目支持自愿打赏，不影响使用与授权，但打赏不构成商用许可。

平台与生态：支持 Windows、macOS、Linux。EvoFlow 是独立产品，开发中参考了 DeerFlow、Hermes Agent、OpenClaw、OpenAI Codex、LangGraph/LangChain、MCP、Tauri 等项目的设计思路，并 vendored/借鉴了 ZCode（Z.AI Co., Ltd.，Apache-2.0）的部分 UI、协议与服务代码。文档在 docs/ 目录（含下载安装、配置模型、Plan 模式、技能与 MCP、IM 渠道、FAQ），可本地 mkdocs serve 预览；联系渠道为 GitHub Issues、Discussions、cloud@evovexai.com 与 evovexai.com。以上均为该 README 固定提交所载内容，本次未实时访问网站，也不代表对项目实际运行效果的验证。

来源：[原始资料](https://raw.githubusercontent.com/EvovexAI/EvoFlow/d921e63c6a771089db1c514a5dcd4cbc36cf95cf/README.md)；读取时间：2026-10-16T08:53:51.217Z；摘要：c0695756b1e44eabd15202868c1badde44527170206315bf35bc44c2c428a8bb
