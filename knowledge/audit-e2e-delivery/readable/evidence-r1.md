# evidence-r1.pdf 阅读视图（自动生成，勿人工编辑）

- 来源原件：[raw/evidence-r1.pdf](../raw/evidence-r1.pdf)
- 原件 SHA-256：`71792d4d08bca8916e953ca99dc5366370373b70d09413c0986394799c241458`
- 输入版本：audit-wiki-r1；生效日期：未知
- 状态：当前 PDF 知识改用 r2（[evidence-r2.md](evidence-r2.md)）；本文件保留 r1 观察记录，原件不覆盖。
- 提取方式：`platform_agents documents/read`，`format=pdf`，`extraction=text-only`，`blocks_total=2`，`has_more=false`
- 提取警告：`pdf_text_only` —— 只提取 PDF 文字；图片、图表、公式及多栏排版的含义需要核对原件，不执行 OCR。
- 提取限制：仅文字层；排版、图表、公式不在本视图内。修订由原件重新提取，不得直接编辑本文件。

## 提取块（定位：PDF 页码）

> 【第 1 页｜ordinal=1｜offset 0–40】
> 资料原件保存来源与 SHA-256；知识正文保留 PDF 页码和 DOCX 段落

> 【第 2 页｜ordinal=2｜offset 0–40】
> 文档保存、静态检查或 HTTP 200 不代表业务成功；算力变体的业务等效和成本

## 读取正文与原件内容流差异（原因尚未确认）

观察值：documents/read 两页正文各 40 字符（`end_offset=40`，`has_more=false`）；原件内容流（只读解码）第 1 页 62 字符、第 2 页 57 字符：

> 【第 1 页｜原件内容流｜62 字符】
> 资料原件保存来源与 SHA-256；知识正文保留 PDF 页码和 DOCX 段落定位。输入版本 audit-wiki-r1。

> 【第 2 页｜原件内容流｜57 字符】
> 文档保存、静态检查或 HTTP 200 不代表业务成功；算力变体的业务等效和成本收益仍需双侧 Run 与比较验证。

读取正文分别止于“段落”“成本”，与原件内容流文字存在差异；原因尚未确认，不将字段缺失解释为截断标志，也不认定为工具缺陷。当前 PDF 知识改用 r2；以上为 r1 观察记录，引用原件内容流文字时须注明该来源。
