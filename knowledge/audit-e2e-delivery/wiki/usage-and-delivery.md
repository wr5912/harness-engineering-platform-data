# 使用与交付

本页整理本主题材料中关于“业务如何使用”和“如何交付”的知识事实。来源生效日期未知；引用定位可在 [delivery-r1.md](../readable/delivery-r1.md) 与 [evidence-r2.md](../readable/evidence-r2.md)（当前 PDF 来源）逐条核对。

## 使用方式

- 业务运行可采用 **Web 交互** 或 **官方 TypeScript SDK** 两种使用方式。
  来源：[delivery-r1.docx](../raw/delivery-r1.docx)（DOCX 段落 2）。
- 使用官方 TypeScript SDK 时，SDK 应用与 DSH Runtime 位于**同一标准容器**，通过 **stdio** 交互。
  来源：[delivery-r1.docx](../raw/delivery-r1.docx)（DOCX 段落 2）。

## 交付方式

- **平台运行**与**独立包**属于交付方式。
  来源：[delivery-r1.docx](../raw/delivery-r1.docx)（DOCX 段落 3）。
- 交付方式与 Web/SDK 使用方式**分别表达**，不混为一谈。
  来源：[delivery-r1.docx](../raw/delivery-r1.docx)（DOCX 段落 3）。

## 概念区分

| 维度 | 材料给出的取值 | 性质 | 来源定位 |
|---|---|---|---|
| 使用方式 | Web 交互、官方 TypeScript SDK | 业务运行时如何操作 | delivery-r1.docx 段落 2 |
| 交付方式 | 平台运行、独立包 | 能力如何交付落地 | delivery-r1.docx 段落 3 |

两者分别表达，是材料明确的规则；材料未给出其他取值，也未说明取值之间的优劣或适用条件，此处不作推断。

## 与运行环境相关的既定条件

SDK 路径下“与 DSH Runtime 同一标准容器、stdio 交互”是材料给出的既定条件（delivery-r1.docx 段落 2）；材料未说明其他部署形态下的 SDK 行为，保持未知。

## 来源时效

材料自述“知识生效日期未知”（delivery-r1.docx 段落 3；evidence-r2.pdf 第 5 页同述“生效日期未知”），且整批材料是知识整理功能的测试输入，不是业务效果证据（见 [证据边界](evidence-boundary.md)）。本页内容在生效日期确认前不得当作现行业务承诺。
