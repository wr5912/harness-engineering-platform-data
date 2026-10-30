// evolution/experiments/EXP-migration-dsh-demo-001-r20ef75d026f1/candidate/dsh/managed/tools.ts
var name = "migration-quote-tools";
var inject = ["tools"];
function apply(ctx) {
  ctx.tools.register({
    name: "quote",
    description: "\u8BA1\u7B97\u6298\u6263\u540E\u62A5\u4EF7",
    parameters: { type: "object", properties: { quantity: { type: "number" }, unit_price: { type: "number" }, discount_pct: { type: "number" } }, required: ["quantity", "unit_price", "discount_pct"] },
    output: { schema: { type: "object", properties: { quantity: { type: "number" }, unit_price: { type: "number" }, discount_pct: { type: "number" }, total: { type: "number" } }, required: ["quantity", "unit_price", "discount_pct", "total"] }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    async execute(input) {
      if (input.quantity < 0 || input.unit_price < 0 || input.discount_pct < 0 || input.discount_pct > 100) throw new Error("\u62A5\u4EF7\u53C2\u6570\u8D85\u51FA\u8303\u56F4");
      return { ...input, total: Math.round(input.quantity * input.unit_price * (1 - input.discount_pct / 100) * 100) / 100 };
    }
  });
}
export {
  apply,
  inject,
  name
};
