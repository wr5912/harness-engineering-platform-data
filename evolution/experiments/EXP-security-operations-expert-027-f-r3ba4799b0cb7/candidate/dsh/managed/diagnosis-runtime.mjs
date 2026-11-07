// ../../harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-reab20c48f610/candidate/dsh/managed/diagnosis-runtime.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
var name = "security-operations-diagnosis-runtime";
var inject = ["tools", "mcpSessionManager"];
var LIST = "list_troubleshooting_playbooks";
var START = "start_diagnosis";
var QUERY = "get_diagnosis_result";
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var stable = (value) => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
var equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
function diagnosisCatalog(value) {
  if (value?.isError) return;
  if (value?.structuredContent !== void 0) value = value.structuredContent;
  else if (Array.isArray(value?.content)) {
    try {
      value = JSON.parse(value.content.filter((part) => part.type === "text").map((part) => part.text).join(""));
    } catch {
      return;
    }
  }
  if (object(value) && value.code !== void 0) value = String(value.code) === "200" ? value.data : void 0;
  return Array.isArray(value) ? value : void 0;
}
function diagnosisValue(value) {
  if (value?.isError) return;
  if (value?.structuredContent !== void 0) value = value.structuredContent;
  else if (Array.isArray(value?.content)) {
    try {
      value = JSON.parse(value.content.filter((part) => part.type === "text").map((part) => part.text).join(""));
    } catch {
      return;
    }
  }
  if (object(value) && value.code !== void 0) value = String(value.code) === "200" ? value.data : void 0;
  return object(value) ? value : void 0;
}
function current(agent) {
  const events = agent?.session?.snapshotEvents?.();
  if (typeof agent?.id !== "string" || !agent.id || agent.id.length > 128 || !Array.isArray(events) || (agent.session.header?.delegationDepth ?? 0) !== 0) {
    throw new Error("\u8BCA\u65AD\u7F3A\u5C11\u6709\u6548\u7684\u771F\u5B9E\u4E3B\u4F1A\u8BDD");
  }
  let index = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "user/message" && events[i].data?.source?.kind === "user") {
      index = i;
      break;
    }
  }
  const user = events[index]?.data;
  if (typeof user?.id !== "string" || !user.id || user.id.length > 128) throw new Error("\u8BCA\u65AD\u7F3A\u5C11\u771F\u5B9E\u7528\u6237\u6D88\u606F\u5F15\u7528");
  const text = typeof user.content === "string" ? user.content : Array.isArray(user.content) && user.content.every((part) => part?.type === "text" && typeof part.text === "string") ? user.content.map((part) => part.text).join("") : "";
  return { events, index, user, text, context: { conversationRef: agent.id, userMessageRef: user.id } };
}
function explicit(text) {
  if (!text.trim() || /(?:取消|停止|撤销|只(?:查|看|分析)|仅(?:查|看|分析)|不(?:要|需|必|再).{0,8}(?:执行|启动|诊断)|[？?]|会影响|如何|怎么)/u.test(text)) return false;
  return /(?:发起|执行|启动|运行|开始|开展|生成).{0,50}(?:诊断|平台排查|故障排查报告)|(?:诊断|平台排查).{0,30}(?:执行|启动|运行)/u.test(text);
}
function allowed(message, entries) {
  if (explicit(message.text)) return true;
  const prior = message.events.slice(0, message.index).reverse().find((event) => event.type === "user/message" && event.data?.source?.kind === "user")?.data;
  const text = typeof prior?.content === "string" ? prior.content : Array.isArray(prior?.content) ? prior.content.filter((part) => part?.type === "text").map((part) => part.text).join("") : "";
  const last = entries.at(-1), status = diagnosisValue(last?.receipt)?.acceptanceStatus;
  if (last?.phase === "UNKNOWN" && /(?:重试|核对原请求).{0,30}诊断/u.test(message.text) && !/(?:取消|停止|不(?:要|再)|[？?])/u.test(message.text)) return true;
  return !!prior && last?.context.userMessageRef === prior.id && explicit(text) && last?.phase === "NOT_CREATED" && ["NEEDS_INPUT", "NEEDS_SELECTION"].includes(status) && !!message.text.trim() && !/(?:取消|停止|不(?:要|再)|只(?:查|看)|仅(?:查|看)|[？?])/u.test(message.text);
}
function createDiagnosisExecution(directory) {
  const locks = /* @__PURE__ */ new Map();
  const path = (id) => join(directory, `${createHash("sha256").update(id).digest("hex")}.v1.json`);
  async function load(id) {
    let text;
    try {
      text = await readFile(path(id), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, entries: [] };
      throw new Error("\u8BCA\u65AD\u8BF7\u6C42\u8D26\u672C\u4E0D\u53EF\u8BFB\u53D6\uFF1B\u672A\u53D1\u8D77\u65B0\u8FD0\u884C");
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("\u8BCA\u65AD\u8BF7\u6C42\u8D26\u672C\u635F\u574F\uFF1B\u4FDD\u7559\u5E76\u505C\u6B62\u63D0\u4EA4");
    }
    if (!object(value) || value.version !== 1 || !Array.isArray(value.entries) || !value.entries.every((entry) => object(entry) && object(entry.input) && object(entry.context) && typeof entry.requestId === "string" && ["UNKNOWN", "ACCEPTED", "NOT_CREATED"].includes(entry.phase))) {
      throw new Error("\u8BCA\u65AD\u8BF7\u6C42\u8D26\u672C\u4E0D\u53EF\u4FE1\uFF1B\u4FDD\u7559\u5E76\u505C\u6B62\u63D0\u4EA4");
    }
    return value;
  }
  async function save(id, ledger) {
    await mkdir(directory, { recursive: true, mode: 448 });
    const temporary = `${path(id)}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(ledger), { flag: "wx", mode: 384 });
    await rename(temporary, path(id));
  }
  async function locked(id, work) {
    const previous = locks.get(id) ?? Promise.resolve();
    let release;
    const tail = previous.then(() => new Promise((resolve) => {
      release = resolve;
    }));
    locks.set(id, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (locks.get(id) === tail) locks.delete(id);
    }
  }
  const startSchema = (schema) => Array.isArray(schema?.required) && schema.required.length === 4 && ["playbookId", "request", "requestId", "context"].every((field) => schema.required.includes(field)) && object(schema.properties) && ["playbookId", "request", "requestId", "context", "probePlanHash"].every((field) => object(schema.properties[field])) && Object.keys(schema.properties).every((field) => ["playbookId", "request", "requestId", "context", "probePlanHash"].includes(field));
  const resultSchema = (schema) => Array.isArray(schema?.required) && schema.required.length === 2 && ["runId", "context"].every((field) => schema.required.includes(field)) && object(schema.properties) && ["runId", "context"].every((field) => object(schema.properties[field])) && Object.keys(schema.properties).every((field) => ["runId", "context"].includes(field));
  return {
    startSchema,
    resultSchema,
    start(input, exec, invoke, schema) {
      return locked(exec.agent.id, async () => {
        if (!startSchema(schema)) throw new Error("\u6392\u67E5\u670D\u52A1\u672A\u63D0\u4F9B\u76EE\u6807\u4E09\u5DE5\u5177\u8BCA\u65AD\u5408\u540C\uFF0C\u672A\u6267\u884C");
        if (!object(input) || Object.keys(input).some((field) => !["playbookId", "request"].includes(field)) || typeof input.playbookId !== "string" || !input.playbookId.trim() || !object(input.request)) {
          throw new Error("\u6A21\u578B\u53EA\u80FD\u63D0\u4F9B\u771F\u5B9E\u5267\u672C\u4E0E\u4E1A\u52A1\u8BF7\u6C42\uFF1B\u4F1A\u8BDD\u3001\u8BF7\u6C42\u8EAB\u4EFD\u53CA\u4E3B\u52A8\u53D6\u8BC1\u6388\u6743\u4E0D\u53EF\u7531\u6A21\u578B\u586B\u5199");
        }
        const message = current(exec.agent), ledger = await load(exec.agent.id);
        if (!allowed(message, ledger.entries)) throw new Error("\u4EC5\u54A8\u8BE2\u3001\u5426\u5B9A\u6216\u672A\u660E\u786E\u8981\u6C42\u5E73\u53F0\u6267\u884C\u8BCA\u65AD\uFF0C\u672A\u521B\u5EFA\u8FD0\u884C");
        const previous = message.events.slice(0, message.index).reverse().find((event) => event.type === "user/message" && event.data?.source?.kind === "user")?.data;
        const last = ledger.entries.at(-1);
        if (!explicit(message.text) && last?.phase === "NOT_CREATED" && last.context.userMessageRef === previous?.id && ["NEEDS_INPUT", "NEEDS_SELECTION"].includes(diagnosisValue(last.receipt)?.acceptanceStatus)) {
          input = { ...last.input, ...input, request: {
            ...last.input.request,
            ...input.request,
            ...object(last.input.request.runInputs) && object(input.request.runInputs) ? { runInputs: { ...last.input.request.runInputs, ...input.request.runInputs } } : {}
          } };
        }
        const unknown = ledger.entries.find((entry2) => entry2.phase === "UNKNOWN");
        if (unknown && !equal(unknown.input, input)) throw new Error("\u539F\u8BCA\u65AD\u63D0\u4EA4\u72B6\u6001\u672A\u77E5\uFF1B\u5FC5\u987B\u6CBF\u539F\u8BF7\u6C42\u548C\u539F\u8F93\u5165\u6838\u5BF9\uFF0C\u4E0D\u80FD\u6362\u53F7\u6539\u53C2");
        const hash = createHash("sha256").update(JSON.stringify(stable({ context: message.context, input }))).digest("hex");
        const id = unknown?.requestId ?? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        let entry = unknown ?? ledger.entries.find((item) => item.requestId === id);
        if (!entry) {
          if (ledger.entries.some((item) => item.context.userMessageRef === message.user.id)) throw new Error("\u672C\u8F6E\u8BCA\u65AD\u5DF2\u6709\u63D0\u4EA4\uFF0C\u7981\u6B62\u66F4\u6362\u53C2\u6570\u91CD\u5EFA");
          exec.signal?.throwIfAborted();
          entry = { input: structuredClone(input), context: message.context, requestId: id, phase: "UNKNOWN" };
          ledger.entries.push(entry);
          await save(exec.agent.id, ledger);
        } else if (!equal(entry.input, input)) throw new Error("\u8BCA\u65AD\u8BF7\u6C42\u8F93\u5165\u5DF2\u51BB\u7ED3\uFF0C\u4E0D\u53EF\u6539\u53D8\u5DF2\u53D7\u7406\u8BF7\u6C42");
        if (entry.phase !== "UNKNOWN") return entry.receipt;
        exec.signal?.throwIfAborted();
        let receipt;
        try {
          receipt = await invoke({ ...entry.input, requestId: entry.requestId, context: entry.context });
        } catch {
          await save(exec.agent.id, ledger);
          throw new Error("\u8BCA\u65AD\u63D0\u4EA4\u72B6\u6001\u672A\u77E5\uFF0C\u4FDD\u7559\u539F\u8BF7\u6C42\u8EAB\u4EFD\uFF1B\u4E0D\u53EF\u6362\u53F7\u6216\u65AD\u8A00\u672A\u521B\u5EFA\u8FD0\u884C");
        }
        const value = diagnosisValue(receipt);
        if (value?.acceptanceStatus === "ACCEPTED" && typeof value.runId === "string" && value.runId) {
          entry.phase = "ACCEPTED";
          entry.receipt = receipt;
        } else if (value && ["NEEDS_INPUT", "NEEDS_SELECTION", "NEEDS_AUTHORIZATION", "BLOCKED"].includes(value.acceptanceStatus) && !value.runId) {
          entry.phase = "NOT_CREATED";
          entry.receipt = receipt;
        } else {
          await save(exec.agent.id, ledger);
          throw new Error("\u8BCA\u65AD\u53D7\u7406\u72B6\u6001\u672A\u77E5\uFF0C\u539F\u8BF7\u6C42\u8EAB\u4EFD\u5DF2\u4FDD\u7559");
        }
        await save(exec.agent.id, ledger);
        return receipt;
      });
    },
    async result(input, exec, invoke, schema) {
      if (!resultSchema(schema) || !object(input) || Object.keys(input).some((field) => field !== "runId") || typeof input.runId !== "string" || !input.runId.trim()) throw new Error("\u8BCA\u65AD\u7ED3\u679C\u4EC5\u63A5\u53D7\u539F runId\uFF0C\u771F\u5B9E\u4F1A\u8BDD\u7531\u8FD0\u884C\u65F6\u6CE8\u5165");
      const message = current(exec.agent), ledger = await load(exec.agent.id);
      if (!ledger.entries.some((entry) => entry.phase === "ACCEPTED" && diagnosisValue(entry.receipt)?.runId === input.runId && entry.context.conversationRef === message.context.conversationRef)) {
        throw new Error("\u6B64\u4F1A\u8BDD\u6CA1\u6709\u53EF\u6838\u9A8C\u7684\u540C\u6B21\u8BCA\u65AD\u8FD0\u884C\uFF0C\u7981\u6B62\u8DE8\u4F1A\u8BDD\u8BFB\u53D6");
      }
      return invoke({ runId: input.runId, context: { conversationRef: message.context.conversationRef } });
    }
  };
}
function apply(ctx) {
  const execution = createDiagnosisExecution(join(process.env.DSH_HOME || homedir(), "diagnosis-operations"));
  const mounted = /* @__PURE__ */ new WeakMap();
  const actual = (raw) => ctx.mcpSessionManager.resolveTool("troubleshooting", raw);
  function mount(agent) {
    if ((agent?.session?.header?.delegationDepth ?? 0) !== 0) return;
    let entries = mounted.get(agent);
    if (!entries) {
      entries = /* @__PURE__ */ new Map();
      mounted.set(agent, entries);
    }
    for (const raw of [LIST, START, QUERY]) {
      const toolName = actual(raw), original = toolName && ctx.tools.get(toolName, agent), previous = entries.get(raw);
      if (previous && original === previous.visible) continue;
      if (previous) {
        previous.dispose();
        entries.delete(raw);
      }
      if (!original) continue;
      const schema = original.parameters ?? {};
      const modern = raw === LIST ? true : raw === START ? execution.startSchema(schema) : execution.resultSchema(schema);
      const properties = modern ? { ...schema.properties } : {};
      delete properties.requestId;
      delete properties.context;
      delete properties.probePlanHash;
      const wrapper = {
        ...original,
        parameters: raw === LIST ? schema : modern ? { ...schema, properties, required: schema.required.filter((field) => !["requestId", "context"].includes(field)) } : { type: "object", properties: {}, required: [], additionalProperties: false },
        execute(args, exec) {
          if (raw === LIST) return original.execute(args, exec);
          if (!modern) throw new Error("\u6392\u67E5\u670D\u52A1\u5C1A\u672A\u63D0\u4F9B\u76EE\u6807\u4E09\u5DE5\u5177\u5408\u540C\uFF0C\u7981\u6B62\u65E7\u8C03\u7528");
          if (raw === START) return execution.start(args, exec, (value) => original.execute(value, exec), schema);
          return execution.result(args, exec, (value) => original.execute(value, exec), schema);
        }
      };
      Object.defineProperty(wrapper, Symbol.for("security-operations.diagnosis.runtime"), { value: true });
      const dispose = agent.ctx.tools.register(wrapper);
      entries.set(raw, { visible: wrapper, dispose });
      ctx.effect(() => dispose);
    }
  }
  ctx.on("agent/created", ({ agent }) => {
    mount(agent);
  });
  ctx.on("agent/pre-step", async ({ agent }, next) => {
    mount(agent);
    return next();
  });
}
export {
  apply,
  createDiagnosisExecution,
  diagnosisCatalog,
  diagnosisValue,
  inject,
  name
};
