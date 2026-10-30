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

// evolution/experiments/EXP-migration-opencode-demo-001-r2085b6b7a566/candidate/dsh/managed/reviewer.ts
var name = "tool-reviewer";
var inject = ["tools", "subagents"];
function textOf(value, depth = 0) {
  if (value === null || value === void 0 || depth > 3) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => textOf(item, depth + 1)).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value;
    for (const key of ["output", "text", "answer", "content", "review"]) {
      if (key in record) {
        const text = textOf(record[key], depth + 1);
        if (text.trim()) return text;
      }
    }
  }
  return "";
}
function requireProjectedConfig(config) {
  const value = config ?? {};
  const agentPreset = value.agentPreset;
  if (typeof agentPreset !== "string" || !agentPreset.trim()) {
    throw new Error(
      "reviewer \u5DE5\u5177\u7F3A\u5C11\u6CE8\u5165\u7684 config.agentPreset\uFF1B\u8BF7\u7531\u5E73\u53F0\u6A21\u578B\u6295\u5F71\u6309 harness.yaml model_bindings.presets \u63D0\u4F9B\uFF08\u5165\u53E3\u58F0\u660E config.harnessModelRole\uFF09"
    );
  }
  const agentOptions = value.agentOptions;
  if (!agentOptions || typeof agentOptions !== "object") {
    throw new Error(
      "reviewer \u5DE5\u5177\u7F3A\u5C11\u6CE8\u5165\u7684 config.agentOptions\uFF1B\u8BF7\u7531\u5E73\u53F0\u6A21\u578B\u6295\u5F71\u6309 harness.yaml model_bindings.presets \u63D0\u4F9B\uFF08\u5165\u53E3\u58F0\u660E config.harnessModelRole\uFF09"
    );
  }
  const provider = agentOptions.provider;
  const model = agentOptions.model;
  const reasoningEffort = agentOptions.reasoningEffort;
  if (typeof provider !== "string" || !provider.trim() || typeof model !== "string" || !model.trim()) {
    throw new Error("reviewer \u5DE5\u5177\u6CE8\u5165\u7684 config.agentOptions \u7F3A\u5C11\u6709\u6548\u7684 provider/model");
  }
  if (typeof reasoningEffort !== "string" || !reasoningEffort.trim()) {
    throw new Error("reviewer \u5DE5\u5177\u6CE8\u5165\u7684 config.agentOptions \u7F3A\u5C11\u6709\u6548\u7684 reasoningEffort");
  }
  return {
    agentPreset,
    agentOptions: { provider, model, reasoningEffort }
  };
}
function apply(ctx, config) {
  const projected = requireProjectedConfig(config);
  ctx.tools.register(value0({
    name: "reviewer",
    description: "\u59D4\u6D3E reviewer \u5B50\u89D2\u8272\u590D\u6838\u5B9E\u9645\u6539\u52A8\uFF08\u53EA\u8BFB\u590D\u6838\uFF0C\u4E0D\u4FEE\u6539\u6587\u4EF6\uFF09\u3002\u672C\u8C03\u7528\u963B\u585E\u7B49\u5F85 reviewer \u5B8C\u6210\u5E76\u8FD4\u56DE\u5176\u590D\u6838\u7ED3\u8BBA\uFF1B\u6536\u5230\u590D\u6838\u7ED3\u8BBA\u524D\u4E0D\u5F97\u4F5C\u6700\u7EC8\u7B54\u590D\u3002task \u9700\u5199\u660E reviewer \u8981\u8BFB\u53D6\u7684\u9879\u76EE\u6587\u4EF6\u3001\u5B9E\u9645\u4FEE\u6539\u5185\u5BB9\u4E0E\u6D4B\u8BD5\u7ED3\u679C\u3002",
    parameters: {
      task: {
        type: "string",
        required: true,
        description: "\u7ED9 reviewer \u7684\u590D\u6838\u4EFB\u52A1\uFF1A\u9700\u8981\u8BFB\u53D6\u7684\u9879\u76EE\u6587\u4EF6\u3001\u5B9E\u9645\u4FEE\u6539\u5185\u5BB9\u4E0E\u6D4B\u8BD5\u7ED3\u679C\u3001\u590D\u6838\u8981\u6C42\u3002"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          subagentId: { type: "string", required: true, description: "reviewer \u5B50\u4F1A\u8BDD ID" },
          review: { type: "string", required: true, description: "reviewer \u7684\u590D\u6838\u7ED3\u8BBA" }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: `reviewer ${value.subagentId} \u590D\u6838\u7ED3\u8BBA\uFF1A
${value.review}`
      }]
    },
    async execute(args, exec) {
      const parent = exec.agent;
      if (!parent) throw new Error("reviewer \u5DE5\u5177\u9700\u8981\u8C03\u7528\u65B9 Agent\uFF08exec.agent \u672A\u5B9A\u4E49\uFF09");
      const signal = exec.signal;
      signal?.throwIfAborted();
      const activation = await ctx.subagents.startActivation({
        provider: "spawn",
        label: "reviewer",
        request: {
          prompt: [{ type: "text", text: args.task }],
          parent,
          agentPreset: projected.agentPreset,
          agentOptions: projected.agentOptions
        },
        signal,
        delivery: "caller"
      });
      const onAbort = () => {
        void Promise.resolve(activation.dispose()).catch(() => void 0);
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      try {
        if (signal?.aborted) onAbort();
        const outcome = await activation.result;
        const stop = outcome && typeof outcome === "object" ? outcome.stopReason ?? outcome.stop_reason ?? null : null;
        if (stop && stop !== "completed") {
          throw new Error(`reviewer \u5B50\u4EFB\u52A1\u672A\u6B63\u5E38\u5B8C\u6210\uFF08stopReason=${String(stop)}\uFF09`);
        }
        const review = textOf(outcome);
        if (!review.trim()) throw new Error("reviewer \u672A\u8FD4\u56DE\u6709\u6548\u590D\u6838\u7ED3\u8BBA");
        return { subagentId: activation.childId, review };
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
        await activation.dispose();
      }
    }
  }));
}
export {
  apply,
  inject,
  name
};
