(() => {
  // advice.mjs
  var obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  var list = (value) => Array.isArray(value) ? value : [];
  var text = (value) => ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  var EXECUTION_BOUNDARY = "\u672C\u6B21\u672A\u6267\u884C\u626B\u63CF\u3001\u4FEE\u590D\u3001\u914D\u7F6E\u53D8\u66F4\u6216\u5904\u7F6E\u3002";
  var CODE_LABELS = {
    accepted: "\u5DF2\u53D7\u7406",
    running: "\u6267\u884C\u4E2D",
    completed: "\u5DF2\u5B8C\u6210",
    failed: "\u8BFB\u53D6\u5931\u8D25",
    incomplete: "\u68C0\u67E5\u4E0D\u5B8C\u6574",
    unverified: "\u672A\u6838\u9A8C",
    cancelled: "\u5DF2\u53D6\u6D88",
    "scope.all": "\u5168\u91CF\u8303\u56F4",
    normal: "\u6B63\u5E38",
    abnormal: "\u5F02\u5E38",
    unknown: "\u672A\u77E5",
    not_applicable: "\u4E0D\u9002\u7528",
    partial: "\u90E8\u5206\u5B8C\u6210",
    NO_TEMPLATE: "\u8BBE\u5907\u672A\u7ED1\u5B9A\u57FA\u7EBF\u6A21\u677F",
    NO_DATA: "SOC\u672A\u91C7\u96C6\u5230\u57FA\u7EBF\u6570\u636E",
    SOC_STATUS_UNKNOWN: "SOC\u672A\u91C7\u96C6\u5230\u72B6\u6001\u6570\u636E",
    BASELINE_EVIDENCE_CONFLICT: "\u57FA\u7EBF\u8BC1\u636E\u51B2\u7A81",
    NO_MATCHING_PAIRS: "\u672C\u6B21\u8303\u56F4\u65E0\u5339\u914D\u5BF9\u8C61/\u65E0\u9002\u7528\u68C0\u67E5\u5BF9",
    NO_MATCHING_RULES: "\u672C\u6B21\u8303\u56F4\u65E0\u5339\u914D\u5BF9\u8C61/\u65E0\u9002\u7528\u68C0\u67E5\u5BF9",
    NO_APPLICABLE_PAIRS: "\u672C\u6B21\u8303\u56F4\u65E0\u5339\u914D\u5BF9\u8C61/\u65E0\u9002\u7528\u68C0\u67E5\u5BF9",
    RULE_INCOMPLETE: "\u89C4\u5219\u68C0\u67E5\u672A\u5B8C\u6210",
    BASELINE_READ_FAILED: "\u57FA\u7EBF\u8BFB\u53D6\u5931\u8D25",
    BASELINE_INCOMPLETE: "\u57FA\u7EBF\u8BFB\u53D6\u672A\u5B8C\u6210",
    SOC_STATUS_READ_FAILED: "SOC\u72B6\u6001\u8BFB\u53D6\u5931\u8D25",
    SOC_STATUS_INCOMPLETE: "SOC\u72B6\u6001\u8BFB\u53D6\u672A\u5B8C\u6210",
    REACHABILITY_INCOMPLETE: "\u4E92\u8054\u8BFB\u53D6\u672A\u5B8C\u6210",
    VULNERABILITIES_INCOMPLETE: "\u6F0F\u6D1E\u8BFB\u53D6\u672A\u5B8C\u6210",
    VULNERABILITIES_READ_FAILED: "\u6F0F\u6D1E\u8BFB\u53D6\u5931\u8D25",
    NO_DEVICE_RECORD: "\u8BBE\u5907\u6CA1\u6709\u8FD4\u56DE\u68C0\u67E5\u660E\u7EC6",
    get_soc_asset_vulnerabilities: "\u8BFB\u53D6\u8D44\u4EA7\u6F0F\u6D1E",
    get_soc_asset_registration_children: "\u8BFB\u53D6\u5BBF\u4E3B\u5B50\u8D44\u4EA7"
  };
  function codeLabel(code) {
    const value = text(code);
    return value && CODE_LABELS[value] ? `${value}\uFF08${CODE_LABELS[value]}\uFF09` : value;
  }
  function safeText(value) {
    const raw = text(value);
    if (!raw) return "";
    return /<[a-z!/]|javascript:|onerror|onload|忽略规则|执行命令|修改凭据|判定正常/i.test(raw) ? "\u539F\u59CB\u6807\u8BC6\uFF08\u5DF2\u8F6C\u4E49\uFF09" : raw;
  }
  function safeLabel(value, fallback = "\u672A\u547D\u540D\u8D44\u4EA7") {
    return safeText(value) || fallback;
  }
  function failureReason(item) {
    const raw = obj(item), facts = obj(raw.facts);
    const errors = list(raw.errors).map(text).filter(Boolean);
    return errors[0] || text(raw.error ?? facts.error) || text(raw.message) || "";
  }
  function operationOf(item) {
    const raw = obj(item), facts = obj(raw.facts);
    const fields = [
      raw.operation,
      raw.operationId,
      raw.tool,
      raw.toolName,
      raw.mcpOperation,
      raw.mcpTool,
      facts.operation,
      facts.operationId,
      facts.tool,
      facts.toolName,
      facts.mcpOperation
    ];
    for (const field of fields) {
      const value = text(field);
      if (value) return value;
    }
    const source = [failureReason(item), ...list(raw.errors).map(text)].join(" ");
    const match = source.match(/(?:[a-z0-9_-]+\/)?(get_[a-z0-9_]+)/i);
    return match ? match[1] : "";
  }
  function templateOf(item) {
    const raw = obj(item), facts = obj(raw.facts), ready = obj(facts.readiness), report = obj(facts.report), run = obj(report.run);
    return {
      name: text(raw.templateName ?? ready.templateName ?? report.templateName ?? run.templateName),
      id: text(raw.templateId ?? ready.templateId ?? report.templateId ?? run.templateId)
    };
  }
  function collectionFields(item) {
    const raw = obj(item), facts = obj(raw.facts), collection = obj(facts.collection);
    return [
      ["\u91C7\u96C6\u4EFB\u52A1", collection.taskName ?? collection.task ?? raw.collectionTask ?? facts.collectionTask],
      ["\u91C7\u96C6\u6743\u9650", collection.permission ?? collection.permissionStatus ?? raw.permission ?? facts.permission],
      ["\u6765\u6E90\u8BB0\u5F55", collection.sourceRecord ?? collection.source ?? raw.sourceRecord ?? facts.sourceRecord],
      ["\u6700\u8FD1\u91C7\u96C6\u65F6\u95F4", collection.lastCollectedAt ?? collection.lastCollectionTime ?? raw.lastCollectedAt ?? facts.lastCollectedAt]
    ].map(([name, value]) => [name, safeText(value)]).filter(([, value]) => value);
  }
  function findingCount(item) {
    const raw = obj(item);
    let count = 0;
    for (const finding of list(raw.findings)) count += list(obj(finding).observations).length || 1;
    count += list(raw.vulnerabilities).length + list(raw.records).length;
    if (!count) for (const source of list(raw.sources)) count += Number(source?.records) || 0;
    return count;
  }
  function findingFacts(item) {
    const raw = obj(item), first = obj(list(raw.findings)[0]);
    const record = obj(first.record ?? first);
    const severity = text(record.severity ?? record.severityName ?? record.riskLevel ?? record.risk_level);
    const source = text(record.sourceName ?? record.source ?? record.vendor);
    return { count: findingCount(item), severity, source };
  }
  function buildAdvice(kind, item, labelText = "") {
    if (!item && !labelText) return { advice: "", verification: "", executionBoundary: "", evidenceSummary: "", safeLabel: "", reasonCode: "", failed: false };
    const raw = obj(item), facts = obj(raw.facts), status = text(raw.status);
    const reason = text(raw.reasonCode ?? raw.notCheckedReason ?? obj(obj(facts.report).run).notCheckedReason ?? obj(facts.readiness).coverageReason);
    const online = text(raw.online ?? facts.online);
    const failure = failureReason(item), operation = operationOf(item);
    const failed = ["failed", "incomplete", "partial", "not_executed", "not_checked"].includes(status) || !!text(raw.error ?? facts.error) || list(raw.errors).length > 0;
    const label2 = safeLabel(labelText);
    const boundary = EXECUTION_BOUNDARY;
    if (kind === "baseline" && reason === "NO_TEMPLATE") {
      const template = templateOf(item);
      const actual = [template.name ? `\u6A21\u677F${safeText(template.name)}` : "", template.id ? `templateId=${safeText(template.id)}` : ""].filter(Boolean);
      const verification = "\u91CD\u65B0\u8BFB\u53D6\u5230\u6A21\u677FID\u3001\u9002\u7528\u68C0\u67E5\u9879\u548C\u5BF9\u5E94\u57FA\u7EBF\u7ED3\u679C\u3002";
      return {
        advice: actual.length ? `\u8BF7\u4E3A\u8BBE\u5907\u7ED1\u5B9A\u9002\u7528\u7684\u57FA\u7EBF\u6A21\u677F\uFF1A${actual.join("\uFF0C")}` : "\u8BF7\u5728SOC\u6838\u5BF9\u5E76\u7ED1\u5B9A\u9002\u7528\u7684\u57FA\u7EBF\u6A21\u677F\uFF08\u5F53\u524D\u672A\u8FD4\u56DE\u6A21\u677F\u540D\u79F0/ID\uFF09\u3002",
        verification,
        executionBoundary: boundary,
        evidenceSummary: `\u6A21\u677F\u540D\u79F0\uFF1A${safeText(template.name) || "\u672A\u63D0\u4F9B"}\uFF1B\u6A21\u677FID\uFF1A${safeText(template.id) || "\u672A\u63D0\u4F9B"}`,
        safeLabel: label2,
        reasonCode: reason,
        failed: false
      };
    }
    if (kind === "baseline" && reason === "NO_DATA") {
      const fields = collectionFields(item);
      const detail = fields.length ? `\uFF08${fields.map(([name, value]) => `${name}\uFF1A${value}`).join("\uFF1B")}\uFF09` : "\uFF08\u5F53\u524D\u672A\u8FD4\u56DE\u91C7\u96C6\u4EFB\u52A1\u3001\u6743\u9650\u3001\u6765\u6E90\u8BB0\u5F55\u6216\u6700\u8FD1\u91C7\u96C6\u65F6\u95F4\uFF09";
      return {
        advice: `\u8BF7\u6838\u5B9E\u5E76\u5B8C\u5584SOC\u57FA\u7EBF\u91C7\u96C6\u914D\u7F6E${detail}`,
        verification: "\u51FA\u73B0\u65B0\u7684\u6709\u6548\u91C7\u96C6\u8BB0\u5F55\u548C\u57FA\u7EBF\u62A5\u544A\u3002",
        executionBoundary: boundary,
        evidenceSummary: fields.length ? fields.map(([name, value]) => `${name}\uFF1A${value}`).join("\uFF1B") : "\u672A\u8FD4\u56DE\u91C7\u96C6\u4EFB\u52A1\u3001\u6743\u9650\u3001\u6765\u6E90\u8BB0\u5F55\u6216\u6700\u8FD1\u91C7\u96C6\u65F6\u95F4",
        safeLabel: label2,
        reasonCode: reason,
        failed: false
      };
    }
    if (kind === "status" && online === "unknown") {
      const observed = text(obj(facts.stateEvidence).evaluatedAt ?? raw.observed_at);
      return {
        advice: "\u8BF7\u6838\u5B9ESOC\u72B6\u6001\u91C7\u96C6\u94FE\u8DEF\u3001\u5FC3\u8DF3/\u4E0A\u62A5\u914D\u7F6E\u53CA\u6700\u8FD1\u89C2\u6D4B\u65F6\u95F4\u3002",
        verification: "\u53D6\u5F97\u65B0\u7684\u660E\u786E\u5728\u7EBF\u6216\u79BB\u7EBF\u89C2\u6D4B\u8BB0\u5F55\uFF1B\u4E0D\u636E\u6B64\u63A8\u65AD\u5F53\u524D\u5728\u7EBF\u72B6\u6001\u3002",
        executionBoundary: boundary,
        evidenceSummary: observed ? `\u6700\u8FD1\u89C2\u6D4B\u65F6\u95F4\uFF1A${safeText(observed)}` : "\u672A\u8FD4\u56DE\u6700\u8FD1\u89C2\u6D4B\u65F6\u95F4",
        safeLabel: label2,
        reasonCode: reason || "SOC_STATUS_UNKNOWN",
        failed: false
      };
    }
    if (kind === "reachability" && ["NO_MATCHING_PAIRS", "NO_MATCHING_RULES", "NO_APPLICABLE_PAIRS"].includes(reason)) {
      return {
        advice: "\u5F53\u524D\u8303\u56F4\u65E0\u9700\u4FEE\u6539\u89C4\u5219\u6216\u8865\u5145\u56FE\u5C42\uFF1B\u5982\u9700\u7EE7\u7EED\u6838\u67E5\uFF0C\u8BF7\u63D0\u4F9B\u9002\u7528\u5BF9\u8C61/\u8303\u56F4\u3002",
        verification: "\u5B8C\u6574\u8BFB\u53D6\u540E\u4ECD\u65E0\u5339\u914D\u5BF9\u8C61\u5373\u7EF4\u6301\u672C\u7ED3\u8BBA\uFF1B\u65B0\u589E\u5BF9\u8C61\u6216\u8303\u56F4\u53D8\u5316\u65F6\u91CD\u65B0\u5339\u914D\u3002",
        executionBoundary: boundary,
        evidenceSummary: `\u6E90\u5BF9\u8C61 ${text(facts.sourceCount) || "\u672A\u63D0\u4F9B"} \u53F0\uFF1B\u76EE\u7684\u5BF9\u8C61 ${text(facts.destinationCount) || "\u672A\u63D0\u4F9B"} \u53F0`,
        safeLabel: label2,
        reasonCode: reason,
        failed: false
      };
    }
    if (kind === "vulnerabilities" && status === "abnormal") {
      const finding = findingFacts(item);
      return {
        advice: "\u8BF7\u6838\u5BF9\u6F0F\u6D1E\u8BB0\u5F55\u3001\u5F71\u54CD\u8D44\u4EA7\u3001\u4E25\u91CD\u5EA6\u548C\u6765\u6E90\uFF0C\u5B8C\u6210\u590D\u6838\u5E76\u53D6\u5F97\u5904\u7F6E\u6216\u63A5\u53D7\u98CE\u9669\u8BB0\u5F55\u3002",
        verification: "\u5B8C\u6210\u9010\u6761\u590D\u6838\u5E76\u53D6\u5F97\u5904\u7F6E\u6216\u63A5\u53D7\u98CE\u9669\u8BB0\u5F55\uFF1B\u672C\u6B21\u672A\u6267\u884C\u626B\u63CF\u6216\u4FEE\u590D\u3002",
        executionBoundary: boundary,
        evidenceSummary: [`\u6F0F\u6D1E\u8BB0\u5F55\uFF1A${finding.count} \u6761`, finding.severity ? `\u4E25\u91CD\u5EA6\uFF1A${safeText(finding.severity)}` : "", finding.source ? `\u6765\u6E90\uFF1A${safeText(finding.source)}` : ""].filter(Boolean).join("\uFF1B"),
        safeLabel: label2,
        reasonCode: reason,
        failed: false
      };
    }
    if (failed) {
      const operationLabel = operation ? codeLabel(operation) : "\u64CD\u4F5C\u540D\u672A\u8FD4\u56DE";
      return {
        advice: `\u8BF7\u6838\u67E5\u53D7\u5F71\u54CD\u64CD\u4F5C ${operationLabel} \u4E0E\u8D44\u4EA7${label2}\u7684\u8FDE\u63A5\u6388\u6743\u3001\u4E1A\u52A1\u8BBF\u95EE\u6743\u9650\u548C\u91CD\u8BD5\u6761\u4EF6\u3002`,
        verification: "\u5728\u6388\u6743\u8303\u56F4\u5185\u91CD\u8BD5\u540E\u53D6\u5F97\u660E\u786E\u6210\u529F\u7ED3\u679C\u6216\u5177\u4F53\u62D2\u7EDD\u539F\u56E0\uFF1B\u4E0D\u80FD\u7528\u7A7A\u7ED3\u679C\u6216\u6B63\u5E38\u7ED3\u8BBA\u66FF\u4EE3\u3002",
        executionBoundary: boundary,
        evidenceSummary: `\u5931\u8D25\u539F\u56E0\uFF1A${safeText(failure) || "\u672A\u63D0\u4F9B"}\uFF1B\u53D7\u5F71\u54CD\u64CD\u4F5C\uFF1A${operationLabel}\uFF1B\u8D44\u4EA7\uFF1A${label2}`,
        safeLabel: label2,
        reasonCode: reason,
        failed: true
      };
    }
    if (kind === "status" && online === "offline") {
      return {
        advice: "\u6309A1\u6838\u5BF9\u8D44\u4EA7\u8EAB\u4EFD\u3001\u7EF4\u62A4\u8BA1\u5212\u548C\u79BB\u7EBF\uFF0F\u5FC3\u8DF3\u65F6\u95F4\uFF1B\u5730\u5740\u65E0\u6548\u65F6\u5148\u6838\u5B9E\u771F\u5B9E\u5730\u5740\u3002",
        verification: "\u53D6\u5F97\u65B0\u7684\u5728\u7EBF\u548C\u6301\u7EED\u91C7\u96C6\u8BB0\u5F55\uFF0C\u53D7\u5F71\u54CD\u4E1A\u52A1\u590D\u6D4B\u901A\u8FC7\u3002",
        executionBoundary: boundary,
        evidenceSummary: "\u72B6\u6001\uFF1A\u79BB\u7EBF",
        safeLabel: label2,
        reasonCode: reason,
        failed: false
      };
    }
    if (kind === "reachability" && status === "abnormal") {
      return {
        advice: "\u6309A4\u6838\u5BF9\u89C4\u5219\u8981\u6C42\u3001\u6E90\u76EE\u7684\u670D\u52A1\u53CA\u5B9E\u9645\u8DEF\u5F84\uFF0F\u7B56\u7565\u8BC1\u636E\u3002",
        verification: "\u5E94\u5141\u8BB8\u7684\u4E1A\u52A1\u53EF\u7528\uFF0C\u5E94\u963B\u65AD\u7684\u8BBF\u95EE\u88AB\u963B\u65AD\u3002",
        executionBoundary: boundary,
        evidenceSummary: "\u89C4\u5219\u5F02\u5E38\u7ED3\u8BBA\u5DF2\u8BB0\u5F55",
        safeLabel: label2,
        reasonCode: reason,
        failed: false
      };
    }
    if (kind === "vulnerabilities" && status === "normal") {
      return {
        advice: "\u5B8C\u6574\u8BFB\u53D6\u540E\u6CA1\u6709\u5386\u53F2\u6F0F\u6D1E\u8BB0\u5F55\uFF1B\u5F53\u524D\u65E0\u9700\u5904\u7F6E\u3002",
        verification: "\u5982\u9700\u786E\u8BA4\u5F53\u524D\u98CE\u9669\uFF0C\u53E6\u884C\u5B89\u6392\u6709\u6548\u626B\u63CF\uFF1B\u672C\u7ED3\u8BBA\u4E0D\u4EE3\u8868\u672C\u6B21\u626B\u63CF\u3002",
        executionBoundary: boundary,
        evidenceSummary: "\u6F0F\u6D1E\u8BB0\u5F55\uFF1A0 \u6761",
        safeLabel: label2,
        reasonCode: reason,
        failed: false
      };
    }
    return { advice: "", verification: "", executionBoundary: boundary, evidenceSummary: "", safeLabel: label2, reasonCode: reason, failed };
  }
  var EVIDENCE_REDACTION = /<script[\s\S]*?<\/script>|<img\b[^>]*>|javascript:|onerror|onload|忽略规则|执行命令|修改凭据/gi;
  function safeEvidenceJson(value) {
    const serialized = JSON.stringify(value, null, 2) ?? "\u672A\u8BB0\u5F55";
    return serialized.replace(EVIDENCE_REDACTION, "[\u5DF2\u8F6C\u4E49]");
  }

  // model.mjs
  var obj2 = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  var list2 = (value) => Array.isArray(value) ? value : [];
  var text2 = (value) => ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  var id = (value) => {
    const v = text2(value).trim();
    return /^\d+$/.test(v) && v !== "0" ? v : "";
  };
  var nameOf = (item) => text2(obj2(item).hostname ?? obj2(item).assetName ?? obj2(item).asset_name ?? obj2(item).name);
  var ipOf = (item) => text2(obj2(item).ip ?? obj2(item).primary_ip);
  var label = (item, fallback) => {
    const name = safeText(nameOf(item)), ip = ipOf(item), asset = id(obj2(item).assetId ?? obj2(item).asset_id);
    return [name || safeText(fallback) || "\u672A\u547D\u540D\u8D44\u4EA7", ip, asset ? `\u8D44\u4EA7 ${asset}` : ""].filter(Boolean).join("\uFF0F");
  };
  var STATUS = { normal: "\u6B63\u5E38", abnormal: "\u5F02\u5E38", unknown: "\u672A\u77E5", failed: "\u8BFB\u53D6\u5931\u8D25", not_applicable: "\u4E0D\u9002\u7528", partial: "\u90E8\u5206\u5B8C\u6210", incomplete: "\u672A\u5B8C\u6210" };
  var statusText = (value) => STATUS[text2(value)] ?? "\u7ED3\u8BBA\u5F85\u6838\u5B9E";
  var REASON = {
    NO_TEMPLATE: "\u8BBE\u5907\u672A\u7ED1\u5B9A\u57FA\u7EBF\u6A21\u677F",
    NO_DATA: "SOC\u672A\u91C7\u96C6\u5230\u57FA\u7EBF\u6570\u636E",
    SOC_STATUS_UNKNOWN: "SOC\u672A\u91C7\u96C6\u5230\u72B6\u6001\u6570\u636E",
    NO_MATCHING_PAIRS: "\u672C\u6B21\u8303\u56F4\u65E0\u5339\u914D\u5BF9\u8C61/\u65E0\u9002\u7528\u68C0\u67E5\u5BF9",
    NO_MATCHING_RULES: "\u672C\u6B21\u8303\u56F4\u65E0\u5339\u914D\u5BF9\u8C61/\u65E0\u9002\u7528\u68C0\u67E5\u5BF9",
    NO_APPLICABLE_PAIRS: "\u672C\u6B21\u8303\u56F4\u65E0\u5339\u914D\u5BF9\u8C61/\u65E0\u9002\u7528\u68C0\u67E5\u5BF9"
  };
  var NO_MATCH = /* @__PURE__ */ new Set(["NO_MATCHING_PAIRS", "NO_MATCHING_RULES", "NO_APPLICABLE_PAIRS"]);
  var FAILED = /* @__PURE__ */ new Set(["failed", "incomplete", "partial", "not_executed", "not_checked"]);
  var READ_ERROR = /读取失败|未执行|未完整|不完整|超时|timeout|error|失败/i;
  function sections(result) {
    const raw = obj2(result);
    if (raw.checks && typeof raw.checks === "object" && !Array.isArray(raw.checks)) {
      return Object.entries(raw.checks).map(([kind, value]) => ({ kind: text2(obj2(value).kind) || kind, source: obj2(value) }));
    }
    return [{ kind: text2(raw.kind) || "inspection", source: raw }];
  }
  function signal(item) {
    const raw = obj2(item), facts = obj2(raw.facts), report = obj2(facts.report), ready = obj2(facts.readiness), run = obj2(report.run);
    return {
      status: text2(raw.status),
      error: raw.error ?? facts.error ?? report.error ?? ready.error,
      reason: text2(raw.reasonCode ?? raw.not_checked ?? raw.notCheckedReason ?? run.notCheckedReason ?? ready.coverageReason ?? facts.reasonCode),
      message: text2(raw.message ?? raw.error),
      online: text2(raw.online ?? facts.online)
    };
  }
  function isReadFailure(item) {
    const s = signal(item);
    return !!s.error || FAILED.has(s.status) || READ_ERROR.test(s.message) && !s.reason;
  }
  function isRealGap(kind, item) {
    const raw = obj2(item), s = signal(item);
    if (isReadFailure(item)) return true;
    if (kind === "baseline" && (s.reason === "NO_TEMPLATE" || s.reason === "NO_DATA")) return false;
    if (kind === "status" && s.online === "unknown") return false;
    if (kind === "reachability" && NO_MATCH.has(s.reason)) return false;
    if (s.status === "normal" || s.status === "abnormal" || s.status === "not_applicable") return false;
    if (kind === "vulnerabilities" && s.status === "unknown") return true;
    return s.status === "unknown" || !s.status;
  }
  function findingCount2(item) {
    const raw = obj2(item);
    let count = 0;
    for (const finding of list2(raw.findings)) count += list2(obj2(finding).observations).length || 1;
    count += list2(raw.vulnerabilities).length + list2(raw.records).length;
    if (!count) for (const source of list2(raw.sources)) count += Number(source?.records) || 0;
    return count;
  }
  function checkSummary(kind, item) {
    const s = signal(item);
    if (kind === "status") {
      if (isReadFailure(item)) return `SOC\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF1A${safeText(failureReason(item)) || "\u672A\u63D0\u4F9B\u539F\u56E0"}`;
      return s.online === "offline" ? "\u79BB\u7EBF" : s.online === "online" ? "\u5728\u7EBF" : REASON.SOC_STATUS_UNKNOWN;
    }
    if (kind === "baseline") {
      if (isReadFailure(item)) return `\u57FA\u7EBF\u8BFB\u53D6\u5931\u8D25\uFF1A${safeText(failureReason(item)) || "\u672A\u63D0\u4F9B\u539F\u56E0"}`;
      return REASON[s.reason] || (s.status === "normal" ? "\u57FA\u7EBF\u901A\u8FC7" : s.status === "abnormal" ? "\u57FA\u7EBF\u4E0D\u8FBE\u6807" : "\u57FA\u7EBF\u7ED3\u8BBA\u5F85\u6838\u5B9E");
    }
    if (kind === "reachability") {
      if (NO_MATCH.has(s.reason)) return REASON.NO_MATCHING_PAIRS;
      if (s.status === "abnormal") return `\u89C4\u5219\u5F02\u5E38\uFF1A${safeText(s.message) || "\u8FDE\u63A5\u4E0D\u7B26\u5408\u8981\u6C42"}`;
      if (s.status === "normal") return "\u89C4\u5219\u6B63\u5E38";
      return safeText(failureReason(item)) || safeText(s.message) || "\u89C4\u5219\u7ED3\u8BBA\u5F85\u6838\u5B9E";
    }
    if (kind === "vulnerabilities") {
      if (isReadFailure(item)) {
        const base = s.message, detail = failureReason(item);
        return `\u6F0F\u6D1E\u8BFB\u53D6\u5931\u8D25\uFF1A${safeText(base && detail && !base.includes(detail) ? `${base}\uFF1A${detail}` : base || detail || "\u8BFB\u53D6\u672A\u5B8C\u6210")}`;
      }
      const n = findingCount2(item);
      return n ? `\u5386\u53F2\u6F0F\u6D1E ${n} \u6761\uFF0C\u5F53\u524D\u5F85\u590D\u6838` : s.status === "normal" ? "\u6CA1\u6709\u6F0F\u6D1E" : "\u6F0F\u6D1E\u7ED3\u8BBA\u5F85\u6838\u5B9E";
    }
    return safeText(failureReason(item)) || s.message || statusText(s.status);
  }
  function buildInspectionCard(result) {
    const raw = obj2(result);
    const runId = text2(raw.run_id ?? raw.runId);
    const kind = text2(raw.kind);
    const script = { deep: "\u5168\u9762\u5DE1\u68C0", routine: "\u5E38\u89C4\u5DE1\u68C0", baseline: "\u57FA\u7EBF\u68C0\u67E5", vulnerabilities: "\u6F0F\u6D1E\u68C0\u67E5", reachability: "\u53EF\u8FBE\u6027\u68C0\u67E5", status: "\u8BBE\u5907\u72B6\u6001\u5DE1\u68C0" }[kind] || "\u5DE1\u68C0";
    const scope = obj2(raw.scope);
    const scopeCount = Number.isFinite(Number(scope.count)) ? Number(scope.count) : null;
    const devices = /* @__PURE__ */ new Map();
    const rules = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map([
      ["offline", []],
      ["soc_unknown", []],
      ["no_template", []],
      ["no_data", []],
      ["vulnerabilities", []],
      ["interconnect", []],
      ["real_gap", []]
    ]);
    const realGaps = [];
    const seenGap = /* @__PURE__ */ new Set();
    const addGap = (kindName, objectKey, labelText, reason, advice, verification) => {
      const key = `${kindName}:${objectKey}`;
      if (seenGap.has(key)) return;
      seenGap.add(key);
      realGaps.push({ kind: kindName, label: labelText, reason: reason || "\u8BFB\u53D6\u5931\u8D25\u6216\u7ED3\u8BBA\u7F3A\u5931", advice: advice || "\u8BF7\u6838\u67E5\u5177\u4F53\u8BFB\u53D6\u5931\u8D25\u3001\u672A\u6267\u884C\u6216\u7F3A\u5931\u8BC1\u636E\u3002", verification: verification || "\u53D6\u5F97\u660E\u786E\u7684\u6210\u529F\u7ED3\u679C\u6216\u5177\u4F53\u5931\u8D25\u539F\u56E0\uFF1B\u4E0D\u80FD\u7528\u7A7A\u7ED3\u679C\u6216\u6B63\u5E38\u7ED3\u8BBA\u66FF\u4EE3\u3002" });
    };
    const ensureDevice = (item) => {
      const asset = id(obj2(item).assetId ?? obj2(item).asset_id) || `ip:${ipOf(item) || nameOf(item) || "unknown"}`;
      if (!devices.has(asset)) devices.set(asset, { assetId: asset.startsWith("ip:") ? "" : asset, label: label(item), name: safeText(nameOf(item)), ip: ipOf(item), checks: [], vulnerabilities: 0, online: "", baseline: "", rules: [] });
      return devices.get(asset);
    };
    const addGroup = (group, item, kindName) => {
      const listValue = groups.get(group);
      const key = `${kindName}:${id(obj2(item).assetId ?? obj2(item).asset_id) || ipOf(item) || nameOf(item) || listValue.length}`;
      if (!listValue.some((entry) => entry.key === key)) listValue.push({ key, label: label(item, kindName === "reachability" ? text2(item.ruleName) : ""), item });
    };
    const availability = { status: false, baseline: false, vulnerabilities: false, reachability: false };
    const itemAvailability = { status: false, baseline: false, vulnerabilities: false, reachability: false };
    const summaryCounts = {};
    const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const sectionMap = sections(raw);
    let missingSections = 0;
    for (const { kind: kindName, source } of sectionMap) {
      if (Object.hasOwn(availability, kindName) && (Array.isArray(source.items) || source.counts && typeof source.counts === "object")) availability[kindName] = true;
      if (Object.hasOwn(itemAvailability, kindName) && Array.isArray(source.items)) itemAvailability[kindName] = true;
      if (Object.hasOwn(availability, kindName) && source.counts && typeof source.counts === "object") summaryCounts[kindName] = source.counts;
      if (!Array.isArray(source.items)) {
        if (!(source.counts && typeof source.counts === "object")) {
          missingSections++;
          addGap("\u7EF4\u5EA6", kindName, "\u68C0\u67E5\u7EF4\u5EA6", "\u672A\u8FD4\u56DE\u68C0\u67E5\u660E\u7EC6\u6570\u7EC4");
        }
        continue;
      }
      for (const item of source.items) {
        const s = signal(item), asset = obj2(item);
        if (kindName === "reachability" || asset.ruleId != null || asset.rule_id != null) {
          const rid = text2(asset.ruleId ?? asset.rule_id ?? obj2(obj2(asset.facts).rule).id) || `connection:${rules.size + 1}`;
          const rule = rules.get(rid) ?? { ruleId: rid, name: safeText(text2(asset.ruleName ?? obj2(obj2(asset.facts).rule).name)) || "\u672A\u547D\u540D\u89C4\u5219", requirement: text2(asset.ruleType ?? obj2(obj2(asset.facts).rule).ruleType) === "FORBIDDEN" ? "\u5E94\u963B\u65AD" : text2(asset.ruleType) === "REQUIRED" ? "\u5E94\u5141\u8BB8" : "\u89C4\u5219\u8981\u6C42\u5F85\u6838\u5B9E", checks: [], status: "normal", noMatch: true, abnormal: false, realGap: false };
          const guidance2 = buildAdvice("reachability", item, `${rule.name}\uFF08\u89C4\u5219 ${rid}\uFF09`);
          rule.checks.push({ status: s.status, reason: s.reason, message: checkSummary("reachability", item), evidence: obj2(asset), observedAt: text2(asset.observed_at), advice: guidance2.advice, verification: guidance2.verification, executionBoundary: guidance2.executionBoundary, evidenceSummary: guidance2.evidenceSummary });
          if (NO_MATCH.has(s.reason) || s.status === "not_applicable") {
            rule.noMatch = rule.noMatch && (NO_MATCH.has(s.reason) || s.status === "not_applicable");
          } else rule.noMatch = false;
          if (s.status === "abnormal") {
            rule.abnormal = true;
            rule.status = "abnormal";
          } else if (s.status === "failed" || isRealGap("reachability", item)) {
            rule.realGap = true;
            if (rule.status !== "abnormal") rule.status = "unknown";
          }
          rules.set(rid, rule);
          if (isRealGap("reachability", item)) addGap("\u89C4\u5219", rid, `${rule.name}\uFF08\u89C4\u5219 ${rid}\uFF09`, s.message || s.reason || "\u89C4\u5219\u8BFB\u53D6\u6216\u8FDE\u63A5\u8BC1\u636E\u4E0D\u5B8C\u6574", guidance2.advice, guidance2.verification);
          continue;
        }
        const device = ensureDevice(item);
        const guidance = buildAdvice(kindName, item, device.label);
        device.checks.push({ kind: kindName, status: s.status, reason: s.reason, message: checkSummary(kindName, item), evidence: obj2(asset), observedAt: text2(asset.observed_at), advice: guidance.advice, verification: guidance.verification, executionBoundary: guidance.executionBoundary, evidenceSummary: guidance.evidenceSummary });
        if (kindName === "status") {
          device.online = s.online || "unknown";
          if (device.online === "offline") addGroup("offline", item, kindName);
          else if (device.online !== "online") addGroup("soc_unknown", item, kindName);
          if (isRealGap("status", item)) addGap("\u8BBE\u5907", asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || "SOC\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\u6216\u672A\u6267\u884C", guidance.advice, guidance.verification);
        } else if (kindName === "baseline") {
          device.baseline = s.reason === "NO_TEMPLATE" ? "NO_TEMPLATE" : s.reason === "NO_DATA" ? "NO_DATA" : s.status;
          if (s.reason === "NO_TEMPLATE") addGroup("no_template", item, kindName);
          else if (s.reason === "NO_DATA") addGroup("no_data", item, kindName);
          else if (isRealGap("baseline", item)) addGap("\u8BBE\u5907", asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || "\u57FA\u7EBF\u8BFB\u53D6\u5931\u8D25\u6216\u7ED3\u8BBA\u7F3A\u5931", guidance.advice, guidance.verification);
        } else if (kindName === "vulnerabilities") {
          device.vulnerabilities += findingCount2(item);
          if (device.vulnerabilities > 0) addGroup("vulnerabilities", item, kindName);
          if (isRealGap("vulnerabilities", item)) addGap("\u8BBE\u5907", asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || "\u6F0F\u6D1E\u6570\u636E\u8BFB\u53D6\u5931\u8D25\u6216\u672A\u6267\u884C", guidance.advice, guidance.verification);
        } else if (isRealGap(kindName, item)) addGap("\u8BBE\u5907", asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || "\u68C0\u67E5\u8BFB\u53D6\u5931\u8D25\u6216\u7ED3\u8BBA\u7F3A\u5931", guidance.advice, guidance.verification);
      }
    }
    for (const rule of rules.values()) {
      if (rule.abnormal) addGroup("interconnect", { ruleName: rule.name, ip: "", hostname: `${rule.name} \xB7 \u89C4\u5219 ${rule.ruleId}` }, "reachability");
    }
    if (missingSections) realGaps.push({ kind: "\u7EF4\u5EA6", label: `${missingSections} \u4E2A\u68C0\u67E5\u7EF4\u5EA6\u672A\u8FD4\u56DE\u660E\u7EC6`, reason: "\u672A\u8FD4\u56DE\u68C0\u67E5\u660E\u7EC6\u6570\u7EC4", advice: "\u8BF7\u6838\u67E5\u7F3A\u5931\u68C0\u67E5\u7EF4\u5EA6\u7684\u8BFB\u53D6\u6761\u4EF6\u540E\u91CD\u8BD5\u3002", verification: "\u53D6\u5F97\u5B8C\u6574\u68C0\u67E5\u660E\u7EC6\u6216\u5177\u4F53\u5931\u8D25\u539F\u56E0\uFF1B\u4E0D\u80FD\u7528\u7A7A\u7ED3\u679C\u66FF\u4EE3\u3002" });
    for (const gap of realGaps) groups.get("real_gap").push({ key: `gap:${gap.kind}:${gap.label}`, label: gap.label, item: { hostname: gap.label, ip: "" } });
    const noMatchRules = [...rules.values()].filter((rule) => rule.noMatch).length;
    const groupAdvice = (key) => {
      const first = groups.get(key)[0];
      if (key === "offline") return "\u6309A1\u6838\u5BF9\u8D44\u4EA7\u8EAB\u4EFD\u3001\u7EF4\u62A4\u8BA1\u5212\u548C\u79BB\u7EBF\uFF0F\u5FC3\u8DF3\u65F6\u95F4\uFF1B\u5730\u5740\u65E0\u6548\u65F6\u5148\u6838\u5B9E\u771F\u5B9E\u5730\u5740\u3002";
      if (key === "soc_unknown") return buildAdvice("status", first?.item).advice;
      if (key === "no_template" || key === "no_data") return buildAdvice("baseline", first?.item).advice;
      if (key === "vulnerabilities") return "A2\uFF1A\u6838\u5B9E\u672C\u673A\u8F6F\u4EF6\u3001\u7248\u672C\u4E0E\u90E8\u7F72\u65B9\u5F0F\uFF0C\u9010\u9879\u590D\u6838\u5386\u53F2\u6F0F\u6D1E\u9002\u7528\u6027\u3002";
      if (key === "interconnect") return first ? "A4\uFF1A\u6838\u5BF9\u89C4\u5219\u8981\u6C42\u3001\u6E90\u76EE\u7684\u670D\u52A1\u53CA\u5B9E\u9645\u8DEF\u5F84\uFF0F\u7B56\u7565\u8BC1\u636E\u3002" : noMatchRules ? "\u5F53\u524D\u8303\u56F4\u65E0\u9002\u7528\u68C0\u67E5\u5BF9\uFF1B\u65E0\u9700\u4FEE\u6539\u89C4\u5219\u6216\u8865\u5145\u56FE\u5C42\uFF0C\u5982\u9700\u7EE7\u7EED\u6838\u67E5\u8BF7\u63D0\u4F9B\u9002\u7528\u5BF9\u8C61/\u8303\u56F4\u3002" : "\u672C\u6B21\u65E0\u89C4\u5219\u5F02\u5E38\u3002";
      if (key === "real_gap") return realGaps[0]?.advice || "\u6838\u5BF9\u5177\u4F53\u8BFB\u53D6\u5931\u8D25\u3001\u672A\u6267\u884C\u6216\u7F3A\u5931\u8BC1\u636E\u3002";
      return "";
    };
    const groupVerification = (key) => {
      const first = groups.get(key)[0];
      if (key === "offline") return "\u53D6\u5F97\u65B0\u7684\u5728\u7EBF\u548C\u6301\u7EED\u91C7\u96C6\u8BB0\u5F55\uFF0C\u53D7\u5F71\u54CD\u4E1A\u52A1\u590D\u6D4B\u901A\u8FC7\u3002";
      if (key === "soc_unknown") return buildAdvice("status", first?.item).verification;
      if (key === "no_template" || key === "no_data") return buildAdvice("baseline", first?.item).verification;
      if (key === "vulnerabilities") return "\u5B8C\u6210\u9010\u6761\u590D\u6838\u5E76\u53D6\u5F97\u5904\u7F6E\u6216\u63A5\u53D7\u98CE\u9669\u8BB0\u5F55\uFF1B\u672C\u6B21\u672A\u6267\u884C\u626B\u63CF\u6216\u4FEE\u590D\u3002";
      if (key === "interconnect") return first ? "\u5E94\u5141\u8BB8\u7684\u4E1A\u52A1\u53EF\u7528\uFF0C\u5E94\u963B\u65AD\u7684\u8BBF\u95EE\u88AB\u963B\u65AD\u3002" : "\u65B0\u589E\u5BF9\u8C61\u6216\u8303\u56F4\u53D8\u5316\u65F6\u91CD\u65B0\u5339\u914D\u3002";
      if (key === "real_gap") return realGaps[0]?.verification || "\u5728\u6388\u6743\u8303\u56F4\u5185\u91CD\u8BD5\u540E\u53D6\u5F97\u660E\u786E\u6210\u529F\u7ED3\u679C\u6216\u5177\u4F53\u62D2\u7EDD\u539F\u56E0\uFF1B\u4E0D\u80FD\u7528\u7A7A\u7ED3\u679C\u6216\u6B63\u5E38\u7ED3\u8BBA\u66FF\u4EE3\u3002";
      return "";
    };
    const groupDefinitions = [
      ["offline", "\u8BBE\u5907\u79BB\u7EBF", "danger"],
      ["soc_unknown", "SOC\u672A\u91C7\u96C6\u5230\u72B6\u6001\u6570\u636E", "warning"],
      ["no_template", "\u8BBE\u5907\u672A\u7ED1\u5B9A\u57FA\u7EBF\u6A21\u677F", "warning"],
      ["no_data", "SOC\u672A\u91C7\u96C6\u5230\u57FA\u7EBF\u6570\u636E", "warning"],
      ["vulnerabilities", "\u5386\u53F2\u6F0F\u6D1E\u5F85\u590D\u6838", "warning"],
      ["interconnect", "\u4E92\u8054\u89C4\u5219\u5F02\u5E38", "danger"],
      ["real_gap", "\u771F\u5B9E\u6267\u884C\u7F3A\u53E3", "danger"]
    ].map(([key, title, tone]) => ({ key, title, tone, advice: groupAdvice(key), verification: groupVerification(key), count: groups.get(key).length, items: groups.get(key) }));
    const metricsAvailable = Object.values(availability).some(Boolean);
    const detailAvailable = Object.values(itemAvailability).some(Boolean);
    const deviceAvailable = itemAvailability.status || itemAvailability.baseline || itemAvailability.vulnerabilities;
    const realGapCount = detailAvailable ? realGaps.length : null;
    const counts = {
      devices: metricsAvailable ? devices.size || scopeCount || 0 : null,
      scopeCount,
      offline: itemAvailability.status ? groups.get("offline").length : finiteNumber(summaryCounts.status?.abnormal),
      socUnknown: itemAvailability.status ? groups.get("soc_unknown").length : finiteNumber(summaryCounts.status?.unknown),
      noTemplate: itemAvailability.baseline ? groups.get("no_template").length : null,
      noData: itemAvailability.baseline ? groups.get("no_data").length : null,
      vulnerabilities: itemAvailability.vulnerabilities ? [...devices.values()].reduce((sum, d) => sum + d.vulnerabilities, 0) : null,
      vulnerabilityDevices: itemAvailability.vulnerabilities ? groups.get("vulnerabilities").length : null,
      rules: itemAvailability.reachability ? rules.size : null,
      abnormalRules: itemAvailability.reachability ? [...rules.values()].filter((r) => r.abnormal).length : null,
      noMatchRules: itemAvailability.reachability ? [...rules.values()].filter((r) => r.noMatch).length : null,
      realGapCount
    };
    const statusText2 = codeLabel(raw.status) || "\u672A\u63D0\u4F9B";
    const events = {
      schema: "inspection-report-event/v1",
      runId,
      actions: ["view_problems", "view_devices", "view_rules", "view_vulnerabilities", "show_markdown", "download_report", "follow_up", "load_details"]
    };
    return {
      schema: "inspection-report-card/v1",
      runId,
      kind,
      script,
      execution: { status: text2(raw.status), statusText: statusText2, complete: raw.complete !== false && text2(raw.status) === "completed" },
      detailAvailable,
      metricsAvailable,
      availability,
      itemAvailability,
      deviceAvailable,
      summaryCounts,
      detailNodes: obj2(raw.detail_nodes),
      emptyState: detailAvailable ? "" : text2(raw.status) === "failed" ? "failed" : text2(raw.status) === "completed" ? "empty" : "pending",
      counts,
      groups: groupDefinitions,
      devices: [...devices.values()],
      rules: [...rules.values()],
      realGaps,
      events,
      initial: { evidenceVisible: false, deviceRows: 0, rawJsonVisible: false, showGroups: true, showActions: true }
    };
  }
  function detailNodeId(model, dimension) {
    return model?.detailNodes?.[dimension]?.[0] || null;
  }
  function eventFor(model, action, target) {
    return {
      type: "inspection_report_event",
      schema: model.events.schema,
      runId: model.runId,
      action,
      ...target ? { target } : {}
    };
  }
  var esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function renderOverviewHtml(model) {
    const metric = (labelText, value) => `<div class="metric"><b>${esc(value ?? "\u2014")}</b><span>${esc(labelText)}</span></div>`;
    const groups = model.detailAvailable ? model.groups.filter((group) => group.count > 0).map((group) => `<button type="button" class="group ${esc(group.tone)}" data-view="${esc(group.key)}"><strong>${esc(group.title)}</strong><span>${esc(group.count)}</span><small>${esc(group.advice || group.items.slice(0, 3).map((item) => item.label).join("\uFF1B") || "\u65E0")}</small></button>`).join("") : "";
    return `<div class="head"><h3>\u5DE1\u68C0\u6982\u89C8\uFF0830\u79D2\u901F\u8BFB\uFF09</h3><span class="tag">${esc(model.script)}</span><span class="tag">${esc(model.execution.complete ? "\u6267\u884C\u5B8C\u6210" : `\u6267\u884C\u72B6\u6001\uFF1A${model.execution.statusText || model.execution.status || "\u672A\u63D0\u4F9B"}`)}</span>${model.runId ? `<span class="tag">${esc(model.runId)}</span>` : ""}</div>
${!model.detailAvailable ? `<p class="warning">${model.emptyState === "failed" ? "\u6267\u884C\u5931\u8D25\uFF0C\u672A\u53D6\u5F97\u7EC8\u6001\u4E1A\u52A1\u660E\u7EC6\uFF1B\u4E0D\u663E\u793A\u8BBE\u59070\u53F0\u3001\u89C4\u52190\u6761\u6216\u201C\u6CA1\u6709\u5339\u914D\u201D\u7B49\u4F2A\u7ED3\u8BBA\u3002" : model.emptyState === "pending" ? "\u6267\u884C\u5DF2\u53D7\u7406\u6216\u4ECD\u5728\u8FD0\u884C\uFF0C\u4E1A\u52A1\u660E\u7EC6\u5C1A\u672A\u8FD4\u56DE\uFF1B\u4E0D\u663E\u793A0\u4E1A\u52A1\u7ED3\u8BBA\u3002" : "\u6267\u884C\u5DF2\u7ED3\u675F\uFF0C\u4E1A\u52A1\u660E\u7EC6\u672A\u968F\u6709\u754C\u6458\u8981\u8FD4\u56DE\uFF1B\u663E\u793A\u771F\u5B9E\u8BA1\u6570\uFF0C\u4E0D\u4F2A\u9020\u660E\u7EC6\u62160\u4E1A\u52A1\u7ED3\u8BBA\u3002"}</p>` : model.execution.complete ? "" : '<p class="warning">\u6267\u884C\u5C1A\u672A\u5B8C\u6210\uFF1B\u4EE5\u4E0B\u53EA\u5C55\u793A\u5DF2\u53D6\u5F97\u7ED3\u679C\uFF0C\u7F3A\u5931\u4E0D\u4EE3\u8868\u6B63\u5E38\u3002</p>'}
${model.metricsAvailable ? `<div class="metrics">${metric("\u51BB\u7ED3\u8303\u56F4\uFF08\u542B\u5355\u5143\uFF09", model.counts.scopeCount ?? model.counts.devices)}${metric("\u771F\u5B9E\u6267\u884C\u7F3A\u53E3", model.counts.realGapCount)}${metric("\u8BBE\u5907\u79BB\u7EBF", model.counts.offline)}${metric("SOC\u672A\u91C7\u96C6\u72B6\u6001", model.counts.socUnknown)}${metric("\u672A\u7ED1\u5B9A\u6A21\u677F", model.counts.noTemplate)}${metric("\u672A\u91C7\u96C6\u57FA\u7EBF", model.counts.noData)}</div>` : ""}
<div class="groups">${groups}</div>
<div class="actions"><button type="button" data-view="problems">\u67E5\u770B\u4E3B\u8981\u95EE\u9898</button><button type="button" data-view="devices">\u67E5\u770B\u8BBE\u5907\u660E\u7EC6</button><button type="button" data-view="rules">\u67E5\u770B\u89C4\u5219</button><button type="button" data-view="vulnerabilities">\u67E5\u770B\u6F0F\u6D1E</button><button type="button" data-view="evidence">\u5C55\u5F00\u8BC1\u636E</button><button type="button" class="primary" data-action="download_report">\u4E0B\u8F7D\u540CRun\u62A5\u544A</button><button type="button" data-action="follow_up">\u7EE7\u7EED\u8FFD\u95EE\u5F53\u524DRun</button></div>
<p class="muted">\u4E1A\u52A1\u7ED3\u8BBA\u4E0E\u771F\u5B9E\u6267\u884C\u7F3A\u53E3\u5206\u5F00\uFF1B\u672A\u91C7\u96C6\u3001\u672A\u7ED1\u5B9A\u3001\u65E0\u9002\u7528\u68C0\u67E5\u5BF9\u4E0D\u8BA1\u4E3A\u7F3A\u53E3\u3002</p><p class="muted">${esc(EXECUTION_BOUNDARY)}</p>`;
  }
  function dispatchEventToInput(inputActions, event) {
    if (!event || event.type !== "inspection_report_event" || !event.runId) return false;
    inputActions.setDraft(JSON.stringify(event));
    inputActions.submit();
    return true;
  }
  var INSPECTION_TOOL_NAMES = ["inspection_deep", "inspection_routine", "inspection_status", "inspection_baseline", "inspection_vulnerabilities", "inspection_reachability", "get_composition_run"];
  function toolViewKeys() {
    return INSPECTION_TOOL_NAMES.flatMap((name) => [name, `mcp__inspection-compositions__${name}`]);
  }
  function inspectionPayloadOf(block) {
    if (!block || block.isError) return null;
    const content = Array.isArray(block.content) ? block.content : [];
    const part = content.find((item) => item && item.type === "text" && typeof item.text === "string");
    let value;
    try {
      value = part ? JSON.parse(part.text) : block.meta;
    } catch {
      return null;
    }
    if (value && value.ok === true && value.result) value = value.result;
    if (value && value.data && !value.kind && !value.checks) value = value.data;
    if (value && value.run_id && (value.nodes || value.nodes_summary) && !value.checks) {
      const result = obj2(value.result);
      return { kind: value.composition_id || value.workflow, run_id: value.run_id, status: value.status, execution_status: value.status, scope: value.scope, nodes: value.nodes, nodes_summary: value.nodes_summary, detail_nodes: value.detail_nodes, artifacts: value.artifacts, error: value.error, ...Object.keys(obj2(result.checks)).length ? { checks: result.checks } : {} };
    }
    return value;
  }

  // client.entry.js
  window.__ModuleLoader__.load({
    id: "dsh-inspection-report-card",
    factory(require2) {
      const React = require2("react");
      const h = React.createElement;
      const NS = "inspectionReportCard";
      const TOOLS = toolViewKeys();
      function emit(model, action, target) {
        const event = eventFor(model, action, target);
        window.dispatchEvent(new CustomEvent("dsh-inspection-report-event", { detail: event }));
        return event;
      }
      function style() {
        if (document.getElementById("dsh-inspection-report-card-style")) return;
        const node = document.createElement("style");
        node.id = "dsh-inspection-report-card-style";
        node.textContent = `
.dsh-inspection-card{border:1px solid var(--dsw-alias-border-secondary,#dbe7f5);border-radius:12px;background:var(--dsw-alias-bg-primary,#fff);padding:14px 16px;margin:8px 0;font-size:13px;color:var(--dsw-alias-text-primary,#172b45)}
.dsh-inspection-card h3{margin:0;font-size:15px}
.dsh-inspection-card .head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.dsh-inspection-card .tag{font-size:11px;padding:2px 7px;border-radius:6px;background:#edf3fb;color:#31557d}
.dsh-inspection-card .metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:10px 0}
.dsh-inspection-card .metric{border:1px solid #e2e9f2;border-radius:8px;padding:7px 9px;background:#f8fbff}
.dsh-inspection-card .metric b{display:block;font-size:18px;line-height:1.3}
.dsh-inspection-card .metric span{font-size:11px;color:#5d7692}
.dsh-inspection-card .groups{display:grid;gap:6px;margin:10px 0}
.dsh-inspection-card button{font:inherit;cursor:pointer}
.dsh-inspection-card .group{text-align:left;border:1px solid #e2e9f2;border-radius:8px;background:#fff;padding:7px 9px;display:grid;grid-template-columns:1fr auto;gap:2px 8px}
.dsh-inspection-card .group small{grid-column:1/-1;color:#657a92;font-size:11px;line-height:1.5}
.dsh-inspection-card .group.danger strong{color:#b12839}
.dsh-inspection-card .group.warning strong{color:#925c0a}
.dsh-inspection-card .actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.dsh-inspection-card .actions button{border:1px solid #cbd9e9;border-radius:7px;background:#fff;color:#29496d;padding:6px 9px;font-size:12px}
.dsh-inspection-card .actions button.primary{background:#2468ce;border-color:#2468ce;color:#fff}
.dsh-inspection-card .detail{margin-top:12px;border-top:1px solid #e7eef7;padding-top:10px}
.dsh-inspection-card .detail h4{margin:8px 0 6px;font-size:13px}
.dsh-inspection-card .row{border:1px solid #e6edf6;border-radius:8px;padding:7px 9px;margin:5px 0;background:#fbfdff}
.dsh-inspection-card .row summary{cursor:pointer;font-weight:600}
.dsh-inspection-card .row p{margin:5px 0;line-height:1.6}
.dsh-inspection-card .muted{color:#6a8099}
.dsh-inspection-card .danger{color:#b12839;font-weight:700}
.dsh-inspection-card .warning{color:#925c0a}
.dsh-inspection-card input[type=search]{width:100%;border:1px solid #cbd9e9;border-radius:7px;padding:6px 8px;margin:4px 0 8px;font:inherit}
.dsh-inspection-card pre{white-space:pre-wrap;word-break:break-word;background:#122641;color:#dbe7fa;border-radius:7px;padding:8px;max-height:260px;overflow:auto;font-size:11px}
.dsh-inspection-card .empty{padding:8px;color:#657a92;border:1px dashed #cbd7e7;border-radius:7px}
@media(max-width:720px){.dsh-inspection-card .metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
        document.head.appendChild(node);
      }
      function metric(label2, value) {
        return h("div", { className: "metric", key: label2 }, h("b", null, String(value ?? "\u2014")), h("span", null, label2));
      }
      function evidenceBlock(rows) {
        return h(
          "details",
          null,
          h("summary", null, "\u5C55\u5F00\u8BC1\u636E"),
          h("pre", null, safeEvidenceJson(rows))
        );
      }
      function checks(view) {
        return view.checks.map((check, index) => h(
          "p",
          { key: index, className: check.status === "abnormal" ? "danger" : "" },
          `${kindLabel(check.kind)}\uFF1A${check.message}${check.observedAt ? `\uFF08${check.observedAt}\uFF09` : ""}`
        ));
      }
      function InspectionTool({ toolName, phase, block }) {
        style();
        const payload = inspectionPayloadOf(block);
        const model = React.useMemo(() => {
          try {
            return payload ? buildInspectionCard(payload) : null;
          } catch {
            return null;
          }
        }, [payload]);
        const [view, setView] = React.useState("overview");
        const [query, setQuery] = React.useState("");
        const cardRef = React.useRef(null);
        React.useEffect(() => {
          let parent = cardRef.current && cardRef.current.parentElement;
          while (parent) {
            if (parent.getAttribute && parent.getAttribute("hidden") === "until-found") {
              parent.removeAttribute("hidden");
              parent.style.height = "auto";
              parent.style.maxHeight = "none";
              parent.style.overflow = "visible";
            }
            parent = parent.parentElement;
          }
        }, []);
        const overview = React.useMemo(() => model ? renderOverviewHtml(model) : "", [model]);
        React.useEffect(() => {
          const node = cardRef.current;
          if (!node || phase !== "result" || !model) return void 0;
          const handler = (event) => {
            const target = event.target && event.target.closest ? event.target.closest("[data-action],[data-view]") : null;
            if (!target) return;
            const action = target.getAttribute("data-action");
            if (action === "download_report" || action === "follow_up") {
              emit(model, action);
              return;
            }
            const next = target.getAttribute("data-view");
            if (next) setView(["problems", "devices", "rules", "vulnerabilities", "evidence"].includes(next) ? next : "problems");
          };
          node.addEventListener("click", handler);
          return () => node.removeEventListener("click", handler);
        }, [model, phase]);
        if (phase !== "result") return h("div", { className: "dsh-inspection-card" }, h("p", null, `\u6B63\u5728\u6267\u884C${toolName.endsWith("inspection_deep") ? "\u5168\u9762\u5DE1\u68C0" : "\u5DE1\u68C0"}\u2026`));
        if (!model) return h(
          "details",
          { className: "dsh-inspection-card" },
          h("summary", null, "\u5DE1\u68C0\u7ED3\u679C\u6682\u672A\u8BC6\u522B\u4E3A\u62A5\u544A\u5361\uFF0C\u5C55\u5F00\u539F\u59CB\u56DE\u6267"),
          h("pre", null, safeEvidenceJson(block?.content ?? block?.meta ?? null))
        );
        const open = (action) => {
          emit(model, action);
          setView("overview");
        };
        const devices = model.devices.filter((device) => !query.trim() || device.label.toLowerCase().includes(query.trim().toLowerCase()));
        const detail = () => {
          if (view === "devices" && !model.deviceAvailable) return h("div", { className: "detail" }, h("h4", null, "\u8BBE\u5907\u660E\u7EC6\u672A\u968F\u6458\u8981\u8FD4\u56DE"), h("p", { className: "warning" }, "\u72B6\u6001\u3001\u57FA\u7EBF\u548C\u6F0F\u6D1E\u9879\u672A\u968F\u6709\u754C\u6458\u8981\u8FD4\u56DE\uFF1B\u4E0D\u663E\u793A\u8BBE\u59070\u53F0\u6216\u201C\u6CA1\u6709\u5339\u914D\u8BBE\u5907\u201D\u3002"), h("button", { type: "button", onClick: () => emit(model, "load_details", { nodeId: detailNodeId(model, "status"), offset: 0, limit: 50 }) }, "\u52A0\u8F7D\u8BBE\u5907\u5206\u9875\u8BE6\u60C5"));
          if (view === "rules" && !model.availability?.reachability) return h("div", { className: "detail" }, h("h4", null, "\u89C4\u5219\u660E\u7EC6\u672A\u968F\u6458\u8981\u8FD4\u56DE"), h("p", { className: "warning" }, "\u4E92\u8054\u89C4\u5219\u9879\u672A\u968F\u6709\u754C\u6458\u8981\u8FD4\u56DE\uFF1B\u4E0D\u663E\u793A\u89C4\u52190\u6761\u3002"), h("button", { type: "button", onClick: () => emit(model, "load_details", { nodeId: detailNodeId(model, "reachability"), offset: 0, limit: 50 }) }, "\u52A0\u8F7D\u89C4\u5219\u5206\u9875\u8BE6\u60C5"));
          if (view === "vulnerabilities" && !model.availability?.vulnerabilities) return h("div", { className: "detail" }, h("h4", null, "\u6F0F\u6D1E\u660E\u7EC6\u672A\u968F\u6458\u8981\u8FD4\u56DE"), h("p", { className: "warning" }, "\u6F0F\u6D1E\u9879\u672A\u968F\u6709\u754C\u6458\u8981\u8FD4\u56DE\uFF1B\u4E0D\u663E\u793A\u6F0F\u6D1E0\u6761\u3002"), h("button", { type: "button", onClick: () => emit(model, "load_details", { nodeId: detailNodeId(model, "vulnerabilities"), offset: 0, limit: 50 }) }, "\u52A0\u8F7D\u6F0F\u6D1E\u5206\u9875\u8BE6\u60C5"));
          if (!model.detailAvailable) return h("div", { className: "detail" }, h("h4", null, "\u4E1A\u52A1\u660E\u7EC6\u672A\u968F\u6458\u8981\u8FD4\u56DE"), h("p", { className: "warning" }, model.emptyState === "failed" ? "\u6267\u884C\u5931\u8D25\u6216\u4EC5\u8FD4\u56DE\u6458\u8981\uFF1B\u4E0D\u663E\u793A\u8BBE\u59070\u53F0\u3001\u89C4\u52190\u6761\u6216\u201C\u6CA1\u6709\u5339\u914D\u201D\u7B49\u4F2A\u7ED3\u8BBA\u3002" : "\u6458\u8981\u4E0D\u542B\u4E1A\u52A1\u9879\uFF1B\u4E0D\u663E\u793A0\u4E1A\u52A1\u7ED3\u8BBA\u3002"), h("div", { className: "actions" }, h("button", { type: "button", onClick: () => emit(model, "load_details", { nodeId: detailNodeId(model, "root"), offset: 0, limit: 50 }) }, "\u52A0\u8F7D\u540CRun\u5206\u9875\u8BE6\u60C5")), h("p", { className: "muted" }, "\u5C06\u6309\u5F53\u524D Run \u7684\u771F\u5B9E\u8282\u70B9\u5206\u9875\u8BFB\u53D6\uFF1B\u672A\u77E5\u7EF4\u5EA6\u4ECD\u663E\u793A unknown\uFF0C\u4E0D\u4F2A\u9020\u603B\u6570\u3002"), h("p", { className: "muted" }, EXECUTION_BOUNDARY));
          if (view === "problems") return h(
            "div",
            { className: "detail" },
            h("h4", null, "\u4E3B\u8981\u95EE\u9898\u5206\u7EC4"),
            model.groups.map((group) => h(
              "div",
              { className: `row ${group.tone}`, key: group.key },
              h("p", null, `${group.title}\uFF1A${group.count} \u9879`),
              h("p", { className: "muted" }, `\u5EFA\u8BAE\uFF1A${group.advice}`),
              h("p", { className: "muted" }, `\u9A8C\u8BC1\uFF1A${group.verification || "\u672A\u63D0\u4F9B"}`),
              h("p", { className: "muted" }, EXECUTION_BOUNDARY),
              group.items.length ? h("p", { className: "muted" }, group.items.map((item) => item.label).join("\uFF1B")) : h("p", { className: "muted" }, "\u65E0")
            ))
          );
          if (view === "devices") return h(
            "div",
            { className: "detail" },
            h("h4", null, `\u8BBE\u5907\u660E\u7EC6\uFF08${model.devices.length} \u53F0\uFF09`),
            h("input", { type: "search", placeholder: "\u6309\u8BBE\u5907\u3001IP \u6216\u8D44\u4EA7\u7B5B\u9009", value: query, onChange: (event) => setQuery(event.target.value) }),
            devices.length ? devices.map((device) => h(
              "details",
              { className: "row", key: device.assetId || device.label },
              h("summary", null, `${device.label} \xB7 ${device.online === "offline" ? "\u79BB\u7EBF" : device.online === "online" ? "\u5728\u7EBF" : "SOC\u672A\u91C7\u96C6\u5230\u72B6\u6001\u6570\u636E"}`),
              device.checks.length ? device.checks.map((check, index) => h(
                "div",
                { key: index, className: "row" },
                h("p", null, `${kindLabel(check.kind)}\uFF1A${check.message}${check.reason ? ` \xB7 ${codeLabel(check.reason)}` : ""}`),
                check.advice ? h("p", { className: "muted" }, `\u5EFA\u8BAE\uFF1A${check.advice}`) : null,
                check.verification ? h("p", { className: "muted" }, `\u9A8C\u8BC1\uFF1A${check.verification}`) : null,
                check.evidenceSummary ? h("p", { className: "muted" }, `\u8BC1\u636E\u6458\u8981\uFF1A${check.evidenceSummary}`) : null,
                check.executionBoundary ? h("p", { className: "muted" }, check.executionBoundary) : null
              )) : h("p", { className: "muted" }, "\u65E0\u68C0\u67E5\u8BB0\u5F55"),
              device.vulnerabilities ? h("p", null, `\u5386\u53F2\u6F0F\u6D1E\u8BB0\u5F55\uFF1A${device.vulnerabilities} \u6761\uFF0C\u5F53\u524D\u5F85\u590D\u6838`) : null,
              h("div", { className: "actions" }, h("button", { type: "button", onClick: () => emit(model, "show_markdown", { assetId: device.assetId }) }, "\u67E5\u770B\u540CRun Markdown")),
              evidenceBlock(device.checks)
            )) : h("p", { className: "empty" }, "\u6CA1\u6709\u5339\u914D\u8BBE\u5907")
          );
          if (view === "rules") return h(
            "div",
            { className: "detail" },
            h("h4", null, `\u4E92\u8054\u89C4\u5219\uFF08${model.rules.length} \u6761\uFF09`),
            model.rules.length ? model.rules.map((rule) => h(
              "details",
              { className: "row", key: rule.ruleId },
              h("summary", null, `${rule.name} \xB7 \u89C4\u5219 ${rule.ruleId} \xB7 ${rule.noMatch ? "\u65E0\u9002\u7528\u68C0\u67E5\u5BF9" : rule.abnormal ? "\u5F02\u5E38" : statusText2(rule.status)}`),
              h("p", null, `${rule.requirement}\uFF1B\u68C0\u67E5 ${rule.checks.length} \u9879`),
              rule.checks.map((check, index) => h(
                "div",
                { key: index, className: "row" },
                h("p", { className: check.status === "abnormal" ? "danger" : "" }, `${check.message}${check.reason ? ` \xB7 ${codeLabel(check.reason)}` : ""}${check.observedAt ? `\uFF08${check.observedAt}\uFF09` : ""}`),
                check.advice ? h("p", { className: "muted" }, `\u5EFA\u8BAE\uFF1A${check.advice}`) : null,
                check.verification ? h("p", { className: "muted" }, `\u9A8C\u8BC1\uFF1A${check.verification}`) : null,
                check.evidenceSummary ? h("p", { className: "muted" }, `\u8BC1\u636E\u6458\u8981\uFF1A${check.evidenceSummary}`) : null,
                check.executionBoundary ? h("p", { className: "muted" }, check.executionBoundary) : null
              )),
              evidenceBlock(rule.checks)
            )) : h("p", { className: "empty" }, "\u672C\u6B21\u6CA1\u6709\u89C4\u5219\u7ED3\u679C")
          );
          if (view === "vulnerabilities") return h(
            "div",
            { className: "detail" },
            h("h4", null, `\u6F0F\u6D1E\u7ED3\u679C\uFF08${model.counts.vulnerabilityDevices} \u53F0 / ${model.counts.vulnerabilities} \u6761\uFF09`),
            model.groups.find((group) => group.key === "vulnerabilities")?.items.length ? model.groups.find((group) => group.key === "vulnerabilities").items.map((item) => h("p", { className: "row", key: item.key }, item.label)) : h("p", { className: "empty" }, "\u672C\u6B21\u6CA1\u6709\u5DF2\u8BFB\u6F0F\u6D1E\u8BB0\u5F55")
          );
          if (view === "evidence") return h(
            "div",
            { className: "detail" },
            h("h4", null, "\u4E09\u5C42\u8BC1\u636E\u4E0E\u540C Run \u4EA4\u4ED8"),
            h("p", null, "\u539F\u5B50\u8BC1\u636E\u5728\u5404\u8BBE\u5907\u3001\u89C4\u5219\u5C55\u5F00\u9879\u4E2D\uFF1B\u4EE5\u4E0B\u662F\u540C Run \u7EA7\u64CD\u4F5C\u3002"),
            h(
              "div",
              { className: "actions" },
              h("button", { type: "button", onClick: () => emit(model, "show_markdown") }, "\u67E5\u770B\u540CRun Markdown"),
              h("button", { type: "button", onClick: () => emit(model, "download_report") }, "\u4E0B\u8F7D\u540CRun\u62A5\u544A")
            ),
            h("p", { className: "muted" }, `\u8FD0\u884C\uFF1A${model.runId || "\u672A\u63D0\u4F9B"}\uFF1B\u6240\u6709\u64CD\u4F5C\u6CBF\u7528\u6B64\u8FD0\u884C\uFF0C\u4E0D\u91CD\u65B0\u5DE1\u68C0\u3002`)
          );
          return null;
        };
        return h(
          "section",
          { className: "dsh-inspection-card", "data-run-id": model.runId || "", ref: cardRef },
          h("div", { dangerouslySetInnerHTML: { __html: overview } }),
          view !== "overview" ? detail() : null
        );
      }
      function statusText2(value) {
        return codeLabel(value) || "\u5F85\u6838\u5B9E";
      }
      function kindLabel(value) {
        return { status: "\u8BBE\u5907\u5728\u7EBF\u72B6\u6001", baseline: "\u57FA\u7EBF\u6838\u67E5", vulnerabilities: "\u6F0F\u6D1E\u89C2\u6D4B", reachability: "\u4E92\u8054\u89C4\u5219" }[value] || codeLabel(value) || "\u68C0\u67E5\u9879";
      }
      function EventBridge({ inputActions }) {
        React.useEffect(() => {
          const listener = (event) => {
            const detail = event?.detail;
            if (!detail || detail.type !== "inspection_report_event") return;
            try {
              dispatchEventToInput(inputActions, detail);
            } catch {
            }
          };
          window.addEventListener("dsh-inspection-report-event", listener);
          return () => window.removeEventListener("dsh-inspection-report-event", listener);
        }, [inputActions]);
        return null;
      }
      const inject = ["slots"];
      function apply(ctx) {
        for (const toolName of TOOLS) {
          ctx.effect(() => ctx.slots.inject("tool.call.toolview", () => ctx.slots.register(
            { name: "tool.call.toolview", key: toolName },
            InspectionTool
          )), `inspection-report-card: ${toolName} view`);
        }
        ctx.effect(() => ctx.slots.inject("conversation.input.dock", () => ctx.slots.register(
          { name: "conversation.input.dock", id: "inspection-report-card-bridge", order: 110 },
          EventBridge
        )), "inspection-report-card: event bridge");
      }
      return { apply, inject };
    }
  });
})();
