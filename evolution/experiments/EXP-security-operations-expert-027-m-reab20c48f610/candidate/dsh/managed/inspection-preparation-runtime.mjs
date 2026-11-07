import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const name = "inspection-preparation-runtime";
const inject = ["tools", "mcpSessionManager"];
const LIST = "list_executable_inspections", START = "start_inspection", QUERY = "get_inspection_result";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
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
function inspectionCatalog(value) {
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
function reportLink(value) {
  if (typeof value !== "string" || !value) return;
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return value;
  } catch {
  }
}
const stable = (value) => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const sameInput = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
function currentUser(agent) {
  const events = agent?.session?.snapshotEvents?.();
  if (!agent?.id || !Array.isArray(events) || (agent.session.header?.delegationDepth ?? 0) !== 0) {
    throw new Error("\u5DE1\u68C0\u7F3A\u5C11\u771F\u5B9E\u4E3B\u4F1A\u8BDD\u6216\u7528\u6237/\u539F\u751F\u5B9A\u65F6\u6D88\u606F");
  }
  let index = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "user/message" && ["user", "schedule"].includes(events[i].data?.source?.kind)) {
      index = i;
      break;
    }
  }
  const user = events[index]?.data;
  if (!user?.id) throw new Error("\u5DE1\u68C0\u7F3A\u5C11\u771F\u5B9E\u7528\u6237\u6216\u539F\u751F\u5B9A\u65F6\u6D88\u606F\u6807\u8BC6");
  return { events, index, user, context: { conversationRef: agent.id, userMessageRef: user.id } };
}
function userText(user) {
  if (typeof user.content === "string") return user.content;
  if (Array.isArray(user.content) && user.content.every((part) => part?.type === "text" && typeof part.text === "string")) {
    return user.content.map((part) => part.text).join("");
  }
  return "";
}
function explicitExecution(text) {
  if (!text.trim() || /(?:取消|停止|撤销)(?:本次|这个|该)?(?:巡检|检查|执行)?/u.test(text) || /(?:不|别|暂不|无需|不必|禁止)(?:要|再|用|需)?(?:.{0,8})(?:执行|启动|发起|巡检|检查|核查)/u.test(text) || /(?:只|仅|先)(?:需|要|做)?(?:查询|查看|预览|列出|看一下)/u.test(text) || /(?:执行|启动|巡检).{0,30}(?:会影响|有什么影响|吗|么|？|\?)/u.test(text)) return false;
  return /(?:执行|启动|发起|开展|开始|运行|做一次|检查|核查|做).{0,60}(?:巡检|基线|设备|资产|漏洞|终端|双网|状态)|(?:巡检|基线核查).{0,40}(?:执行|启动|开始)/u.test(text);
}
function executionAuthorized(current, entries) {
  const text = userText(current.user);
  if (explicitExecution(text)) return true;
  const previous = current.events.slice(0, current.index).reverse().find((event) => event.type === "user/message" && ["user", "schedule"].includes(event.data?.source?.kind))?.data;
  const last = entries.at(-1);
  const denied = /(?:取消|停止|撤销|不(?:要|再|需|必|用)?(?:.{0,8})(?:执行|启动|巡检)|(?:只|仅|先)(?:查询|查看|预览|列出)|[？?])/u.test(text);
  if (last?.phase === "UNKNOWN" && /(?:重试|核对原请求).{0,30}巡检/u.test(text) && !denied) return true;
  return !!previous && last?.phase === "NOT_CREATED" && ["NEEDS_INPUT", "NEEDS_SELECTION"].includes(inspectionValue(last.receipt)?.acceptanceStatus) && last.context.userMessageRef === previous.id && explicitExecution(userText(previous)) && !!text.trim() && !denied;
}
function requestId(context, input, user) {
  const identity = user.source?.kind === "schedule" ? { conversationRef: context.conversationRef, schedule: user.content } : context;
  const hex = createHash("sha256").update(JSON.stringify(stable({ context: identity, input }))).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function createInspectionExecution(directory) {
  const locks = /* @__PURE__ */ new Map();
  const key = (id) => createHash("sha256").update(id).digest("hex");
  const legacyPath = (id) => join(directory, `${key(id)}.json`);
  const ledgerPath = (id) => join(directory, `${key(id)}.v2.json`);
  async function read(path) {
    let text;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw new Error("\u5DE1\u68C0\u8BF7\u6C42\u8D26\u672C\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u672A\u63D0\u4EA4\u65B0\u8BF7\u6C42");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("\u5DE1\u68C0\u8BF7\u6C42\u8D26\u672C\u635F\u574F\uFF0C\u672A\u63D0\u4EA4\u65B0\u8BF7\u6C42");
    }
  }
  async function load(id) {
    const legacy = await read(legacyPath(id));
    if (legacy !== void 0 && (!object(legacy) || !object(legacy.input) || !object(legacy.context) || typeof legacy.requestId !== "string" || legacy.attempted !== void 0 && typeof legacy.attempted !== "boolean")) {
      throw new Error("\u65E7\u5DE1\u68C0\u8D26\u672C\u65E0\u6CD5\u6838\u5B9E\uFF0C\u4FDD\u7559\u539F\u6587\u4EF6\u5E76\u505C\u6B62\u65B0\u63D0\u4EA4");
    }
    if (legacy?.attempted && !inspectionValue(legacy.receipt)?.runId) {
      throw new Error("\u65E7\u7248\u672C\u5DE1\u68C0\u63D0\u4EA4\u72B6\u6001\u672A\u77E5\uFF0C\u4FDD\u7559\u539F\u8BF7\u6C42\u7531\u7EF4\u62A4\u65B9\u6838\u67E5\uFF1B\u4E0D\u6362\u53F7\u91CD\u53D1");
    }
    const value = await read(ledgerPath(id));
    if (value === void 0) return { version: 2, entries: [] };
    if (!object(value) || value.version !== 2 || !Array.isArray(value.entries) || !value.entries.every((entry) => object(entry) && object(entry.input) && object(entry.context) && typeof entry.requestId === "string" && ["UNKNOWN", "ACCEPTED", "NOT_CREATED"].includes(entry.phase))) {
      throw new Error("\u5DE1\u68C0\u65B0\u8BF7\u6C42\u8D26\u672C\u65E0\u6CD5\u6838\u5B9E\uFF0C\u4FDD\u7559\u539F\u6587\u4EF6\u5E76\u505C\u6B62\u65B0\u63D0\u4EA4");
    }
    return value;
  }
  async function save(id, value) {
    await mkdir(directory, { recursive: true, mode: 448 });
    const temporary = `${ledgerPath(id)}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 384 });
    await rename(temporary, ledgerPath(id));
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
  function unconfirmed() {
    return new Error("\u5DE1\u68C0\u53D7\u7406\u72B6\u6001\u672A\u77E5\uFF0C\u539F\u8F93\u5165\u4E0E\u539F\u8BF7\u6C42\u5DF2\u4FDD\u7559\uFF1B\u65B0\u5951\u7EA6\u4EC5\u80FD\u6309\u540C\u4E00\u8BF7\u6C42\u5E42\u7B49\u6838\u5BF9\uFF0C\u4E0D\u80FD\u6362\u53F7\u3001\u6539\u53C2\u6216\u79F0\u4E3A\u5DF2\u542F\u52A8");
  }
  return {
    start(input, exec, invoke, schema) {
      return locked(exec.agent.id, async () => {
        const required = schema?.required, properties = schema?.properties;
        if (!Array.isArray(required) || required.length !== 2 || !["taskId", "requestId"].every((field) => required.includes(field)) || !object(properties) || !["taskId", "requestId", "deviceSelector", "businessInputs", "mode"].every((field) => object(properties[field])) || Object.keys(properties).some((field) => !["taskId", "requestId", "deviceSelector", "businessInputs", "mode"].includes(field))) {
          throw new Error("\u5DE1\u68C0\u670D\u52A1\u5C1A\u672A\u63D0\u4F9B\u76EE\u6807\u56DB\u5DE5\u5177\u76F4\u63A5\u542F\u52A8\u5408\u540C\uFF0C\u7981\u6B62\u8C03\u7528");
        }
        if (!object(input) || Object.keys(input).some((field) => !["taskId", "deviceSelector", "businessInputs", "mode"].includes(field)) || typeof input.taskId !== "string" || !input.taskId.trim()) {
          throw new Error("\u542F\u52A8\u4EC5\u63A5\u53D7\u771F\u5B9E\u4EFB\u52A1\u53CA\u7528\u6237\u9009\u62E9\u7684\u8303\u56F4\u3001\u4E1A\u52A1\u8F93\u5165\u548C\u6A21\u5F0F\uFF1B\u8FD0\u884C\u65F6\u5206\u914D\u7A33\u5B9A\u8BF7\u6C42\u8EAB\u4EFD");
        }
        if (input.deviceSelector !== void 0 && (!object(input.deviceSelector) || !["ALL", "ASSET_IDS", "IP", "CIDR", "TOPOLOGY_GROUP", "ASSET_CLASS", "FILTER"].includes(input.deviceSelector.kind))) {
          throw new Error("\u8BBE\u5907\u9009\u62E9\u5668\u65E0\u6548\uFF0C\u4E0D\u80FD\u731C\u8D44\u4EA7\u7F16\u53F7\u6216\u6539\u4E3A ALL");
        }
        if (input.businessInputs !== void 0 && !object(input.businessInputs)) throw new Error("\u4E1A\u52A1\u8F93\u5165\u987B\u6309\u670D\u52A1\u53C2\u6570\u4F20\u9012");
        if (input.mode !== void 0 && !["FULL", "MUST_PASS"].includes(input.mode)) throw new Error("\u5DE1\u68C0\u6A21\u5F0F\u65E0\u6548\uFF0C\u672A\u542F\u52A8");
        const current = currentUser(exec.agent), record = await load(exec.agent.id);
        const old = await read(legacyPath(exec.agent.id));
        if (old?.attempted && old.context?.userMessageRef === current.context.userMessageRef) {
          throw new Error("\u5F53\u524D\u7528\u6237\u6D88\u606F\u5DF2\u6709\u65E7\u7248\u672C\u5DE1\u68C0\u63D0\u4EA4\uFF0C\u4FDD\u7559\u539F\u8FD0\u884C\u4E0E\u8D26\u672C\uFF0C\u4E0D\u91CD\u590D\u542F\u52A8");
        }
        if (!executionAuthorized(current, record.entries)) throw new Error("\u5F53\u524D\u771F\u5B9E\u7528\u6237\u4EC5\u67E5\u8BE2\u3001\u5426\u5B9A\u6216\u672A\u660E\u786E\u6267\u884C\uFF0C\u5DE1\u68C0\u672A\u542F\u52A8");
        const previous = current.events.slice(0, current.index).reverse().find((event) => event.type === "user/message" && ["user", "schedule"].includes(event.data?.source?.kind))?.data;
        const last = record.entries.at(-1);
        if (!explicitExecution(userText(current.user)) && last?.phase === "NOT_CREATED" && ["NEEDS_INPUT", "NEEDS_SELECTION"].includes(inspectionValue(last.receipt)?.acceptanceStatus) && last.context.userMessageRef === previous?.id) {
          input = {
            ...last.input,
            ...input,
            ...object(last.input.businessInputs) && object(input.businessInputs) ? { businessInputs: { ...last.input.businessInputs, ...input.businessInputs } } : {}
          };
        }
        const unknown = record.entries.find((entry) => entry.phase === "UNKNOWN");
        if (unknown && "definitionVersion" in unknown.input) {
          throw new Error("\u65E7\u4E94\u5DE5\u5177\u8BF7\u6C42\u72B6\u6001\u672A\u77E5\uFF0C\u539F\u8BF7\u6C42\u542B\u76EE\u6807\u670D\u52A1\u4E0D\u63A5\u53D7\u7684\u7248\u672C\u5B57\u6BB5\uFF1B\u4FDD\u7559\u539F\u8D26\u672C\uFF0C\u505C\u6B62\u8DE8\u5408\u540C\u91CD\u8BD5");
        }
        if (unknown && !sameInput(unknown.input, input)) throw new Error("\u539F\u5DE1\u68C0\u63D0\u4EA4\u72B6\u6001\u672A\u77E5\uFF0C\u4E0D\u80FD\u66F4\u6362\u8F93\u5165\u6216\u8BF7\u6C42\u7F16\u53F7\uFF1B\u4FDD\u7559\u539F\u8BF7\u6C42\u6838\u5BF9");
        const id = unknown?.requestId ?? requestId(current.context, input, current.user);
        let state = unknown ?? record.entries.find((entry) => entry.requestId === id);
        if (!state) {
          if (record.entries.some((entry) => entry.context.userMessageRef === current.context.userMessageRef)) {
            throw new Error("\u540C\u4E00\u771F\u5B9E\u7528\u6237\u6D88\u606F\u5DF2\u6709\u5DE1\u68C0\u63D0\u4EA4\uFF0C\u4E0D\u80FD\u6539\u53C2\u6216\u53E6\u5EFA\u8FD0\u884C");
          }
          exec.signal?.throwIfAborted();
          state = { input: structuredClone(input), context: current.context, requestId: id, phase: "UNKNOWN" };
          record.entries.push(state);
          await save(exec.agent.id, record);
        } else if (!sameInput(state.input, input)) throw new Error("\u539F\u8BF7\u6C42\u53C2\u6570\u5DF2\u51BB\u7ED3\uFF0C\u4E0D\u80FD\u4FEE\u6539\u540E\u590D\u7528\u5DF2\u53D7\u7406\u7F16\u53F7");
        if (state.phase !== "UNKNOWN") return state.receipt;
        exec.signal?.throwIfAborted();
        let receipt;
        try {
          receipt = await invoke({ ...state.input, requestId: state.requestId });
        } catch (error) {
          const code = error instanceof Error ? error.code : void 0;
          state.exception = {
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : typeof error === "string" ? error : "\u8C03\u7528\u629B\u51FA\u975E Error \u5F02\u5E38",
            ...typeof code === "string" || typeof code === "number" ? { code } : {}
          };
          await save(exec.agent.id, record);
          throw unconfirmed();
        }
        const value = inspectionValue(receipt);
        if (value?.acceptanceStatus === "ACCEPTED" && typeof value.runId === "string" && value.runId.trim()) {
          state.phase = "ACCEPTED";
          state.receipt = receipt;
        } else if (value && ["NEEDS_INPUT", "NEEDS_SELECTION", "BLOCKED"].includes(value.acceptanceStatus) && !value.runId) {
          state.phase = "NOT_CREATED";
          state.receipt = receipt;
        } else {
          state.failure = receipt;
          await save(exec.agent.id, record);
          throw unconfirmed();
        }
        await save(exec.agent.id, record);
        return receipt;
      });
    }
  };
}
function apply(ctx) {
  const execution = createInspectionExecution(join(process.env.DSH_HOME || homedir(), "inspection-operations"));
  const mounted = /* @__PURE__ */ new WeakMap();
  const actual = (raw) => ctx.mcpSessionManager.resolveTool("inspection", raw);
  function mount(agent) {
    if ((agent.session.header?.delegationDepth ?? 0) !== 0) return;
    let entries = mounted.get(agent);
    if (!entries) {
      entries = /* @__PURE__ */ new Map();
      mounted.set(agent, entries);
    }
    for (const raw of [LIST, START, QUERY]) {
      const toolName = actual(raw), original = toolName && ctx.tools.get(toolName, agent);
      const entry = entries.get(raw);
      if (entry && original === entry.visible) continue;
      if (entry) {
        entry.dispose();
        entries.delete(raw);
      }
      if (!original) continue;
      const schema = original.parameters ?? {}, required = schema.required, sourceProperties = schema.properties;
      const expected = raw === START ? ["taskId", "requestId"] : raw === QUERY ? ["runId"] : [];
      const allowed = raw === START ? ["taskId", "requestId", "deviceSelector", "businessInputs", "mode"] : raw === QUERY ? ["runId"] : [];
      const modern = raw === LIST || Array.isArray(required) && required.length === expected.length && expected.every((field) => required.includes(field)) && object(sourceProperties) && allowed.every((field) => object(sourceProperties[field])) && Object.keys(sourceProperties).every((field) => allowed.includes(field));
      const properties = modern && raw !== LIST ? { ...sourceProperties } : {};
      if (raw === START) delete properties.requestId;
      const wrapper = {
        ...original,
        // 仅收紧技术字段与不兼容 schema；其余保留上游说明、原有参数描述和结果。
        parameters: raw === LIST ? schema : modern ? { ...schema, properties, required: required.filter((field) => field !== "requestId") } : { type: "object", properties: {}, required: [], additionalProperties: false },
        execute(args, exec) {
          if (!modern) throw new Error("\u5DE1\u68C0\u670D\u52A1\u4ECD\u672A\u63D0\u4F9B\u76EE\u6807\u56DB\u5DE5\u5177\u5408\u540C\uFF0C\u7981\u6B62\u65E7\u5951\u7EA6\u8C03\u7528");
          if (raw === LIST) {
            if (!object(args) || Object.keys(args).length) throw new Error("\u76EE\u5F55\u67E5\u8BE2\u65E0\u9700\u53C2\u6570");
            return original.execute(args, exec);
          }
          if (raw === START) return execution.start(args, exec, (value) => original.execute(value, exec), schema);
          if (!object(args) || Object.keys(args).some((field) => field !== "runId") || typeof args.runId !== "string" || !args.runId.trim()) throw new Error("\u540C\u6B21\u5DE1\u68C0\u67E5\u8BE2\u53EA\u80FD\u4F7F\u7528\u771F\u5B9E runId");
          return original.execute(args, exec);
        }
      };
      Object.defineProperty(wrapper, Symbol.for("security-operations.inspection.runtime"), { value: true });
      const dispose = agent.ctx.tools.register(wrapper);
      entries.set(raw, { visible: wrapper, upstream: original, dispose });
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
  createInspectionExecution,
  inject,
  inspectionCatalog,
  inspectionValue,
  name,
  reportLink
};
