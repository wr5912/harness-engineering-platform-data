// extensions/task-examples/src/runtime.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var name = "task-example-tools";
var inject = ["tools", "connection", "webServer"];
var execute = promisify(execFile);
var digest = (value) => createHash("sha256").update(value).digest("hex");
var runPattern = /^task-[0-9a-f-]{36}$/;
var safeCell = (value) => String(value).replace(/[\r\n|]/g, " ").slice(0, 500);
var columns = { run_id: { type: "string" }, action: { type: "string", required: true }, cursor: { type: "number" }, source: { type: "string" }, summaries: { type: "object", additionalProperties: { type: "string" } }, train_py: { type: "string", description: "\u4EC5candidate\u52A8\u4F5C\uFF1A\u4FEE\u6539\u540E\u7684\u5B8C\u6574train.py\uFF0C\u5176\u4F59\u4E0A\u6E38\u6587\u4EF6\u4E0D\u53EF\u66F4\u6539\u3002" } };
var trainingCommit = "228791fb499afffb54b46200aca536f79142f117";
function apply(ctx, config) {
  const base = join(process.env.DSH_HOME || "/var/lib/dsh", "task-example-artifacts");
  async function save(id, value) {
    await mkdir(join(base, id), { recursive: true });
    await writeFile(join(base, id, "state.json"), JSON.stringify(value, null, 2));
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
    const content = await response.text();
    if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error("\u8D44\u6599\u8D85\u8FC7\u8BFB\u53D6\u4E0A\u9650");
    return content;
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
  async function trainingPreflight() {
    const workspace = join(process.env.DSH_HOME || "/var/lib/dsh", "autoresearch");
    const checks = { nvidia_gpu: false, pytorch_cuda: false, uv: false, fixed_source: false, prepared_data: false };
    try {
      const r = await execute("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"], { timeout: 5e3 });
      checks.nvidia_gpu = Boolean(r.stdout.trim());
    } catch {
    }
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...process.env.CUDA_VISIBLE_DEVICES ? { CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES } : {} };
    try {
      await execute("uv", ["--version"], { timeout: 5e3, env });
      checks.uv = true;
    } catch {
    }
    try {
      const r = await execute("git", ["rev-parse", "HEAD"], { cwd: workspace, timeout: 5e3, env });
      checks.fixed_source = r.stdout.trim() === trainingCommit;
    } catch {
    }
    if (checks.fixed_source && checks.uv) try {
      await execute("uv", ["run", "--no-sync", "python", "-c", "import torch; assert torch.cuda.is_available()"], { cwd: workspace, timeout: 2e4, env });
      checks.pytorch_cuda = true;
    } catch {
    }
    try {
      await readFile(join(process.env.HOME || "/root", ".cache/autoresearch/tokenizer/tokenizer.pkl"));
      checks.prepared_data = true;
    } catch {
    }
    return { workspace, env, checks, ready: Object.values(checks).every(Boolean) };
  }
  async function training(args, session, signal) {
    if (args.action === "status") return state(args.run_id || "", session);
    const preflight = await trainingPreflight();
    if (args.action === "preflight" || !preflight.ready) return {
      ready: preflight.ready,
      checks: preflight.checks,
      status: preflight.ready ? "ready" : "training-resource-unavailable",
      inference_api_is_training_backend: false,
      fixed_source: trainingCommit,
      required_next: "\u5728\u5B9E\u4F8BHOME/autoresearch\u51C6\u5907\u5DF2\u5BA1\u9605\u7684\u56FA\u5B9A\u6765\u6E90\u3001\u4F9D\u8D56\u53CA\u6570\u636E\uFF1B\u9884\u68C0\u5168\u90E8\u901A\u8FC7\u540E\u624D\u5141\u8BB8baseline\u548Ccandidate\u3002\u6CA1\u6709\u8BAD\u7EC3\u6267\u884C\u56DE\u6267\u65F6\u4E0D\u751F\u6210\u8BAD\u7EC3\u6307\u6807\u3002"
    };
    if (!["baseline", "candidate"].includes(args.action)) throw new Error("\u8BAD\u7EC3\u52A8\u4F5C\u5FC5\u987B\u4E3Apreflight\u3001baseline\u3001candidate\u6216status");
    const id = args.action === "baseline" ? `task-${randomUUID()}` : args.run_id;
    const value = args.action === "baseline" ? { session_id: session, source_kind: "real_training", created_at: (/* @__PURE__ */ new Date()).toISOString(), attempts: [], best: null, candidates_used: 0 } : await state(id, session);
    if (value.attempts.some((a) => a.status === "running")) throw new Error("\u5148\u524D\u8BAD\u7EC3\u72B6\u6001\u672A\u77E5\uFF0C\u5148\u67E5\u8BE2\u5B9E\u9645\u8FDB\u7A0B\uFF0C\u4E0D\u80FD\u91CD\u590D\u53D1\u8D77");
    if (Date.now() - Date.parse(value.created_at) > 60 * 6e4) throw new Error("\u8BAD\u7EC3\u4EFB\u52A1\u603B\u65F6\u9650\u5DF2\u5230");
    if (args.action === "candidate" && (!value.best || value.candidates_used >= 3)) throw new Error("\u5FC5\u987B\u5148\u6709\u6709\u6548\u57FA\u7EBF\uFF0C\u4E14\u5019\u9009\u5B9E\u9A8C\u6700\u591A\u4E09\u6B21");
    const script = join(preflight.workspace, "train.py"), fixed = ["prepare.py", "pyproject.toml", "uv.lock"];
    const fixedHashes = Object.fromEntries(await Promise.all(fixed.map(async (file) => [file, digest(await readFile(join(preflight.workspace, file), "utf8"))])));
    const previous = await readFile(script, "utf8");
    if (args.action === "candidate" && (typeof args.train_py !== "string" || !args.train_py.trim() || Buffer.byteLength(args.train_py) > 128 * 1024)) throw new Error("\u5019\u9009\u5FC5\u987B\u63D0\u4F9B\u4E0D\u8D85\u8FC7128KiB\u7684train.py");
    const attempt = { index: value.attempts.length, kind: args.action, status: "running", started_at: (/* @__PURE__ */ new Date()).toISOString(), script_sha256: digest(args.action === "candidate" ? args.train_py : previous) };
    if (args.action === "candidate") value.candidates_used++;
    value.attempts.push(attempt);
    await save(id, value);
    const attemptPath = join(base, id, `attempt-${attempt.index}`);
    await mkdir(attemptPath, { recursive: true });
    await writeFile(join(attemptPath, "train.py"), args.action === "candidate" ? args.train_py : previous);
    let accepted = false;
    try {
      if (args.action === "candidate") await writeFile(script, args.train_py);
      const result = await execute("uv", ["run", "--no-sync", "train.py"], { cwd: preflight.workspace, env: preflight.env, signal, timeout: 6e5, maxBuffer: 1024 * 1024 });
      await writeFile(join(attemptPath, "stdout.log"), result.stdout);
      await writeFile(join(attemptPath, "stderr.log"), result.stderr);
      for (const file of fixed) if (digest(await readFile(join(preflight.workspace, file), "utf8")) !== fixedHashes[file]) throw new Error("\u56FA\u5B9A\u8BC4\u4F30\u6216\u4F9D\u8D56\u6587\u4EF6\u53D1\u751F\u53D8\u5316\uFF0C\u672C\u6B21\u6307\u6807\u4E0D\u63A5\u53D7");
      const metric = /^val_bpb:\s*([0-9]+(?:\.[0-9]+)?)\s*$/m.exec(result.stdout);
      if (!metric || !Number.isFinite(Number(metric[1]))) throw new Error("\u771F\u5B9E\u8BAD\u7EC3\u672A\u8FD4\u56DE\u6709\u6548val_bpb");
      attempt.val_bpb = Number(metric[1]);
      accepted = !value.best || attempt.val_bpb < value.best.val_bpb;
      attempt.status = accepted ? "keep" : "discard";
      if (accepted) {
        value.best = { index: attempt.index, val_bpb: attempt.val_bpb, script_sha256: attempt.script_sha256 };
        await writeFile(join(base, id, "best-train.py"), await readFile(script));
      }
    } catch (error) {
      attempt.status = signal.aborted ? "cancelled" : "failed";
      attempt.failure = error.code || error.name || "training-error";
      await writeFile(join(attemptPath, "stdout.log"), String(error.stdout || ""));
      await writeFile(join(attemptPath, "stderr.log"), String(error.stderr || error.message));
    } finally {
      if (!accepted) await writeFile(script, previous);
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
      results_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=results.tsv`,
      ...value.best ? { best_code_url: `/assistant/api/task-examples/artifact?run_id=${id}&file=best-train.py` } : {},
      artifacts: ["results.tsv", ...value.best ? ["best-train.py"] : [], `attempt-${attempt.index}/stdout.log`]
    };
  }
  ctx.connection.fetch.register({ path: "/api/task-examples/artifact", methods: ["GET"], requestBody: "buffered", fetch: async (request) => {
    try {
      const url = new URL(request.url), id = url.searchParams.get("run_id") || "", file = url.searchParams.get("file") || "";
      if (!runPattern.test(id) || !["report.md", "devices.csv", "results.tsv", "best-train.py"].includes(file)) return new Response("\u53C2\u6570\u65E0\u6548", { status: 400 });
      const bytes = await readFile(join(base, id, file));
      return new Response(bytes, { headers: {
        "content-type": file.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${id}-${file}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      } });
    } catch {
      return new Response("\u4EA7\u7269\u5C1A\u4E0D\u5B58\u5728", { status: 404 });
    }
  } });
  ctx.tools.register({
    name: `task_${config.kind}`,
    description: config.kind === "inspection" ? "\u57FA\u7840\u8D44\u4EA7\u53F0\u8D26\u53EA\u8BFB\u5DE1\u68C0\uFF1Astart\u56FA\u5B9A\u8D44\u4EA7\u5FEB\u7167\uFF0Cpage\u6309cursor\u8BFB\u5B8C\u5206\u9875\uFF0Creport\u6821\u9A8C\u5DF2\u8BFB\u53D6\u5B8C\u6574\u96C6\u5408\u5E76\u751F\u6210\u5B9E\u9645Markdown/CSV\u62A5\u544A\u3002\u6570\u636E\u6765\u81EA\u57FA\u7840Mock\uFF0C\u4E0D\u80FD\u79F0\u4E3A\u771F\u5B9E\u8BBE\u5907\u5065\u5EB7\u68C0\u6D4B\u3002" : config.kind === "research" ? "\u591A\u6B65\u9AA4\u8D44\u6599\u7814\u7A76\uFF1Astart\u521B\u5EFA\u4EFB\u52A1\uFF0Ccollect\u6309\u914D\u7F6E\u8D44\u6599URL\u8BFB\u53D6\u771F\u5B9E\u6B63\u6587\uFF0Creport\u7528\u6BCF\u4E2AURL\u5BF9\u5E94\u7684summaries\u751F\u6210\u5E26\u6765\u6E90\u7684\u62A5\u544A\uFF1B\u8D44\u6599\u987B\u5168\u90E8\u8BFB\u53D6\u3002" : "\u81EA\u4E3B\u8BAD\u7EC3\u7814\u7A76\uFF1Apreflight\u6838\u67E5\u771F\u5B9EGPU\u3001\u56FA\u5B9A\u6765\u6E90\u3001uv/PyTorch\u4E0E\u6570\u636E\uFF1Bbaseline\u5EFA\u7ACB\u4E00\u6B21\u771F\u5B9E\u57FA\u7EBF\uFF0Ccandidate\u53EA\u4FEE\u6539train.py\u5E76\u5B9E\u9645\u8BAD\u7EC3\u8BC4\u4F30\uFF0C\u6700\u591A\u4E09\u4E2A\u5019\u9009\u3001\u5355\u6B21\u5341\u5206\u949F\u3001\u603B\u65F6\u9650\u4E00\u5C0F\u65F6\u3002\u66F4\u4F18\u4FDD\u7559\u3001\u5931\u8D25\u56DE\u9000\uFF0Cstatus\u8BFB\u53D6\u539F\u8FD0\u884C\u3002\u6CA1\u6709\u771F\u5B9E\u7B97\u529B\u65F6\u53EA\u62A5\u544A\u7F3A\u53E3\uFF0C\u4E0D\u4EA7\u751F\u6A21\u62DF\u6307\u6807\u3002",
    parameters: columns,
    async execute(args, execution) {
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
        const content = await get(args.source, signal);
        value.documents ||= {};
        value.documents[args.source] = { sha256: digest(content), content: content.slice(0, 24e3), read_at: (/* @__PURE__ */ new Date()).toISOString() };
        value.read = [.../* @__PURE__ */ new Set([...value.read, args.source])];
        await save(id, value);
        return { run_id: id, source: args.source, ...value.documents[args.source], truncated: content.length > 24e3 };
      }
      if (config.kind === "research" && args.action === "report") {
        if (!value.sources.length || value.sources.some((url) => !value.read.includes(url))) throw new Error("\u8FD8\u6709\u8D44\u6599\u672A\u8BFB\u53D6\uFF0C\u4E0D\u80FD\u4EA4\u4ED8\u5B8C\u6574\u62A5\u544A");
        if (value.sources.some((url) => typeof args.summaries?.[url] !== "string" || !args.summaries[url].trim())) throw new Error("\u62A5\u544A\u987B\u9010\u9879\u5305\u542B\u5DF2\u8BFB\u6765\u6E90\u7684\u7ED3\u8BBA");
        const text = "# \u591A\u6B65\u9AA4\u4E1A\u52A1\u8D44\u6599\u8C03\u7814\u62A5\u544A\n\n" + value.sources.map((url, i) => `## \u8D44\u6599 ${i + 1}

${args.summaries[url].slice(0, 8e3)}

\u6765\u6E90\uFF1A[\u539F\u59CB\u8D44\u6599](${url})\uFF1B\u8BFB\u53D6\u65F6\u95F4\uFF1A${value.documents[url].read_at}\uFF1B\u6458\u8981\uFF1A${value.documents[url].sha256}
`).join("\n");
        return { ...await report(id, value, text), source_count: value.sources.length, note: "\u5DF2\u5B8C\u6210\u6765\u6E90\u5B8C\u6574\u6027\u6821\u9A8C\uFF1B\u8BED\u4E49\u51C6\u786E\u6027\u9700\u7531\u72EC\u7ACB\u8BC4\u6D4B\u6838\u5BF9\u3002" };
      }
      throw new Error("\u672C\u4E1A\u52A1\u4E0D\u652F\u6301\u6B64\u52A8\u4F5C");
    }
  });
}
export {
  apply,
  inject,
  name
};
