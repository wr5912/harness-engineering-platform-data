# 原生 CUDA 接入

本路径用于已授权的普通管理会话，将本地 checkpoint 接入当前 Harness 的严格编码预算和证明合同。官方 serving 参考继续维护上游用法；当前扩展的唯一源码是系统 `program_root` 下的 `runtime/research/kev-serving.mts`，生成的 Python 只作官方 `serve.app` 的同进程装载制品，不另行编辑。远端执行、状态、传输与端口转发沿用[原生执行交接](../../kev-training/references/native-execution.md)。

## 生成与启动

先核对已训练工件、校准后的实际温度、目标主机及当前服务。`serving.json` 只含六项实际身份：`run` 为本地 checkpoint 绝对路径，`base` 来自训练配置，`temperature` 为已核对温度，当前实现要求 `dtype:"float32"`、`backend:"torch"`、`device:"cuda"`。`LOCAL_KEV` 是运行 emit 的机器上的完整固定 KEV checkout，`REMOTE_KEV` 是目标服务读取的同版本目录；不能用模型路由代替它们。

以下路径均替换为已核对的实际值，输出使用新文件：

```text
node --experimental-strip-types PROGRAM_ROOT/runtime/research/kev-serving.mts emit --kev-root LOCAL_KEV --runtime-kev-root REMOTE_KEV --serving SERVING.json --out NEW_BOOTSTRAP.py --config-out NEW_CONFIG.json
```

保存 emit 回执中的 `bootstrap_sha256/admission_source_sha256/emitter_source_sha256`，将 `required_env` 原样用于服务命令卡；缓存和离线环境沿用实际配置。通过 SSH CLI 上传生成物并核对两侧摘要，以目标 venv Python 执行 bootstrap，传 `--harness-config`、与 serving.run 相同的 `--run`、`--device cuda` 和明确 `--host/--port`；`--fallback` 如提供也必须指向同一 checkpoint。原有服务按真实 PID、出生时间、来源及在途请求核对后定向操作，不因端口占用另起不明来源的副本。

## 实际证明与调用方

先读取实际 `/v1/models`，核对模型六项身份及顶层 `harness_encoding` 的编码仓库版本、源码摘要、admission 摘要、预算和 `json-wire-sha256/v1` 合同。服务不返回这些字段时不能把普通 serving 当作该接入已就绪。

把训练/线上共用构造器产生的真实 `{state,questions,model?}` 保存为请求后生成 wire：

```text
node --experimental-strip-types PROGRAM_ROOT/runtime/research/kev-serving.mts probe --request REQUEST.json --out NEW_WIRE.json
```

将输出 `request_wire_body` 的 UTF-8 原字节发送给 `/v1/harness/encoding`，不要用会重新序列化的 `json=` 发送。检查实际 `harness_encoding` 的 state/questions 摘要与本次 wire 一致、`admitted:true`、三项实测 token 数均在 helper 的固定预算内。该端点只编码，`model_invocation:false` 不表示已经完成模型推理；422 拒收必须保留原因，不截断或增加预算。

随后用真实请求验证 `/v1/systemone` 的类型化决定、实际请求 ID、温度、来源及响应中的 `harness_encoding`。通过现有 `context.decide` 和原生工具适配器接入，保留 model_execution、逐次 model_requests 及失败/未知调用；`/v1/models`、编码通过和一次推理成功各有范围，完整装载与质量仍由新 Session 和两侧 Run 核对。容器调用前从实际实例核验转发地址可达，不以宿主机 loopback 请求代替。
