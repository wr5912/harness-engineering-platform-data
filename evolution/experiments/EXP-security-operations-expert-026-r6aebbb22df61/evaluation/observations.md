# Evaluation Observations

固定 Case 为 U-EMG-MISSING-TARGET、U-QA-001，模型为 MiMo Flash/off，MCP Mock 映射 SHA 为 `1005aaf302af4a729c29dde6f8ecf7cee491c160f9b12875ebb09fcea5c4eefd`。每一对使用相同来源提交；结果仅适用于该 Mock 边界。

| 来源与程序 | 父版 Run | EXP026 Run | 实际结果 |
|---|---|---|---|
| 4d03a16 / review:none | run-ade00ca7-8b91-41b6-a835-f7ec65fdd603 | run-336d94c7-a463-423e-80d2-891fb03ba574 | 两侧均未保留 Error: JSON 包装中的404原因；QA分别为 passed、inconclusive。 |
| 38e0fdc / aa3c10e | run-2dfa0a95-a136-474c-a94d-8ffbd49dcea5 | run-92c6bb6a-f9dc-4536-895e-33f28e570dee | 两侧真实404；父版泛化为未取得回执并建议重试，EXP026保留目标缺失原因。AI复核未完成，有效结论均为 inconclusive。 |
| 38e0fdc / 162b144（C1） | run-e2fcc6f8-5a91-4ed1-aaad-b21bad701b65 | run-028a9199-2c68-45be-b0e8-26b83852283f | 再次取得同404的两侧技术观察；原复核未完整读完证据，有效结论均为 inconclusive。 |
| 38e0fdc / d961b80（C3，效果与源码分开） | run-e94134da-05cd-40e8-8642-b2cd4163c37a | run-61f812e3-90ab-40fa-89a1-f1bb97a9008b | 业务效果复核完成：父版1 passed、1 failed；EXP026两项均 passed。两侧来源均 matched，源码诊断均未完成。 |

C1的两侧真实 prepare 均仅1次，原样携带目标172.16.2.103、源IP198.51.100.78、443端口，同 callId 回执均为404/“未找到对应模拟资产”，没有确认执行。EXP026保留该原因且不建议盲目重试。标准 Runtime 镜像内相关回归27/27通过，覆盖成功、传输失败、协议错误、200与isError冲突及完整 Error: JSON 包装。

C3父版本次 body 字符串包含未求值的 `.replace` 表达式，实际回执为“准备请求字段无效”，没有取得404；不能把这一对的全部差异单独归因于404处理。EXP026本次实际收到404，最终为“处理结果：未完成；原因：未找到对应模拟资产”，仅1次 prepare、0次确认或执行。其应急 Case 由机器 inconclusive 经完整业务证据复核修正为 passed；QA维持 passed。Case标准和原始裁决均未手改。

平台诊断链另以历史父版1f162的 [C4 Run](../../EXP-security-operations-expert-024-rad80a907c628/runs/run-403db09b-c724-4514-96f0-c95a59f1fdd1/) 验证：QA效果 passed，来源 matched；源码真实超时仍为 incomplete，并保留实际 MiMo Session、25组配对工具回执和12/186个完整阅读分包，未把未知范围算作源码通过。该单例不扩展EXP026的业务覆盖范围。
