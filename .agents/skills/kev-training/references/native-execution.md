# 原生执行交接

用于已明确授权的普通管理会话。`plan_only`、固定抽样或其他专项不借此扩大工具范围。沿用当前 Agent、父版、Run、数据摘要与已有产物；不依赖开发者私有临时目录或聊天历史。AI 复核 IR 时先读 `platform_agents.context` 的真实主体，模型只填写判断、标签和依据；原生记录经下文工具核验后自动形成标注来源。model 为空时保留未知，不补造模型身份。

## 入口与凭据

从系统工作区上下文取 `program_root`、`asset_root`。CLI唯一源码是程序根的 `runtime/research/training-ssh.mts`，可用 Node 24 的 `--experimental-strip-types` 直接运行。用原生 `bash` 调用它；长期命令设置 `run_in_background:true`，保存真实 `jobId`，用 `job_output/job_list` 收集状态和输出。

连接读取数据根 `config/compute-training-servers.json` 中已登记的真实 `server_id`；没有连接先完成实际登记，不从示例拼ID。密码引用 `ref:training-server/<slug>` 对应数据根 `.local/credentials/training-servers/<slug>.json`。专用文件由授权的凭据配置过程准备，模型不读取或输出正文。密码文件合同为 `{schema_version:1,kind:"ssh_password",password:真实值}`；SSH key使用 `{schema_version:1,kind:"ssh_key",identity_file:实际绝对路径}`，也可在没有引用时沿用原生SSH agent。CLI内部用 `SSH_ASKPASS` 交付密码，不将密码放入argv、环境值或日志。

CLI不创建服务器、生成密钥或猜测其他 `ref:` 的位置。首次连接按OpenSSH `accept-new` 保存本任务使用的known_hosts；认证失败与SSH banner可达是不同状态。

## 命令卡与生命周期

命令卡来自本技能已有 `training_plan.py prepare/commands` 的当前实际输出，保留 `{cwd,argv,env,unset_env,requires?}`。先满足 `requires`，不改写计划器参数来跳过编码或数据核对。显式提供 `UV_PROJECT_ENVIRONMENT` 时，全部阶段的命令卡使用该目录的 `bin/uv`，执行前在此任务 venv 中安装并验证 uv；未指定时沿用原生 `uv` 解析。SSH工作目录、卡中cwd与远端文件均须在所选服务器的workDir内。

以下 `CLI`、`ROOT`、`SERVER`、`CARD`、`RECEIPT` 均替换为实际绝对路径或已登记ID，不能原样执行占位符：

```text
node --experimental-strip-types CLI exec --asset-root ROOT --server-id SERVER --card CARD --receipt RECEIPT
node --experimental-strip-types CLI status --asset-root ROOT --receipt RECEIPT
node --experimental-strip-types CLI cancel --asset-root ROOT --receipt RECEIPT
```

首次exec先持久保存命令摘要与远端目录，再派发；同一receipt已存在时拒绝重复启动。回执含真实PID、Linux进程出生时间、命令卡摘要和退出状态。断线/不确定结果保持unknown，先status；训练成功还须读取实际训练报告和checkpoint，不能只看CLI退出0。

cancel核对命令身份、PID出生时间、进程组和runner路径，再发送TERM并检查整个所属进程组。`stopping`表示仍有进程存活，不能说已经停完；`job_kill`只处理原生本地Job，不独自证明远端训练已停。CLI不自动重试未知执行，也不自动强杀未核清的进程。远端Linux需有OpenSSH、POSIX shell、setsid、ps、awk、base64与GNU dd。

完整命令输出保留在回执remote目录的 `output.log`；Job输出是有界观察，不能代替日志工件。建议把receipt放在本次任务的本地忽略目录，阶段完成后将不含凭据的来源、命令摘要、实际退出、日志和工件摘要回流对应Experiment的交付资料。后台模型服务还须独立核对真实服务PID、`/v1/models`、模型来源与可用端点；启动命令结束不代表模型已就绪。

## 工件与下一阶段

逐个已知普通文件上传或回收，不复制Runtime HOME、缓存目录或凭据：

```text
node --experimental-strip-types CLI transfer --asset-root ROOT --server-id SERVER --direction upload --local LOCAL_FILE --remote REMOTE_FILE --receipt TRANSFER_RECEIPT
node --experimental-strip-types CLI transfer --asset-root ROOT --server-id SERVER --direction download --local NEW_LOCAL_FILE --remote REMOTE_FILE --receipt TRANSFER_RECEIPT
```

CLI使用原生scp并核对两侧实际SHA-256；下载不覆盖已有文件。依据真实训练清单分别回收LoRA、head、training_config、metrics、校准与日志，基座权重保留为依赖来源引用。传输通过不代表训练或业务通过。

模型只监听远端 `127.0.0.1` 时，用同一连接转发明确端口。映射文件是数组，每项为 `{bind_address:"实际本地IP",local_port:实际本地端口,remote_port:实际远端端口}`；可分别填写两个模型的映射。`bind_address` 必填；业务实例运行在容器中时，选择容器实际可达的平台主机地址，并从该实例核验端点，不能把本机loopback可达写成容器可达。

```text
node --experimental-strip-types CLI forward --asset-root ROOT --server-id SERVER --mappings MAPPINGS_JSON --receipt TUNNEL_RECEIPT
```

`forward` 使用前台 `ssh -N -L`、`ExitOnForwardFailure=yes`，由普通原生后台Job托管，不创建额外执行服务。远端目标固定为 `127.0.0.1`。保存实际Job ID和receipt；`running`表示已核验SSH PID、出生时间、完整参数和该进程持有的本地监听，仍需另行请求模型API。`status/cancel`读取同一receipt，通过共享数据目录的私有控制socket交给持有SSH的原生Job核验或停止；不同bash的PID命名空间不能互相替代。控制通道不可达时保持unknown，再用真实Job身份核对，不据此重启隧道。Job收到TERM也会关闭SSH并清理AskPass。隧道`closed`不表示远端模型进程已停，远端停止仍须使用其独立执行回执核验。

数据复核通过后交 `kev-trace-pipeline`，编码/训练/校准交本技能，服务核对交 `kev-deploy`，再回 `compute-variant-research` 用当前公共generation_contract构建、冻结、装载与比较。用户已明确委托AI复核时，逐题保留真实模型、Session、依据与functional_validation用途；不把该用途扩大为人工真值、业务等效或页面end确认。整体授权未改变时按成功回执连续进入下一阶段；失败只停止依赖步骤。

## 平台回放取证

训练前先在当前 `local_state_root` 的任务目录保存共用的 NLU、state、questions 与 replay 源码，再运行采集与回放。目录和文件身份写入该任务已有的 `handoff.json`，清单记录逐文件字节数、SHA-256、三个 constructor 摘要及 `replay_source_sha256`。已冻结的阶段交付设为只读；后续任务从该数据路径恢复，最终将同一版本回流派生 Candidate，以 Candidate 作为唯一可编辑源码。源码或构造口径改变时保存新版本，并重新执行受影响的回放、编码和训练。

普通管理会话可用程序根 `runtime/research/platform-replay-input.mts` 批量保存实际平台HTTP回执，不手工复制工具输出。`URL` 必须匹配当前数据根登记的平台基址，`CONFIG` 是已核对模型和构造器身份的回放配置文件，`OUT` 为新目录：

```text
node --experimental-strip-types PROGRAM_ROOT/runtime/research/platform-replay-input.mts collect --url URL --asset-root ROOT --dataset-id DATASET_ID --record-id RECORD_ID --replay-config CONFIG --out OUT
node --experimental-strip-types PROGRAM_ROOT/runtime/research/platform-replay-input.mts batch --url URL --asset-root ROOT --run-id RUN_ID --replay-config CONFIG --out OUT
```

采集器内部从专用admin文件登录，Cookie只保留在内存；不把账号或Cookie放入命令参数和证据。它顺序调用只读 `datasets/read`、`datasets/source`、`runs/trace`，批量时先用 `datasets/list(include_eligibility:false)` 取得真实ID，保留完整决策分片摘要、来源身份与原生行号/seq。输出单条 `input.json` 或批量 `inputs/NNNNNN/input.json`，可直接交付变体源码中的 `decision-replay-cli prepare/finish`；采集本身不生成Qwen回执、标签或训练结果，先前已发生业务调用的输入仍由prepare如实跳过。

`manifest.json` 区分平台原文件SHA与实际HTTP响应正文SHA。回执正文通过公共脱敏合同核对后才逐字保存；发现未脱敏秘密则阻断该正文保存，不另造脱敏投影冒充原HTTP。`partial` 保留已取得的安全回执，不表示完整输入，重试使用新输出目录。此过程不修改原Run；完成后仍需实际Qwen、编码器与复核阶段各自的回执。

当前首轮主路由回放按以下协议继续；其他决策点须有相应实现，不能冒充已覆盖：

1. 从任务交接路径读取 `decision-replay-cli.ts` 及其源码清单，核对四项摘要。输入为 `{input:{readback,record_id,source_page,source_decision,trace_pages},config:{model,constructor,replay_source_sha256,native_tool_names,skill_loader_name?}}`；其中 `model` 保留实际 provider/model、repository、source_kind/source_url 与固定 revision，`constructor` 含 `state_constructor_sha256/questions_source_sha256/language_understanding_source_sha256`。目录工具名来自真实原生能力目录。
2. 用 `node --experimental-strip-types SOURCE/decision-replay-cli.ts prepare INPUT.json` 取得 `ready`、完整 `request.payload` 和 `request.request_sha256`。`skipped` 保留原因，不发模型请求。采集器提供的完整前缀必须通过回放入口自身检查，不能把发生业务调用后的状态改成首轮。
3. 按同一源码的 `QWEN_HTTP_GENERATION` 和 payload 生成实际 wire，通过原生 Job 与上述 SSH CLI 调用已固定 Qwen 服务。保存 wire 字节摘要、实际 HTTP 状态和原始响应、真实 id/model/usage。权重来源 revision 与 HTTP model alias 分别记录，不互相替换；不修写返回文本或复用不同请求的响应。
4. 将真实回执组成 `{request_sha256,receipt:{record_mode:"recorded_model",execution_id,model,content,http_transport:{request_model,expected_response_model,response_model,response_id,http_status,usage?}}}`，`request_sha256` 使用 prepare 的值，另保留 wire 字节摘要。运行 `node --experimental-strip-types SOURCE/decision-replay-cli.ts finish INPUT.json BOUND_QWEN_RECEIPT.json`；`invalid_qwen` 保留失败，`unlabeled` 只表示生成了新 IR，尚无合格标签。
5. 按下节读取新 IR 的完整 state/question 后逐题判断。旧平台题目、历史动作或标签不直接移植到新题；无法唯一作答时保留 ambiguous/invalid。完成原生证据最终化后，再按 `kev-trace-pipeline` 的 annotate/compile/split/audit 合同继续。


## IR 功能复核与来源最终化

唯一工具为程序根 `runtime/research/ir-review.mts`。先固定原始未标注 IR 文件及 SHA、通过实际编码的 sample_id 数组文件及 SHA。普通管理会话调用 `platform_agents.context`，随后用下列单命令逐片读取；不能先读取带历史动作和旧标签的整行 IR 来代替材料。完整题目在工具上限内一次返回；较长材料直接使用返回的 next_read_command 续读至 complete，不自行重建参数。上限以程序常量为准；完整内容及摘要由 finalize 核验，模型不手算或填写摘要。

```text
node --experimental-strip-types PROGRAM_ROOT/runtime/research/ir-review.mts material IR_FILE IR_SHA SAMPLE_ID CURSOR
node --experimental-strip-types PROGRAM_ROOT/runtime/research/ir-review.mts readback ANSWERS_FILE
```

模型看到全部材料后，在下一模型步骤用原生 `write` 一次保存答案 JSONL，每行仅 `{sample_id,status,value,basis}`；status 可为 verified、weak、ambiguous、invalid 或 unlabeled。核对当前题型和候选，证据不足保留不确定状态。随后调用 readback 核对同一文件与 SHA；Session、model、event seq、概率及来源元数据均不由模型填写。

用实际管理 Session 和文件摘要调用最终化；IRCLI、各文件、URL 与 ROOT 均替换为已核对的绝对路径或真实值：

```text
node --experimental-strip-types IRCLI finalize --url URL --asset-root ROOT --session-id SESSION_ID --helper-path IRCLI --ir-file IR_FILE --expected-ir-sha256 IR_SHA --sample-ids-file IDS_FILE --expected-ids-sha256 IDS_SHA --answers-file ANSWERS_FILE --expected-answers-sha256 ANSWERS_SHA --out NEW_DIR
```

finalize 只读公开原生 Session 的完整 follow/page 记录，核对模型已收到完整新输入、成功写入与同 SHA 回读，再派生 `annotations.jsonl` 和 `receipt.json`。主体、模型及读取和写回位置由原生事实产生；原 IR 和答案保留，既有输出目录不覆盖。blocked 时按 reason 核实际状态再继续，不盲目重放写入。原生日志只在内存处理，回执仅保存必要身份、摘要与位置。生成的 `{sample_id,label}` 可直接交 annotate；verified 是 AI 功能复核主张，不表示人工真值或变体 end。

## Candidate 源码导入

新 Candidate 已由平台 `compute-variants/preview` → `create` 建出后，用程序根 `runtime/research/platform-asset-edit.mts` 的 `import` 模式把冻结文本源码写入该 Candidate；目标 `--experiment-id` 必须是新建出的 Candidate，不能是固定父版，也不使用占位值。经原生 `bash`/Job 执行，长期命令保存真实 Job ID：

```text
node --experimental-strip-types PROGRAM_ROOT/runtime/research/platform-asset-edit.mts import --url PLATFORM_URL --asset-root ASSET_ROOT --agent-id AGENT_ID --experiment-id EXPERIMENT_ID --source-manifest SOURCE_MANIFEST --expected-manifest-sha256 MANIFEST_SHA --out OUTPUT_DIR
```

`PROGRAM_ROOT`、`ASSET_ROOT` 取当前受信工作区上下文，`PLATFORM_URL` 取数据根登记的平台基址，`AGENT_ID`、`EXPERIMENT_ID` 取平台实际回执，`SOURCE_MANIFEST`、`MANIFEST_SHA` 取冻结 stage 的真实清单与原字节 SHA，`OUTPUT_DIR` 是新目录；均按实际值替换，示例变量不是真实 ID。

该 CLI 内部复用已登记平台 URL/工作区核对与专用 admin 认证，Cookie 与密码不进入模型参数或输出。它读取 UTF-8 文本 source manifest 与 `files[].path`/`sha256`（可选 `bytes`），固定 source manifest 原字节 SHA；当前 stage manifest 兼容 `agent` 字段。文本文件默认导入该 Candidate 的 `dsh/managed/compute-workflow/<source path>`；`files[].target_path` 可显式指定 Candidate 内相对目标路径（用于原 Guard、Preset、Profile 等四个集成文件），不允许越出 Candidate。二进制模型仍走既有 `training-ssh transfer --direction download` 真实 Job 回收，不使用文本导入。

`files[].expected_sha256` 必须在生成完整目标正文时由 `edit/read` 取得并原样保留；允许 `null` 或 64 位小写 SHA，缺省/`null` 仅用于新建文件。实际 `edit/read` 与该基线不一致时拒写，不得重新读取最新 SHA 覆盖该基线；已同字节可只读跳过；写回执未知先 readback，不重发 apply。后续四个 integration 文件的 manifest 必须保留 `candidateIntegrationEdits` 结果中的 `expected_sha256`，11 个首次新源码默认 `null`。

实际保存严格走公开 `edit/read` 取 CAS → `edit/preview` → `edit/apply` → `edit/read` 回读 SHA，保持原字节，不手工抄写大源码。字节已相同只回读、不重复写；写回执未知先实际回读，不自动重发 apply；`readback_verified_after_unconfirmed_apply` 只表示期望字节已核到，不能冒称收到成功写回执。`--out` 须为新目录；`partial` 失败保留真实回执供恢复；stdout 只给路径、计数与摘要。导入完成不含构建、冻结或实际装载含义。

完整性、Guard 与平台原 scope 继续生效；普通管理会话可在现有用户授权内连续办理后续阶段，`plan_only` 与抽样专项仍到其原边界停止，不借 CLI 清空或扩大 scope。
