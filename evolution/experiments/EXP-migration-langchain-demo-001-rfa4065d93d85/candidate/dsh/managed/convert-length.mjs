// ../work/harness-engineering-platform/runtime/adapters/dsh-web/src/resolve-runtime.ts
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

// native-dsh:@deepseek-ai/dsh-tools
var native = await runtimeModule("@deepseek-ai/dsh-tools");
var value0 = native["defineTool"];
var value1 = native["valueSchemaSpecToJsonSchema"];
var value2 = native["parameterSchemaSpecToJsonSchema"];
var value3 = native["validateArgs"];
var value4 = native["ToolArgsError"];
var value5 = native["assertSupportedJsonSchema"];
var value6 = native["assertObjectJsonSchema"];
var value7 = native["validateJsonSchemaValue"];
var value8 = native["JsonSchemaError"];
var value9 = native["CodeRunFailedError"];
var value10 = native["RUN_CODE_NAME"];
var value11 = native["jsonSchemaToTs"];
var value12 = native["renderToolsSdk"];
var value13 = native["jsonSchemaToPy"];
var value14 = native["renderToolsSdkPy"];
var value15 = native["defineContentToolFixture"];
var value16 = native["TOOL_RUNTIME_SCHEDULER"];
var value17 = native["TOOL_ABORTED"];
var value18 = native["TOOL_ABORTED_BEFORE_DISPATCH"];
var value19 = native["ToolNotFoundError"];
var value20 = native["ToolOutputError"];
var value21 = native["ToolRuntime"];
var dsh_tools_default = native.default;

// native-dsh:@deepseek-ai/dsh-llm
var native2 = await runtimeModule("@deepseek-ai/dsh-llm");
var value02 = native2["assertUsableApiKey"];
var value110 = native2["BlockAssembler"];
var value22 = native2["callConfigEquals"];
var value32 = native2["isAgentLoopRequest"];
var value42 = native2["markAgentLoopRequest"];
var value52 = native2["LlmError"];
var value62 = native2["LlmAdapter"];
var value72 = native2["LlmRuntime"];
var value82 = native2["userAgent"];
var value92 = native2["attributionHeaders"];
var value102 = native2["APP_IDENTITY"];
var value112 = native2["MessageId"];
var value122 = native2["ToolCallId"];
var value132 = native2["ProviderRequestId"];
var value142 = native2["LlmAttemptId"];
var value152 = native2["ReasoningEffortId"];
var value162 = native2["isContextWindowExceededError"];
var value172 = native2["isQuotaExceededError"];
var value182 = native2["errorChain"];
var value192 = native2["isHarnessError"];
var value202 = native2["HarnessError"];
var value212 = native2["CONTEXT_WINDOW_EXCEEDED_CODE"];
var value222 = native2["QUOTA_EXCEEDED_CODE"];
var value23 = native2["ACCOUNT_QUOTA_EXCEEDED_CODE"];
var value24 = native2["EMPTY_RESPONSE_CODE"];
var value25 = native2["INVALID_CREDENTIAL_CODE"];
var value26 = native2["IMAGE_OFFLOAD_REQUIRED_CODE"];
var value27 = native2["normalizeApiKey"];
var value28 = native2["resolveImageAttachmentAccess"];
var value29 = native2["textOnlyImageText"];
var value30 = native2["requestImageHandleText"];
var value31 = native2["offloadedImageText"];
var value322 = native2["contentHasImage"];
var value33 = native2["contentHasFile"];
var value34 = native2["fileHandleText"];
var value35 = native2["projectFilesToText"];
var value36 = native2["projectOffloadedImages"];
var value37 = native2["requiredImageOffload"];
var value38 = native2["projectImagesForTextModel"];
var value39 = native2["projectToolUpdates"];
var value40 = native2["expandAssistantStream"];
var value41 = native2["isTokenDelta"];
var value422 = native2["isVisibleChunk"];
var value43 = native2["chunkHasVisibleText"];
var value44 = native2["runFirstTokenTime"];
var value45 = native2["runFirstVisibleTime"];
var value46 = native2["assistantStreamFirstTokenTime"];
var value47 = native2["assistantStreamHasVisibleContent"];
var value48 = native2["assistantStreamHasVisibleText"];
var value49 = native2["lastAssistantStreamChunk"];
var value50 = native2["assistantStreamChunks"];
var value51 = native2["joinAssistantStreamText"];
var value522 = native2["assembleAssistantStream"];
var value53 = native2["AssistantStreamAccumulator"];
var value54 = native2["boundContextSummary"];
var value55 = native2["freezeMessage"];
var value56 = native2["createMessage"];
var value57 = native2["createDeveloperMessage"];
var value58 = native2["createUserMessage"];
var value59 = native2["createAssistantMessage"];
var value60 = native2["createSystemMessage"];
var value61 = native2["createToolResultMessage"];
var value622 = native2["CONTEXT_SUMMARY_MAX_CHARS"];
var value63 = native2["resolveRetryPolicy"];
var value64 = native2["RetryPolicySchema"];
var dsh_llm_default = native2.default;

// evolution/experiments/EXP-migration-langchain-demo-001-rfa4065d93d85/candidate/dsh/managed/convert-length.ts
var convertLengthTool = {
  name: "convert_length",
  description: "\u7C73\u4E0E\u5398\u7C73\u6362\u7B97",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["value", "from", "to"],
    properties: {
      value: { type: "number", description: "\u5F85\u6362\u7B97\u6570\u503C\uFF0C\u5FC5\u987B\u4E3A\u975E\u8D1F\u6570" },
      from: { type: "string", enum: ["m", "cm"], description: "\u6765\u6E90\u5355\u4F4D\uFF1Am \u6216 cm" },
      to: { type: "string", enum: ["m", "cm"], description: "\u76EE\u6807\u5355\u4F4D\uFF1Am \u6216 cm" }
    }
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["value", "unit"],
      properties: {
        value: { type: "number", description: "\u6362\u7B97\u7ED3\u679C\u6570\u503C" },
        unit: { type: "string", enum: ["m", "cm"], description: "\u7ED3\u679C\u5355\u4F4D" }
      }
    },
    render: (_args, value) => {
      return [{ type: "text", text: JSON.stringify(value) }];
    }
  },
  execute: async (args, _exec) => {
    const { value, from, to } = args ?? {};
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("convert_length \u53C2\u6570\u9519\u8BEF\uFF1Avalue \u5FC5\u987B\u662F\u6570\u503C");
    }
    if (value < 0) {
      throw new Error("convert_length \u53C2\u6570\u9519\u8BEF\uFF1Avalue \u5FC5\u987B\u4E3A\u975E\u8D1F\u6570\u503C");
    }
    if (from !== "m" && from !== "cm") {
      throw new Error("convert_length \u53C2\u6570\u9519\u8BEF\uFF1Afrom \u4EC5\u652F\u6301 m \u6216 cm");
    }
    if (to !== "m" && to !== "cm") {
      throw new Error("convert_length \u53C2\u6570\u9519\u8BEF\uFF1Ato \u4EC5\u652F\u6301 m \u6216 cm");
    }
    if (from === to) {
      return { value, unit: to };
    }
    return { value: from === "m" ? value * 100 : value / 100, unit: to };
  }
};
var FINAL_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["value", "unit", "explanation"],
  properties: {
    value: { type: "number", description: "\u6362\u7B97\u7ED3\u679C\u6570\u503C" },
    unit: { type: "string", enum: ["m", "cm"], description: "\u7ED3\u679C\u5355\u4F4D" },
    explanation: { type: "string", description: "\u975E\u7A7A\u4E2D\u6587\u8BF4\u660E" }
  }
};
var MAX_CORRECTIONS = 2;
var turnStates = /* @__PURE__ */ new Map();
var replayBlockedSessions = /* @__PURE__ */ new Set();
function guardState(session, turn) {
  let byTurn = turnStates.get(session);
  if (byTurn === void 0) {
    byTurn = /* @__PURE__ */ new Map();
    turnStates.set(session, byTurn);
  }
  let state = byTurn.get(turn);
  if (state === void 0) {
    state = { convertSucceeded: false, pendingCallIds: /* @__PURE__ */ new Set(), lastAssistantText: "", corrections: 0 };
    byTurn.set(turn, state);
  }
  return state;
}
function dropTurn(session, turn) {
  const byTurn = turnStates.get(session);
  byTurn?.delete(turn);
  if (byTurn !== void 0 && byTurn.size === 0) turnStates.delete(session);
  replayBlockedSessions.delete(session);
}
function textOf(content) {
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n");
}
function finalOutputViolations(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return ["\u6700\u7EC8\u7B54\u590D\u4E0D\u662F\u5408\u6CD5 JSON"];
  }
  const violations = value7(FINAL_OUTPUT_SCHEMA, parsed);
  if (violations.length > 0) return violations;
  const explanation = parsed.explanation;
  if (typeof explanation !== "string" || explanation.trim() === "") {
    return ["explanation \u5FC5\u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32"];
  }
  return [];
}
function installFinalOutputGuard(ctx) {
  ctx.on("session/event", (session, event) => {
    const data = event?.data;
    const turn = typeof data?.turn === "number" ? data.turn : void 0;
    if (event?.type === "tool/call" && turn !== void 0 && data?.name === "convert_length" && typeof data.callId === "string") {
      guardState(session, turn).pendingCallIds.add(data.callId);
    } else if (event?.type === "tool/result" && turn !== void 0) {
      const message = data?.message;
      const callId = message?.toolCallId;
      const state = turnStates.get(session)?.get(turn);
      if (state !== void 0 && typeof callId === "string" && state.pendingCallIds.delete(callId) && message?.isError !== true) {
        state.convertSucceeded = true;
      }
    } else if (event?.type === "assistant/message" && turn !== void 0) {
      guardState(session, turn).lastAssistantText = textOf(data?.message?.content);
    } else if (event?.type === "turn/end" && turn !== void 0) {
      dropTurn(session, turn);
    }
  });
  ctx.on("session/disposed", (session) => {
    turnStates.delete(session);
    replayBlockedSessions.delete(session);
  });
  ctx.tools.guard((execution) => {
    if (execution.name !== "convert_length") return void 0;
    const session = execution.agent?.session;
    if (session !== void 0 && replayBlockedSessions.has(session)) {
      return "\u7EA0\u6B63\u56DE\u5408\u4E0D\u5F97\u91CD\u653E convert_length\uFF1A\u8BF7\u53EA\u8F93\u51FA\u4FEE\u6B63\u540E\u7684\u6700\u7EC8 JSON\uFF0C\u4E0D\u8981\u91CD\u65B0\u8C03\u7528\u6362\u7B97\u5DE5\u5177";
    }
    return void 0;
  });
  ctx.on("agent/turn-stopping", (payload) => {
    const { agent, turn } = payload;
    const state = turnStates.get(agent.session)?.get(turn);
    if (state === void 0) return;
    if (!state.convertSucceeded) return;
    const violations = finalOutputViolations(state.lastAssistantText);
    if (violations.length === 0) return;
    if (state.corrections >= MAX_CORRECTIONS) {
      dropTurn(agent.session, turn);
      throw new Error(`\u6700\u7EC8\u7B54\u590D\u7ED3\u6784\u6821\u9A8C\u5931\u8D25\uFF08convert_length \u6210\u529F\u5206\u652F\uFF09\uFF1A${violations.join("\uFF1B")}\u3002\u5DF2\u540C\u8F6E\u7EA0\u6B63 ${MAX_CORRECTIONS} \u6B21\u4ECD\u4E0D\u5408\u683C\uFF0C\u505C\u6B62\u672C turn\u3002`);
    }
    state.corrections += 1;
    replayBlockedSessions.add(agent.session);
    agent.steer(value58({
      content: [{
        type: "text",
        text: `\u6700\u7EC8\u7B54\u590D\u7ED3\u6784\u7EA0\u6B63\uFF08\u7B2C ${state.corrections}/${MAX_CORRECTIONS} \u6B21\uFF09\uFF1A\u4E0A\u4E00\u6761\u6700\u7EC8\u7B54\u590D\u4E0D\u7B26\u5408\u7EA6\u5B9A\u8F93\u51FA\u7ED3\u6784\uFF1A${violations.join("\uFF1B")}\u3002\u8BF7\u53EA\u8F93\u51FA\u4FEE\u6B63\u540E\u7684\u6700\u7EC8 JSON \u5BF9\u8C61\uFF0C\u4EC5\u542B\u4E09\u4E2A\u5B57\u6BB5\uFF1Avalue\uFF08\u6362\u7B97\u6570\u503C\uFF09\u3001unit\uFF08"m" \u6216 "cm"\uFF09\u3001explanation\uFF08\u975E\u7A7A\u4E2D\u6587\u8BF4\u660E\uFF09\uFF1B\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u5B83\u6587\u5B57\uFF0C\u4E5F\u4E0D\u8981\u8C03\u7528\u4EFB\u4F55\u5DE5\u5177\uFF08\u5305\u62EC convert_length\uFF09\u3002`
      }],
      // 专用来源 kind（notice 形态）：如实归因为最终输出 guard 的自动补正，不冒充人工用户输入。
      source: { kind: "migration-output-validation", form: "notice", summary: "\u6700\u7EC8\u8F93\u51FA\u9700\u8981\u683C\u5F0F\u8865\u6B63" }
    }));
  });
}
var name = "convert-length-tool";
var inject = ["tools"];
function apply(ctx) {
  ctx.tools.register(convertLengthTool);
  installFinalOutputGuard(ctx);
}
export {
  apply,
  inject,
  name
};
