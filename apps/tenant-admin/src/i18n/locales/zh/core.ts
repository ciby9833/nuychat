export default {
  login: {
    brand: "NuyChat 管理后台",
    title: "租户管理登录",
    subtitle: "使用租户管理员账号登录",
    emailLabel: "邮箱",
    emailPlaceholder: "请输入邮箱",
    passwordLabel: "密码",
    passwordPlaceholder: "请输入密码",
    submit: "进入后台"
  },
  nav: {
    brand: "管理后台",
    subbrand: "NuyChat",
    logout: "退出登录",
    groups: {
      core: "基础管理",
      ops: "运营管理",
      sys: "平台配置"
    }
  },
  lang: {
    switchLabel: "语言",
    zh: "中文",
    en: "English",
    id: "Indonesia"
  },
  tabs: {
    overview: "概览",
    cases: "事项",
    "human-conversations": "人工会话",
    tasks: "任务",
    organization: "组织",
    permissions: "权限",
    shifts: "排班",
    agents: "坐席",
    "ai-seats": "AI 座席",
    "ai-conversations": "AI 会话",
    "memory-qa": "Memory QA",
    "dispatch-audit": "调度依据",
    ai: "AI 配置",
    capabilities: "AI 能力",
    kb: "知识库",
    routing: "路由",
    channels: "渠道",
    analytics: "分析",
    sla: "SLA",
    qa: "质检",
    csat: "满意度",
    supervisor: "主管台",
    customers: "客户分组"
  },
  common: {
    refresh: "刷新",
    closeCurrent: "关闭当前",
    closeAll: "关闭全部",
    save: "保存",
    cancel: "取消",
    edit: "编辑",
    delete: "删除",
    create: "创建",
    add: "添加",
    enable: "启用",
    disable: "停用",
    search: "查询",
    confirm: "确认删除",
    status: "状态",
    action: "操作",
    noData: "暂无数据",
    active: "启用",
    inactive: "停用",
    remove: "移除",
    on: "开启",
    off: "关闭",
    total: "总计"
  },
  overview: {
    totalConversations: "总会话数",
    kbEntries: "知识库条目",
    agentCount: "坐席数量",
    statusDistribution: "会话状态分布"
  },
  cases: {
    loadError: "加载事项列表失败",
    searchPlaceholder: "搜索事项ID / 标题 / 客户 / 会话ID",
    statusPlaceholder: "事项状态",
    query: "查询",
    cardTitle: "事项视角",
    col: {
      case: "事项",
      customer: "客户",
      channel: "渠道",
      owner: "负责人",
      status: "状态",
      summary: "摘要",
      lastActivity: "最近活动"
    },
    ownerFinal: "最终",
    ownerCurrent: "当前"
  },
  analytics: {
    title: "日报分析",
    stats: {
      totalEvents: "总事件数",
      casesTouched: "涉及事项数",
      convsStarted: "会话开始",
      msgsReceived: "消息接收",
      msgsSent: "消息发送",
      skillsExecuted: "技能执行",
      convsResolved: "会话结束"
    },
    eventDetail: "事件明细 — {{date}}",
    noEvents: "当日暂无事件数据",
    col: {
      eventType: "事件类型",
      rawType: "原始类型",
      count: "事件数量"
    },
    events: {
      conversation_started: "会话开始",
      message_received: "消息接收",
      message_sent: "消息发送",
      skill_executed: "技能执行",
      conversation_resolved: "会话结束"
    }
  },
  kb: {
    queryModule: "查询模块",
    listModule: "列表模块",
    searchPlaceholder: "搜索文章",
    allCategories: "全部分类",
    addArticle: "新增文章",
    editArticle: "编辑文章",
    tagsSeparated: "标签（逗号分隔）",
    items: "条",
    col: {
      category: "分类",
      title: "标题",
      content: "内容",
      hits: "命中次数",
      status: "状态"
    }
  },
  agents: {},
  routing: {
    rulesTab: "路由规则",
    modulesTab: "模块管理",
    skillGroupsTab: "技能组管理",
    rulesCount: "{{count}} 条规则",
    enabledCount: "{{count}} 条启用",
    modulesCount: "{{count}} 个模块",
    skillGroupsCount: "{{count}} 个技能组",
    addRule: "新增规则",
    addModule: "新增模块",
    addSkillGroup: "新增技能组",
    hint: "规则命中条件后导向部门/团队/技能组，调度中心按在线与负载选人"
  },
  dispatchAudit: {
    hint: "用于查看每个事项为什么被分配到 AI 或人工，以及后续每次责任切换的依据。",
    common: {
      none: "无",
      yes: "是",
      no: "否"
    },
    stats: {
      total: "{{count}} 条执行记录",
      plans: "{{count}} 条路由规划",
      aiRuntime: "{{count}} 条 AI 执行",
      manual: "{{count}} 条人工变更"
    },
    filters: {
      caseId: "按事项 ID 过滤",
      conversationId: "按会话 ID 过滤",
      triggerType: "触发类型"
    },
    columns: {
      time: "时间",
      case: "事项",
      trigger: "触发",
      decisionType: "决策类型",
      rule: "规则",
      reason: "原因",
      summary: "摘要"
    },
    detail: {
      title: "调度执行详情",
      case: "事项",
      conversation: "会话",
      trigger: "触发",
      decisionType: "决策类型",
      rule: "规则",
      conditions: "命中条件",
      inputSnapshot: "输入快照",
      decisionSummary: "决策摘要",
      decisionReason: "决策原因",
      candidates: "候选项",
      transitions: "责任切换"
    },
    candidateColumns: {
      type: "类型",
      candidate: "候选",
      stage: "阶段",
      result: "结果",
      reason: "原因",
      details: "详情"
    },
    candidateResult: {
      accepted: "选中",
      rejected: "淘汰"
    },
    transitionColumns: {
      time: "时间",
      type: "类型",
      from: "从",
      to: "到",
      reason: "原因"
    },
    case: {
      short: "事项 {{id}}",
      full: "事项 {{id}}",
      unlinked: "未关联事项"
    },
    summary: {
      assignedAgent: "人工 {{id}}",
      assignedAi: "AI {{id}}",
      noDirectOwner: "无直接负责人"
    },
    ops: {
      title: "调度运营建议",
      empty: "当前时间范围内暂无明显建议。",
      aiAgents: "按 AI 座席",
      teams: "按团队",
      customerSegments: "按客户等级 / 渠道"
    },
    candidateDetails: {
      score: "评分: {{score}}",
      todayNewCaseCount: "今日新事项: {{count}}",
      activeAssignments: "当前接待中: {{count}}",
      reservedAssignments: "已保留: {{count}}",
      balancedFormula: "balanced_new_case = 4 * 今日新事项 + 2 * 当前接待中 + 1 * 已保留"
    },
    patterns: {
      modeReason: "{{mode}} / {{reason}}",
      ownerWithId: "{{ownerType}} / {{ownerId}}"
    },
    actions: {
      view: "查看",
      assign_ai_owner: "分配给 AI",
      assign_specific_owner: "直接分配给人工",
      enqueue_for_human: "进入人工队列",
      preserve_existing_owner: "保留当前负责人"
    },
    modes: {
      ai_first: "AI 优先",
      human_first: "人工优先",
      ai_only: "仅 AI",
      human_only: "仅人工",
      hybrid: "混合调度"
    },
    selectionModes: {
      rule: "规则命中",
      fallback: "回退方案",
      none: "未参与"
    },
    strategies: {
      least_busy: "最空闲",
      sticky: "会话粘滞",
      balanced_new_case: "新事项均衡",
      load_balanced: "负载均衡",
      prefer_human: "优先人工",
      prefer_ai: "优先 AI"
    },
    triggerTypes: {
      inbound_message: "入站消息",
      ai_routing: "AI 路由",
      ai_routing_execution: "AI 运行调度",
      agent_assign: "人工接管",
      agent_handoff: "人工转队列",
      agent_transfer: "人工转人工",
      supervisor_transfer: "主管转移",
      conversation_resolve: "会话解决",
      ai_handoff: "AI 转人工"
    },
    decisionTypes: {
      routing_plan: "路由规划",
      ai_runtime: "AI 执行",
      manual_transition: "人工变更"
    },
    candidateTypes: {
      agent: "人工坐席",
      team: "团队",
      department: "部门",
      ai_agent: "AI 座席"
    },
    candidateStages: {
      configured_target: "固定目标校验",
      conversation_sticky: "会话粘滞",
      strategy_selection: "策略选择",
      team_scope: "团队筛选",
      eligible: "可接待校验"
    },
    transitionTypes: {
      ai_takeover: "AI 接管",
      ai_unavailable_to_system: "AI 不可用，转系统队列",
      human_takeover: "人工接管",
      supervisor_transfer: "主管转移"
    },
    ownerTypes: {
      system: "系统",
      human: "人工",
      agent: "人工坐席",
      ai: "AI"
    },
    conversationStatuses: {
      open: "进行中",
      queued: "排队中",
      bot_active: "AI 处理中",
      human_active: "人工处理中",
      waiting_customer: "等待客户",
      waiting_internal: "等待内部",
      resolved: "已解决"
    },
    queueStatuses: {
      assigned: "已分配",
      pending: "排队中",
      resolved: "无需排队",
      failed: "失败"
    },
    reasons: {
      conversation_sticky: "沿用该会话上一次负责的 AI",
      conversation_sticky_other: "该会话已粘滞到其他 AI",
      strategy_least_busy: "按最空闲策略选择",
      strategy_sticky: "按粘滞策略选择",
      configured_ai_agent_selected: "按配置指定的 AI",
      configured_ai_agent_unavailable: "配置的 AI 当前不可用",
      not_configured_target: "不是规则中指定的 AI",
      not_selected_by_strategy: "未被当前策略选中",
      policy_selected_human: "当前策略判定应优先人工",
      reserved_human_fallback: "AI 不适合时回退到人工",
      preserve_existing_human_owner: "保留当前人工负责人",
      agent_handoff_human_fallback: "人工转交时回退到人工",
      ai_handoff_human_dispatch: "AI 请求转人工",
      ai_handoff_human_dispatch_fallback_any_group: "目标组无人可接，回退到其他人工组",
      ai_handoff_forced_human: "当前流程强制转人工",
      fallback_human_target: "回退到默认人工目标",
      no_active_ai_agent: "当前没有可用 AI",
      "no-eligible-agent": "当前没有可接待的人工坐席",
      "no-skill-group": "未配置技能组",
      accepted_reserved_assignment: "沿用已保留的人工分配",
      excluded_for_reroute: "该坐席被排除在本次重路由之外",
      team_not_selected: "所属团队未被选中",
      team_has_no_eligible_agent: "该团队当前没有可接待坐席",
      agent_on_break: "坐席处于休息中",
      agent_not_scheduled: "坐席当前未排班",
      outside_shift_window: "当前不在坐席班次时间内",
      agent_concurrency_disabled: "该坐席未开放接待并发",
      agent_concurrency_full: "该坐席已达到并发上限",
      "ai-replied": "AI 已回复并接管会话",
      "conversation-resolved": "会话已解决",
      "supervisor-transfer": "主管执行了转移",
      sla_assignment_accept_timeout: "人工接单超时"
    },
    fields: {
      planId: "计划 ID",
      currentHandlerId: "当前负责人 ID",
      currentHandlerType: "当前负责人类型",
      conversationStatus: "会话状态",
      preserveHumanOwner: "保留原人工负责人",
      channelType: "渠道类型",
      operatingMode: "执行模式",
      issueSummary: "事项摘要",
      aiAgentId: "AI ID",
      aiAgentName: "AI 名称",
      selectionMode: "选中方式",
      mode: "模式",
      action: "动作",
      selectedOwnerType: "最终归属",
      moduleId: "模块 ID",
      skillGroupId: "技能组 ID",
      departmentId: "部门 ID",
      teamId: "团队 ID",
      assignedAgentId: "人工坐席 ID",
      strategy: "策略",
      status: "队列状态",
      activeConversationCount: "活跃会话数",
      lastAssignedAt: "最近分配时间",
      teamName: "团队名称",
      departmentName: "部门名称",
      totalAgents: "团队总人数",
      eligibleAgents: "可接待人数",
      rejectBreakdown: "淘汰原因分布",
      activeAssignments: "当前接待中",
      reservedAssignments: "已保留",
      todayNewCaseCount: "今日新事项数",
      maxConcurrency: "并发上限"
    }
  }
};
