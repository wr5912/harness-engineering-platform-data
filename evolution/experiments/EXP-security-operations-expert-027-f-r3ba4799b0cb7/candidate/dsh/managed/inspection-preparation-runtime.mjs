import { createHash } from "node:crypto";
const name = "inspection-preparation-runtime";
const inject = ["tools", "mcpSessionManager"];
const runs = ["inspection_baseline", "inspection_vulnerabilities", "inspection_reachability", "inspection_routine", "inspection_deep"];
const queries = ["get_composition_run", "get_composition_details", "get_composition_artifact"];
function inspectionExecution(raw, exec) {
  const agent = exec.agent, events = agent?.session?.snapshotEvents?.();
  const messages = events?.filter((event) => event.type === "user/message" && ["user", "schedule"].includes(event.data?.source?.kind)).map((event) => event.data);
  const current = messages?.at(-1);
  if (!agent?.id || !current?.id || (agent.session.header?.delegationDepth ?? 0) !== 0) throw new Error("\u5DE1\u68C0\u7F3A\u5C11\u771F\u5B9E\u4E3B\u4F1A\u8BDD\u6216\u7528\u6237/\u5B9A\u65F6\u6D88\u606F");
  const identity = createHash("sha256").update(JSON.stringify([agent.id, current.id, raw])).digest("hex");
  return { ...exec, callId: `inspection-${identity}` };
}
function apply(ctx) {
  const mounted = /* @__PURE__ */ new WeakMap();
  function mount(agent) {
    if ((agent.session.header?.delegationDepth ?? 0) !== 0) return;
    let entries = mounted.get(agent);
    if (!entries) {
      entries = /* @__PURE__ */ new Map();
      mounted.set(agent, entries);
    }
    for (const raw of [...runs, ...queries]) {
      const toolName = ctx.mcpSessionManager.resolveTool("inspection-compositions", raw);
      const original = toolName && ctx.tools.get(toolName, agent), entry = entries.get(raw);
      if (entry && original === entry.visible) continue;
      if (entry) {
        entry.dispose();
        entries.delete(raw);
      }
      if (!original) continue;
      const wrapper = { ...original, execute(args, exec) {
        return original.execute(args, runs.includes(raw) ? inspectionExecution(raw, exec) : exec);
      } };
      Object.defineProperty(wrapper, Symbol.for("security-operations.inspection.runtime"), { value: true });
      const dispose = agent.ctx.tools.register(wrapper);
      entries.set(raw, { visible: wrapper, dispose });
      ctx.effect(() => dispose);
    }
  }
  ctx.on("agent/created", ({ agent }) => mount(agent));
  ctx.on("agent/pre-step", async ({ agent }, next) => {
    mount(agent);
    return next();
  });
}
export {
  apply,
  inject,
  inspectionExecution,
  name
};
