# EXP027 主线融合观察

2026-11-11 UTC。三个用户指定的特性均通过共同融合入口写入本主线。固定来源和摘要由 [change.yaml](../change.yaml) 的 `fusion_sources` 维护，当前融合计划和检查由其中的 `creation` 维护。

## 取舍与边界

- 保留主线对 DSH 原生委派、确认、调度和工具展示的复用，不恢复来源中的旧执行包装或固定业务轮次锁。
- 威胁研判合入严格低于 0.75 的规则建议条件、0–2 项三字段建议、本地 HTML 报告和动态下载。按来源已确认的兼容交付行为，可解析结果在证据校验失败时仍可交付，但保留 `validation.status=failed` 及 SOC 的真实失败状态；交付完成不表示校验通过，不增加报告保存 MCP 调用。
- 策略和应急合入 XX 固定指令及模板 Skill、真实组合来源与验收入口，不回退离线 Mock，也不恢复旧确认控制器。
- 合入巡检报告卡片、只读故障组合、同次完整报告导出，以及设备发现、表格预览和明确确认后的资产纳管；保留子角色原有职责和底层工具边界。

共同融合入口未确认自动公共基线，差异按固定来源逐项取舍并保留该限制，不把人工参考的 Git 父版本写成已核验公共基线。受控融合曾因 TypeScript 声明文件语法检查异常中断；程序侧共同校验修复及 3 项定向回归通过，合法 `.d.ts/.d.mts/.d.cts` 可保存，错误语法仍拒绝。该程序修复仅保留在本地开发工作树，未部署或推送程序仓库。

## 本次验证

Node 受影响合同与集成回归 **383/383**，Python **73/73**，均零失败、零跳过。官方 MCP SDK 的真实协议调用使用本地受控服务夹具，不代表真实 SOC、设备或模型验收。测试调整覆盖来源明确替换的旧接口、兼容交付语义、共享管理器装载方式及 Guard 当前职责，失败后均重新执行并通过。

四个受影响 TypeScript 入口通过受控构建，巡检准备、研判 MCP 桥接、资产纳管和完整报告的源码、共享运行器、编译器及 ESM 摘要复核均通过；构建身份见 `change.yaml` 的 `asset_builds`。已停用的历史诊断入口未重新构建。共同 `fusion/verify` 的 `merged-build` 已通过，回执固定本次 Candidate、来源及评测摘要。

复现时在本目录的 `../candidate/` 下执行。`HARNESS_PROGRAM_ROOT` 指向程序仓库；`HARNESS_DSH_ENTRY` 指向锁定 Runtime 的 MCP client `package.json`，`DSH_MCP_CLIENT_ANCHOR` 与 `DSH_MCP_BRIDGE_PACKAGE` 使用同一路径：

```bash
ASSET_TEST_BUILT=1 node --experimental-transform-types --experimental-test-module-mocks --test \
  tests/threat-report-download.test.mjs \
  tests/security-operations-guard.test.mjs \
  tests/mcp-scope-guard.test.mjs \
  tests/security-report-runtime.test.mjs \
  tests/asset-onboarding-runtime.test.mjs \
  dsh/managed/inspection-report-card/test/model.test.mjs \
  tests/attachment-tool.test.mjs \
  tests/attachment-reader.test.mjs \
  tests/delegation-presentation.test.mjs \
  tests/fault-echo-guard.test.mjs \
  tests/asset-onboarding-seed.test.mjs \
  tests/asset-onboarding-group.test.mjs \
  tests/asset-onboarding-preview-ui.test.mjs \
  tests/asset-onboarding-confirmation.test.mjs \
  tests/asset-onboarding-range.test.mjs \
  tests/asset-onboarding-commit.test.mjs \
  tests/asset-workbook.test.mjs \
  tests/security-operations-child-guard.test.mjs \
  tests/inspection-runtime-contract.test.mjs \
  tests/inspection-catalog-output.test.mjs \
  tests/xx-device-control-mock.test.mjs \
  tests/xx-device-control-wiring.test.mjs \
  tests/xx-device-control-role-guard.test.mjs \
  tests/xx-device-policy-mock.test.mjs \
  tests/xx-device-policy-wiring.test.mjs \
  tests/threat-analysis-mcp-group-bridge.test.mjs \
  tests/mcp-group-v2-provider.test.mjs \
  tests/xx-device-control-sdk.test.mjs \
  tests/xx-device-policy-sdk.test.mjs

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
```

## 尚待验证

未重载或切换实例，未执行融合版本的新业务 Run，未核对真实外部服务和设备效果，未进行 Research Release 复现。`merged-load` 与 `merged-capability` 仍待执行；来源历史结果不升级为融合主线的业务通过。后续继续时先核对当前共用评测摘要，再在新 Session 和新 Run 上核对装载与受影响用例。
