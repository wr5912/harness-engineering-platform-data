// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts
import { createHash as createHash2 } from "node:crypto";

// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs
import { createHash } from "node:crypto";
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var identifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\s\u0000-\u001f\u007f]/u.test(value);
var integer = (value) => Number.isSafeInteger(value) && value >= 0;
var fail = (message) => {
  throw new Error(message);
};
var hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
var escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[char]);
var textOnly = (content) => Array.isArray(content) && content.length > 0 && content.every((part) => part?.type === "text" && typeof part.text === "string") ? content.map((part) => part.text).join("") : void 0;
var visibleText = (content) => Array.isArray(content) ? content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("") : "";
var parseObject = (text) => {
  if (typeof text !== "string") return void 0;
  try {
    const value = JSON.parse(text);
    return object(value) ? value : void 0;
  } catch {
    return void 0;
  }
};
function ownEvents(input) {
  if (!Array.isArray(input) || input.some((event, index) => !object(event) || !integer(event.seq) || typeof event.type !== "string" || !object(event.data) || index > 0 && event.seq <= input[index - 1].seq)) {
    fail("\u62A5\u544A\u6765\u6E90\u5FC5\u987B\u662F\u6309\u5E8F\u3001\u65E0\u91CD\u590D\u5E8F\u53F7\u7684\u539F\u751F\u4F1A\u8BDD\u4E8B\u4EF6\u3002");
  }
  const cut = input.findLastIndex((event) => event.type === "session/end-seed" && event.data.inherited === true);
  return input.slice(cut + 1);
}
function successfulPairs(events, includeErrors = false) {
  const calls = /* @__PURE__ */ new Map(), receipts = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event.type === "tool/call" && identifier(event.data.callId)) {
      const list = calls.get(event.data.callId) ?? [];
      list.push(event);
      calls.set(event.data.callId, list);
    } else if (event.type === "tool/result" && identifier(event.data.message?.toolCallId)) {
      const list = receipts.get(event.data.message.toolCallId) ?? [];
      list.push(event);
      receipts.set(event.data.message.toolCallId, list);
    }
  }
  const pairs = [];
  for (const [callId, entries] of calls) {
    const results = receipts.get(callId) ?? [];
    if (entries.length !== 1 || results.length !== 1) continue;
    const call = entries[0], receipt = results[0], message = receipt.data.message;
    if (call.seq >= receipt.seq || typeof call.data.name !== "string" || !integer(call.data.turn) || !integer(call.data.step) || call.data.turn !== receipt.data.turn || call.data.step !== receipt.data.step || message?.role !== "tool" || message.source?.kind !== "tool" || message.source.callId !== callId || message.toolCallId !== callId || message.isError !== void 0 && typeof message.isError !== "boolean") continue;
    const isError = message.isError === true || receipt.data.error !== void 0;
    if (!includeErrors && isError) continue;
    if (receipt.sourceEventSeqs !== void 0 && (!Array.isArray(receipt.sourceEventSeqs) || !receipt.sourceEventSeqs.includes(call.seq) || receipt.sourceEventSeqs.some((seq) => !integer(seq) || seq >= receipt.seq))) continue;
    const args = parseObject(call.data.arguments);
    if (args) pairs.push({ call, receipt, args, isError });
  }
  return pairs;
}
function inspectionValue(message) {
  let value = parseObject(textOnly(message.content));
  for (let depth = 0; object(value) && depth < 6; depth++) {
    if (value.isError === true || value.ok !== void 0 && value.ok !== true) return void 0;
    if (value.structuredContent !== void 0) {
      value = value.structuredContent;
      continue;
    }
    if (Array.isArray(value.content)) {
      value = parseObject(textOnly(value.content));
      continue;
    }
    if (value.code !== void 0) {
      if (String(value.code) !== "200") return void 0;
      value = value.data;
      continue;
    }
    if (identifier(value.run_id)) return value;
    if (object(value.result)) {
      value = value.result;
      continue;
    }
    if (object(value.run)) {
      value = value.run;
      continue;
    }
    return void 0;
  }
  return void 0;
}
var inspectionTools = new Map(["status", "baseline", "vulnerabilities", "reachability", "routine", "deep"].map((kind) => [`mcp__inspection-compositions__inspection_${kind}`, `inspection-${kind}`]));
function selectInspectionRuns(input, runId, canonicalName = (name2) => name2) {
  if (runId !== void 0 && !identifier(runId)) fail("\u5DE1\u68C0\u62A5\u544A\u8FD0\u884C\u6807\u8BC6\u65E0\u6548\u3002");
  if (typeof canonicalName !== "function") fail("\u5DE1\u68C0\u5DE5\u5177\u6765\u6E90\u89E3\u6790\u5668\u65E0\u6548\u3002");
  const events = ownEvents(input), origins = /* @__PURE__ */ new Map();
  for (const pair of successfulPairs(events)) {
    const workflow = inspectionTools.get(canonicalName(pair.call.data.name));
    if (!workflow) continue;
    const value = inspectionValue(pair.receipt.data.message);
    if (!value) continue;
    if (value.composition_id !== void 0 && value.composition_id !== workflow || value.workflow !== void 0 && value.workflow !== workflow) continue;
    const previous = origins.get(value.run_id);
    if (previous && previous.workflow !== workflow) fail("\u540C\u4E00\u5DE1\u68C0\u8FD0\u884C\u51FA\u73B0\u51B2\u7A81\u7684\u539F\u59CB\u542F\u52A8\u6765\u6E90\u3002");
    origins.set(value.run_id, { runId: value.run_id, workflow, seq: pair.receipt.seq });
  }
  const candidates = runId !== void 0 ? [origins.get(runId)].filter(Boolean) : [...origins.values()].sort((left, right) => right.seq - left.seq);
  if (!candidates.length) fail("\u672C\u4F1A\u8BDD\u6CA1\u6709\u53EF\u6838\u9A8C\u7684\u5DE1\u68C0\u542F\u52A8\u56DE\u6267\uFF0C\u4E0D\u80FD\u501F\u5916\u90E8\u8FD0\u884C\u6807\u8BC6\u5BFC\u51FA\u3002");
  return Object.freeze(candidates.map((origin) => Object.freeze({ run_id: origin.runId, workflow: origin.workflow })));
}
var troubleshootingTools = /* @__PURE__ */ new Map([
  ["mcp__troubleshooting-compositions__diagnose_business_access", "troubleshooting-business-access"],
  ["mcp__troubleshooting-compositions__diagnose_device_offline", "troubleshooting-device-offline"]
]);
var troubleshootingWorkflows = new Set(troubleshootingTools.values());
var troubleshootingGetters = new Set(["get_composition_run", "get_composition_artifact", "get_composition_details"].map((raw) => `mcp__troubleshooting-compositions__${raw}`));
var safeResourceId = (value) => identifier(value) && /^[a-z\d][a-z\d._-]*$/iu.test(value) && !value.includes("..");
var safeHtmlName = (value) => typeof value === "string" && value.length <= 512 && value === value.trim() && /\.html$/iu.test(value) && !/[\\/:*?"<>|%\u0000-\u001f\u007f]/u.test(value) && !value.startsWith(".");
var htmlMime = (value) => typeof value === "string" && /^text\/html(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(value);
var sameJson = (left, right) => stableReportJson(left) === stableReportJson(right);
function matchesParent(parentId, ...values) {
  return values.every((value) => !object(value) || ["session_id", "sessionId", "parent_session_id", "parentSessionId"].every((key) => !Object.hasOwn(value, key) || value[key] === parentId));
}
function troubleshootingReceiptMarker(message) {
  let value = parseObject(textOnly(message?.content));
  for (let depth = 0; object(value) && depth < 6; depth++) {
    if (troubleshootingWorkflows.has(value.composition_id) || troubleshootingWorkflows.has(value.workflow)) return true;
    if (identifier(value.run_id)) return false;
    if (object(value.structuredContent)) {
      value = value.structuredContent;
      continue;
    }
    if (Array.isArray(value.content)) {
      value = parseObject(textOnly(value.content));
      continue;
    }
    if (object(value.result)) {
      value = value.result;
      continue;
    }
    if (object(value.run)) {
      value = value.run;
      continue;
    }
    if (object(value.data)) {
      value = value.data;
      continue;
    }
    return false;
  }
  return false;
}
function uncertainTroubleshootingReceipt(event, events, canonicalName) {
  if (event.type !== "tool/result" || event.data.message?.role !== "tool" || event.data.message.source?.kind !== "tool" || !troubleshootingReceiptMarker(event.data.message)) return false;
  const calls = events.filter((call) => call.type === "tool/call" && call.data.callId === event.data.message.toolCallId);
  return !calls.length || calls.some((call) => {
    const name2 = canonicalName(call.data.name);
    return !troubleshootingTools.has(name2) && !troubleshootingGetters.has(name2);
  });
}
function selectTroubleshootingRun(parentId, input, runId, canonicalName = (name2) => name2) {
  if (!identifier(parentId) || runId !== void 0 && !safeResourceId(runId)) fail("\u6545\u969C\u62A5\u544A\u4E3B\u4F1A\u8BDD\u6216\u8FD0\u884C\u6807\u8BC6\u65E0\u6548\u3002");
  if (typeof canonicalName !== "function") fail("\u6545\u969C\u7EC4\u5408\u5DE5\u5177\u6765\u6E90\u89E3\u6790\u5668\u65E0\u6548\u3002");
  const events = ownEvents(input);
  const attempts = events.filter((event) => event.type === "tool/call" && troubleshootingTools.has(canonicalName(event.data.name)));
  const pairs = successfulPairs(events, true).filter((pair2) => troubleshootingTools.has(canonicalName(pair2.call.data.name)));
  if (events.some((event) => uncertainTroubleshootingReceipt(event, events, canonicalName))) {
    fail("\u53D1\u73B0\u7F3A\u5C11\u672C\u4F1A\u8BDD\u539F\u59CB\u8C03\u7528\u6216\u5DE5\u5177\u8EAB\u4EFD\u4E0D\u660E\u7684\u6545\u969C\u7EC4\u5408\u56DE\u6267\uFF0C\u6765\u6E90\u5F85\u6838\uFF0C\u4E0D\u80FD\u56DE\u9000\u65E7\u62A5\u544A\u3002");
  }
  if (!attempts.length) {
    if (runId !== void 0) fail("\u672C\u4F1A\u8BDD\u6CA1\u6709\u8BE5\u6545\u969C\u7EC4\u5408\u7684\u771F\u5B9E\u542F\u52A8\u6765\u6E90\uFF0C\u4E0D\u80FD\u501F\u5916\u90E8\u8FD0\u884C\u6807\u8BC6\u5BFC\u51FA\u3002");
    return void 0;
  }
  const origins = /* @__PURE__ */ new Map();
  for (const pair2 of pairs) {
    const value2 = inspectionValue(pair2.receipt.data.message);
    if (!value2 || !safeResourceId(value2.run_id)) continue;
    const workflow2 = troubleshootingTools.get(canonicalName(pair2.call.data.name));
    const previous = origins.get(value2.run_id);
    if (previous && (previous.workflow !== workflow2 || previous.callId !== pair2.call.data.callId)) {
      fail("\u540C\u4E00\u6545\u969C\u8FD0\u884C\u51FA\u73B0\u51B2\u7A81\u6216\u91CD\u590D\u7684\u539F\u59CB\u542F\u52A8\u6765\u6E90\uFF0C\u4E0D\u80FD\u56DE\u9000\u65E7\u62A5\u544A\u3002");
    }
    origins.set(value2.run_id, { workflow: workflow2, callId: pair2.call.data.callId });
  }
  const explicit = runId !== void 0 ? pairs.filter((pair2) => inspectionValue(pair2.receipt.data.message)?.run_id === runId) : void 0;
  if (explicit && explicit.length !== 1) fail("\u6307\u5B9A\u6545\u969C\u8FD0\u884C\u6CA1\u6709\u672C\u4F1A\u8BDD\u552F\u4E00\u771F\u5B9E\u542F\u52A8\u6765\u6E90\uFF0C\u4E0D\u80FD\u4F7F\u7528\u5916\u90E8\u3001\u51B2\u7A81\u6216inspection\u8FD0\u884C\u3002");
  const latest = explicit ? explicit[0].call : attempts.at(-1), matching = pairs.filter((pair2) => pair2.call === latest);
  if (matching.length !== 1) fail("\u6240\u9009\u6545\u969C\u7EC4\u5408\u8C03\u7528\u5C1A\u65E0\u552F\u4E00\u3001\u540Cturn/step\u7684\u5B8C\u6574\u56DE\u6267\uFF0C\u72B6\u6001\u672A\u77E5\uFF0C\u4E0D\u80FD\u56DE\u9000\u65E7\u62A5\u544A\u3002");
  const pair = matching[0], value = inspectionValue(pair.receipt.data.message);
  const toolName = canonicalName(latest.data.name), workflow = troubleshootingTools.get(toolName);
  const request = requestBefore(events, latest.seq);
  if (pair.isError || !value || receiptFailed(pair)) fail("\u6240\u9009\u6545\u969C\u7EC4\u5408\u542F\u52A8\u5931\u8D25\u6216\u56DE\u6267\u5DF2\u88C1\u526A\uFF0C\u4E0D\u80FD\u56DE\u9000\u65E7\u62A5\u544A\u3002");
  if (!request || !safeResourceId(value.run_id) || value.composition_id !== workflow || value.workflow !== void 0 && value.workflow !== workflow || !matchesParent(
    parentId,
    latest,
    latest.data,
    pair.receipt,
    pair.receipt.data,
    pair.receipt.data.message,
    pair.receipt.data.message.source,
    value
  ) || pair.args.run_id !== void 0 && pair.args.run_id !== value.run_id || pair.args.composition_id !== void 0 && pair.args.composition_id !== workflow || pair.args.workflow !== void 0 && pair.args.workflow !== workflow) {
    fail("\u6240\u9009\u6545\u969C\u8FD0\u884C\u4E0E\u672C\u4F1A\u8BDD\u3001\u539F\u59CB\u5DE5\u5177\u6216\u6D41\u7A0B\u51B2\u7A81\uFF0C\u4E0D\u80FD\u56DE\u9000\u65E7\u62A5\u544A\u3002");
  }
  if (!["accepted", "pending", "queued", "running", "in_progress", "completed"].includes(value.status)) {
    fail(`\u6240\u9009\u6545\u969C\u7EC4\u5408\u542F\u52A8\u72B6\u6001\u4E3A${typeof value.status === "string" ? value.status : "unknown"}\uFF0C\u5931\u8D25\u6216\u672A\u77E5\uFF0C\u4E0D\u80FD\u56DE\u9000\u65E7\u62A5\u544A\u3002`);
  }
  return Object.freeze({
    parent_session_id: parentId,
    run_id: value.run_id,
    composition_id: workflow,
    workflow,
    start_tool_name: toolName,
    start_registered_tool_name: latest.data.name,
    start_call_id: latest.data.callId,
    start_turn: latest.data.turn,
    start_step: latest.data.step,
    start_seq: latest.seq,
    start_result_seq: pair.receipt.seq,
    user_message_id: request.user.data.id,
    request_seq: request.user.seq,
    request_sha256: hash(request.request),
    start_receipt_hash_scope: "native-tool-result.visible-text/v1",
    start_receipt_sha256: hash(textOnly(pair.receipt.data.message.content))
  });
}
function selectTroubleshootingArtifact(binding, run) {
  if (!object(binding) || !identifier(binding.parent_session_id) || !safeResourceId(binding.run_id) || !troubleshootingWorkflows.has(binding.workflow) || binding.composition_id !== binding.workflow || !object(run) || run.isError === true || run.ok !== void 0 && run.ok !== true || run.run_id !== binding.run_id || run.composition_id !== binding.composition_id || run.workflow !== binding.workflow || !matchesParent(binding.parent_session_id, run)) fail("\u6545\u969C\u7EC4\u5408 canonical \u7ED3\u679C\u4E0E\u672C\u4F1A\u8BDD\u539F\u8FD0\u884C\u6216\u6D41\u7A0B\u4E0D\u4E00\u81F4\u3002");
  if (run.status !== "completed") fail(`\u6240\u9009\u6545\u969C\u7EC4\u5408\u5C1A\u672A\u6210\u529F\u5B8C\u6210\uFF08status=${typeof run.status === "string" && run.status ? run.status : "unknown"}\uFF09\uFF0C\u4E0D\u80FD\u5BFC\u51FA\u6216\u56DE\u9000\u65E7\u62A5\u544A\u3002`);
  const reports = Array.isArray(run.artifacts) ? run.artifacts.filter((item) => object(item) && (typeof item.filename === "string" && /\.html?$/iu.test(item.filename) || typeof item.contentType === "string" && /^text\/html\b/iu.test(item.contentType))) : [];
  const report = reports[0];
  if (reports.length !== 1 || !safeResourceId(report.id) || !safeHtmlName(report.filename) || !htmlMime(report.contentType) || !Number.isSafeInteger(report.bytes) || report.bytes <= 0 || report.bytes > 32 * 1024 * 1024 || run.artifacts.filter((item) => item?.id === report.id).length !== 1) {
    fail("\u539F\u6545\u969C\u8FD0\u884C\u6CA1\u6709\u552F\u4E00\u3001\u5408\u6CD5\u4E14\u4E0D\u8D85\u8FC732MiB\u7684HTML\u4EA7\u7269\uFF0C\u4E0D\u80FD\u4EC5\u6309report\u6807\u8BC6\u6311\u9009\u6216\u56DE\u9000\u3002");
  }
  return report;
}
function troubleshootingReportSource(binding, run, artifact) {
  const report = selectTroubleshootingArtifact(binding, run);
  if (!object(artifact) || artifact.isError === true || artifact.ok !== void 0 && artifact.ok !== true || typeof artifact.body !== "string" || artifact.filename !== report.filename || artifact.contentType !== report.contentType || !htmlMime(artifact.contentType) || artifact.id !== void 0 && artifact.id !== report.id || artifact.artifactId !== void 0 && artifact.artifactId !== report.id || artifact.run_id !== void 0 && artifact.run_id !== binding.run_id || artifact.composition_id !== void 0 && artifact.composition_id !== binding.composition_id || artifact.workflow !== void 0 && artifact.workflow !== binding.workflow || !matchesParent(binding.parent_session_id, report, artifact)) fail("\u539F\u6545\u969CHTML\u4E0ERun\u3001\u4EA7\u7269\u8EAB\u4EFD\u6216MIME\u4E0D\u4E00\u81F4\uFF0C\u672A\u4FDD\u5B58\u3002");
  const html = artifact.body, data = Buffer.from(html, "utf8"), sha256 = hash(html);
  if (data.toString("utf8") !== html || !/^\s*<!doctype\s+html(?:\s+[^<>]*)?>\s*(?:<!--[\s\S]*?-->\s*)*<html(?:\s+[^<>]*)?>[\s\S]*<\/html>\s*$/iu.test(html)) {
    fail("\u539F\u6545\u969C\u4EA7\u7269\u4E0D\u662F\u5B8C\u6574UTF-8 HTML\uFF0C\u672A\u622A\u65AD\u6216\u91CD\u7ED8\u3002");
  }
  if (data.byteLength !== report.bytes || data.byteLength > 32 * 1024 * 1024 || artifact.bytes !== void 0 && artifact.bytes !== data.byteLength) fail("\u539F\u6545\u969CHTML\u5B57\u8282\u6570\u4E0E\u4EA7\u7269\u5143\u6570\u636E\u4E0D\u4E00\u81F4\u3002");
  for (const value of [report, artifact, report.metadata, artifact.metadata].filter(object)) {
    if (value.sha256 !== void 0 && (typeof value.sha256 !== "string" || !/^[a-f\d]{64}$/iu.test(value.sha256) || value.sha256.toLowerCase() !== sha256)) fail("\u539F\u6545\u969CHTML SHA-256\u4E0E\u4EA7\u7269\u5143\u6570\u636E\u4E0D\u4E00\u81F4\u3002");
    if (value.bytes !== void 0 && value.bytes !== data.byteLength || value.filename !== void 0 && value.filename !== report.filename || value.contentType !== void 0 && value.contentType !== report.contentType || ["id", "artifactId", "artifact_id"].some((key) => value[key] !== void 0 && value[key] !== report.id) || value.run_id !== void 0 && value.run_id !== binding.run_id || value.composition_id !== void 0 && value.composition_id !== binding.composition_id || value.workflow !== void 0 && value.workflow !== binding.workflow || !matchesParent(binding.parent_session_id, value)) fail("\u539F\u6545\u969C\u4EA7\u7269\u8EAB\u4EFD\u3001\u5B57\u8282\u6216\u989D\u5916metadata\u4E0E\u539F\u8FD0\u884C\u4E0D\u4E00\u81F4\u3002");
  }
  for (const [key, value] of Object.entries(report)) {
    if (["id", "filename", "contentType", "bytes", "sha256"].includes(key)) continue;
    if (Object.hasOwn(artifact, key) && !sameJson(value, artifact[key])) fail("\u539F\u6545\u969C\u4EA7\u7269\u53CC\u65B9\u63D0\u4F9B\u7684\u989D\u5916metadata\u51B2\u7A81\u3002");
  }
  const sourceBase = {
    kind: "fault-troubleshooting",
    ...binding,
    artifact_id: report.id,
    original_filename: report.filename,
    original_content_type: report.contentType,
    original_sha256: sha256,
    original_sha256_scope: "sha256-of-original-utf8-body",
    original_bytes: data.byteLength,
    artifact_metadata: { ...report },
    artifact_response_metadata: Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== "body"))
  };
  return {
    html,
    filename: report.filename,
    source: Object.freeze({ ...sourceBase, source_sha256: hash(JSON.stringify(sourceBase)) })
  };
}
function selectFaultChild(parentId, input, childId) {
  if (!identifier(parentId) || childId !== void 0 && (!identifier(childId) || childId === parentId)) {
    fail("\u6545\u969C\u62A5\u544A\u4E3B/\u5B50\u4F1A\u8BDD\u6807\u8BC6\u65E0\u6548\u3002");
  }
  const events = ownEvents(input), pairs = successfulPairs(events).filter((pair) => pair.call.data.name === "delegate_fault_analysis");
  const candidates = [];
  for (const catalog of events.filter((event) => event.type === "subagent/catalog")) {
    const data = catalog.data, id = data.childId;
    if (childId !== void 0 && id !== childId) continue;
    if (!identifier(id) || id === parentId || data.version !== 0 || data.mode !== "continuable" || !integer(data.childCreatedAt)) continue;
    const catalogs = events.filter((event) => event.type === "subagent/catalog" && event.data.childId === id);
    if (catalogs.length !== 1) fail("\u6545\u969C\u5B50\u4EFB\u52A1\u76EE\u5F55\u8EAB\u4EFD\u91CD\u590D\u6216\u51B2\u7A81\uFF0C\u4E0D\u80FD\u9009\u62E9\u62A5\u544A\u6765\u6E90\u3002");
    const matches = pairs.filter((pair) => textOnly(pair.receipt.data.message.content) === `started subagent ${id}`);
    if (matches.length !== 1) continue;
    const { call, receipt, args } = matches[0];
    if (!(call.seq < catalog.seq && catalog.seq < receipt.seq) || typeof args.prompt !== "string" || !args.prompt.trim()) continue;
    const notices = events.filter((event) => event.type === "user/message" && event.data.role === "user" && event.data.source?.kind === "subagent-settled" && event.data.source.form === "notice" && typeof event.data.source.summary === "string" && event.data.source.senderSessionId === id && event.seq > receipt.seq);
    const notice = notices[0];
    if (!notice || !integer(notice.time) || notice.time < data.childCreatedAt) continue;
    const user = events.findLast((event) => event.seq < call.seq && event.type === "user/message" && event.data.role === "user" && event.data.source?.kind === "user");
    const request = visibleText(user?.data.content);
    if (!user || !identifier(user.data.id) || !request.trim()) continue;
    candidates.push(Object.freeze({
      parentId,
      childId: id,
      childCreatedAt: data.childCreatedAt,
      delegateCallId: call.data.callId,
      request,
      userMessageId: user.data.id,
      requestSeq: user.seq,
      delegateSeq: call.seq,
      receiptSeq: receipt.seq,
      noticeSeq: notice.seq,
      noticeTime: notice.time
    }));
  }
  candidates.sort((left, right) => right.noticeSeq - left.noticeSeq);
  if (!candidates.length) fail("\u672C\u4F1A\u8BDD\u6CA1\u6709\u5DF2\u8BC1\u5B9E\u5B8C\u6210\u7684\u6545\u969C\u5206\u6790\u59D4\u6D3E\uFF0C\u4E0D\u80FD\u8BFB\u53D6\u4EFB\u610F\u4F1A\u8BDD\u6216\u5BFC\u51FA\u542F\u52A8\u56DE\u6267\u3002");
  const selected = candidates[0];
  if (childId === void 0 && rootReadonlyPairs(events).some((pair) => pair.receipt.seq > selected.noticeSeq)) {
    fail("\u4E3B\u52A9\u624B\u5DF2\u6709\u66F4\u65B0\u8BC1\u636E\uFF0C\u8BF7\u7528analysis\u5BFC\u51FA\u5B8C\u6574\u5206\u6790\uFF1B\u4E0D\u80FD\u4EC5\u4FDD\u5B58\u8865\u8BC1\u524D\u7684\u65E7\u5B50\u4EFB\u52A1\u6B63\u6587\u3002");
  }
  return selected;
}
function startupOnly(body) {
  const value = body.trim();
  return /^started subagent \S+$/u.test(value) || /^已启动故障分析子智能体[。.!！]?(?:\s*任务[：:][^\n]*)?(?:\s*结果将在任务结束后返回[。.!！]?)?$/u.test(value);
}
function faultReportSource(binding, snapshot) {
  if (!object(binding) || !identifier(binding.parentId) || !identifier(binding.childId) || binding.parentId === binding.childId || !identifier(binding.delegateCallId) || !identifier(binding.userMessageId) || typeof binding.request !== "string" || !binding.request.trim() || !["childCreatedAt", "requestSeq", "delegateSeq", "receiptSeq", "noticeSeq", "noticeTime"].every((key) => integer(binding[key])) || !(binding.requestSeq < binding.delegateSeq && binding.delegateSeq < binding.receiptSeq && binding.receiptSeq < binding.noticeSeq)) fail("\u6545\u969C\u62A5\u544A\u7F3A\u5C11\u53D7\u7BA1\u9009\u62E9\u7684\u771F\u5B9E\u6765\u6E90\u7ED1\u5B9A\u3002");
  const header = snapshot?.session;
  if (!object(header) || header.id !== binding.childId || header.createdAt !== binding.childCreatedAt || header.origin !== "subagent" || header.isSeeded !== false || snapshot.inheritedEventCount !== 0 || header.delegationDepth !== void 0 && header.delegationDepth !== 1 || header.agentPreset !== void 0 && header.agentPreset !== "security-operations-fault-analysis") {
    fail("\u6545\u969C\u5B50\u4F1A\u8BDD\u5FEB\u7167\u4E0E\u7236\u76EE\u5F55\u4E0D\u4E00\u81F4\uFF0C\u6216\u5305\u542B\u7EE7\u627F/\u5176\u4ED6\u89D2\u8272\u5185\u5BB9\u3002");
  }
  const events = ownEvents(snapshot.events);
  const start = events.findLast((event) => event.type === "turn/start");
  const end = events.findLast((event) => event.type === "turn/end");
  if (!start || !end || !integer(start.data.turn) || end.seq <= start.seq || end.data.turn !== start.data.turn || end.data.reason?.kind !== "completed" || !integer(end.time) || end.time < binding.childCreatedAt || end.time > binding.noticeTime || events.filter((event) => event.type === "turn/end" && event.data.turn === end.data.turn).length !== 1) {
    fail("\u6545\u969C\u5B50\u4EFB\u52A1\u6CA1\u6709\u4E0E\u539F\u751F\u5B8C\u6210\u901A\u77E5\u5339\u914D\u7684\u6210\u529F\u7EC8\u6001\uFF0C\u4E0D\u80FD\u5BFC\u51FA\u8FD0\u884C\u4E2D\u3001\u5931\u8D25\u6216\u540E\u7EED\u6539\u52A8\u7684\u7ED3\u679C\u3002");
  }
  const tail = events.filter((event) => event.seq > start.seq && event.seq < end.seq && ["assistant/message", "tool/call", "tool/result", "user/message", "assistant/attempt"].includes(event.type)).at(-1);
  const message = tail?.data?.message;
  if (tail?.type !== "assistant/message" || tail.data.turn !== end.data.turn || tail.data.interrupted === true || message?.role !== "assistant" || message.source?.kind !== "model" || !identifier(message.id) || typeof message.source.provider !== "string" || !message.source.provider || typeof message.source.model !== "string" || !message.source.model || !Array.isArray(message.content) || message.content.some((part) => !object(part) || !["text", "reasoning"].includes(part.type) || typeof part.text !== "string")) {
    fail("\u6545\u969C\u5B50\u4EFB\u52A1\u6CA1\u6709\u771F\u5B9E\u3001\u5B8C\u6574\u7684\u6700\u7EC8\u52A9\u624B\u6B63\u6587\uFF0C\u4E0D\u80FD\u628A\u5DE5\u5177\u56DE\u6267\u6216\u672A\u5B8C\u6210\u7247\u6BB5\u5F53\u62A5\u544A\u3002");
  }
  const body = visibleText(message.content);
  if (!body.trim() || startupOnly(body)) fail("\u6545\u969C\u5206\u6790\u7ED3\u679C\u4E3A\u7A7A\u6216\u53EA\u6709\u542F\u52A8\u901A\u77E5\uFF0C\u4E0D\u80FD\u751F\u6210\u5185\u5BB9\u62A5\u544A\u3002");
  const sourceBase = {
    kind: "fault-readonly",
    parent_session_id: binding.parentId,
    child_session_id: binding.childId,
    child_created_at: binding.childCreatedAt,
    delegate_call_id: binding.delegateCallId,
    user_message_id: binding.userMessageId,
    request_seq: binding.requestSeq,
    delegate_seq: binding.delegateSeq,
    receipt_seq: binding.receiptSeq,
    notice_seq: binding.noticeSeq,
    result_seq: tail.seq,
    completed_turn: end.data.turn,
    completed_seq: end.seq,
    completed_at: new Date(end.time).toISOString(),
    request_sha256: hash(binding.request),
    content_sha256: hash(body)
  };
  const source = Object.freeze({ ...sourceBase, source_sha256: hash(JSON.stringify(sourceBase)) });
  const rows = [
    ["\u62A5\u544A\u6027\u8D28", "\u53EA\u8BFB\u53D6\u8BC1\u4E0E\u5206\u6790\uFF1B\u4E0D\u662F\u5916\u90E8\u5E73\u53F0\u8BCA\u65AD\u5F52\u6863\uFF0C\u4E0D\u8868\u793A\u95EE\u9898\u5DF2\u4FEE\u590D\u6216\u5DF2\u6267\u884C\u5904\u7F6E"],
    ["\u5206\u6790\u5B8C\u6210\u65F6\u95F4\uFF08UTC\uFF09", source.completed_at],
    ["\u4E3B\u4F1A\u8BDD", source.parent_session_id],
    ["\u6545\u969C\u5B50\u4F1A\u8BDD", source.child_session_id],
    ["\u59D4\u6D3E\u8C03\u7528", source.delegate_call_id],
    ["\u539F\u7528\u6237\u6D88\u606F", source.user_message_id],
    ["\u8BF7\u6C42\u4E8B\u4EF6\u5E8F\u53F7", source.request_seq],
    ["\u59D4\u6D3E/\u542F\u52A8\u56DE\u6267/\u5B8C\u6210\u901A\u77E5\u5E8F\u53F7", `${source.delegate_seq} / ${source.receipt_seq} / ${source.notice_seq}`],
    ["\u6700\u7EC8\u6B63\u6587/\u6210\u529F\u7EC8\u6001\u5E8F\u53F7", `${source.result_seq} / ${source.completed_seq}`],
    ["\u539F\u8BF7\u6C42 SHA-256", source.request_sha256],
    ["\u539F\u6B63\u6587 SHA-256", source.content_sha256],
    ["\u6765\u6E90\u8BB0\u5F55 SHA-256", source.source_sha256]
  ];
  return { html: renderFaultHtml(binding.request, body, rows), source };
}
function renderFaultHtml(request, body, rows, options = {}) {
  const note = options.note ?? "\u53EA\u8BFB\u53D6\u8BC1\u4E0E\u5206\u6790\u3002\u539F\u6587\u4E2D\u7684\u4E8B\u5B9E\u3001\u63A8\u65AD\u3001\u8BC1\u636E\u7F3A\u53E3\u4E0E\u672A\u6267\u884C\u5EFA\u8BAE\u5747\u6309\u539F\u6587\u4FDD\u7559\uFF1B\u672A\u5217\u51FA\u7684\u5185\u5BB9\u4E0D\u8865\u9020\u3002\u751F\u6210\u672C\u6587\u4EF6\u4E0D\u4F1A\u91CD\u65B0\u53D6\u8BC1\u3001\u4E3B\u52A8\u63A2\u6D4B\u3001\u6267\u884C\u5904\u7F6E\u6216\u8BC1\u660E\u95EE\u9898\u5DF2\u4FEE\u590D\u3002";
  const bodyTitle = options.bodyTitle ?? "\u53EA\u8BFB\u53D6\u8BC1\u4E0E\u5206\u6790\u6B63\u6587\uFF08\u539F\u6587\uFF09";
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>\u6545\u969C\u6392\u67E5\u62A5\u544A\uFF08\u53EA\u8BFB\u53D6\u8BC1\u4E0E\u5206\u6790\uFF09</title><style>html{color-scheme:light}body{margin:0;background:#f3f5f7;color:#202a36;font:16px/1.7 system-ui,sans-serif}.paper{max-width:1040px;margin:32px auto;padding:36px;background:white;border:1px solid #dfe5eb;border-radius:12px}h1{font-size:27px;margin:0 0 12px}h2{font-size:20px;margin-top:28px}.note{padding:12px 16px;border-left:4px solid #56728e;background:#edf3f8}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #dfe5eb;padding:9px 12px;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{width:27%;font-weight:600}@media(max-width:600px){.paper{margin:0;padding:20px;border:0;border-radius:0}th{width:32%}}@media print{body{background:white}.paper{margin:0;max-width:none;border:0;padding:0}}</style></head><body><main class="paper"><h1>\u6545\u969C\u6392\u67E5\u62A5\u544A</h1><p class="note">` + escape(note) + "</p><section><h2>\u539F\u7528\u6237\u8BF7\u6C42</h2><pre>" + escape(request) + "</pre></section><section><h2>" + escape(bodyTitle) + "</h2><pre>" + escape(body) + "</pre></section>" + (options.extra ?? "") + "<section><h2>\u6765\u6E90\u4E0E\u5B8C\u6574\u6027</h2><p>\u4EE5\u4E0B\u6807\u8BC6\u548C\u54C8\u5E0C\u7528\u4E8E\u56DE\u6EAF\u539F\u59CB\u8BB0\u5F55\uFF1B\u6765\u6E90\u53EF\u8FFD\u6EAF\u4E0D\u4EE3\u8868\u5206\u6790\u7ED3\u8BBA\u5DF2\u88AB\u72EC\u7ACB\u9A8C\u8BC1\u3002</p><table><tbody>" + rows.map(([label, value]) => '<tr><th scope="row">' + escape(label) + "</th><td>" + escape(value) + "</td></tr>").join("") + "</tbody></table></section></main></body></html>\n";
  return html;
}
var faultReadSources = /* @__PURE__ */ new Set([
  "mcp__sec-ops__get_event_by_id",
  "mcp__sec-ops__get_ingest_devices_by_asset_by_asset_id"
]);
var faultReadonlyName = (name2) => typeof name2 === "string" && (faultReadSources.has(name2) || name2.startsWith("mcp__soc-readonly__") && identifier(name2.slice("mcp__soc-readonly__".length)));
function requestBefore(events, seq) {
  const user = events.findLast((event) => event.seq < seq && event.type === "user/message" && event.data.role === "user" && event.data.source?.kind === "user");
  const request = visibleText(user?.data.content);
  return user && identifier(user.data.id) && request.trim() ? { user, request } : void 0;
}
function receiptFailed(pair) {
  if (pair.isError) return true;
  let value = parseObject(textOnly(pair.receipt.data.message.content));
  for (let depth = 0; object(value) && depth < 4; depth++) {
    if (value.isError === true || value.ok === false) return true;
    if (Object.hasOwn(value, "code") && Object.hasOwn(value, "data") && /^\d+$/u.test(String(value.code)) && String(value.code) !== "200") return true;
    if (object(value.structuredContent)) {
      value = value.structuredContent;
      continue;
    }
    if (Array.isArray(value.content)) {
      value = parseObject(textOnly(value.content));
      continue;
    }
    break;
  }
  return false;
}
function rootReadonlyPairs(events, canonicalName = (name2) => name2) {
  const pairs = [];
  for (const pair of successfulPairs(events, true)) {
    const toolName = canonicalName(pair.call.data.name);
    if (!faultReadonlyName(toolName) || !Array.isArray(pair.receipt.data.message.content)) continue;
    const request = requestBefore(events, pair.call.seq);
    if (!request) continue;
    pairs.push({ ...pair, ...request, toolName });
  }
  return pairs;
}
function mainFaultReportSource(parentId, input, analysis, evidenceCallIds, canonicalName = (name2) => name2) {
  if (!identifier(parentId) || typeof analysis !== "string" || !analysis.trim() || startupOnly(analysis)) {
    fail("\u4E3B\u52A9\u624B\u6545\u969C\u62A5\u544A\u9700\u8981\u771F\u5B9E\u4E3B\u4F1A\u8BDD\u548C\u975E\u7A7A\u7684\u53EF\u89C1\u5206\u6790\u6B63\u6587\u3002");
  }
  if (typeof canonicalName !== "function") fail("\u6545\u969C\u53EA\u8BFB\u6765\u6E90\u89E3\u6790\u5668\u65E0\u6548\u3002");
  const events = ownEvents(input), available = rootReadonlyPairs(events, canonicalName);
  let selected;
  if (evidenceCallIds !== void 0) {
    if (!Array.isArray(evidenceCallIds) || evidenceCallIds.length === 0 || evidenceCallIds.some((id) => !identifier(id)) || new Set(evidenceCallIds).size !== evidenceCallIds.length) {
      fail("\u6545\u969C\u8BC1\u636E\u8C03\u7528\u6807\u8BC6\u5FC5\u987B\u662F\u975E\u7A7A\u3001\u65E0\u91CD\u590D\u7684\u672C\u4F1A\u8BDD\u771F\u5B9E\u8C03\u7528\u96C6\u5408\u3002");
    }
    selected = evidenceCallIds.map((id) => {
      const matches = available.filter((pair) => pair.call.data.callId === id);
      if (matches.length !== 1) fail("\u6307\u5B9A\u8BC1\u636E\u4E0D\u662F\u672C\u4F1A\u8BDD\u53EF\u6838\u9A8C\u7684\u53EA\u8BFB\u8C03\u7528/\u56DE\u6267\u914D\u5BF9\uFF1B\u4E0D\u80FD\u4F7F\u7528\u7528\u6237JSON\u3001\u5B50\u65E5\u5FD7\u6216\u672A\u77E5\u8C03\u7528\u3002");
      return matches[0];
    });
  } else {
    const requestSeq = available.reduce((latest, pair) => Math.max(latest, pair.user.seq), -1);
    selected = available.filter((pair) => pair.user.seq === requestSeq);
  }
  if (!selected.length) fail("\u672C\u4F1A\u8BDD\u6CA1\u6709\u771F\u5B9E\u53EA\u8BFB\u56DE\u6267\uFF0C\u4E0D\u80FD\u4EC5\u51ED\u6A21\u578B\u6B63\u6587\u751F\u6210\u6709\u4E8B\u5B9E\u6765\u6E90\u7684\u6545\u969C\u62A5\u544A\u3002");
  selected.sort((left, right) => left.receipt.seq - right.receipt.seq);
  const requests = [...new Map(selected.map((pair) => [pair.user.data.id, { user: pair.user, request: pair.request }])).values()].sort((left, right) => left.user.seq - right.user.seq);
  const primary = requests.at(-1), last = selected.at(-1);
  if (!integer(last.receipt.time) || !Number.isFinite(new Date(last.receipt.time).getTime())) {
    fail("\u6545\u969C\u8BC1\u636E\u6CA1\u6709\u53EF\u6838\u9A8C\u7684\u539F\u751F\u56DE\u6267\u65F6\u95F4\uFF0C\u4E0D\u80FD\u8865\u9020\u8BC1\u636E\u65F6\u70B9\u3002");
  }
  const evidence = selected.map((pair) => {
    const isError = receiptFailed(pair);
    const projection = {
      projection: "native-tool-result.visible-text/v1",
      is_error: isError,
      content: pair.receipt.data.message.content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => ({ type: "text", text: part.text }))
    };
    return Object.freeze({
      call_id: pair.call.data.callId,
      tool_name: pair.toolName,
      call_seq: pair.call.seq,
      result_seq: pair.receipt.seq,
      is_error: isError,
      user_message_id: pair.user.data.id,
      request_seq: pair.user.seq,
      receipt_projection: projection.projection,
      receipt_sha256: hash(JSON.stringify(projection))
    });
  });
  const sourceBase = {
    kind: "fault-main-readonly",
    parent_session_id: parentId,
    user_message_id: primary.user.data.id,
    request_seq: primary.user.seq,
    evidence,
    evidence_until_seq: last.receipt.seq,
    evidence_until_utc: new Date(last.receipt.time).toISOString(),
    requests: requests.map((item) => ({
      user_message_id: item.user.data.id,
      request_seq: item.user.seq,
      request_sha256: hash(item.request)
    })),
    receipt_hash_scope: "\u4EC5\u5DF2\u4FDD\u7559\u7684\u539F\u751F\u5DE5\u5177\u7ED3\u679C\u53EF\u89C1text\u6295\u5F71\u53CA\u9519\u8BEF\u6807\u8BB0\uFF0C\u4E0D\u662F\u5B8C\u6574HTTP\u54CD\u5E94\u6216canonical\u539F\u6587",
    request_sha256: hash(primary.request),
    content_sha256: hash(analysis)
  };
  const source = Object.freeze({ ...sourceBase, source_sha256: hash(JSON.stringify(sourceBase)) });
  const rows = [
    ["\u62A5\u544A\u6027\u8D28", "\u4E3B\u52A9\u624B\u4F9D\u636E\u672C\u4F1A\u8BDD\u771F\u5B9E\u53EA\u8BFB\u56DE\u6267\u6574\u7406\u7684\u53EF\u89C1\u5206\u6790\uFF1B\u4E0D\u662F\u72EC\u7ACB\u5B50\u4EFB\u52A1\u539F\u6587\u3001\u5916\u90E8\u8BCA\u65AD\u5F52\u6863\u6216\u4FEE\u590D\u8BC1\u660E"],
    ["\u8BC1\u636E\u622A\u6B62\u65F6\u95F4\uFF08UTC\uFF09", source.evidence_until_utc],
    ["\u4E3B\u4F1A\u8BDD", parentId],
    ["\u6700\u8FD1\u53D6\u8BC1\u8BF7\u6C42\u6D88\u606F", source.user_message_id],
    ["\u6700\u8FD1\u53D6\u8BC1\u8BF7\u6C42\u4E8B\u4EF6\u5E8F\u53F7", source.request_seq],
    ["\u771F\u5B9E\u56DE\u6267\u6570", evidence.length],
    ["\u6807\u8BB0\u5931\u8D25\u7684\u56DE\u6267\u6570", evidence.filter((item) => item.is_error).length],
    ["\u56DE\u6267\u54C8\u5E0C\u8303\u56F4", source.receipt_hash_scope],
    ["\u6700\u8FD1\u539F\u8BF7\u6C42 SHA-256", source.request_sha256],
    ["\u53EF\u89C1\u5206\u6790\u6B63\u6587 SHA-256", source.content_sha256],
    ["\u6765\u6E90\u8BB0\u5F55 SHA-256", source.source_sha256]
  ];
  const requestHtml = requests.map((item) => "<details><summary>\u53D6\u8BC1\u8BF7\u6C42 \xB7 " + escape(item.user.data.id) + " \xB7 \u4E8B\u4EF6 " + escape(item.user.seq) + "</summary><pre>" + escape(item.request) + "</pre></details>").join("");
  const evidenceHtml = evidence.map((item, index) => "<details><summary>\u56DE\u6267 " + escape(item.call_id) + " \xB7 " + escape(item.tool_name) + " \xB7 " + (item.is_error ? "\u5931\u8D25/\u5DF2\u5C1D\u8BD5" : "\u5DF2\u8FD4\u56DE\uFF0C\u4E1A\u52A1\u7ED3\u8BBA\u89C1\u539F\u6587") + "</summary><p>\u8C03\u7528/\u7ED3\u679C\u4E8B\u4EF6\uFF1A" + escape(item.call_seq) + " / " + escape(item.result_seq) + "\uFF1B\u6240\u5C5E\u7528\u6237\u8BF7\u6C42\uFF1A" + escape(item.user_message_id) + "\uFF1B\u53EF\u89C1\u6295\u5F71 SHA-256\uFF1A" + escape(item.receipt_sha256) + "</p><pre>" + escape(visibleText(selected[index].receipt.data.message.content)) + "</pre></details>").join("");
  const html = renderFaultHtml(primary.request, analysis, rows, {
    note: "\u53EA\u8BFB\u53D6\u8BC1\u4E0E\u5206\u6790\u3002\u672C\u62A5\u544A\u6B63\u6587\u7531\u4E3B\u52A9\u624B\u4F9D\u636E\u6240\u7ED1\u5B9A\u7684\u771F\u5B9E\u56DE\u6267\u6574\u7406\uFF0C\u8BED\u4E49\u5224\u65AD\u7531\u4E3B\u52A9\u624B\u627F\u62C5\uFF1B\u4E0D\u662F\u72EC\u7ACB\u5B50\u4EFB\u52A1\u539F\u6587\u3002\u4E8B\u5B9E\u3001\u63A8\u65AD\u3001\u8BC1\u636E\u7F3A\u53E3\u4E0E\u672A\u6267\u884C\u5EFA\u8BAE\u6309\u6B63\u6587\u4FDD\u7559\uFF0C\u4E0D\u81EA\u52A8\u8BC1\u660E\u7ED3\u8BBA\u6B63\u786E\u6216\u95EE\u9898\u5DF2\u4FEE\u590D\u3002\u5BFC\u51FA\u4E0D\u4F1A\u91CD\u65B0\u67E5\u8BE2\u3001\u63A2\u6D4B\u6216\u5904\u7F6E\u3002",
    bodyTitle: "\u4E3B\u52A9\u624B\u53EF\u89C1\u5206\u6790\u6B63\u6587",
    extra: "<section><h2>\u53D6\u8BC1\u6240\u5BF9\u5E94\u7684\u771F\u5B9E\u8BF7\u6C42</h2>" + requestHtml + "</section><section><h2>\u5DF2\u4FDD\u7559\u7684\u56DE\u6267\u53EF\u89C1\u6295\u5F71</h2><p>\u8FD9\u91CC\u53EA\u4FDD\u5B58\u672C\u4F1A\u8BDD\u5B9E\u9645\u4FDD\u7559\u7684\u53EF\u89C1\u6587\u5B57\uFF0C\u53EF\u80FD\u5305\u542B\u9519\u8BEF\u3001\u622A\u65AD\u6216\u7F3A\u5931\uFF1B\u4E0D\u662F\u5B8C\u6574HTTP\u54CD\u5E94\u6216canonical\u539F\u6587\u3002\u975E\u9519\u8BEF\u56DE\u6267\u4E5F\u4E0D\u81EA\u52A8\u7B49\u4E8E\u4E1A\u52A1\u6210\u529F\u3002</p>" + evidenceHtml + "</section>"
  });
  return { html, source };
}
function validSavedReport(value, parentId, kind, args) {
  if (!object(value) || value.schema_version !== "security-report/v1" || value.kind !== kind || value.session_id !== parentId || !identifier(value.attachment_id) || !object(value.source) || typeof value.filename !== "string" || !/\.html$/iu.test(value.filename) || /[\\/\u0000-\u001f\u007f]/u.test(value.filename) || typeof value.file_path !== "string" || !value.file_path.startsWith("/") || /[\u0000-\u001f\u007f]/u.test(value.file_path) || value.file_path.split(/[\\/]/u).includes("..") || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || typeof value.sha256 !== "string" || !/^[a-f\d]{64}$/iu.test(value.sha256) || value.attachment_id !== `sha256:${value.sha256.toLowerCase()}` || value.content_type !== "text/html; charset=utf-8" || args.attachment_id !== void 0 && args.attachment_id !== value.attachment_id || kind === "fault" && value.source.parent_session_id !== parentId || args.run_id !== void 0 && value.source.run_id !== args.run_id || args.child_id !== void 0 && value.source.child_session_id !== args.child_id) return false;
  return true;
}
var savedIdentityFields = [
  "schema_version",
  "kind",
  "session_id",
  "attachment_id",
  "file_path",
  "filename",
  "content_type",
  "bytes",
  "sha256",
  "source"
];
var savedPublicFields = [...savedIdentityFields, "generated_at", "message"];
var stableReportJson = (value) => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
function savedFieldsConflict(left, right) {
  return savedIdentityFields.some((key) => Object.hasOwn(left, key) && Object.hasOwn(right, key) && stableReportJson(key === "sha256" && typeof left[key] === "string" ? left[key].toLowerCase() : left[key]) !== stableReportJson(key === "sha256" && typeof right[key] === "string" ? right[key].toLowerCase() : right[key]));
}
function isOpaqueMcp(name2) {
  if (typeof name2 !== "string" || !name2.startsWith("mcp__")) return false;
  const knownGroups = ["soc-readonly", "sec-ops", "inspection-compositions", "troubleshooting-compositions", "policy-configuration", "emergency-action", "asset-management"];
  return !knownGroups.some((group) => name2.startsWith(`mcp__${group}__`));
}
function hasNewTroubleshootingSource(events, cutoff, canonicalName) {
  if (events.some((event) => {
    if (event.seq <= cutoff) return false;
    if (event.type === "tool/call" && troubleshootingTools.has(canonicalName(event.data.name))) return true;
    return uncertainTroubleshootingReceipt(event, events, canonicalName);
  })) return true;
  for (const pair of successfulPairs(events, true)) {
    if (pair.receipt.seq <= cutoff) continue;
    const name2 = canonicalName(pair.call.data.name);
    if (troubleshootingTools.has(name2)) return true;
    if (name2 === "mcp__troubleshooting-compositions__get_composition_run") {
      const value = inspectionValue(pair.receipt.data.message);
      if (pair.isError || !value || value.status !== "completed") return true;
    }
    if (name2 === "mcp__troubleshooting-compositions__get_composition_artifact" && receiptFailed(pair)) return true;
  }
  return false;
}
function hasNewReportSource(parentId, events, kind, cutoff, canonicalName, newTroubleshooting) {
  if (newTroubleshooting) return true;
  const pairs = successfulPairs(events, true);
  for (const pair of pairs) {
    if (pair.receipt.seq <= cutoff || !requestBefore(events, pair.call.seq)) continue;
    const name2 = canonicalName(pair.call.data.name);
    if (isOpaqueMcp(name2 ?? pair.call.data.name)) return true;
    if (kind === "fault" && faultReadonlyName(name2)) return true;
    if (kind === "inspection" && (inspectionTools.has(name2) || ["get_composition_run", "get_composition_details", "get_composition_artifact"].some((raw) => name2 === `mcp__inspection-compositions__${raw}`))) return true;
  }
  if (kind !== "fault") return false;
  if (events.some((event) => event.seq > cutoff && event.type === "tool/call" && event.data.name === "delegate_fault_analysis" && identifier(event.data.callId) && requestBefore(events, event.seq))) return true;
  const children = /* @__PURE__ */ new Set();
  for (const event of events) {
    if (event.type !== "user/message" || event.data.source?.kind !== "subagent-settled") continue;
    const childId = event.data.source.senderSessionId;
    if (!identifier(childId) || children.has(childId)) continue;
    children.add(childId);
    try {
      if (selectFaultChild(parentId, events, childId).noticeSeq > cutoff) return true;
    } catch {
    }
  }
  return false;
}
function selectSavedSecurityReport(parentId, input, kind, attachmentId, canonicalName = (name2) => name2) {
  if (!identifier(parentId) || !["inspection", "fault"].includes(kind)) fail("\u5DF2\u4FDD\u5B58\u62A5\u544A\u7684\u4E3B\u4F1A\u8BDD\u6216\u7C7B\u578B\u65E0\u6548\u3002");
  if (typeof canonicalName !== "function") fail("\u5DF2\u4FDD\u5B58\u62A5\u544A\u5DE5\u5177\u6765\u6E90\u89E3\u6790\u5668\u65E0\u6548\u3002");
  if (attachmentId !== void 0 && !identifier(attachmentId)) return void 0;
  const events = ownEvents(input), records = [];
  for (const pair of successfulPairs(events)) {
    if (pair.call.data.name !== "export_security_report" || pair.args.kind !== kind) continue;
    const body = parseObject(textOnly(pair.receipt.data.message.content));
    const rawMeta = pair.receipt.data.meta;
    const meta = object(rawMeta) && rawMeta.schema_version === "security-report/v1" ? rawMeta : void 0;
    const value2 = meta ?? body;
    if (!validSavedReport(value2, parentId, kind, pair.args)) continue;
    if (kind === "fault" && value2.source.kind === "fault-troubleshooting") {
      let binding;
      try {
        binding = selectTroubleshootingRun(parentId, events.filter((event) => event.seq < pair.call.seq), value2.source.run_id, canonicalName);
      } catch {
        continue;
      }
      if (binding && pair.args.attachment_id !== void 0 && hasNewTroubleshootingSource(events.filter((event) => event.seq < pair.call.seq), binding.start_result_seq, canonicalName)) continue;
      if (!binding || Object.entries(binding).some(([key, item]) => !sameJson(item, value2.source[key])) || value2.filename !== value2.source.original_filename || value2.bytes !== value2.source.original_bytes || value2.sha256.toLowerCase() !== value2.source.original_sha256 || !object(value2.source.artifact_metadata) || value2.source.artifact_metadata.id !== value2.source.artifact_id || value2.source.artifact_metadata.filename !== value2.filename || value2.source.artifact_metadata.bytes !== value2.bytes || value2.source.artifact_metadata.contentType !== value2.source.original_content_type) continue;
      const { source_sha256, ...sourceBase } = value2.source;
      if (source_sha256 !== hash(JSON.stringify(sourceBase))) continue;
    } else if (kind === "fault") {
      if (pair.args.run_id !== void 0) continue;
      try {
        if (selectTroubleshootingRun(parentId, events.filter((event) => event.seq < pair.call.seq), void 0, canonicalName)) continue;
      } catch {
        continue;
      }
    }
    if (meta !== void 0 && object(body) && body.schema_version === "security-report/v1" && savedFieldsConflict(meta, body)) continue;
    if (attachmentId !== void 0 && value2.attachment_id !== attachmentId) continue;
    records.push({ value: value2, receipt_seq: pair.receipt.seq });
  }
  if (!records.length) return void 0;
  records.sort((left, right) => left.receipt_seq - right.receipt_seq);
  const selected = records.at(-1);
  const sameAttachment = records.filter((item) => item.value.attachment_id === selected.value.attachment_id);
  if (sameAttachment.some((item) => savedFieldsConflict(item.value, selected.value))) return void 0;
  const original = sameAttachment[0];
  let cutoff = original.receipt_seq;
  const source = original.value.source;
  if (kind === "fault") {
    const evidenceSeqs = Array.isArray(source.evidence) ? source.evidence.map((item) => item?.result_seq).filter(integer) : [];
    const sourceSeq = source.kind === "fault-troubleshooting" ? source.start_result_seq : evidenceSeqs.length ? Math.max(...evidenceSeqs) : source.notice_seq;
    if (integer(sourceSeq)) cutoff = Math.min(cutoff, sourceSeq);
  }
  const value = Object.fromEntries(savedPublicFields.filter((key) => Object.hasOwn(selected.value, key) && (!["generated_at", "message"].includes(key) || typeof selected.value[key] === "string")).map((key) => [key, selected.value[key]]));
  const newTroubleshooting = kind === "fault" && hasNewTroubleshootingSource(events, cutoff, canonicalName);
  return {
    value,
    receipt_seq: selected.receipt_seq,
    has_new_troubleshooting_source: newTroubleshooting,
    has_new_source: hasNewReportSource(parentId, events, kind, cutoff, canonicalName, newTroubleshooting)
  };
}

// evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts
var name = "security-report-runtime";
var inject = ["tools", "attachments", "sessionQuery", "mcpSessionManager"];
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function reportValue(value) {
  if (value?.isError === true) throw new Error("\u62A5\u544A\u8BFB\u53D6\u5931\u8D25\uFF0C\u672A\u751F\u6210\u4E0B\u8F7D\u6587\u4EF6");
  if (record(value?.structuredContent)) value = value.structuredContent;
  else if (Array.isArray(value?.content)) {
    const text = value.content.filter((part) => part?.type === "text").map((part) => part.text).join("");
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("\u62A5\u544A\u670D\u52A1\u672A\u8FD4\u56DE\u5B8C\u6574\u7684\u7ED3\u6784\u5316\u4EA7\u7269");
    }
  }
  if (record(value) && Object.hasOwn(value, "code")) {
    if (String(value.code) !== "200") throw new Error("\u62A5\u544A\u670D\u52A1\u8FD4\u56DE\u4E1A\u52A1\u5931\u8D25\uFF0C\u672A\u751F\u6210\u4E0B\u8F7D\u6587\u4EF6");
    value = value.data;
  }
  if (record(value) && Object.hasOwn(value, "ok")) {
    if (value.ok !== true || !record(value.result)) throw new Error("\u5E73\u53F0\u62A5\u544A\u8BFB\u53D6\u5931\u8D25\u6216\u7F3A\u5C11\u5B8C\u6574\u4EA7\u7269");
    value = value.result;
  }
  if (!record(value)) throw new Error("\u62A5\u544A\u4EA7\u7269\u56DE\u6267\u65E0\u6548");
  if (value.isError === true) throw new Error("\u62A5\u544A\u8BFB\u53D6\u5931\u8D25\uFF0C\u672A\u751F\u6210\u4E0B\u8F7D\u6587\u4EF6");
  return value;
}
function requireReportRequest(exec) {
  const agent = exec?.agent, session = agent?.session;
  if (!agent?.id || session?.id !== agent.id || (session.header?.delegationDepth ?? 0) !== 0 || typeof session.snapshotEvents !== "function") throw new Error("\u62A5\u544A\u4EC5\u80FD\u7531\u5F53\u524D\u771F\u5B9E\u4E3B\u4F1A\u8BDD\u751F\u6210");
  const events = session.snapshotEvents();
  const user = events.findLast((event) => event?.type === "user/message" && event.data?.source?.kind === "user");
  const content = user?.data?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter((part) => part?.type === "text").map((part) => part.text).join("") : "";
  const requested = /(?:生成|导出|下载|保存|提供|交付|输出|给我|给出|出具|发我|发给我|附上)[\s\S]{0,40}(?:报告|HTML)|(?:报告|HTML)[\s\S]{0,20}(?:生成|导出|下载|保存|给我|给出|出具|发我|发给我)|(?:执行|开始|运行)[\s\S]{0,20}巡检/iu.test(text);
  const inquiryOnly = /^\s*(?:(?:(?:请问|请(?:介绍|说明|解释))\s*)?(?:如何|怎么|怎样)[\s\S]*(?:报告|HTML)|(?:请问\s*)?(?:本次|这次)?(?:完整|巡检)?(?:报告|HTML)\s*(?:如何|怎么|怎样)[\s\S]*|请(?:介绍|说明|解释)[\s\S]{0,20}(?:报告|HTML)[\s\S]{0,20}(?:步骤|方法|用途|格式|内容))[\s\S]*$/iu.test(text);
  const declined = /(?:不要|禁止|无需|不需要|暂不|先不|别|取消|停止)[\s\S]{0,8}(?:生成|导出|下载|保存|提供|交付|输出|给我|给出|出具|发我|发给我|附上|报告|HTML)/iu.test(text);
  const downloadExisting = /(?:下载|导出)[\s\S]{0,40}(?:报告|HTML)|(?:报告|HTML)[\s\S]{0,20}(?:下载|导出)/iu.test(text) && /(?:刚才|上次|先前|此前|已有|已(?:生成|导出|保存)|原(?:有|始)?(?:的)?(?:HTML|报告|文件)|同一(?:份|个)?)/iu.test(text);
  const declinedCreation = /(?:不要|禁止|无需|不需要|暂不|先不|别|取消|停止)[^，。！？；;,\n]{0,8}生成/iu.test(text);
  const declinedTransfer = /(?:不要|禁止|无需|不需要|暂不|先不|别|取消|停止)[^，。！？；;,\n]{0,8}(?:下载|导出|保存|提供|交付|输出|给我|给出|出具|发我|发给我|附上)/iu.test(text);
  const reuseOnly = downloadExisting && declinedCreation && !declinedTransfer;
  if (!user?.data?.id || !requested || inquiryOnly || declinedTransfer || declined && !reuseOnly) {
    throw new Error("\u5F53\u524D\u8BF7\u6C42\u6CA1\u6709\u62A5\u544A\u751F\u6210\u6216\u4E0B\u8F7D\u610F\u56FE\uFF0C\u672A\u5199\u5165\u6587\u4EF6");
  }
  return { agent, events, reuseOnly };
}
function apply(ctx) {
  ctx.tools.register({
    name: "export_security_report",
    description: "\u4FDD\u5B58\u5F53\u524D\u4F1A\u8BDD\u771F\u5B9E\u5DE1\u68C0\u6216\u6545\u969C\u7EC4\u5408\u7684\u539FHTML\uFF0C\u53EF\u539F\u751F\u9884\u89C8\u3001\u4E0B\u8F7D\u3002fault\u9ED8\u8BA4\u6838\u9A8C\u672C\u4F1A\u8BDD\u6700\u65B0\u771F\u5B9E\u542F\u52A8\u7684troubleshooting-business-access/diagnose_business_access\u6216troubleshooting-device-offline/diagnose_device_offline\uFF1B\u663E\u5F0Frun_id\u53EF\u9009\u62E9\u672C\u4F1A\u8BDD\u771F\u5B9E\u7ED1\u5B9A\u7684\u539F\u6545\u969CRun\uFF0C\u4E0D\u5192\u79F0\u6700\u65B0\u3002\u53EA\u8BFB\u539FRun\u53CA\u552F\u4E00\u5B8C\u6574HTML\uFF0C\u4FDD\u7559\u539Ffilename/UTF-8\u5B57\u8282\uFF0C\u4E0D\u8BA9\u6A21\u578B\u91CD\u7ED8\u3002\u65B0\u6D41\u7A0B\u5931\u8D25\u3001\u8FD0\u884C\u4E2D\u3001\u672A\u77E5\u6216\u8BFB\u53D6\u6821\u9A8C\u5931\u8D25\u5747\u62D2\u7EDD\uFF0C\u4E0D\u56DE\u9000\u65E7\u62A5\u544A\u3002\u4EC5\u65E0\u65B0\u6D41\u7A0B\u6D3B\u52A8\u65F6\u517C\u5BB9analysis\u4E3B\u52A9\u624B\u53EA\u8BFB\u53D6\u8BC1\u6B63\u6587\u6216\u5DF2\u5B8C\u6210\u6545\u969C\u5B50\u7ED3\u679C\u3002\u518D\u6B21\u4E0B\u8F7D\u590D\u7528\u771F\u5B9Eattachment_id/\u539Ffile\uFF1B\u51FA\u73B0\u66F4\u665A\u65B0\u6545\u969C\u7EC4\u5408\u6765\u6E90\u65F6\u4E0D\u80FD\u7528\u65E7\u9644\u4EF6\u7ED5\u8FC7\uFF1B\u65E0\u65B0\u7F16\u6392\u65F6\u4ECD\u53EF\u663E\u5F0F\u590D\u7528\u771F\u5B9E\u5386\u53F2\u9644\u4EF6\u3002\u4E0D\u80FD\u4F20HTML\u3001\u8DEF\u5F84\u3001URL\u6216\u5176\u4ED6\u4F1A\u8BDD\uFF1B\u751F\u6210\u4E0D\u7B49\u4E8E\u4FEE\u590D\u6216\u5DF2\u4E0B\u8F7D\u3002",
    parameters: { type: "object", additionalProperties: false, required: ["kind"], properties: {
      kind: { type: "string", enum: ["inspection", "fault"] },
      run_id: { type: "string", description: "\u53EF\u9009\uFF1A\u672C\u4F1A\u8BDD\u771F\u5B9E\u542F\u52A8\u56DE\u6267\u7684\u539F\u8FD0\u884C\u7F16\u53F7\u3002inspection\u7701\u7565\u65F6\u9009\u62E9\u672C\u4F1A\u8BDD\u6700\u8FD1\u5DF2\u5B8C\u6210\u62A5\u544A\uFF0C\u663E\u5F0F\u7F16\u53F7\u53EA\u6838\u8BE5\u539F\u5DE1\u68C0\uFF1Bfault\u4EC5\u5141\u8BB8\u672C\u4F1A\u8BDD\u771F\u5B9E\u542F\u52A8\u7684troubleshooting\u6545\u969C\u8FD0\u884C\uFF0C\u4E0Echild_id/analysis/evidence_call_ids/attachment_id\u4E92\u65A5\uFF0Cfault\u7701\u7565\u9ED8\u8BA4\u6700\u65B0\u5C1D\u8BD5\u3002\u663E\u5F0F\u539FRun\u4E0D\u662F\u6700\u65B0\u7ED3\u679C\u58F0\u660E\uFF1B\u62D2\u7EDD\u5916\u90E8\u3001\u672A\u77E5\u6216inspection\u5047\u5192\u3002" },
      child_id: { type: "string", description: "\u53EF\u9009\uFF0C\u4EC5\u65E0\u65B0\u6545\u969C\u7EC4\u5408\u6765\u6E90\u65F6\uFF1A\u660E\u786E\u5BFC\u51FA\u672C\u4F1A\u8BDD\u6307\u5B9A\u5DF2\u5B8C\u6210\u5B50\u5206\u6790\uFF1B\u4E0D\u5F97\u4E0Eanalysis/run_id\u6DF7\u7528\u3002\u4E3B\u52A9\u624B\u5DF2\u8865\u8BC1\u65F6\u5E94\u6539\u7528analysis\u3002" },
      analysis: { type: "string", minLength: 1, maxLength: 65536, description: "\u4EC5\u65E0\u65B0\u6545\u969C\u7EC4\u5408\u6765\u6E90\u65F6\uFF1A\u4E3B\u52A9\u624B\u4F9D\u636E\u672C\u4F1A\u8BDD\u5B9E\u9645SOC\u53EA\u8BFB\u56DE\u6267\u6574\u7406\u7684\u5B8C\u6574\u53EF\u89C1\u62A5\u544A\u6B63\u6587\uFF0C\u542B\u4E8B\u5B9E\u3001\u63A8\u65AD\u3001\u8BC1\u636E\u7F3A\u53E3\u3001\u672A\u6267\u884C\u5EFA\u8BAE\uFF1B\u4E0D\u662FHTML\u6216\u9690\u85CFreasoning\u3002\u8BED\u4E49\u5206\u6790\u7531\u6A21\u578B\u8D1F\u8D23\uFF0C\u6765\u6E90\u7531\u5165\u53E3\u6838\u5BF9\u3002" },
      evidence_call_ids: { type: "array", minItems: 1, maxItems: 32, uniqueItems: true, items: { type: "string", minLength: 1 }, description: "\u53EF\u9009\uFF0C\u914D\u5408analysis\u7ED1\u5B9A\u672C\u4F1A\u8BDD\u771F\u5B9E\u53EA\u8BFB\u67E5\u8BE2\u8C03\u7528\uFF1B\u7701\u7565\u81EA\u52A8\u9009\u62E9\u6700\u8FD1\u5B9E\u9645\u53D6\u8BC1\u6279\u6B21\u3002\u4E0D\u8BA9\u7528\u6237\u586B\u5199\u7F16\u53F7\uFF0C\u4E0D\u4EE5\u7528\u6237\u6750\u6599\u5192\u5145\u539F\u751F\u56DE\u6267\u3002" },
      attachment_id: { type: "string", pattern: "^sha256:[a-f0-9]{64}$", description: "\u518D\u6B21\u4E0B\u8F7D\u65F6\u4EC5\u4F20\u672C\u4F1A\u8BDD\u4E0A\u6B21\u771F\u5B9E\u5BFC\u51FA\u56DE\u6267\u7684attachment_id\uFF1B\u4E0Erun_id/child_id/analysis/evidence_call_ids\u4E92\u65A5\uFF0C\u4E0D\u65B0\u751F\u6210\u6216\u53D6\u8BC1\u3002" }
    } },
    output: {
      schema: { type: "object" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      presentationMeta: (_args, value) => value
    },
    async execute(args, exec) {
      const { agent, events, reuseOnly } = requireReportRequest(exec);
      if (!record(args) || !["inspection", "fault"].includes(args.kind) || Object.keys(args).some((key) => !["kind", "run_id", "child_id", "analysis", "evidence_call_ids", "attachment_id"].includes(key)) || args.run_id !== void 0 && typeof args.run_id !== "string" || args.child_id !== void 0 && typeof args.child_id !== "string" || args.kind === "inspection" && ["child_id", "analysis", "evidence_call_ids"].some((key) => args[key] !== void 0) || args.run_id !== void 0 && ["child_id", "analysis", "evidence_call_ids", "attachment_id"].some((key) => args[key] !== void 0) || args.analysis !== void 0 && (typeof args.analysis !== "string" || !args.analysis.trim() || args.analysis.length > 65536) || args.evidence_call_ids !== void 0 && (args.analysis === void 0 || !Array.isArray(args.evidence_call_ids) || args.evidence_call_ids.length < 1 || args.evidence_call_ids.length > 32 || args.evidence_call_ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(args.evidence_call_ids).size !== args.evidence_call_ids.length) || args.analysis !== void 0 && args.child_id !== void 0 || args.attachment_id !== void 0 && (typeof args.attachment_id !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(args.attachment_id) || ["run_id", "child_id", "analysis", "evidence_call_ids"].some((key) => args[key] !== void 0))) throw new Error("\u62A5\u544A\u7C7B\u578B\u6216\u6765\u6E90\u53C2\u6570\u4E0D\u7B26\u5408\u5408\u540C");
      exec.signal?.throwIfAborted();
      const canonical = (tool) => {
        for (const [group, names] of [
          ["inspection-compositions", ["inspection_status", "inspection_baseline", "inspection_vulnerabilities", "inspection_reachability", "inspection_routine", "inspection_deep", "get_composition_run", "get_composition_details", "get_composition_artifact"]],
          ["troubleshooting-compositions", ["diagnose_business_access", "diagnose_device_offline", "get_composition_run", "get_composition_details", "get_composition_artifact"]]
        ]) {
          for (const raw of names) {
            const actual = ctx.mcpSessionManager?.resolveTool?.(group, raw);
            if (actual && actual === tool) return `mcp__${group}__${raw}`;
          }
        }
        return tool;
      };
      const saved = selectSavedSecurityReport(agent.id, events, args.kind, args.attachment_id, canonical);
      if (args.attachment_id !== void 0 && !saved) throw new Error("\u672C\u4F1A\u8BDD\u6CA1\u6709\u8BE5\u771F\u5B9E\u5DF2\u5BFC\u51FA\u62A5\u544A\uFF0C\u4E0D\u731C\u6D4B\u9644\u4EF6\u6216\u6587\u4EF6\u8DEF\u5F84");
      if (args.attachment_id !== void 0 && args.kind === "fault" && saved.has_new_troubleshooting_source) {
        throw new Error("\u672C\u4F1A\u8BDD\u5DF2\u6709\u66F4\u65B0\u6545\u969C\u6765\u6E90\u6216\u65B0\u5C1D\u8BD5\uFF0C\u4E0D\u80FD\u6307\u5B9A\u65E7attachment_id\u7ED5\u8FC7\uFF1B\u8BF7\u6838\u5BF9\u6700\u65B0\u8FD0\u884C\u3002");
      }
      if (args.attachment_id !== void 0 || (args.kind === "fault" || reuseOnly) && args.run_id === void 0 && args.analysis === void 0 && args.child_id === void 0 && saved && !saved.has_new_source) {
        return { ...saved.value, message: "\u5DF2\u590D\u7528\u672C\u4F1A\u8BDD\u539FHTML\u6587\u4EF6\uFF0C\u672A\u91CD\u65B0\u53D6\u8BC1\u3001\u5206\u6790\u6216\u751F\u6210\u3002\u53EF\u9884\u89C8\u6216\u4E0B\u8F7D\uFF1B\u6587\u4EF6\u8BFB\u53D6\u65F6\u4ECD\u6838\u5BF9\u539F\u59CB\u5B57\u8282\u548CSHA-256\u3002" };
      }
      if (reuseOnly) throw new Error("\u5F53\u524D\u8BF7\u6C42\u4EC5\u5141\u8BB8\u4E0B\u8F7D\u672C\u4F1A\u8BDD\u771F\u5B9E\u5DF2\u5BFC\u51FA\u7684\u539F\u9644\u4EF6\uFF1B\u6CA1\u6709\u53EF\u590D\u7528\u539F\u6587\u4EF6\u6216\u5B58\u5728\u66F4\u65B0\u6765\u6E90\uFF0C\u672A\u91CD\u65B0\u751F\u6210\u3001\u53D6\u8BC1\u6216\u8BFB\u53D6Run\u3002");
      const troubleshooting = args.kind === "fault" ? selectTroubleshootingRun(agent.id, events, args.run_id, canonical) : void 0;
      if (troubleshooting && ["analysis", "child_id", "evidence_call_ids"].some((key) => args[key] !== void 0)) {
        throw new Error("\u5F53\u524D\u5DF2\u6709\u65B0\u6545\u969C\u7EC4\u5408\u6765\u6E90\uFF0C\u8BF7\u7701\u7565analysis/child_id/evidence_call_ids\u8BFB\u53D6\u539FHTML\uFF1B\u4E0D\u56DE\u9000\u65E7\u5206\u6790\u3002");
      }
      let html, source, filename;
      let expectedInspectionBytes;
      if (args.kind === "inspection") {
        const inspectionCanonical = (tool) => {
          for (const raw of ["inspection_status", "inspection_baseline", "inspection_vulnerabilities", "inspection_reachability", "inspection_routine", "inspection_deep"]) {
            const actual2 = ctx.mcpSessionManager.resolveTool("inspection-compositions", raw);
            if (actual2 && actual2 === tool) return `mcp__inspection-compositions__${raw}`;
          }
          return void 0;
        };
        const candidates = selectInspectionRuns(events, args.run_id, inspectionCanonical);
        const query = ctx.mcpSessionManager.resolveTool("inspection-compositions", "get_composition_run");
        if (!query || !ctx.tools.get(query, agent)) throw new Error("\u5F53\u524D\u6CA1\u6709\u540C\u6B21\u5DE1\u68C0\u7EC8\u6001\u8BFB\u53D6\u5165\u53E3");
        let selected;
        let report;
        for (const [index, candidate] of candidates.entries()) {
          const state = await ctx.tools.execute({
            name: query,
            callId: `${exec.callId}:status${index ? `:${index}` : ""}`,
            rootCallId: exec.rootCallId,
            parent: exec.token,
            arguments: { run_id: candidate.run_id },
            agent,
            signal: exec.signal
          });
          for (const context of state.additionalContexts ?? []) exec.deferContext(context);
          exec.signal?.throwIfAborted();
          if (state.isError) throw new Error("\u539F\u5DE1\u68C0\u7EC8\u6001\u8BFB\u53D6\u5931\u8D25\uFF0C\u672A\u5BFC\u51FA\u62A5\u544A");
          const run = reportValue(state.value);
          if (run.run_id !== candidate.run_id || run.composition_id !== candidate.workflow || run.workflow !== void 0 && run.workflow !== candidate.workflow) throw new Error("\u5DE1\u68C0\u7ED3\u679C\u4E0E\u672C\u4F1A\u8BDD\u539F\u59CB\u8FD0\u884C\u6216\u6D41\u7A0B\u4E0D\u4E00\u81F4");
          if (run.status !== "completed") {
            if (args.run_id === void 0 && ["accepted", "pending", "queued", "running", "failed", "canceled", "cancelled"].includes(run.status)) continue;
            throw new Error("\u539F\u5DE1\u68C0\u5C1A\u672A\u6210\u529F\u7ED3\u675F\uFF0C\u4E0D\u80FD\u5C06\u8FD0\u884C\u4E2D\u6216\u5931\u8D25\u72B6\u6001\u5BFC\u51FA\u4E3A\u5DF2\u5B8C\u6210\u62A5\u544A\u3002");
          }
          const reports = Array.isArray(run.artifacts) ? run.artifacts.filter((item2) => item2?.id === "report") : [];
          const item = reports[0];
          if (reports.length !== 1 || typeof item.filename !== "string" || !/\.html$/iu.test(item.filename) || typeof item.contentType !== "string" || !/^text\/html(?:\s*;|\s*$)/iu.test(item.contentType) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) throw new Error("\u539F\u5DE1\u68C0\u672A\u8FD4\u56DE\u552F\u4E00\u3001\u975E\u7A7A\u7684HTML\u62A5\u544A\u4EA7\u7269");
          selected = candidate;
          report = item;
          break;
        }
        if (!selected || !report) throw new Error("\u672C\u4F1A\u8BDD\u5C1A\u65E0\u5DF2\u5B8C\u6210\u7684\u539F\u5DE1\u68C0\u62A5\u544A\uFF1B\u672A\u751F\u6210\u6216\u5207\u6362\u5916\u90E8\u6765\u6E90");
        expectedInspectionBytes = report.bytes;
        const actual = ctx.mcpSessionManager.resolveTool("inspection-compositions", "get_composition_artifact");
        if (!actual || !ctx.tools.get(actual, agent)) throw new Error("\u5F53\u524D\u6CA1\u6709\u540C\u6B21\u5DE1\u68C0\u62A5\u544A\u8BFB\u53D6\u5165\u53E3");
        const result = await ctx.tools.execute({
          name: actual,
          callId: `${exec.callId}:report`,
          rootCallId: exec.rootCallId,
          parent: exec.token,
          arguments: { run_id: selected.run_id, artifactId: report.id },
          agent,
          signal: exec.signal
        });
        for (const context of result.additionalContexts ?? []) exec.deferContext(context);
        exec.signal?.throwIfAborted();
        if (result.isError) throw new Error("\u539F\u5DE1\u68C0\u62A5\u544A\u8BFB\u53D6\u5931\u8D25\uFF0C\u672A\u91CD\u65B0\u542F\u52A8\u5DE1\u68C0");
        const artifact = reportValue(result.value);
        if (typeof artifact.body !== "string" || !/^text\/html(?:\s*;|$)/iu.test(artifact.contentType ?? "") || !/\.html$/iu.test(artifact.filename ?? "")) throw new Error("\u539F\u8FD0\u884C\u5C1A\u65E0\u53EF\u5BFC\u51FA\u7684\u5B8C\u6574HTML\u62A5\u544A");
        if (artifact.filename !== report.filename || artifact.contentType !== report.contentType) throw new Error("\u539F\u62A5\u544A\u4E0E\u540C\u6B21\u4EA7\u7269\u5143\u6570\u636E\u4E0D\u4E00\u81F4");
        html = artifact.body;
        source = {
          kind: "inspection",
          run_id: selected.run_id,
          artifact_id: report.id,
          original_filename: artifact.filename,
          original_sha256: createHash2("sha256").update(html).digest("hex")
        };
        filename = `inspection-report-${selected.run_id}.html`;
      } else if (troubleshooting) {
        const readOriginal = async (raw, suffix, arguments_) => {
          const actual = ctx.mcpSessionManager?.resolveTool?.("troubleshooting-compositions", raw);
          if (!actual || !ctx.tools.get(actual, agent)) throw new Error("\u5F53\u524D\u6CA1\u6709\u771F\u5B9E\u53EF\u89C1\u7684\u6545\u969C\u7EC4\u5408\u53EA\u8BFB\u5165\u53E3\uFF0C\u4E0D\u80FD\u56DE\u9000\u65E7\u62A5\u544A\u3002");
          const result = await ctx.tools.execute({
            name: actual,
            callId: `${exec.callId}:${suffix}`,
            rootCallId: exec.rootCallId,
            parent: exec.token,
            arguments: arguments_,
            agent,
            signal: exec.signal
          });
          for (const context of result.additionalContexts ?? []) exec.deferContext(context);
          exec.signal?.throwIfAborted();
          if (result.isError) throw new Error("\u539F\u6545\u969C\u7EC4\u5408\u8BFB\u53D6\u5931\u8D25\uFF0C\u672A\u4FDD\u5B58\uFF0C\u4E5F\u4E0D\u4F1A\u56DE\u9000\u65E7\u62A5\u544A\u3002");
          return reportValue(result.value);
        };
        const run = await readOriginal("get_composition_run", "fault-status", { run_id: troubleshooting.run_id });
        const original = selectTroubleshootingArtifact(troubleshooting, run);
        const artifact = await readOriginal("get_composition_artifact", "fault-report", {
          run_id: troubleshooting.run_id,
          artifactId: original.id
        });
        const fresh = selectTroubleshootingRun(agent.id, agent.session.snapshotEvents(), args.run_id, canonical);
        if (JSON.stringify(fresh) !== JSON.stringify(troubleshooting)) throw new Error("\u6545\u969C\u8FD0\u884C\u6765\u6E90\u5DF2\u53D8\u5316\uFF0C\u672A\u4FDD\u5B58\u8FC7\u65F6\u62A5\u544A\u3002");
        const report = troubleshootingReportSource(troubleshooting, run, artifact);
        html = report.html;
        source = { ...report.source };
        filename = report.filename;
      } else if (args.analysis !== void 0) {
        const report = mainFaultReportSource(agent.id, events, args.analysis, args.evidence_call_ids);
        html = report.html;
        source = { ...report.source };
        filename = `fault-report-${report.source.content_sha256.slice(0, 16)}.html`;
      } else {
        const selected = selectFaultChild(agent.id, events, args.child_id);
        const snapshot = await ctx.sessionQuery.readSession(selected.childId);
        exec.signal?.throwIfAborted();
        const fresh = selectFaultChild(agent.id, agent.session.snapshotEvents(), args.child_id);
        if (fresh.childId !== selected.childId || fresh.delegateCallId !== selected.delegateCallId || fresh.noticeSeq !== selected.noticeSeq) throw new Error("\u6545\u969C\u5206\u6790\u6765\u6E90\u5DF2\u53D8\u5316\uFF0C\u8BF7\u6838\u5BF9\u539F\u7ED3\u679C");
        const report = faultReportSource(fresh, snapshot);
        html = report.html;
        source = { ...report.source };
        filename = `fault-report-${selected.childId}.html`;
      }
      if (!/^\s*<!doctype\s+html\b/iu.test(html) || !/<html\b/iu.test(html) || !/<\/html>\s*$/iu.test(html)) {
        throw new Error("\u62A5\u544A\u4E0D\u662F\u5B8C\u6574HTML\u6587\u6863\uFF0C\u672A\u628A\u7247\u6BB5\u5192\u5145\u5B8C\u6574\u62A5\u544A");
      }
      const data = Buffer.from(html, "utf8");
      if (expectedInspectionBytes !== void 0 && data.byteLength !== expectedInspectionBytes) throw new Error("\u539F\u62A5\u544A\u5B57\u8282\u6570\u4E0E\u540C\u6B21\u4EA7\u7269\u5143\u6570\u636E\u4E0D\u4E00\u81F4\uFF0C\u672A\u622A\u65AD\u4EA4\u4ED8");
      if (data.byteLength > 32 * 1024 * 1024) throw new Error("\u62A5\u544A\u8D85\u8FC7\u539F\u751F\u5B8C\u6574\u6587\u4EF6\u9884\u89C8\u768432MiB\u9ED8\u8BA4\u4E0A\u9650\uFF0C\u672A\u622A\u65AD\u4EA4\u4ED8");
      exec.signal?.throwIfAborted();
      if (args.kind === "fault" && !troubleshooting && selectTroubleshootingRun(agent.id, agent.session.snapshotEvents(), void 0, canonical)) {
        throw new Error("\u8BFB\u53D6\u65E7\u6545\u969C\u7ED3\u679C\u671F\u95F4\u5DF2\u51FA\u73B0\u65B0\u7EC4\u5408\u6765\u6E90\uFF0C\u672A\u4FDD\u5B58legacy\u62A5\u544A\u3002");
      }
      const attachment = await ctx.attachments.saveFile({ name: filename, data });
      const path = ctx.attachments.fileHostPath(attachment);
      if (!path || attachment.bytes !== data.byteLength) throw new Error("HTML\u5DF2\u4FDD\u5B58\u4F46\u5F53\u524D\u6587\u4EF6\u540E\u7AEF\u4E0D\u80FD\u63D0\u4F9B\u53EF\u6838\u5BF9\u7684\u4E0B\u8F7D\u6587\u4EF6");
      if (troubleshooting && (attachment.name !== filename || attachment.attachmentId !== `sha256:${source.original_sha256}`)) {
        throw new Error("HTML\u5DF2\u4FDD\u5B58\u4F46\u539F\u751F\u9644\u4EF6filename\u6216SHA\u4E0E\u539F\u6545\u969C\u4EA7\u7269\u4E0D\u4E00\u81F4\uFF0C\u672A\u58F0\u660E\u6210\u529F\u4EA4\u4ED8\u3002");
      }
      exec.signal?.throwIfAborted();
      return {
        schema_version: "security-report/v1",
        kind: args.kind,
        session_id: agent.id,
        file_path: path,
        filename: attachment.name,
        content_type: "text/html; charset=utf-8",
        bytes: attachment.bytes,
        sha256: createHash2("sha256").update(data).digest("hex"),
        attachment_id: attachment.attachmentId,
        source,
        generated_at: (/* @__PURE__ */ new Date()).toISOString(),
        message: troubleshooting && args.run_id !== void 0 ? "\u5DF2\u6309\u663E\u5F0Frun_id\u4FDD\u5B58\u672C\u4F1A\u8BDD\u539F\u6545\u969CRun\u7684\u5B8C\u6574HTML\uFF0C\u4E0D\u5192\u79F0\u672C\u4F1A\u8BDD\u6700\u65B0\u7ED3\u679C\u3002\u53EF\u539F\u751F\u9884\u89C8\u3001\u4E0B\u8F7D\uFF1B\u4E0D\u8868\u793A\u6545\u969C\u5DF2\u4FEE\u590D\u3002" : "HTML\u62A5\u544A\u6587\u4EF6\u5DF2\u751F\u6210\u3002\u53EF\u5728\u672C\u6B21\u62A5\u544A\u5361\u7247\u9884\u89C8\u6216\u4E0B\u8F7DHTML\uFF1B\u751F\u6210\u6587\u4EF6\u4E0D\u8868\u793A\u6545\u969C\u5DF2\u4FEE\u590D\u6216\u5DE1\u68C0\u5168\u90E8\u6B63\u5E38\u3002"
      };
    }
  });
}
export {
  apply,
  inject,
  name,
  reportValue,
  requireReportRequest
};
