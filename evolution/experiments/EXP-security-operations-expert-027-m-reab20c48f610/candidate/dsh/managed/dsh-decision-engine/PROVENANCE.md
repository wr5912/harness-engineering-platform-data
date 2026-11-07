# 来源与装配状态

## 结论

**Host 源码相对导入闭包已在文本层面补齐；完整 Client 入口仍缺失，插件未激活、未安装或验证生效。** 新增客户端纯策略模块尚未接入，不是完整 UI。两个运行实例均未因本任务重启。当前本地工作稿未声明为已冻结、已发布或完整可恢复的业务版本。

截至本次记录，已保存并回读二十四个与固定上游摘要一致的文件，以及六个本地适配或说明文件；不含本记录。二十个 Host JavaScript 模块、一个未接入的客户端纯策略模块和一个仅作来源保留的迁移脚本通过平台草稿语法检查。保存、语法检查和 AI 静态审查都不证明实际装载或业务效果。本轮没有执行插件代码、上游脚本、测试、依赖准备、决策模型请求或实例生命周期操作。

## 固定上游

- 仓库：https://github.com/zuosus/dsh-decision-engine
- 提交：`146453d1427e2cf27d02cc786f3baff78bf87c6c`，包版本 `1.1.0`，MIT。
- 平台来源：`source-80c0b333-fb0b-4a11-a36f-883c06c4ce6b`
- 来源指纹：`1f62a06b2a511693b3732dd133dde1c7005ea8dce2f3b17d5de7a83d7c2e73bc`

以下为机器核对清单：每行依次为相对本目录路径、SHA-256。仅这些文件声明与固定上游字节一致。

```text
package.json 0003ef17038bf09cd1c72429fc216c5102474031e73578badc3de229b1981873
cordis.patch.yml 4d10b2cae606a6fc2ea0b2127d041f61ce99690eab78fd53c07b1ee14d644076
LICENSE 5ed998a7ea4b40df59c4b4849bdde7739bffc1870900ab67c4d3f8c6bee53e1e
icon.svg bf8a477072418b9dd0983445ebd083d54a670d3cdee8badaeedcbeda5236c50a
locale/en.json 1e7093316db41f96b5568819bbbc60959997890e43886375050f328d79a0d647
locale/zh.json 6f9ea5fec0f5ce11d42cc94986ceee10d5f15b984d96008ace0a6198c3a7556d
lib/home-paths.js d59f30d75f7803c847a26711d661abab599deb05e816b37c1b7ad0960bdbf251
lib/config-file.js 87aebd383f4c3e7285b4e5b47688e6d8c83a002e06b2528eb9e1c8fc51be089b
lib/tokenizer.js 5b68c5abb246be1b7b00bd07a8ee31bd7d11d3b1bfd0abbf7b7358b729bf1c20
lib/credentials.js 22ea07ef1e1d4892e1dd10a19fafaf5f1f86585caf8f4f3ce7de812bf4330499
lib/decision-cache.js fcd13f9f6fd32ecd9549769af57e5c008b0de08240b60bac5f0f2031d3514689
lib/endpoint-fallback.js cfdc743e7393bbe962d67c12f63d3607331f4af8e045ae07352bf462bbd7a9a4
lib/engine.js 005d156fbdeff49790de44a5902d57d66baec21726b8f7234eac67c5dd9ddbdd
lib/adapters/route.js 1b40edae4273580780c4770e7b23df40ea81688c9f7e67eb40066a031dece175
lib/adapters/translate.js c1f07854f6b20faf354ec3da1f00899d009902f47abb0909771edc50929dd7b7
lib/decision-points.js a1360f7f30f140d16bde962b8e43724f977b7f34502e6d313d715d0729bbd4bc
lib/outcomes.js b2f625778d5300645b3eef00c34f60b6a4436b83587a6e72a7098e1ffd22b7db
lib/adapters/agent.js 1fed69f6677d1f7c1348b1963e9f6fca36d58ae159eccc92c23f963615028a20
lib/adapters/tools.js f3d97a25403b375d7760a6c6012ee100890219ad814e1de7b386c96fd0cf7bb3
lib/telemetry.js 5977b5509e3848b046a7b02228142eb978c87eadb57844b2f4aa1ed63d9cb5c4
lib/stats-store.js 96da513f0e7d2c804a6e42d35a4e4f6c1385b06ea787c677b9db6b309473e22a
lib/stats.js d492258078aa5e272bbd61a02e4944d99ff7c0a6ddb014a708e8c01e34181f58
lib/points/spec.js 83007b24529756dd179bb89cd374f21e94bf0e89f5d6ca20d5efcca0a4a79478
scripts/migrate-profile.mjs f40e0389df36afd7e65fc26d3fb1a264ca535ce3fbf92319a2cbcc4dfff0f391
```

迁移脚本仅按包资源声明保留原文，没有执行，不参与 Host 导入闭包。上游 test 和 verify 脚本未纳入本部署，也未运行；不称本目录为完整上游开发仓库。

## 本地适配与说明

机器核对清单：

```text
lib/index.js 8f2e333e3d4601f397d2b9e99902e52fbc1561b3d87b02a039876b9717d10342
lib/managed-deployment.js 15e5f64d2160711c135c2e66637a2b94177b42fb002783ecd15e2e0f70a97354
lib/providers.js 4982d80e1223e92461893e2bacbeba833737853d776d6fb5534546f0da06ecc6
lib/managed-client-policy.js f527b878aab7a8b63cb2efee5bd9598bd8990955515d06b75192b2f9ea340d55
README.md b5cf9331268bc3937c767ec24ac822ad8271092fbb4a3e0429aadd766c345033
config.example.yml 28597197255683ca8f941dccdb382eedfb6f1bf5032a5b89ba8529283ce24dde
```

原始入口摘要：`30b3501bbb5217430d883c8f02a8254072559f4b7fefed7329a07f3b099860ed`。本地入口精简了长注释及部分 Schema 说明并实现以下约束；不是上游原样副本，也没有全面语义等效认证。

1. 显式 custom + none 才允许无 Key；凭据解析前退出，匿名请求只带 Content-Type，不发送空或虚构认证头。匿名 status 不扫描其他 provider 凭据或显示后缀，密钥字段保存先被拒绝。
2. classify、probe、models 均受 decisionFetch 约束。托管请求只允许用户授权服务的 /v1/systemone 和 /v1/models，拒绝 URL 凭据、query/hash、重定向。尚无插件实际请求证据。
3. 首次合并和 HOME 重载均应用可信 Profile 托管锁定。显式 managedDeployment:true 时固定 custom 匿名、authorize=observe、其余七点 off、对外统计 off；HOME 不能覆盖。
4. auto 权限下允许影子记录，但不施加审批；enforce 下仍跳过 auto。保留既有安全守卫、审批与主模型。关闭对外使用统计，保留本地审计；独立数据子目录，不迁移或改写旧配置和旧统计。
5. Provider 原始摘要：`8dcf05c3ba7368699cf10ace562064165970445dbbb105b2c01b92b82af0daee`。读取视图两处认证文本被隐藏；未恢复隐藏内容。仅从参数按公开协议重写认证头构造并说明差异；托管匿名提前旁路此函数，不包含固定凭据。
6. 本地部署说明与配置示例为匹配上述托管约束另写，不是生效配置。原上游说明摘要 `2b19c7bf3f96c6374b0fdeb97e3915b154b14337c454d4eb0fecf8e7e5fc9777`；原配置示例摘要 `7d5c1315775df3c15f0495916bc9de59fcc8460d08fb9e589253da5083ecae6a`。
7. 客户端纯策略模块仅辅助未知状态禁写、同 Provider 显式匿名、凭据字段剔除、真实 telemetryLevel 和同源文档相对 URL；尚未被完整 Client 引用或构建，不进入二十模块 Host 闭包，不是替代 UI 或新的安全边界。

当前部署边界见[托管说明](README.md)；固定 Runtime 兼容依据与完整 UI 接入条件见[接入记录](../dsh-decision-engine-integration.md)。

## AI 静态核对及限制

这些是 AI 只读静态审查，不是人员复核或独立真值；未执行源码、测试或实例操作，也未读取真实凭据。

- Session `199858b0-b7c5-437f-bf64-c5597d590a4c` 核对入口与托管约束模块，未发现当前托管路径的确定新增缺陷。固定原入口尾部十六项导出由主管理会话读取后补交核对；不能声称该子会话独立读全原入口。非托管密钥改名保存问题属于上游已有逻辑，本部署拒绝密钥保存，不扩范围修复。
- Session `d35b6058-d62c-4b29-8d26-7140c218aad7` 核对 Provider 十九项导出及入口十七项导入、匿名凭据旁路；当时十七个 JS 中未检出所检查的常见遮罩占位。随后文本核对全部二十个 Host 模块、二十一条相对导入边及所需导出，未见缺失；第三方 bare import 仅 @deepseek-ai/schemastery，@deepseek-ai/cordis 为 peer 声明，另使用五项 Node 内建模块。未验证实际共享 peer 或加载兼容。
- 同一子会话只读核对完整固定 Client 来源，摘要 `24861ab7cbe7b0c6cd1f95ad48ce6cb12906a8650e807ff8b6aa23a98663b96b`、160354 字节、126091 字符、3195 行；没有保存或执行它。发现待适配项：根路径 fetch 未显式保留网关挂载目录；匿名普通保存仍携带被 Host 拒绝的密钥字段；需禁止托管自动/重试配置写入且正确显示无需 Key；两处 draft 未派生 telemetryLevel，会错误回显 daily。完整 UI 仍缺失。
- Session `3b81b304-4a06-48c1-85a3-57f27da0d30f` 从固定 DSH b830ec950faba0a46dda564be3e2d854afed94f1 核对 HTTP/WS 文档基址、物理 API 到精确 Fetch 的分发。类型未列 PUT，但实现允许已注册 PUT 匹配；没有据此证明业务网关或实例已验收，未更改原方法。随后静态核对新增纯策略模块及 SHA：在最新真实 status、草稿与 patch 一致的合同下，未发现确定缺陷；所有保存路径、状态失效、locale 和实际基址仍须由完整 Client 接入验证。

上游元数据节省量及反事实统计不是本实例已实现的收益；影子建议不能当实际放行、询问或拦截。当前无真实决策或业务回归证据。

## 服务早期只读证据

保留此前接入记录中的事实，未冒充当前复测：GET /v1/models 曾返回 HTTP 200，目录含 kev-latest 与 jev-latest；GET /openapi.json 曾返回 HTTP 200，声明 POST /v1/systemone 需要 state、questions，model 默认 kev-latest。根路径曾返回 404，不代表决策端点不可用。它们是管理侧只读检查，不是插件已发出请求或完成真实决策验证；仍未发送真实决策 POST。

## 受控复用、依赖与后续

最近一次使用当时 Candidate 摘要预览固定迁移来源的 Client 文件复用，tasks/assembly-preview 返回 asset_operation_failed（filesystem_code: unknown），未写文件。已读 migrations/preview 仅提供 new-agent/new-version；没有当前目标原位来源复制的成功回执，未擅自新建版本作搬运跳板。完整正文编辑合同不接受来源引用，不继续逐文件搬运。限定检索其他 Experiment Candidate 的同名第三方 Client 文件未发现可直接复用项，不把这项检索泛化为其余版本无能力。

本轮 npm 当前标签出现 1.3.1，但其 gitHead 的公开说明读取为 404，受控 Git 清点返回 source_read_failed。未切换来源，也未核对或排除该版能力；保留当前已核对的 1.1.0 适配基线。

此前全局依赖准备曾失败于 voice-hub 的 DSH 公共依赖声明；本轮未重装或删除语音清单、锁、node_modules。既有受控 restart 预览说明保留 HOME、Sessions、来源、Run 和登记，但不是实际重启或本插件 peer 已解析的证据。能力发现器对既有业务 Patch 标为 invalid；回读仍含 DSH !!js 表达式，未取得目标 Runtime 解析失败证据，不擅自改写。

本轮回读确认完整 Client 仍不存在，顶层 Profile 与业务 Patch 未加入激活引用；实例详情仍指向原 EXP027、原标准镜像与 local / Qwen3.8-27B，并报告 HOME 保留。剩余工作是受控纳入并最小适配完整 Client，核对完整资源与共享 peer，验证真实装载和工具决策调用，再更新两个运行实例并回归。当前没有实例重启或插件生效证明。
