export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type DecisionQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string; criteria: { false: string; true: string } }
  | { type: 'score'; instructions: string; criteria: string[] }

export const DECISION_SITES = [
  'main_route', 'policy_action', 'emergency_scope', 'emergency_action_match',
  'inspection_template_match', 'fault_next_probe', 'fault_hypothesis', 'threat_evidence',
  'threat_judgement', 'threat_verdict_reliability', 'threat_recommendation',
  'frozen_plan_step', 'material_answer',
] as const
export type DecisionSite = typeof DECISION_SITES[number]

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
Object.freeze(DECISION_SITES)

/** 对象、工具目录、模板和证据候选由 state 提供；本文件只固定问题语义。 */
export const DECISION_QUESTIONS: Record<DecisionSite, Record<string, DecisionQuestion>> = freeze({
  main_route: {
    route: {
      type: 'choice',
      instructions: '依据真实用户原文、已核验的语言理解、明确否定与当前任务绑定，选择本轮主要业务语义。提及一个动作不等于请求执行；仅整理材料不得变成操作。多个需要分别办理的策略或应急请求先澄清，不生成工具或对象标识。',
      criteria: {
        emergency_action: '用户请求对明确目标办理应急动作，或继续核对同一应急任务。',
        policy_configuration: '用户请求办理网络访问策略，或继续核对同一策略任务。',
        threat_analysis: '用户请求研判威胁或告警，或继续核对同一威胁研判任务。',
        fault_analysis: '用户请求调查故障原因，需要围绕对象和时段开展只读取证。',
        inspection: '用户请求巡检、查找巡检目录或继续查看同一巡检运行。',
        schedule: '用户明确请求创建、查询、修改或删除调度规则；单纯提及时间不代表需要调度。',
        response_planning: '用户请求基于已给事实编写响应计划或评估影响，不表示取得执行授权。',
        investigation: '用户要求进一步检索、调查或核对材料、对象及状态，需要取得新证据，且不属于其他已列明的业务流程。',
        direct_answer: '用户需要概念说明、普通问答或对已给材料作忠实摘要；现有输入足以回答，不要求新增检索、对象状态核对或其他业务办理。',
        clarify_multiple_requests: '本轮包含多个不同业务办理请求，或业务目标相互冲突，需要先澄清办理对象与顺序；同一普通问答中的多个概念不属于此项。',
      },
    },
  },
  policy_action: {
    requested_effect: {
      type: 'choice',
      instructions: '判断用户对该项访问策略所表达的允许或拒绝语义，保留原文的否定和条件。“开通”等办理措辞不能覆盖原文要求禁止或阻断的含义。这里只判断访问效果，不补端点、端口、协议、有效期或执行权限。',
      criteria: {
        allow: '用户明确要求允许符合所述条件的源到目的访问。',
        deny: '用户明确要求拒绝或阻断符合所述条件的源到目的访问。',
        unclear_or_conflicting: '允许与拒绝的意图未明确，或现有措辞存在不能消解的冲突。',
      },
    },
  },
  emergency_scope: {
    scope: {
      type: 'choice',
      instructions: '根据被操作设备、动作原文、源目关系和已知设备类型判断作用范围。不能按文本出现的 IP 数量判断范围；保留目的端与端口条件，不把被操作设备和流量来源混成两个操作目标。',
      criteria: {
        single_target: '动作施加于一个明确设备或目标；其他来源或端口只是该目标上的动作条件。',
        two_endpoint_traffic: '请求针对明确源到明确目的之间的流量关系，两个端点共同限定操作范围。',
        unclear: '现有材料不足以区分被操作目标与流量端点，或作用范围存在冲突。',
      },
    },
  },
  emergency_action_match: {
    matches_requested_action: {
      type: 'noul',
      instructions: '仅评价 state 中这一个真实目录动作候选是否符合用户动作、目标类型、范围与参数语义。区分防火墙封禁、解除与主机动作；不补造目录动作或解除所需的真实规则标识。',
      criteria: {
        false: '该动作与用户要求不匹配，或已有目录与请求材料不足以确认匹配。',
        true: '已有材料明确支持该真实目录动作与用户要求的动作及作用对象匹配。',
      },
    },
  },
  inspection_template_match: {
    matches_requested_inspection: {
      type: 'noul',
      instructions: '仅评价 state 中这一个真实巡检模板的巡检项、发布版本与范围说明是否符合用户要求。模板标识与具体对象留在 state；这里只判断语义匹配，不发起巡检，不把已有运行当成新请求。',
      criteria: {
        false: '模板的巡检项或范围不符合请求，或现有材料不能确认匹配。',
        true: '模板公开的巡检项与范围明确覆盖本次请求。',
      },
    },
  },
  fault_next_probe: {
    next_probe: {
      type: 'choice',
      instructions: '围绕当前故障对象和时段选择下一项必要的最小只读取证。只选择实际可用且参数齐全的能力，结合已有结果、空值、失败和已调用签名避免无收益重复；不得把能力缺失或空查询等同于资产不存在。这里的选择不改变当前角色或工具权限。',
      criteria: {
        search_graph_assets: '在图谱中按已有线索查找相关资产。',
        get_graph_resolve_ip_host: '解析已有 IP 或主机线索所对应的图谱对象。',
        get_soc_asset_by_asset_id: '按已知资产标识读取该资产的实际详情。',
        list_soc_asset: '按当前问题所需条件查询 SOC 资产列表。',
        get_soc_asset_biz_systems: '读取已知资产关联的业务系统信息。',
        get_soc_asset_vulnerabilities: '读取已知资产的漏洞信息。',
        get_ingest_devices_by_asset_by_asset_id: '查询已知资产关联的采集设备。',
        get_graph_node_detail: '读取已知图谱节点的实际详情。',
        get_graph_path_query: '查询当前已知对象之间的图谱路径关系。',
        get_reachability_path_by_ip: '按已有 IP 条件查询可达性路径。',
        get_graph_flow_host_pair_ports: '查询两个已知主机之间的流量及端口关系。',
        get_reachability_cross_signal: '交叉核对当前路径或对象的多源可达性信号。',
        get_graph_compliance_violations: '查询与当前问题相关的图谱合规违规事实。',
        get_graph_coverage: '核对图谱已有数据的覆盖范围与缺口。',
        get_event_by_id: '按已知事件标识读取该事件的实际记录。',
        finish: '已有事实足以给出当前故障问题的有边界答复，无需继续取证。',
        ask_missing_parameter: '必要下一步缺少用户能够补充的对象、时段或其他必需参数，先澄清。',
        capability_unavailable: '当前问题所需能力没有实际装载、无法访问或无法提供有效结果，应明确能力缺口。',
      },
    },
  },
  fault_hypothesis: {
    finding_status: {
      type: 'choice',
      instructions: '只评价 state 中这一项待核验故障原因。依据同一对象、同一时段的实际证据与直接冲突事实；空查询、缺失信息或其他对象的事实不能作为反证，不在缺证时给原因排序或标置信度。',
      criteria: {
        supported: '与该对象和时段直接相关的实际证据支持这个原因主张。',
        refuted: '与该对象和时段直接相关的实际事实明确反驳这个原因主张。',
        insufficient: '现有事实不足以支持或反驳该原因，仍存在决定性材料缺口。',
      },
    },
  },
  threat_evidence: {
    relevance: {
      type: 'choice',
      instructions: '评价 state 中这一个已核验路径和值的观察与当前主张的关系。只使用决策前冻结的五源材料，保留实体、时段与冲突；规则名称、事件声明和重复告警不自动构成攻击事实。',
      criteria: {
        support: '该观察直接支持当前主张中的行为、关系或结果事实。',
        direct_counter: '该观察包含直接反驳当前主张的实际事实，而非仅未查到数据。',
        neutral: '该观察与当前主张的判定没有直接支持或反驳关系。',
        insufficient: '该观察的内容或关联信息不足，无法可靠判断其与当前主张的关系。',
      },
    },
    attack_specific: {
      type: 'noul',
      instructions: '评价同一个观察本身是否包含可核验、针对攻击行为的特异事实，不把规则名称、泛化异常或告警数量当作高特异攻击行为。',
      criteria: {
        false: '该观察不含足以确认攻击特异性的实际行为事实。',
        true: '该观察含有能够直接核验的攻击特异行为事实。',
      },
    },
    relation_observed: {
      type: 'noul',
      instructions: '评价 state 中所提实体关系是否在原始材料中被实际观察到。仅同一 IP、同一时间或重复告警不能代替稳定的实体与行为关联。',
      criteria: {
        false: '所提关系没有实际观察证据，或仅有不能建立该关系的共同线索。',
        true: '原始材料明确观察到了所提实体之间的该项关系。',
      },
    },
    successful_outcome_observed: {
      type: 'noul',
      instructions: '评价所提攻击结果是否已有实际成功结果证据。请求、尝试、规则命中或事件的成功声明不能自行替代可核验的结果事实。',
      criteria: {
        false: '没有实际成功结果的可核验事实，或材料只证明了尝试与声明。',
        true: '已有原始材料中的实际结果事实证明所提结果成功发生。',
      },
    },
  },
  threat_judgement: {
    verdict: {
      type: 'choice',
      instructions: '依据当前已核验五源、主张、支持与反向事实和缺口，按固定父版结论语义研判。缺数据本身不自动等于可疑；名单技术命中不等于业务结论正确。这里只输出结论语义，不输出数值可信度。',
      criteria: {
        true_alert: '实际证据支持最小攻击链，或存在恶意且成功的强单点攻击事实。',
        false_positive: '实际材料未达到攻击链或高特异攻击单点条件；仍需如实保留低可信与材料缺口。',
        suspicious: '尚未形成最小攻击链，但存在高特异性的攻击单点事实。',
      },
    },
    primary_result: {
      type: 'choice',
      instructions: '单独判断当前主要攻击主张是否成立，不能用其他攻击、相邻告警或主张之外的事实替代；保留直接冲突和缺失结果。',
      criteria: {
        supported: '已核验事实直接支持当前主要攻击主张。',
        refuted: '已核验事实直接反驳当前主要攻击主张。',
        insufficient: '当前材料不足以支持或反驳该主要主张。',
      },
    },
    supported_secondary_attack: {
      type: 'noul',
      instructions: '判断在当前主要主张之外，是否有已核验事实支持另一项攻击行为。必须区分不同主张与各自证据，不把对主要主张的否定直接转成其他攻击。',
      criteria: {
        false: '现有材料没有实际支持另一项攻击行为。',
        true: '现有已核验事实明确支持主要主张之外的另一项攻击行为。',
      },
    },
  },
  threat_verdict_reliability: {
    evidence_closure: {
      type: 'score',
      instructions: '评价同一冻结五源对当前结论的证据闭合程度，只选有序语义等级，不换算成 confidence_score。等级语义依次为：barely_distinguishable 表示仅勉强可区分；decisive_gap_or_conflict 表示仍有决定性缺口或冲突；leading_but_missing_relation_or_outcome 表示主要方向已有支持但关键关系或结果缺失；strong_without_decisive_gap 表示证据较强且无决定性缺口；decisive_closed_facts 表示决定性事实已闭合。',
      criteria: [
        'barely_distinguishable', 'decisive_gap_or_conflict',
        'leading_but_missing_relation_or_outcome', 'strong_without_decisive_gap', 'decisive_closed_facts',
      ],
    },
  },
  threat_recommendation: {
    disposition: {
      type: 'choice',
      instructions: '评价 state 中这一个建议候选的适当语义，依据已定结论、真实目标和已观察行为。证据只支持核验时不升级为封禁或隔离；建议不变成执行，也不补造未观察的目标。',
      criteria: {
        verify: '现有事实只支持进一步核验该目标、行为或结果。',
        block: '直接事实支持提出针对该已观察目标的封禁建议，仍需遵循既有操作边界。',
        isolate: '直接事实支持提出针对该已观察目标的隔离建议，仍需遵循既有操作边界。',
        remediate: '直接事实支持提出针对该实际问题的修复建议。',
        monitor: '现有事实支持持续观察该已知对象或信号，无需升级为其他处置建议。',
        omit: '候选缺少直接事实、真实目标或与当前结论的必要关系，应省略该建议。',
      },
    },
    priority: {
      type: 'choice',
      instructions: '仅为同一个有依据的建议候选选择相对优先级。优先级不能代替证据、结论或执行授权，不因告警数量或模型语气自行升级。',
      criteria: {
        P1: '该建议需要优先核验或处理。',
        P2: '该建议在优先事项之后按常规顺序核验或处理。',
        P3: '该建议可以后续跟踪或观察。',
      },
    },
  },
  frozen_plan_step: {
    supported_by_frozen_input: {
      type: 'noul',
      instructions: '只评价受信 Gate 已允许范围内的这一个步骤候选是否得到冻结输入支持。动作、目标与回滚事实均需已有依据；模型不判断授权或审批，也不把未知步骤补成已允许。',
      criteria: {
        false: '该步骤的动作、目标、条件或回滚主张存在未获冻结输入支持的内容。',
        true: '该步骤的必要事实与限定条件均能由已允许的冻结输入支持。',
      },
    },
  },
  material_answer: {
    claim_supported_by_supplied_material: {
      type: 'noul',
      instructions: '仅核对 state 中这一句事实性主张是否由用户提供或已实际取得的材料支持。保留数值、单位、否定、范围、语言和来源要求；不得用常识补全未取得的知识库流程或把未知状态写成已完成。',
      criteria: {
        false: '该句的事实内容不能由已提供材料支持，或包含与材料冲突及缺失的限定。',
        true: '已提供材料足以支持该句的事实内容及其数值、否定和范围限定。',
      },
    },
  },
})

/** 每次返回独立的问题集合，调用者不能改变其他调用或注册时的固定题义。 */
export function questionsFor(site: DecisionSite): Record<string, DecisionQuestion> {
  const questions = DECISION_QUESTIONS[site]
  if (!questions) throw new Error('未知决策站点：' + site)
  return freeze(structuredClone(questions))
}

export const pending_business_checks = freeze([
  '应急动作与巡检模板必须从实际目录取得；缺少目录不补造正样本或动作清单。',
  '故障原因、完整威胁研判与建议优先级仍需独立业务复核，不能把原 Run 的工具选择或机器结论当真值。',
  'evidence_closure 的五档语义尚未校准到父版 confidence_score；本文件不提供数值映射。',
] as const)
