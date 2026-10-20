// ../../../../harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-023-r2233d74f6fb3/candidate/dsh/managed/asset-alerts-atomic/index.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
var name = "asset-alerts-atomic";
var inject = ["tools"];
function apply(ctx) {
  const bytes = readFileSync(fileURLToPath(new URL("../compute-workflow/fixtures.json", import.meta.url)));
  const fixture = JSON.parse(bytes.toString("utf8"));
  if (fixture.mode !== "mock-replay") throw new Error("\u672C\u6B21\u5171\u540C\u57FA\u51C6\u5FC5\u987B\u4F7F\u7528\u5DF2\u51BB\u7ED3\u7684 Mock/replay \u5916\u90E8\u6837\u672C");
  const fixedInputSha256 = createHash("sha256").update(bytes).digest("hex");
  const operations = ["get_soc_asset_by_asset_id", "list_detect_alert"];
  for (const operation of operations) ctx.tools.register({
    name: operation,
    description: operation === "get_soc_asset_by_asset_id" ? "\u8D44\u4EA7\u5173\u8054\u544A\u8B66\u7814\u7A76\uFF1A\u6309\u6574\u6570 assetId \u67E5\u8BE2\u8D44\u4EA7\u8BE6\u60C5\uFF1B\u6765\u81EA\u56FA\u5B9A Mock/replay \u5916\u90E8 GET \u6837\u672C\uFF0C\u5FC5\u987B\u68C0\u67E5 HTTP \u72B6\u6001\u3001\u4E1A\u52A1 code \u548C data.assetId\u3002" : "\u8D44\u4EA7\u5173\u8054\u544A\u8B66\u7814\u7A76\uFF1A\u6309\u5B9E\u9645\u8D44\u4EA7\u8BE6\u60C5\u4E2D\u7684 ID \u67E5\u8BE2\u8FD130\u5929\u9996\u9875\u544A\u8B66\u5206\u7EC4\uFF1Breq\u6309\u539FOpenAPI\u53C2\u6570\u4F20\u5165\u3002\u6765\u81EA\u56FA\u5B9AMock/replay\uFF0C\u7A7A\u7ED3\u679C\u548C\u5931\u8D25\u5FC5\u987B\u533A\u5206\u3002",
    parameters: fixture.tool_schemas[operation],
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(args, execution) {
      execution.signal.throwIfAborted();
      const assetId = operation === "get_soc_asset_by_asset_id" ? String(args.assetId) : String(args.req.assetId);
      const sample = fixture.cases[assetId];
      if (!sample) throw new Error("\u5F53\u524D\u8D44\u4EA7\u4E0D\u5728\u672C\u6B21\u56FA\u5B9A\u6837\u672C\u4E2D\uFF1B\u672A\u67E5\u8BE2\u5728\u7EBF\u7CFB\u7EDF");
      if (operation === "list_detect_alert" && (args.req.pageNum !== 1 || args.req.pageSize !== 5 || args.req.windowSeconds !== 2592e3)) throw new Error("\u672C\u6B21\u51BB\u7ED3\u6837\u672C\u4EC5\u8986\u76D6\u8FD130\u5929\u3001\u7B2C1\u9875\u3001\u6BCF\u98755\u7EC4\uFF1B\u672A\u67E5\u8BE2\u5176\u4ED6\u8303\u56F4");
      const reply = operation === "get_soc_asset_by_asset_id" ? sample.asset : sample.alerts;
      if (!reply) throw new Error("\u8D44\u4EA7\u67E5\u8BE2\u5931\u8D25\u7684\u6837\u672C\u6CA1\u6709\u540E\u7EED\u544A\u8B66\u54CD\u5E94\uFF0C\u4E0D\u5F97\u7EE7\u7EED\u67E5\u8BE2");
      const ok = reply.status >= 200 && reply.status < 300 && reply.json.code === 200;
      return {
        ok,
        status: reply.status,
        json: structuredClone(reply.json),
        fixed_input_sha256: fixedInputSha256,
        receipt: {
          mode: fixture.mode,
          source_kind: "basic_mock",
          fixture_provenance: sample.provenance,
          fixed_input_sha256: fixedInputSha256,
          operation_id: operation,
          method: "GET",
          arguments: args,
          path: operation === "get_soc_asset_by_asset_id" ? `/api/v1/security-operations/readonly/assets/${assetId}` : "/api/v1/security-operations/readonly/alerts"
        }
      };
    }
  });
}
export {
  apply,
  inject,
  name
};
