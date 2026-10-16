// extensions/task-examples/src/runtime.ts
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
var name = "task-example-tools";
var inject = ["tools", "connection", "webServer"];
var digest = (value) => createHash("sha256").update(value).digest("hex");
var runPattern = /^task-[0-9a-f-]{36}$/;
var safeCell = (value) => String(value).replace(/[\r\n|]/g, " ").slice(0, 500);
var columns = { run_id: { type: "string" }, action: { type: "string" }, cursor: { type: "number" }, source: { type: "string" }, summaries: { type: "object", additionalProperties: { type: "string" } }, train_py: { type: "string", description: "\u4EC5candidate\u52A8\u4F5C\uFF1A\u4FEE\u6539\u540E\u7684\u5B8C\u6574train.py\uFF0C\u5176\u4F59\u4E0A\u6E38\u6587\u4EF6\u4E0D\u53EF\u66F4\u6539\u3002" } };
var trainingCommit = "228791fb499afffb54b46200aca536f79142f117";
async function runTrainingProcess(command, args, options) {
  options.signal?.throwIfAborted();
  return new Promise((resolve2, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0, reason = "";
    let receipt = Promise.resolve();
    const killGroup = (signal) => {
      if (!child.pid) return;
      try {
        process.kill(process.platform === "win32" ? child.pid : -child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") reason ||= "process-cleanup-failed";
      }
    };
    const stop = (code) => {
      reason ||= code;
      killGroup("SIGTERM");
    };
    const aborted = () => terminate("cancelled");
    let forceTimer;
    const forceCleanup = () => {
      if (!forceTimer) forceTimer = setTimeout(() => killGroup("SIGKILL"), 250);
    };
    const terminate = (code) => {
      stop(code);
      forceCleanup();
    };
    options.signal?.addEventListener("abort", aborted, { once: true });
    const capture = (kind, value) => {
      const limit = options.maxBytes ?? 1024 * 1024;
      const kept = value.subarray(0, Math.max(0, limit - bytes)).toString();
      if (kind === "stdout") stdout += kept;
      else stderr += kept;
      bytes += value.length;
      if (bytes > limit) terminate("output-limit");
    };
    child.stdout?.on("data", (value) => capture("stdout", value));
    child.stderr?.on("data", (value) => capture("stderr", value));
    child.on("spawn", () => {
      if (options.onSpawn && child.pid) receipt = options.onSpawn(child.pid).catch(() => {
        terminate("process-receipt-failed");
      });
    });
    child.on("error", (error) => {
      reason ||= error.code || "spawn-error";
    });
    child.on("exit", () => {
      killGroup("SIGTERM");
      forceCleanup();
    });
    const timeout = setTimeout(() => terminate("timeout"), options.timeout);
    child.on("close", async (code, signal) => {
      await receipt;
      clearTimeout(timeout);
      if (forceTimer) clearTimeout(forceTimer);
      options.signal?.removeEventListener("abort", aborted);
      killGroup("SIGKILL");
      if (reason || code !== 0 || signal) reject(Object.assign(new Error(reason || "process-failed"), { code: reason || "process-failed", stdout, stderr }));
      else resolve2({ stdout, stderr });
    });
    if (options.signal?.aborted) terminate("cancelled");
  });
}
var execute = runTrainingProcess;
function safeTrainingLog(value) {
  return String(value ?? "").replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]+)\b/g, "[REDACTED]").replace(/(Bearer\s+)[^\s"']+/gi, "$1[REDACTED]").replace(/((?:api[_-]?key|password|token|secret)\s*[:=]\s*)[^\s,"']+/gi, "$1[REDACTED]");
}
async function fileDigest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function apply(ctx, config) {
  const base = join(process.env.DSH_HOME || "/var/lib/dsh", "task-example-artifacts");
  const workspaceRoot = process.cwd();
  const subjectPreset = config.presetId ?? { inspection: "daily-inspection-assistant", research: "multi-step-research-analyst", training: "autonomous-training-researcher" }[config.kind];
  const isSubject = (agent) => agent?.session?.header?.agentPreset === subjectPreset;
  ctx.on("agent/pre-step", ({ agent }, next) => {
    if (isSubject(agent)) agent.ctx.tools.restrict({ allow: ["task_" + config.kind] });
    return next();
  });
  ctx.tools.guard((execution) => isSubject(execution.agent) && execution.name !== "task_" + config.kind ? "\u4EFB\u52A1\u53EA\u5141\u8BB8\u5DF2\u7ED1\u5B9A\u4E1A\u52A1\u5DE5\u5177" : void 0);
  async function save(id, value) {
    value.run_id ||= id;
    await mkdir(join(base, id), { recursive: true });
    const temporary = join(base, id, `state-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, join(base, id, "state.json"));
  }
  async function state(id, session) {
    if (!runPattern.test(id)) throw new Error("\u8FD0\u884C ID \u65E0\u6548");
    const value = JSON.parse(await readFile(join(base, id, "state.json"), "utf8"));
    if (value.session_id !== session) throw new Error("\u8BE5\u4EFB\u52A1\u5C5E\u4E8E\u53E6\u4E00 Session");
    return value;
  }
  async function get(url, signal) {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(2e4)]) });
    if (!response.ok) throw new Error(`\u5916\u90E8\u8D44\u6599\u8BFB\u53D6\u5931\u8D25: HTTP ${response.status}`);
    const reader = response.body?.getReader(), chunks = [];
    let bytes = 0;
    if (reader) try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("\u8D44\u6599\u8D85\u8FC7\u8BFB\u53D6\u4E0A\u9650");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function readSourceDocument(document) {
    if (!/^references\/[a-z0-9-]+\.md$/.test(document.path) || !/^[0-9a-f]{64}$/.test(document.sha256)) throw new Error("\u56FA\u5B9A\u8D44\u6599\u8DEF\u5F84\u6216\u6458\u8981\u914D\u7F6E\u65E0\u6548");
    const file = resolve(workspaceRoot, document.path);
    const info = await lstat(file);
    if (!info.isFile() || info.size > 2 * 1024 * 1024 || await realpath(file) !== file) throw new Error("\u56FA\u5B9A\u8D44\u6599\u5FC5\u987B\u662F\u5DE5\u4F5C\u533Areferences\u5185\u7684\u666E\u901A\u6587\u4EF6");
    const bytes = await readFile(file);
    if (createHash("sha256").update(bytes).digest("hex") !== document.sha256) throw new Error("\u56FA\u5B9A\u8D44\u6599\u6458\u8981\u4E0D\u5339\u914D\uFF0C\u8BF7\u6838\u5BF9\u5DF2\u7ED1\u5B9A\u7248\u672C\uFF1B\u672A\u5C1D\u8BD5\u8054\u7F51\u66FF\u4EE3");
    return bytes.toString("utf8");
  }
  async function report(id, value, content, csv) {
    const bytes = Buffer.from(content);
    await writeFile(join(base, id, "report.md"), bytes);
    if (csv) await writeFile(join(base, id, "devices.csv"), csv);
    value.report_sha256 = digest(content);
    value.completed_at = (/* @__PURE__ */ new Date()).toISOString();
    await save(id, value);
    return {
      run_id: id,
      completed: true,
      source_kind: value.source_kind,
      report_sha256: value.report_sha256,
      markdown: content,
      ...csv ? { csv } : {},
      download_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=report.md`,
      ...csv ? { csv_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=devices.csv` } : {}
    };
  }
  const fixedTrainingFiles = ["prepare.py", "pyproject.toml", "uv.lock"];
  async function trainingPreflight(signal) {
    const workspace = join(process.env.DSH_HOME || "/var/lib/dsh", "autoresearch");
    const checks = { nvidia_gpu: false, pytorch_cuda: false, uv: false, fixed_source: false, fixed_evaluation_files: false, prepared_data: false };
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...process.env.CUDA_VISIBLE_DEVICES ? { CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES } : {} };
    try {
      const r = await execute("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"], { timeout: 5e3, env, signal });
      checks.nvidia_gpu = Boolean(r.stdout.trim());
    } catch {
    }
    try {
      await execute("uv", ["--version"], { timeout: 5e3, env, signal });
      checks.uv = true;
    } catch {
    }
    try {
      const r = await execute("git", ["rev-parse", "HEAD"], { cwd: workspace, timeout: 5e3, env, signal });
      checks.fixed_source = r.stdout.trim() === trainingCommit;
    } catch {
    }
    if (checks.fixed_source) try {
      await execute("git", ["diff", "--exit-code", trainingCommit, "--", ...fixedTrainingFiles], { cwd: workspace, timeout: 5e3, env, signal });
      checks.fixed_evaluation_files = true;
    } catch {
    }
    if (checks.fixed_source && checks.uv && checks.nvidia_gpu) try {
      await execute("uv", ["run", "--no-sync", "python", "-c", "import torch; assert torch.cuda.is_available()"], { cwd: workspace, timeout: 2e4, env, signal });
      checks.pytorch_cuda = true;
    } catch {
    }
    try {
      const cache = join(env.HOME, ".cache/autoresearch");
      const shards = (await readdir(join(cache, "data"))).filter((file) => /^shard_\d{5}\.parquet$/.test(file));
      const required = [join(cache, "tokenizer/tokenizer.pkl"), join(cache, "tokenizer/token_bytes.pt"), ...shards.map((file) => join(cache, "data", file))];
      checks.prepared_data = shards.includes("shard_06542.parquet") && shards.length >= 2 && (await Promise.all(required.map((path) => stat(path)))).every((value) => value.isFile() && value.size > 0);
    } catch {
    }
    signal.throwIfAborted();
    return { workspace, env, checks, ready: Object.values(checks).every(Boolean) };
  }
  async function trainingInputs(workspace, home) {
    const cache = join(home, ".cache/autoresearch");
    const dataFiles = (await readdir(join(cache, "data"))).filter((file) => /^shard_\d{5}\.parquet$/.test(file)).sort();
    const paths = [
      ...fixedTrainingFiles.map((file) => ["source/" + file, join(workspace, file)]),
      ...["tokenizer.pkl", "token_bytes.pt"].map((file) => ["tokenizer/" + file, join(cache, "tokenizer", file)]),
      ...dataFiles.map((file) => ["data/" + file, join(cache, "data", file)])
    ];
    return Object.fromEntries(await Promise.all(paths.map(async ([key, path]) => [key, await fileDigest(path)])));
  }
  const processAlive = (pid) => {
    if (!Number.isInteger(pid) || Number(pid) < 1) return false;
    try {
      process.kill(Number(pid), 0);
      return true;
    } catch (error) {
      return error.code !== "ESRCH";
    }
  };
  async function restoreTrainingScript(id, value, workspace) {
    const file = value.best ? "best-train.py" : "attempt-0/train.py";
    const script = await readFile(join(base, id, file), "utf8");
    const expected = value.best?.script_sha256 ?? value.attempts[0]?.script_sha256;
    if (digest(script) !== expected) throw new Error("\u56DE\u9000\u6E90\u7801\u6458\u8981\u4E0D\u5339\u914D\uFF0C\u9700\u8981\u4EBA\u5DE5\u6838\u5BF9");
    await writeFile(join(workspace, "train.py"), script);
  }
  async function trainingStatus(id, session) {
    const value = await state(id, session);
    const active = value.attempts?.find((attempt) => attempt.status === "running");
    if (active && !processAlive(active.owner_pid) && !processAlive(active.process_id)) {
      active.status = "interrupted";
      active.failure = "process-ended-without-receipt";
      active.finished_at = (/* @__PURE__ */ new Date()).toISOString();
      try {
        await restoreTrainingScript(id, value, value.workspace);
        active.rollback = "restored";
      } catch {
        active.rollback = "needs-intervention";
      }
      await save(id, value);
      const directory = join(base, id, `attempt-${active.index}`);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "failure.txt"), "\u8BAD\u7EC3\u8FDB\u7A0B\u7ED3\u675F\u4F46\u6CA1\u6709\u5B8C\u6574\u56DE\u6267\uFF1B\u4FDD\u7559\u539F\u5C1D\u8BD5\u5E76\u6309\u65E2\u6709\u4EE3\u7801\u6458\u8981\u56DE\u9000\u3002");
      const rows = value.attempts.map((attempt) => [attempt.script_sha256, attempt.val_bpb ?? "", attempt.status, attempt.kind].join("	"));
      await writeFile(join(base, id, "results.tsv"), "source_sha256	val_bpb	status	kind\n" + rows.join("\n") + "\n");
      try {
        const lock = JSON.parse(await readFile(join(base, "training.lock"), "utf8"));
        if (lock.run_id === id && !processAlive(lock.owner_pid)) await unlink(join(base, "training.lock"));
      } catch {
      }
    }
    return {
      ...value,
      resumable: Boolean(value.best) && value.candidates_used < 3 && Date.now() - Date.parse(value.created_at) < 60 * 6e4 && !value.attempts?.some((attempt) => attempt.status === "running") && !value.fixed_inputs_changed,
      note: "\u6062\u590D\u4E0D\u4F1A\u91CD\u7F6E\u5019\u9009\u6B21\u6570\u548C\u4EFB\u52A1\u65F6\u9650\uFF1B\u672A\u77E5\u8FDB\u7A0B\u4E0D\u91CD\u590D\u542F\u52A8\u3002"
    };
  }
  async function training(args, session, signal) {
    if (args.action === "status") return trainingStatus(args.run_id || "", session);
    if (!["preflight", "baseline", "candidate"].includes(args.action)) throw new Error("\u8BAD\u7EC3\u52A8\u4F5C\u5FC5\u987B\u4E3Apreflight\u3001baseline\u3001candidate\u6216status");
    const indexPath = join(base, "training-session-" + digest(session) + ".json");
    let existing;
    try {
      existing = JSON.parse(await readFile(indexPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (args.action === "baseline" && existing) throw new Error(`\u672C Session \u5DF2\u4F7F\u7528\u4E00\u6B21\u57FA\u7EBF\uFF1B\u8BF7\u7528 status \u67E5\u8BE2 ${existing.run_id}\uFF0C\u4E0D\u80FD\u91CD\u65B0\u5F00\u59CB\u4EE5\u91CD\u7F6E\u9884\u7B97`);
    let value = args.action === "candidate" ? await state(args.run_id || "", session) : void 0;
    if (value && (existing?.run_id !== args.run_id || value.source_kind !== "real_training")) throw new Error("\u5019\u9009\u5FC5\u987B\u5C5E\u4E8E\u672C Session \u5DF2\u767B\u8BB0\u7684\u8BAD\u7EC3\u4EFB\u52A1");
    if (value?.fixed_inputs_changed || value?.attempts?.some((attempt) => attempt.status === "running")) throw new Error("\u5148\u524D\u8BAD\u7EC3\u6216\u56FA\u5B9A\u8F93\u5165\u72B6\u6001\u672A\u786E\u8BA4\uFF0C\u5148\u67E5\u8BE2 status\uFF0C\u4E0D\u80FD\u91CD\u590D\u53D1\u8D77");
    if (value && (!value.best || value.candidates_used >= 3)) throw new Error("\u5FC5\u987B\u5148\u6709\u6709\u6548\u57FA\u7EBF\uFF0C\u4E14\u5019\u9009\u5B9E\u9A8C\u6700\u591A\u4E09\u6B21");
    if (value && Date.now() - Date.parse(value.created_at) >= 60 * 6e4) throw new Error("\u8BAD\u7EC3\u4EFB\u52A1\u603B\u65F6\u9650\u5DF2\u5230");
    const preflight = await trainingPreflight(signal);
    if (args.action === "preflight" || !preflight.ready) return {
      ready: preflight.ready,
      checks: preflight.checks,
      status: preflight.ready ? "ready" : "training-resource-unavailable",
      inference_api_is_training_backend: false,
      fixed_source: trainingCommit,
      required_next: "\u5728\u5B9E\u4F8BHOME/autoresearch\u51C6\u5907\u5DF2\u5BA1\u9605\u7684\u56FA\u5B9A\u6765\u6E90\u3001\u4F9D\u8D56\u53CA\u8BAD\u7EC3/\u9A8C\u8BC1\u6570\u636E\uFF1B\u9884\u68C0\u5168\u90E8\u901A\u8FC7\u540E\u624D\u5141\u8BB8baseline\u548Ccandidate\u3002\u6CA1\u6709\u8BAD\u7EC3\u6267\u884C\u56DE\u6267\u65F6\u4E0D\u751F\u6210\u8BAD\u7EC3\u6307\u6807\u3002"
    };
    if (args.action === "candidate" && (typeof args.train_py !== "string" || !args.train_py.trim() || Buffer.byteLength(args.train_py) > 128 * 1024)) throw new Error("\u5019\u9009\u5FC5\u987B\u63D0\u4F9B\u4E0D\u8D85\u8FC7128KiB\u7684train.py");
    if (args.action === "candidate" && /\b(?:sk-[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]+)\b/.test(args.train_py)) throw new Error("\u8BAD\u7EC3\u6E90\u7801\u4E0D\u80FD\u5305\u542BAPI\u5BC6\u94A5\u6216\u8BBF\u95EE\u51ED\u636E");
    await mkdir(base, { recursive: true });
    const lockPath = join(base, "training.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("\u8BAD\u7EC3\u5DE5\u4F5C\u533A\u5DF2\u5360\u7528\u6216\u5B58\u5728\u672A\u786E\u8BA4\u7684\u4E2D\u65AD\uFF0C\u8BF7\u5148\u67E5\u8BE2\u539F\u4EFB\u52A1\u72B6\u6001");
      throw error;
    }
    const id = args.action === "baseline" ? `task-${randomUUID()}` : args.run_id;
    await lock.writeFile(JSON.stringify({ run_id: id, owner_pid: process.pid }));
    try {
      if (args.action === "candidate") value = await state(id, session);
      const script = join(preflight.workspace, "train.py");
      const previous = await readFile(script, "utf8");
      const frozen = await trainingInputs(preflight.workspace, preflight.env.HOME);
      if (args.action === "baseline") {
        const upstream = await execute("git", ["show", `${trainingCommit}:train.py`], { cwd: preflight.workspace, env: preflight.env, timeout: 5e3, signal });
        if (digest(previous) !== digest(upstream.stdout)) throw new Error("\u57FA\u7EBFtrain.py\u5FC5\u987B\u4E0E\u56FA\u5B9A\u4E0A\u6E38\u7248\u672C\u4E00\u81F4");
        value = {
          session_id: session,
          source_kind: "real_training",
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          workspace: preflight.workspace,
          fixed_source: trainingCommit,
          fixed_inputs: frozen,
          attempts: [],
          best: null,
          candidates_used: 0
        };
        await save(id, value);
        await writeFile(indexPath, JSON.stringify({ run_id: id }), { flag: "wx" });
      } else {
        if (JSON.stringify(frozen) !== JSON.stringify(value.fixed_inputs)) throw new Error("\u56FA\u5B9A\u8BC4\u4F30\u3001\u6570\u636E\u6216\u4F9D\u8D56\u4E0E\u57FA\u7EBF\u4E0D\u4E00\u81F4\uFF0C\u4E0D\u80FD\u6BD4\u8F83\u6307\u6807");
        if (digest(previous) !== value.best.script_sha256) throw new Error("\u5F53\u524D\u8BAD\u7EC3\u4EE3\u7801\u4E0E\u5DF2\u4FDD\u7559\u7248\u672C\u4E0D\u4E00\u81F4\uFF0C\u9700\u8981\u5148\u6838\u5BF9");
        if (value.candidates_used >= 3) throw new Error("\u5019\u9009\u5B9E\u9A8C\u6700\u591A\u4E09\u6B21");
      }
      const remaining = 60 * 6e4 - (Date.now() - Date.parse(value.created_at));
      if (remaining <= 0) throw new Error("\u8BAD\u7EC3\u4EFB\u52A1\u603B\u65F6\u9650\u5DF2\u5230");
      const attempt = {
        index: value.attempts.length,
        kind: args.action,
        status: "running",
        owner_pid: process.pid,
        started_at: (/* @__PURE__ */ new Date()).toISOString(),
        script_sha256: digest(args.action === "candidate" ? args.train_py : previous)
      };
      if (args.action === "candidate") value.candidates_used++;
      value.attempts.push(attempt);
      await save(id, value);
      const attemptPath = join(base, id, `attempt-${attempt.index}`);
      await mkdir(attemptPath, { recursive: true });
      await writeFile(join(attemptPath, "train.py"), args.action === "candidate" ? args.train_py : previous);
      let accepted = false;
      try {
        if (args.action === "candidate") await writeFile(script, args.train_py);
        const result = await execute("uv", ["run", "--no-sync", "train.py"], {
          cwd: preflight.workspace,
          env: preflight.env,
          signal,
          timeout: Math.min(6e5, remaining),
          onSpawn: async (pid) => {
            attempt.process_id = pid;
            await save(id, value);
          }
        });
        await writeFile(join(attemptPath, "stdout.log"), safeTrainingLog(result.stdout));
        await writeFile(join(attemptPath, "stderr.log"), safeTrainingLog(result.stderr));
        const after = await trainingInputs(preflight.workspace, preflight.env.HOME);
        if (JSON.stringify(after) !== JSON.stringify(value.fixed_inputs)) {
          value.fixed_inputs_changed = true;
          throw new Error("\u56FA\u5B9A\u8BC4\u4F30\u3001\u6570\u636E\u6216\u4F9D\u8D56\u53D1\u751F\u53D8\u5316\uFF0C\u672C\u6B21\u6307\u6807\u4E0D\u63A5\u53D7");
        }
        if (digest(await readFile(script, "utf8")) !== attempt.script_sha256) throw new Error("\u8FD0\u884C\u671F\u95F4train.py\u53D1\u751F\u53D8\u5316\uFF0C\u672C\u6B21\u6307\u6807\u4E0D\u63A5\u53D7");
        const metrics = [...result.stdout.matchAll(/^val_bpb:\s*([0-9]+(?:\.[0-9]+)?)\s*$/gm)];
        if (metrics.length !== 1 || !Number.isFinite(Number(metrics[0][1]))) throw new Error("\u771F\u5B9E\u8BAD\u7EC3\u672A\u8FD4\u56DE\u552F\u4E00\u6709\u6548val_bpb");
        attempt.val_bpb = Number(metrics[0][1]);
        attempt.metric_source = "executed_train_stdout";
        const improved = !value.best || attempt.val_bpb < value.best.val_bpb;
        if (improved) {
          await writeFile(join(base, id, "best-train.py"), await readFile(script));
          value.best = { index: attempt.index, val_bpb: attempt.val_bpb, script_sha256: attempt.script_sha256 };
        }
        accepted = improved;
        attempt.status = accepted ? "keep" : "discard";
      } catch (error) {
        attempt.status = signal.aborted ? "cancelled" : "failed";
        attempt.failure = error.code || error.name || "training-error";
        try {
          if (JSON.stringify(await trainingInputs(preflight.workspace, preflight.env.HOME)) !== JSON.stringify(value.fixed_inputs)) value.fixed_inputs_changed = true;
        } catch {
          value.fixed_inputs_changed = true;
        }
        if (error.stdout !== void 0) await writeFile(join(attemptPath, "stdout.log"), safeTrainingLog(error.stdout));
        if (error.stderr !== void 0) await writeFile(join(attemptPath, "stderr.log"), safeTrainingLog(error.stderr));
        else await writeFile(join(attemptPath, "failure.txt"), safeTrainingLog(error.message));
      } finally {
        if (!accepted) {
          await writeFile(script, previous);
          attempt.rollback = "restored";
        }
        attempt.finished_at = (/* @__PURE__ */ new Date()).toISOString();
        await save(id, value);
        const rows = value.attempts.map((a) => [a.script_sha256, a.val_bpb ?? "", a.status, a.kind].join("	"));
        await writeFile(join(base, id, "results.tsv"), "source_sha256	val_bpb	status	kind\n" + rows.join("\n") + "\n");
      }
      return {
        run_id: id,
        attempt,
        best: value.best,
        candidates_used: value.candidates_used,
        max_candidates: 3,
        source_kind: "real_training",
        fixed_inputs_changed: Boolean(value.fixed_inputs_changed),
        metric_source: "executed_train_stdout",
        independently_evaluated: false,
        results_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=results.tsv`,
        ...value.best ? { best_code_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=best-train.py` } : {},
        artifacts: ["results.tsv", ...value.best ? ["best-train.py"] : [], `attempt-${attempt.index}/stdout.log`]
      };
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  ctx.connection.fetch.register({ path: "/api/task-examples/artifact", methods: ["GET"], requestBody: "buffered", fetch: async (request) => {
    try {
      const url = new URL(request.url), id = url.searchParams.get("run_id") || "", file = url.searchParams.get("file") || "";
      const allowedFile = ["report.md", "devices.csv", "results.tsv", "best-train.py"].includes(file) || /^attempt-(?:0|[1-9]\d*)\/(?:stdout\.log|stderr\.log|failure\.txt|train\.py)$/.test(file);
      if (!runPattern.test(id) || !allowedFile) return new Response("\u53C2\u6570\u65E0\u6548", { status: 400 });
      const metadata = JSON.parse(await readFile(join(base, id, "state.json"), "utf8"));
      if (!metadata.session_id || metadata.run_id !== id) return new Response("\u4EFB\u52A1\u8BB0\u5F55\u65E0\u6548", { status: 404 });
      const bytes = await readFile(join(base, id, file));
      return new Response(bytes, { headers: {
        "content-type": file.endsWith(".csv") ? "text/csv; charset=utf-8" : file.endsWith(".tsv") ? "text/tab-separated-values; charset=utf-8" : file.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${id}-${file}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      } });
    } catch {
      return new Response("\u4EA7\u7269\u5C1A\u4E0D\u5B58\u5728", { status: 404 });
    }
  } });
  const taskLocks = /* @__PURE__ */ new Map();
  async function serializeTask(key, operation) {
    const previous = taskLocks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => void 0).then(operation);
    taskLocks.set(key, current);
    try {
      return await current;
    } finally {
      if (taskLocks.get(key) === current) taskLocks.delete(key);
    }
  }
  ctx.tools.register({
    name: `task_${config.kind}`,
    description: config.kind === "inspection" ? "\u57FA\u7840\u8D44\u4EA7\u53F0\u8D26\u53EA\u8BFB\u5DE1\u68C0\uFF1Astart\u56FA\u5B9A\u8D44\u4EA7\u5FEB\u7167\uFF0Cpage\u6309cursor\u8BFB\u5B8C\u5206\u9875\uFF0Creport\u6821\u9A8C\u5DF2\u8BFB\u53D6\u5B8C\u6574\u96C6\u5408\u5E76\u751F\u6210\u5B9E\u9645Markdown/CSV\u62A5\u544A\u3002\u6570\u636E\u6765\u81EA\u57FA\u7840Mock\uFF0C\u4E0D\u80FD\u79F0\u4E3A\u771F\u5B9E\u8BBE\u5907\u5065\u5EB7\u68C0\u6D4B\u3002" : config.kind === "research" ? "\u591A\u6B65\u9AA4\u8D44\u6599\u7814\u7A76\uFF1Astart\u521B\u5EFA\u4EFB\u52A1\uFF0Ccollect\u6309\u660E\u786E\u914D\u7F6E\u8BFB\u53D6\u5728\u7EBF\u6B63\u6587\u6216\u6821\u9A8C\u672C\u5730\u56FA\u5B9A\u5B98\u65B9\u8D44\u6599\u5FEB\u7167\uFF0Creport\u7528comparison\u7ED9\u51FA\u8DE8\u6765\u6E90\u6BD4\u8F83\u7ED3\u8BBA\u3001summaries\u4FDD\u7559\u5404URL\u7684\u76F8\u5173\u4F9D\u636E\uFF0C\u751F\u6210\u5E26\u6765\u6E90\u7684\u62A5\u544A\uFF1B\u8D44\u6599\u987B\u5168\u90E8\u8BFB\u53D6\uFF0C\u4E0D\u81EA\u52A8\u5207\u6362\u6570\u636E\u6765\u6E90\u3002" : "\u81EA\u4E3B\u8BAD\u7EC3\u7814\u7A76\uFF1Apreflight\u6838\u67E5\u771F\u5B9EGPU\u3001\u56FA\u5B9A\u6765\u6E90\u3001uv/PyTorch\u4E0E\u6570\u636E\uFF1Bbaseline\u5EFA\u7ACB\u4E00\u6B21\u771F\u5B9E\u57FA\u7EBF\uFF0Ccandidate\u53EA\u4FEE\u6539train.py\u5E76\u5B9E\u9645\u8BAD\u7EC3\u8BC4\u4F30\uFF0C\u6700\u591A\u4E09\u4E2A\u5019\u9009\u3001\u5355\u6B21\u5341\u5206\u949F\u3001\u603B\u65F6\u9650\u4E00\u5C0F\u65F6\u3002\u66F4\u4F18\u4FDD\u7559\u3001\u5931\u8D25\u56DE\u9000\uFF0Cstatus\u8BFB\u53D6\u539F\u8FD0\u884C\u3002\u6CA1\u6709\u771F\u5B9E\u7B97\u529B\u65F6\u53EA\u62A5\u544A\u7F3A\u53E3\uFF0C\u4E0D\u4EA7\u751F\u6A21\u62DF\u6307\u6807\u3002",
    parameters: { type: "object", properties: config.kind === "research" ? { ...columns, comparison: { type: "string", description: "report\u5FC5\u586B\uFF1A\u7EFC\u5408\u5168\u90E8\u5DF2\u8BFB\u6765\u6E90\uFF0C\u6A2A\u5411\u6BD4\u8F83\u7528\u9014\u3001\u4EFB\u52A1\u673A\u5236\u3001\u8FD0\u884C\u4E0E\u8BB8\u53EF\u524D\u63D0\uFF0C\u7ED9\u51FA\u5F53\u524D\u5E73\u53F0\u53EF\u501F\u9274\u53CA\u4E0D\u53EF\u76F4\u63A5\u91C7\u7528\u7684\u7ED3\u8BBA\uFF1B\u4E0D\u662F\u4E24\u4EFD\u6458\u8981\u7684\u91CD\u590D\u62FC\u63A5\u3002" } } : columns, required: ["action"], additionalProperties: false },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    async execute(args, execution) {
      return serializeTask(args.run_id || execution.agent.session.header.id, async () => {
        const session = execution.agent.session.header.id, signal = execution.signal;
        if (config.kind === "training") {
          return training(args, session, signal);
        }
        if (args.action === "start") {
          const id2 = `task-${randomUUID()}`;
          const value2 = { session_id: session, created_at: (/* @__PURE__ */ new Date()).toISOString(), source_kind: config.kind === "inspection" ? "basic_mock" : "live_public_documents", read: [] };
          if (config.kind === "inspection") {
            const all = JSON.parse(await get(config.assetUrl || "http://127.0.0.1:53001/api/v1/assets", signal));
            if (!Array.isArray(all)) throw new Error("\u8D44\u4EA7\u63A5\u53E3\u672A\u8FD4\u56DE\u5217\u8868");
            value2.rows = all.filter((r) => /^asset-000[1-5]$/.test(r.asset_id)).map((r) => ({ asset_id: r.asset_id, hostname: r.hostname, asset_type: r.asset_type, risk_score: r.risk_score }));
            if (value2.rows.length !== 5 || new Set(value2.rows.map((r) => r.asset_id)).size !== 5) throw new Error("\u56FA\u5B9A\u57FA\u7840\u8D44\u4EA7\u8303\u56F4\u4E0D\u5B8C\u6574\uFF0C\u4E0D\u80FD\u751F\u6210\u5168\u91CF\u62A5\u544A");
            value2.source_sha256 = digest(JSON.stringify(value2.rows));
          } else if (config.sourceDocuments !== void 0) {
            if (config.sourceUrls !== void 0 || !config.sourceDocuments.length || config.sourceDocuments.some((document) => !/^https:\/\//.test(document.url) || !/^references\/[a-z0-9-]+\.md$/.test(document.path) || !/^[0-9a-f]{64}$/.test(document.sha256)) || new Set(config.sourceDocuments.map((document) => document.url)).size !== config.sourceDocuments.length) throw new Error("\u56FA\u5B9A\u8D44\u6599\u5FEB\u7167\u914D\u7F6E\u65E0\u6548\uFF0C\u4E0D\u80FD\u4E0E\u5728\u7EBF\u6765\u6E90\u540C\u65F6\u914D\u7F6E");
            value2.source_kind = "fixed_public_document_snapshot";
            value2.source_documents = config.sourceDocuments.map((document) => ({ ...document }));
            value2.sources = value2.source_documents.map((document) => document.url);
          } else value2.sources = config.sourceUrls || [];
          await save(id2, value2);
          return { run_id: id2, source_kind: value2.source_kind, ...value2.rows ? { total: value2.rows.length, next_cursor: 0, source_sha256: value2.source_sha256 } : { sources: value2.sources } };
        }
        const id = args.run_id || "", value = await state(id, session);
        if (args.action === "status") return { run_id: id, read: value.read, completed: Boolean(value.completed_at), source_kind: value.source_kind };
        if (config.kind === "inspection" && args.action === "page") {
          const cursor = args.cursor;
          if (!Number.isInteger(cursor) || cursor < 0 || cursor >= value.rows.length || cursor % 2) throw new Error("\u5206\u9875cursor\u65E0\u6548");
          const rows = value.rows.slice(cursor, cursor + 2);
          value.read = [.../* @__PURE__ */ new Set([...value.read, ...rows.map((r) => r.asset_id)])];
          await save(id, value);
          return { run_id: id, rows, next_cursor: cursor + 2 < value.rows.length ? cursor + 2 : null, total: value.rows.length, source_kind: value.source_kind };
        }
        if (config.kind === "inspection" && args.action === "report") {
          const missing = value.rows.filter((r) => !value.read.includes(r.asset_id)).map((r) => r.asset_id);
          if (missing.length) throw new Error(`\u5C1A\u672A\u8BFB\u53D6\u5168\u90E8\u8BBE\u5907\uFF0C\u4E0D\u80FD\u4EA4\u4ED8\u5B8C\u6574\u62A5\u544A\uFF1B\u7F3A\u5C11 ${missing.join("\u3001")}`);
          const rows = value.rows;
          const text = `# \u57FA\u7840\u8D44\u4EA7\u53F0\u8D26\u5DE1\u68C0\u62A5\u544A

\u6765\u6E90\uFF1A\u57FA\u7840\u6A21\u62DF\u63A5\u53E3\uFF0C\u672A\u8FDE\u63A5\u6216\u68C0\u6D4B\u771F\u5B9E\u8BBE\u5907\u3002

\u8FD0\u884C\uFF1A${id}

\u8BBE\u5907\u603B\u6570\uFF1A${rows.length}

| \u8BBE\u5907ID | \u72B6\u6001 | \u540D\u79F0 | \u7C7B\u578B | \u53F0\u8D26\u98CE\u9669\u5206\u503C |
| --- | --- | --- | --- | --- |
${rows.map((r) => `| ${r.asset_id} | \u53F0\u8D26\u5DF2\u8BB0\u5F55 | ${safeCell(r.hostname)} | ${safeCell(r.asset_type)} | ${r.risk_score} |`).join("\n")}

\u6458\u8981\uFF1A\u5DF2\u6838\u5BF9\u5168\u90E8 ${rows.length} \u53F0\u6307\u5B9A\u57FA\u7840\u8D44\u4EA7\u7684\u53F0\u8D26\u8BB0\u5F55\uFF1B\u672C\u62A5\u544A\u4E0D\u63D0\u4F9B\u5B9E\u65F6\u8BBE\u5907\u5065\u5EB7\u7ED3\u8BBA\u3002
`;
          const csv = "device_id,status,hostname,asset_type,risk_score\n" + rows.map((r) => [r.asset_id, "\u53F0\u8D26\u5DF2\u8BB0\u5F55", r.hostname, r.asset_type, r.risk_score].map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(",")).join("\n") + "\n";
          return { ...await report(id, value, text, csv), device_count: rows.length, device_ids: rows.map((r) => r.asset_id) };
        }
        if (config.kind === "research" && args.action === "collect") {
          if (!value.sources.includes(args.source)) throw new Error("\u8D44\u6599\u4E0D\u5728\u672C\u4EFB\u52A1\u56FA\u5B9A\u6765\u6E90\u8303\u56F4\u5185");
          if (value.documents?.[args.source]) return { run_id: id, source: args.source, source_kind: value.source_kind, ...value.documents[args.source], reused_snapshot: true };
          const document = value.source_documents?.find((item) => item.url === args.source);
          if (value.source_kind === "fixed_public_document_snapshot" && !document) throw new Error("\u56FA\u5B9A\u8D44\u6599\u767B\u8BB0\u7F3A\u5931\uFF1B\u672A\u5C1D\u8BD5\u8054\u7F51\u66FF\u4EE3");
          const content = document ? await readSourceDocument(document) : await get(args.source, signal);
          value.documents ||= {};
          value.documents[args.source] = { sha256: digest(content), content: content.slice(0, 24e3), read_at: (/* @__PURE__ */ new Date()).toISOString() };
          value.read = [.../* @__PURE__ */ new Set([...value.read, args.source])];
          await save(id, value);
          return { run_id: id, source: args.source, source_kind: value.source_kind, ...value.documents[args.source], truncated: content.length > 24e3 };
        }
        if (config.kind === "research" && args.action === "report") {
          if (!value.sources.length || value.sources.some((url) => !value.read.includes(url))) throw new Error("\u8FD8\u6709\u8D44\u6599\u672A\u8BFB\u53D6\uFF0C\u4E0D\u80FD\u4EA4\u4ED8\u5B8C\u6574\u62A5\u544A");
          if (value.sources.some((url) => typeof args.summaries?.[url] !== "string" || !args.summaries[url].trim())) throw new Error("\u62A5\u544A\u987B\u9010\u9879\u5305\u542B\u5DF2\u8BFB\u6765\u6E90\u7684\u7ED3\u8BBA");
          if (typeof args.comparison !== "string" || !args.comparison.trim()) throw new Error("\u62A5\u544A\u987B\u5305\u542B\u8DE8\u6765\u6E90\u6BD4\u8F83\u7ED3\u8BBA\uFF0C\u4E0D\u80FD\u4EC5\u62FC\u63A5\u9010\u9879\u6458\u8981");
          value.comparison = args.comparison.trim();
          value.summaries = Object.fromEntries(value.sources.map((url) => [url, args.summaries[url].trim()]));
          const basis = value.source_kind === "fixed_public_document_snapshot" ? "\u672C\u62A5\u544A\u4F9D\u636E\u5DF2\u6821\u9A8C\u6458\u8981\u7684\u5B98\u65B9\u56FA\u5B9A\u63D0\u4EA4\u8D44\u6599\u5FEB\u7167\uFF1B\u8D44\u6599\u65F6\u70B9\u4EE5\u5404\u539F\u59CB\u94FE\u63A5\u4E2D\u7684\u63D0\u4EA4\u4E3A\u51C6\uFF0C\u672C\u6B21\u6CA1\u6709\u5B9E\u65F6\u8BBF\u95EE\u7F51\u7AD9\u3002" : "\u672C\u62A5\u544A\u4F9D\u636E\u672C\u6B21\u5B9E\u9645\u8BFB\u53D6\u7684\u5728\u7EBF\u8D44\u6599\uFF1B\u8BFB\u53D6\u65F6\u70B9\u89C1\u5404\u6765\u6E90\u3002";
          const text = "# \u591A\u6B65\u9AA4\u4E1A\u52A1\u8D44\u6599\u8C03\u7814\u62A5\u544A\n\n## \u6BD4\u8F83\u7ED3\u8BBA\n\n" + value.comparison + "\n\n" + basis + "\n\n## \u6765\u6E90\u8981\u70B9\u4E0E\u4F9D\u636E\n\n" + value.sources.map((url, i) => `### \u6765\u6E90 ${i + 1}

${value.summaries[url]}

\u6765\u6E90\uFF1A[\u539F\u59CB\u8D44\u6599](${url})\uFF1B\u8BFB\u53D6\u65F6\u95F4\uFF1A${value.documents[url].read_at}\uFF1B\u6458\u8981\uFF1A${value.documents[url].sha256}
`).join("\n");
          return { ...await report(id, value, text), source_count: value.sources.length, note: "\u5DF2\u5B8C\u6210\u6765\u6E90\u5B8C\u6574\u6027\u6821\u9A8C\uFF1B\u8BED\u4E49\u51C6\u786E\u6027\u9700\u7531\u72EC\u7ACB\u8BC4\u6D4B\u6838\u5BF9\u3002" };
        }
        throw new Error("\u672C\u4E1A\u52A1\u4E0D\u652F\u6301\u6B64\u52A8\u4F5C");
      });
    }
  });
}
export {
  apply,
  inject,
  name,
  runTrainingProcess
};
