// evolution/experiments/EXP-security-operations-expert-024-rad80a907c628/candidate/dsh/managed/inspection-preparation-runtime.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// native-dsh:@deepseek-ai/dsh-spill-policy/notice
import { existsSync } from "node:fs";

// ../hep-inspection-program/runtime/adapters/dsh-web/src/resolve-runtime.ts
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
function runtimeRequire(name2, containerManifest) {
  const candidates = containerManifest ? [containerManifest] : [
    process.env.HARNESS_DSH_ENTRY,
    process.argv[1],
    fileURLToPath(import.meta.url),
    new URL("../../../../platform/plugin/package.json", import.meta.url).pathname
  ];
  for (const entry of candidates) {
    if (!entry) continue;
    let canonical;
    let require2;
    try {
      canonical = realpathSync(entry);
      require2 = createRequire(canonical);
      require2.resolve(name2);
    } catch {
      continue;
    }
    if (!containerManifest) process.env.HARNESS_DSH_ENTRY = canonical;
    return require2;
  }
  throw new Error(`Web \u8DEF\u5F84\u9002\u914D\u5668\u65E0\u6CD5\u4ECE\u5F53\u524D Runtime \u89E3\u6790 ${name2}`);
}
async function runtimeModule(name2, containerManifest) {
  return import(pathToFileURL(runtimeRequire(name2, containerManifest).resolve(name2)).href);
}

// native-dsh:@deepseek-ai/dsh-spill-policy/notice
var manifest = "/opt/dsh/packages/spill/spill-policy/package.json";
var native = await runtimeModule("@deepseek-ai/dsh-spill-policy/notice", existsSync(manifest) ? manifest : void 0);
var value0 = native["formatSpillNotice"];
var value1 = native["hasSpillNotice"];

// evolution/experiments/EXP-security-operations-expert-024-rad80a907c628/candidate/dsh/managed/inspection-preparation-runtime.ts
var name = "inspection-preparation-runtime";
var inject = ["tools", "mcpSessionManager"];
var LIST = "list_executable_inspections";
var PREPARE = "prepare_inspection";
var START = "start_inspection";
var QUERY = "get_inspection_result";
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function inspectionValue(value) {
  if (value?.isError) return;
  if (value?.structuredContent !== void 0) value = value.structuredContent;
  else if (Array.isArray(value?.content)) {
    const text = value.content.filter((part) => part.type === "text").map((part) => part.text).join("");
    try {
      value = JSON.parse(text);
    } catch {
      return;
    }
  }
  if (object(value) && value.code !== void 0) value = String(value.code) === "200" ? value.data : void 0;
  return object(value) ? value : void 0;
}
function reportLink(value) {
  if (typeof value !== "string" || !value) return;
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return value;
  } catch {
  }
}
function userContext(agent) {
  const events = agent.session.snapshotEvents();
  const user = events.slice().reverse().find((event) => event.type === "user/message" && ["user", "schedule"].includes(event.data?.source?.kind))?.data;
  if (!agent.id || !user?.id || (agent.session.header?.delegationDepth ?? 0) !== 0) throw new Error("\u5DE1\u68C0\u7F3A\u5C11\u771F\u5B9E\u4E3B\u4F1A\u8BDD\u4E0E\u7528\u6237\u6216\u539F\u751F\u5B9A\u65F6\u6D88\u606F");
  return { conversationRef: agent.id, userMessageRef: user.id };
}
function requestId(context, input, agent) {
  const user = agent.session.snapshotEvents().slice().reverse().find((event) => event.type === "user/message")?.data;
  const identity = user?.source?.kind === "schedule" ? { conversationRef: context.conversationRef, schedule: user.content } : context;
  const stable = (value) => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const hex = createHash("sha256").update(JSON.stringify(stable({ context: identity, input }))).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function createInspectionExecution(directory) {
  const locks = /* @__PURE__ */ new Map();
  const path = (id) => join(directory, `${createHash("sha256").update(id).digest("hex")}.json`);
  async function load(id) {
    try {
      return JSON.parse(await readFile(path(id), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw new Error("\u5DE1\u68C0\u63D0\u4EA4\u72B6\u6001\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u5148\u6838\u5BF9\u539F\u8BF7\u6C42\uFF0C\u4E0D\u91CD\u590D\u53D1\u8D77");
    }
  }
  async function save(id, value) {
    await mkdir(directory, { recursive: true, mode: 448 });
    const temporary = `${path(id)}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 384 });
    await rename(temporary, path(id));
  }
  async function locked(id, work) {
    const previous = locks.get(id) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    locks.set(id, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (locks.get(id) === tail) locks.delete(id);
    }
  }
  function verify(value, input) {
    if (!value?.preparationId || value.taskId !== input.taskId || value.definitionVersion !== input.definitionVersion) throw new Error("\u51C6\u5907\u56DE\u6267\u7F3A\u5C11\u540C\u4E00\u6A21\u677F\u3001\u7248\u672C\u6216\u51C6\u5907\u6807\u8BC6\uFF0C\u672A\u542F\u52A8\u5DE1\u68C0");
    return value;
  }
  return {
    prepare(input, exec, invoke) {
      return locked(exec.agent.id, async () => {
        if (Object.keys(input).some((key) => !["taskId", "definitionVersion", "deviceSelector", "businessInputs"].includes(key))) throw new Error("\u51C6\u5907\u53C2\u6570\u53EA\u63A5\u53D7\u771F\u5B9E\u76EE\u5F55\u58F0\u660E\u7684\u6A21\u677F\u3001\u7248\u672C\u3001\u8BBE\u5907\u9009\u62E9\u5668\u548C\u4E1A\u52A1\u8F93\u5165");
        if (!object(input.deviceSelector) || !["ALL", "ASSET_IDS", "IP", "CIDR", "TOPOLOGY_GROUP", "ASSET_CLASS", "FILTER"].includes(input.deviceSelector.kind)) throw new Error("\u5148\u660E\u786E\u672C\u6B21\u8BBE\u5907\u8303\u56F4\u5E76\u63D0\u4F9B\u539F\u59CB\u9009\u62E9\u5668\uFF0C\u4E0D\u80FD\u9ED8\u8BA4\u5168\u90E8\u8D44\u4EA7");
        const context = userContext(exec.agent), previous = await load(exec.agent.id);
        if (previous?.attempted && !previous.receipt) throw new Error(`\u539F\u63D0\u4EA4\u72B6\u6001\u672A\u77E5\uFF1B\u8BF7\u6309\u539F requestId ${previous.requestId} \u67E5\u8D26\uFF0C\u4E0D\u91CD\u65B0\u51C6\u5907\u6216\u542F\u52A8`);
        const id = requestId(context, input, exec.agent);
        if (previous?.requestId === id && previous.attempted) throw new Error(`\u672C\u6B21\u8BF7\u6C42\u5DF2\u53D1\u8D77\uFF1B\u53EA\u67E5\u8BE2\u539F runId ${inspectionValue(previous.receipt)?.runId ?? "\u672A\u77E5"}`);
        const receipt = await invoke({ ...input, context });
        const preparation = inspectionValue(receipt);
        if (!preparation) throw new Error("\u51C6\u5907\u672A\u8FD4\u56DE\u53EF\u8BC6\u522B\u56DE\u6267\uFF0C\u672A\u542F\u52A8\u5DE1\u68C0");
        if (preparation.status === "READY") verify(preparation, input);
        await save(exec.agent.id, { input: structuredClone(input), context, requestId: id, preparation });
        return receipt;
      });
    },
    start(input, exec, prepare, invoke) {
      return locked(exec.agent.id, async () => {
        if (Object.keys(input).some((key) => !["taskId", "definitionVersion", "preparationId"].includes(key))) throw new Error("\u542F\u52A8\u53EA\u63A5\u53D7\u5DF2\u51C6\u5907\u7684\u6A21\u677F\u3001\u7248\u672C\u548C\u51C6\u5907\u7F16\u53F7\uFF0C\u8303\u56F4\u4E0E requestId \u7531\u8FD0\u884C\u65F6\u7ED1\u5B9A");
        const state = await load(exec.agent.id);
        if (!state || state.preparation.preparationId !== input.preparationId || state.input.taskId !== input.taskId || state.input.definitionVersion !== input.definitionVersion) throw new Error("\u5148\u51C6\u5907\u672C\u6B21\u6A21\u677F\u4E0E\u539F\u59CB\u8303\u56F4\uFF0C\u4E0D\u80FD\u542F\u52A8\u5176\u4ED6\u51C6\u5907");
        if (state.attempted) {
          if (state.receipt) return state.receipt;
          throw new Error(`\u539F\u63D0\u4EA4\u72B6\u6001\u672A\u77E5\uFF1B\u8BF7\u6309\u539F requestId ${state.requestId} \u67E5\u8D26\uFF0C\u4E0D\u91CD\u590D\u542F\u52A8`);
        }
        const context = userContext(exec.agent);
        if (context.userMessageRef !== state.context.userMessageRef) throw new Error("\u7528\u6237\u8BF7\u6C42\u5DF2\u53D8\u5316\uFF1B\u6309\u5F53\u524D\u8BF7\u6C42\u91CD\u65B0\u51C6\u5907\uFF0C\u4E0D\u80FD\u6CBF\u7528\u65E7\u8303\u56F4");
        if (state.preparation.status !== "READY") throw new Error("\u51C6\u5907\u672A\u5C31\u7EEA\uFF1B\u53EA\u6F84\u6E05\u670D\u52A1\u8FD4\u56DE\u7684\u8303\u56F4\u6B67\u4E49\u6216\u4E1A\u52A1\u7F3A\u9879");
        const expires = Date.parse(state.preparation.expiresAt);
        if (!Number.isFinite(expires)) throw new Error("\u51C6\u5907\u7F3A\u5C11\u53EF\u6838\u5BF9\u7684\u6709\u6548\u671F\uFF0C\u672A\u542F\u52A8\u5DE1\u68C0");
        if (Date.now() >= expires) {
          const receipt2 = await prepare({ ...state.input, context: state.context });
          state.preparation = verify(inspectionValue(receipt2), state.input);
          await save(exec.agent.id, state);
          if (state.preparation.status !== "READY" || !(Date.parse(state.preparation.expiresAt) > Date.now())) throw new Error("\u6309\u539F\u9009\u62E9\u5668\u91CD\u65B0\u51C6\u5907\u540E\u4ECD\u672A\u5C31\u7EEA\u6216\u5DF2\u8FC7\u671F\uFF0C\u672A\u542F\u52A8\u5DE1\u68C0");
        }
        exec.signal?.throwIfAborted();
        state.attempted = true;
        await save(exec.agent.id, state);
        const receipt = await invoke({
          taskId: state.input.taskId,
          definitionVersion: state.input.definitionVersion,
          preparationId: state.preparation.preparationId,
          requestId: state.requestId,
          context: state.context
        });
        if (!inspectionValue(receipt)?.runId) throw new Error(`\u672A\u53D6\u5F97\u771F\u5B9E runId\uFF1B\u539F requestId ${state.requestId} \u7684\u63D0\u4EA4\u72B6\u6001\u5F85\u67E5\u8D26\uFF0C\u4E0D\u91CD\u590D\u542F\u52A8`);
        state.receipt = receipt;
        await save(exec.agent.id, state);
        return receipt;
      });
    }
  };
}
function apply(ctx) {
  const execution = createInspectionExecution(join(process.env.DSH_HOME || homedir(), "inspection-operations"));
  const mounted = /* @__PURE__ */ new WeakMap();
  const pending = /* @__PURE__ */ new Map();
  const actual = (raw) => ctx.mcpSessionManager.resolveTool("inspection", raw);
  const isSpilled = (content) => content?.some((part) => part.type === "text" && typeof part.text === "string" && value1(part.text));
  ctx.on("agent/disposed", ({ agent }) => {
    pending.delete(agent.id);
  });
  ctx.on("agent/pre-step", async ({ agent, messages }, next) => {
    if (messages?.some((message) => ["user", "schedule"].includes(message.source?.kind))) pending.delete(agent.id);
    if ((agent.session.header?.delegationDepth ?? 0) === 0) {
      let entries = mounted.get(agent);
      if (!entries) {
        entries = /* @__PURE__ */ new Map();
        mounted.set(agent, entries);
      }
      for (const raw of [LIST, PREPARE, START]) {
        const toolName = actual(raw), original = toolName && ctx.tools.get(toolName, agent);
        const entry = entries.get(raw);
        if (entry && original === entry.visible) continue;
        if (entry) {
          entry.dispose();
          entries.delete(raw);
        }
        if (!original) continue;
        const properties = { ...original.parameters.properties };
        delete properties.context;
        delete properties.requestId;
        if (raw === START) delete properties.scope;
        const wrapper = {
          ...original,
          description: raw === LIST ? "\u67E5\u8BE2\u5DF2\u53D1\u5E03\u4E14\u542F\u7528\u7684\u5DE1\u68C0\u76EE\u5F55\uFF0C\u53EA\u8BFB\uFF1B\u6267\u884C\u8BF7\u6C42\u7531\u4E3B Agent \u9009\u62E9\u552F\u4E00\u6A21\u677F\u5E76\u6838\u5BF9\u5B9E\u9645\u8303\u56F4\u540E\u540C\u8F6E\u51C6\u5907\u548C\u542F\u52A8\u3002" : raw === PREPARE ? "\u6309\u771F\u5B9E\u76EE\u5F55\u4E0E\u539F\u59CB\u8303\u56F4\u51C6\u5907\u5DE1\u68C0\uFF1BREADY \u540E\u660E\u786E\u6267\u884C\u8BF7\u6C42\u53EF\u5728\u540C\u8F6E\u542F\u52A8\uFF0C\u7F3A\u9879\u53EA\u6F84\u6E05\u3002" : "\u6309\u672C\u8F6E\u660E\u786E\u6267\u884C\u8BF7\u6C42\u6D88\u8D39\u771F\u5B9E READY \u51C6\u5907\uFF1B\u540C\u8F6E\u542F\u52A8\uFF0C\u65E0\u989D\u5916\u786E\u8BA4\uFF1B\u5DF2\u53D1\u8D77\u53EA\u7EED\u67E5\uFF0C\u56DE\u6267\u672A\u77E5\u5148\u67E5\u8D26\u3002",
          parameters: {
            ...original.parameters,
            properties,
            additionalProperties: false,
            required: raw === LIST ? original.parameters.required : raw === START ? ["taskId", "definitionVersion", "preparationId"] : ["taskId", "definitionVersion", "deviceSelector"]
          },
          execute(args, exec) {
            if (raw === LIST) return original.execute(args, exec);
            if (raw === PREPARE) return execution.prepare(args, exec, (value) => original.execute(value, exec));
            const prepareName = actual(PREPARE), prepared = prepareName && entries.get(PREPARE)?.upstream;
            if (!prepared) throw new Error("\u5F53\u524D\u5DE1\u68C0\u51C6\u5907\u5DE5\u5177\u4E0D\u53EF\u7528\uFF0C\u672A\u542F\u52A8\u5DE1\u68C0\uFF1B\u5176\u4ED6\u4E1A\u52A1\u53EF\u7EE7\u7EED\u4F7F\u7528");
            return execution.start(args, exec, (value) => prepared.execute(value, exec), (value) => original.execute(value, exec));
          }
        };
        const dispose = agent.ctx.tools.register(wrapper);
        entries.set(raw, { visible: wrapper, upstream: original, dispose });
        ctx.effect(() => dispose);
      }
    }
    return next();
  });
  ctx.on("tools/result", (exec, result) => {
    if (!exec.agent) return;
    if (exec.name === actual(QUERY) && exec.arguments?.includeReport === true && !result.isError) {
      const full = inspectionValue(result.value);
      if (full && full.runId === exec.arguments.runId && typeof full.reportMarkdown === "string") {
        pending.set(exec.agent.id, { exec, full, spilled: !!isSpilled(result.content) });
      }
    } else if (exec.parent === void 0) {
      const delivery = pending.get(exec.agent.id);
      const workflow = ["inspection_workflow", "security_operations_code_workflow", "security_operations_hybrid_workflow"].includes(exec.name);
      if (workflow && delivery && !result.isError && delivery.exec.rootCallId === exec.rootCallId) delivery.spilled ||= !!isSpilled(result.content);
      else pending.delete(exec.agent.id);
    }
  });
  ctx.on("agent/request", async ({ agent, signal }, next) => {
    const config = await next(), delivery = pending.get(agent.id);
    pending.delete(agent.id);
    if (!delivery?.spilled || signal?.aborted) return config;
    const { exec, full } = delivery, link = reportLink(full.reportDownloadUrl);
    let markdown = "\u5B8C\u6574\u62A5\u544A\u5DF2\u7531 DSH \u6309\u5B9E\u9645\u5185\u8054\u9884\u7B97\u622A\u65AD\uFF0C\u672C\u6761\u672A\u5185\u8054\u5168\u6587\u3002";
    try {
      const result = await ctx.tools.execute({
        name: actual(QUERY),
        arguments: { runId: full.runId, includeReport: false },
        callId: `inspection-summary-${randomUUID()}`,
        rootCallId: exec.rootCallId,
        agent,
        signal
      });
      const summary = result.isError ? void 0 : inspectionValue(result.value);
      if (summary && summary.runId === full.runId && link && summary.reportDownloadUrl === link && typeof summary.reportSummaryMarkdown === "string" && summary.reportSummaryMarkdown.trim() && !isSpilled(result.content)) {
        markdown += "\n\n\u4EE5\u4E0B\u4E3A\u53E6\u884C\u53EA\u8BFB\u53D6\u5F97\u7684\u540C\u6B21\u5DF2\u5B58\u62A5\u544A\u6458\u8981\uFF1A\n\n" + summary.reportSummaryMarkdown;
      } else markdown += "\n\u672A\u53D6\u5F97\u53EF\u6838\u9A8C\u4E14\u53EF\u5B8C\u6574\u5185\u8054\u7684\u540C\u6B21\u6458\u8981\uFF0C\u8BF7\u4F7F\u7528\u539F\u62A5\u544A\u94FE\u63A5\u3002";
      ctx.logger?.info?.(`\u5DE1\u68C0\u6D3E\u751F\u6458\u8981\u8BFB\u53D6\uFF1ArunId=${full.runId}\uFF1B\u540C\u6B21\u6458\u8981\u6838\u9A8C=${!!summary && summary.runId === full.runId && summary.reportDownloadUrl === link && !isSpilled(result.content)}`);
    } catch {
      markdown += "\n\u540C\u6B21\u6458\u8981\u8865\u8BFB\u5931\u8D25\uFF0C\u539F\u62A5\u544A\u72B6\u6001\u4FDD\u6301\u4E0D\u53D8\uFF0C\u53EF\u7EE7\u7EED\u67E5\u8BE2\u539F runId\u3002";
    }
    if (link) markdown += "\n\n[\u4E0B\u8F7D\u5B8C\u6574\u62A5\u544A](<" + link + ">)";
    else markdown += "\n\u672A\u53D6\u5F97\u6709\u6548\u7684\u539F\u62A5\u544A\u4E0B\u8F7D\u94FE\u63A5\u3002";
    if (!signal?.aborted) {
      const { queueControlledOutput } = await import(new URL("./operation-result-delivery.mjs", import.meta.url).href);
      queueControlledOutput(agent.id, markdown);
    }
    return config;
  });
}
export {
  apply,
  createInspectionExecution,
  inject,
  inspectionValue,
  name,
  reportLink
};
