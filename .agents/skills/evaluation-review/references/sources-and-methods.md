# 专家方法与外部依据

核验日期：2026-11-02。这些内容用于设计时按需参考，不作为用例字段或默认附加交付。标准借鉴不等于合规认证；ISO 内容仅据官方公开摘要确认范围。

## 从什么材料开始

优先读业务需求、原用例及总则，确定用户真正要完成的任务。再针对有疑问的部分查看工具合同、真实用户记录、缺陷和运行证据。需要核验数量或状态时，寻找本轮可独立比较的数据。

实现代码和历史输出用于理解现状，业务需求与已确认合同决定验收要求。不要为了填表要求所有任务都收集全套材料。

## 用什么方法和工具

| 要解决的问题 | 按需采用的方法 |
|---|---|
| 预期是否说清楚 | 用“条件—动作—可观察结果”检查表达，最终仍写成简单用例 |
| 主要流程或分支是否遗漏 | 对照原需求与真实失败；复杂条件才用决策表或状态图帮助分析 |
| 行为、数量、报告是否一致 | 核对本轮工具回执、状态、报告和必要审计；关键事实用确定性比较 |
| 用户入口与产物是否可用 | 在执行验收时使用浏览器自动化、API 或文件检查；是否纳入取决于真实需求 |
| 判定规则是否抓得住错误 | 用错误数量、重复启动、缺报告等反例检查；接受合法的等效表述 |
| 文本能否被平台读取 | 复用平台原生解析器；格式通过不能证明业务通过 |

证据缺失时不宣称通过；没有完整采集，空日志不能证明未发生某动作。仅取得 URL 不能证明下载成功，但是否要求实际下载取决于用例既有验收范围，不能在改写时静默加项。模拟执行只证明相应条件下的行为。

## 外部依据及用途

| 官方来源 | 采用什么 |
|---|---|
| [ISTQB Test Analyst v4.0，2025](https://istqb.org/wp-content/uploads/sdm-uploads/ISTQB-CTAL-TA-Syllabus-v4.0-EN-4.pdf) | §1.3.2 的质量维度，包括易懂、精确、完整和简洁；不要求每个维度都变成一个字段 |
| [ISTQB Acceptance Testing，2019](https://istqb.org/?download_id=3585&sdm_process_download=1) | 可测试的验收条件、业务结果及 Given/When/Then 思路 |
| [ISO/IEC/IEEE 29119-3:2021](https://www.iso.org/standard/79429.html) / [29119-4:2021](https://webstore.iec.ch/en/publication/71836) | 理解测试文档与测试设计技术的范围，按实际需要取用 |
| [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) / [25059:2023](https://www.iso.org/standard/80655.html) | 从产品及 AI 质量维度查漏；不直接给本项目设定数值门槛 |
| [NIST AI RMF 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) | 评测条件、独立复核与评测有效性 |
| [Anthropic：Demystifying evals for AI agents，2026-01-09](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) | 从真实失败构建评测，区分运行轨迹、最终结果与判定 |
| [Cucumber Gherkin](https://cucumber.io/docs/gherkin/reference/) | 写可观察结果；无需强制使用英文语法或安装框架 |
| [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) | 需要 UI 取证时查看操作与结果 |
| [Agent Skills Specification](https://agentskills.io/specification) | 技能结构和渐进加载；不证明业务验收效果 |
