# audit-e2e-delivery 知识主题入口

主题路径：`knowledge/audit-e2e-delivery/`。本主题把用户提供的文件格式验收材料整理为有来源的 Wiki，围绕“使用与交付”和“证据边界”组织。

> 范围声明：这些材料是知识整理功能的**真实测试输入，不是业务效果证据**；来源生效日期未知。当前 PDF 知识沿用 r2；r1 原件及其观察记录保留。

## 知识页面

- [使用与交付](wiki/usage-and-delivery.md) —— Web/SDK 使用方式与平台运行/独立包交付方式的区分及既定运行条件。
- [证据边界](wiki/evidence-boundary.md) —— 材料用途、判定边界（保存/静态检查/HTTP 200 不等于业务成功）与来源登记要求。

## 来源登记

| 原名 | 输入版本 | 完整原件 SHA-256 | 本地原件 | 生效日期 | 来源地址／用户提供说明 |
|---|---|---|---|---|---|
| delivery-r1.docx | audit-wiki-r1 | `9c9ab1ff2a9bb64c56d83d4d0f9f37f08f360df8c2bc15b76b6445454895c7ca` | [raw/delivery-r1.docx](raw/delivery-r1.docx) | 未知（材料自述“知识生效日期未知”） | 用户提供，原路径 `.local/audit-e2e-inputs/wiki-delivery/delivery-r1.docx`；无外部来源地址 |
| evidence-r1.pdf | audit-wiki-r1 | `71792d4d08bca8916e953ca99dc5366370373b70d09413c0986394799c241458` | [raw/evidence-r1.pdf](raw/evidence-r1.pdf) | 未知（材料未给出生效日期） | 用户提供，原路径 `.local/audit-e2e-inputs/wiki-delivery/evidence-r1.pdf`；无外部来源地址 |
| evidence-r2.pdf | audit-wiki-r2 | `894db55679750e65e89e5216ca111af7b6134d01b6930b290cbbe130c1f14ec8` | [raw/evidence-r2.pdf](raw/evidence-r2.pdf) | 未知（材料第 5 页自述“生效日期未知”） | 用户提供，原路径 `.local/audit-e2e-inputs/wiki-delivery/evidence-r2.pdf`；无外部来源地址 |

说明：

- `raw/` 为逐字节保存的原件，上述 SHA-256 为**完整原件摘要**，已与用户输入路径下的原文件核对一致。接收/整理时间不作为知识生效日期。
- 输入版本为材料自述（delivery-r1.docx 段落 1；evidence-r2.pdf 第 5 页）。
- 同一摘要的原件可复用；本次三份原件摘要各不相同，均独立登记，r1 记录不因 r2 新增而删除。

## 提取边界与阅读视图

| 来源 | 提取方式 | 警告 | 提取边界与状态 | 阅读视图 |
|---|---|---|---|---|
| delivery-r1.docx | `documents/read`，`format=docx`，3 段完整 | `docx_text_only`：不提供排版页码，图片/图表/公式/表格结构需核对原件 | 读取正文与原件 `word/document.xml` 逐字一致 | [readable/delivery-r1.md](readable/delivery-r1.md) |
| evidence-r1.pdf | `documents/read`，`format=pdf`，2 页 | `pdf_text_only`：不执行 OCR，图片/图表/公式/多栏排版需核对原件 | 读取正文两页各 40 字符（`end_offset=40`，`has_more=false`），与原件内容流文字（62／57 字符）存在差异，原因尚未确认；当前改用 r2，观察记录保留 | [readable/evidence-r1.md](readable/evidence-r1.md) |
| evidence-r2.pdf | `documents/read`，`format=pdf`，5 页 | `pdf_text_only`：同上 | 逐页核对读取正文与原件内容流逐字一致（17／21／26／23／26 字符），各页完整；当前 PDF 知识来源 | [readable/evidence-r2.md](readable/evidence-r2.md) |

文字提取不证明图表、公式、表格关系或 Word 排版完整；本次未做 OCR。引用 r1 原件内容流文字时保留“原件内容流”标注（见 [readable/evidence-r1.md](readable/evidence-r1.md)）。
