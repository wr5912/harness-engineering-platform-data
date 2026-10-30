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

// evolution/experiments/EXP-audit-e2e-assistant-web-004-r9c5e2e27d234/candidate/dsh/managed/receipt-helper/index.ts
var UNIT_RULE = "\u91D1\u989D\u5355\u4F4D\u968F\u5355\u4EF7\u5355\u4F4D\uFF08\u5982\u5143\uFF09\uFF0C\u6570\u91CF\u5355\u4F4D\u968F\u8F93\u5165\u6570\u91CF\u5355\u4F4D\uFF08\u5982\u4EF6\uFF09";
var FIELD_LABEL = {
  unit_price: "\u5355\u4EF7",
  quantity: "\u6570\u91CF"
};
function invalidReason(field, value) {
  const label = FIELD_LABEL[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${label}\u65E0\u6548\uFF1A${JSON.stringify(value)} \u4E0D\u662F\u6709\u9650\u6570\u503C\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u5408\u8BA1`;
  }
  if (value < 0) {
    return `${label}\u65E0\u6548\uFF1A${value} \u4E0D\u662F\u975E\u8D1F\u6570\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u5408\u8BA1`;
  }
  return null;
}
var receiptTotalTool = value0({
  name: "receipt_total",
  description: "\u6536\u636E\u5408\u8BA1\u53EA\u8BFB\u8BA1\u7B97\u5DE5\u5177\uFF1A\u63A5\u6536\u5355\u4EF7 unit_price \u4E0E\u6570\u91CF quantity\uFF0C\u8FD4\u56DE\u53EF\u6838\u5BF9\u7684\u4E58\u79EF\u5408\u8BA1\u4E0E\u5355\u4F4D\u8BF4\u660E\u3002\u4EC5\u505A\u672C\u5730\u4E58\u6CD5\uFF0C\u4E0D\u8BBF\u95EE\u5916\u90E8\u7CFB\u7EDF\u3001\u4E0D\u4FDD\u5B58\u4E1A\u52A1\u6570\u636E\uFF1B\u8F93\u5165\u4E0D\u662F\u6709\u9650\u975E\u8D1F\u6570\u65F6\u5982\u5B9E\u8FD4\u56DE\u4E0D\u53EF\u8BA1\u7B97\u539F\u56E0\u3002",
  parameters: {
    unit_price: {
      type: "number",
      required: true,
      description: "\u5355\u4EF7\uFF08\u91D1\u989D/\u4EF6\uFF09\uFF0C\u5FC5\u987B\u4E3A\u6709\u9650\u7684\u975E\u8D1F\u6570"
    },
    quantity: {
      type: "number",
      required: true,
      description: "\u6570\u91CF\uFF08\u4EF6\uFF09\uFF0C\u5FC5\u987B\u4E3A\u6709\u9650\u7684\u975E\u8D1F\u6570"
    }
  },
  output: {
    schema: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean", const: true, required: true },
            formula: { type: "string", required: true, description: "\u53EF\u6838\u5BF9\u7B97\u5F0F\uFF1A\u5355\u4EF7 \xD7 \u6570\u91CF = \u5408\u8BA1" },
            unit_price: { type: "number", required: true },
            quantity: { type: "number", required: true },
            total: { type: "number", required: true, description: "\u5408\u8BA1 = \u5355\u4EF7 \xD7 \u6570\u91CF" },
            unit: { type: "string", required: true, description: "\u5408\u8BA1\u5355\u4F4D\u8BF4\u660E" }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean", const: false, required: true },
            computable: { type: "boolean", const: false, required: true },
            field: { type: "string", enum: ["unit_price", "quantity"], required: true },
            reason: { type: "string", required: true, description: "\u660E\u786E\u7684\u4E0D\u53EF\u8BA1\u7B97\u539F\u56E0" },
            requirement: { type: "string", required: true, description: "\u9700\u8981\u7528\u6237\u63D0\u4F9B\u7684\u6709\u6548\u8F93\u5165" }
          }
        }
      ]
    },
    render: (_args, value) => {
      const text = value.ok ? `receipt_total \u8BA1\u7B97\u6210\u529F\uFF1A${value.formula}\uFF1B\u5408\u8BA1 ${value.total}\uFF1B${value.unit}` : `receipt_total \u65E0\u6CD5\u8BA1\u7B97\uFF08ok=false\uFF09\uFF1A${value.reason}\u3002${value.requirement}`;
      return [{ type: "text", text }];
    }
  },
  execute: async (args) => {
    const unitPrice = args.unit_price;
    const quantity = args.quantity;
    const badUnitPrice = invalidReason("unit_price", unitPrice);
    const badQuantity = invalidReason("quantity", quantity);
    if (badUnitPrice !== null || badQuantity !== null) {
      const field = badUnitPrice !== null ? "unit_price" : "quantity";
      const reason = badUnitPrice !== null ? badUnitPrice : badQuantity;
      return {
        ok: false,
        computable: false,
        field,
        reason,
        requirement: `\u8BF7\u63D0\u4F9B\u6709\u6548\u7684${FIELD_LABEL[field]}\uFF08\u6709\u9650\u7684\u975E\u8D1F\u6570\uFF09\u540E\u91CD\u65B0\u8BA1\u7B97`
      };
    }
    const total = unitPrice * quantity;
    return {
      ok: true,
      formula: `${unitPrice} \xD7 ${quantity} = ${total}`,
      unit_price: unitPrice,
      quantity,
      total,
      unit: UNIT_RULE
    };
  }
});
var name = "receipt-helper";
var inject = ["tools"];
function apply(ctx) {
  ctx.tools.register(receiptTotalTool);
}
export {
  apply,
  inject,
  name
};
