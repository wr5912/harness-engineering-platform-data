// evolution/experiments/EXP-migration-agentscope-demo-001-rd991aeb01b21/candidate/dsh/managed/tools.ts
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
var name = "migration-agentscope-version-tools";
var inject = ["tools"];
var PYTHON_BRIDGE = fileURLToPath(new URL("./python/version_tool_cli.py", import.meta.url));
function runVersionTool(input, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("\u8C03\u7528\u5DF2\u53D6\u6D88\uFF08AbortSignal \u5DF2\u4E2D\u6B62\uFF09"));
      return;
    }
    const child = spawn("python3", [PYTHON_BRIDGE], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onAbort = () => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("\u8C03\u7528\u5DF2\u53D6\u6D88\uFF08AbortSignal \u4E2D\u6B62\u4E86 Python3 \u5B50\u8FDB\u7A0B\uFF09")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => finish(() => reject(new Error("Python3 \u8FDB\u7A0B\u542F\u52A8\u5931\u8D25\uFF1A" + err.message))));
    child.on("close", (code) => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        finish(() => reject(new Error(`Python \u6865\u63A5\u8FD4\u56DE\u975E JSON\uFF08\u9000\u51FA\u7801 ${code}\uFF09\uFF1A${(stderr || stdout).slice(0, 400)}`)));
        return;
      }
      if (code !== 0 || !parsed.ok || !parsed.value) {
        const detail = parsed.error?.message || stderr.trim() || "\u672A\u77E5\u9519\u8BEF";
        const kind = parsed.error?.type ? `\uFF0C${parsed.error.type}` : "";
        finish(() => reject(new Error(`Python \u5DE5\u5177\u9519\u8BEF\uFF08\u9000\u51FA\u7801 ${code}${kind}\uFF09\uFF1A${detail}`)));
        return;
      }
      finish(() => resolve(parsed.value));
    });
    child.stdin.on("error", () => {
    });
    child.stdin.end(JSON.stringify(input));
  });
}
function apply(ctx) {
  ctx.tools.register({
    name: "select_newer_version",
    description: "\u6BD4\u8F83\u4E24\u4E2A\u7248\u672C\u53F7\u5E76\u8FD4\u56DE\u8F83\u65B0\u8005\u3002\u7ECF Python3 \u5B50\u8FDB\u7A0B\u8C03\u7528 packaging.version \u7684\u72EC\u7ACB\u4E1A\u52A1\u51FD\u6570\u5B9E\u73B0\u3002\u6BD4\u8F83\u7248\u672C\u5FC5\u987B\u4F7F\u7528\u672C\u5DE5\u5177\uFF0C\u4E0D\u8981\u81EA\u884C\u5224\u65AD\u3002\u8F93\u5165\u5FC5\u987B\u662F\u5408\u6CD5\u7248\u672C\u53F7\uFF0C\u5426\u5219\u5DE5\u5177\u62A5\u9519\u3002",
    parameters: {
      type: "object",
      properties: {
        left: { type: "string", description: "\u5DE6\u4FA7\u7248\u672C\u53F7\uFF0C\u4F8B\u5982 1.9" },
        right: { type: "string", description: "\u53F3\u4FA7\u7248\u672C\u53F7\uFF0C\u4F8B\u5982 1.10" }
      },
      required: ["left", "right"]
    },
    output: {
      schema: {
        type: "object",
        properties: {
          left: { type: "string" },
          right: { type: "string" },
          newer: { type: "string" },
          runtime: {
            type: "object",
            properties: {
              python: { type: "string" },
              packaging: { type: "string" },
              bridge: { type: "string" }
            },
            required: ["python", "packaging", "bridge"]
          }
        },
        required: ["left", "right", "newer", "runtime"]
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
    },
    async execute(input, exec) {
      return await runVersionTool(input, exec?.signal);
    }
  });
}
export {
  apply,
  inject,
  name
};
