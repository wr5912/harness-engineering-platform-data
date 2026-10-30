# 操作记录

## 2026-10-31（Asia/Shanghai 采样时间）首次整理 audit-wiki-r1

- 材料：`delivery-r1.docx`、`evidence-r1.pdf`（用户提供，原路径 `.local/audit-e2e-inputs/wiki-delivery/`；知识整理功能真实测试输入，非业务效果证据）。
- 动作：原件逐字节保存至 `raw/` 并核对 SHA-256 一致；`documents/read` 逐份完整读取（docx 3 段、pdf 2 页，均 `has_more=false`）；生成 `readable/` 阅读视图；新建页面 `wiki/usage-and-delivery.md`、`wiki/evidence-boundary.md`；建立来源登记 `index.md`。
- 未解决问题：
  1. 两份材料的生效日期未知，接收时间不作替代。
  2. `documents/read` 对 `evidence-r1.pdf` 两页正文各返回 40 字符（`end_offset=40`），与原件内容流文字（62／57 字符）存在差异，原因尚未确认；观察记录保留于 `readable/evidence-r1.md`。
  3. DOCX/PDF 提取均为纯文字，不覆盖排版、图表、公式与表格结构（警告 `docx_text_only`、`pdf_text_only`）。
- 无知识冲突：本次仅两份材料，未与既有知识不一致（本主题首次整理）。

## 2026-10-31（Asia/Shanghai 采样时间）修订：新增 evidence-r2.pdf（audit-wiki-r2）

- 材料：`evidence-r2.pdf`（用户提供，原路径 `.local/audit-e2e-inputs/wiki-delivery/evidence-r2.pdf`；5 页，知识整理格式验收输入，非业务效果证据，生效日期未知）。
- 动作：`documents/read` 读取 5 页并逐页核对完整性（读取正文与原件内容流逐字一致，17／21／26／23／26 字符）；原件逐字节保存 `raw/evidence-r2.pdf`，SHA-256 `894db55679750e65e89e5216ca111af7b6134d01b6930b290cbbe130c1f14ec8` 与源文件一致；新增 `readable/evidence-r2.md`；更新 `index.md` 与两页 Wiki 的 PDF 来源为 r2；r1 来源状态改为“读取正文与原件内容流存在差异，原因尚未确认，当前改用 r2”，r1 原件、页数、提取边界与观察记录保留。
- 顺序说明：`.local/` 路径不是 documents/read 可导入来源，先逐字节复制到 `raw/` 并核对摘要，再读取；readable／index／Wiki／log 更新均在读取与完整性核对通过后进行。
- 未解决问题：
  1. r1 读取正文与原件内容流差异的原因未知，未认定为工具缺陷。
  2. 各来源生效日期未知。
  3. 纯文字提取不覆盖排版、图表、公式、表格结构（`docx_text_only`、`pdf_text_only`）；未做 OCR。
- 无知识冲突：r2 与 r1 概念内容一致，表述以 r2 为准；r1 观察记录保留。
