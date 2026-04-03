export default {
  routing: {
    table: {
      module: "模块",
      operatingMode: "运行模式",
      status: "状态",
      skillGroup: "技能组",
      moduleName: "所属模块",
      priority: "优先级",
      rule: "规则",
      conditions: "命中条件",
      target: "目标归属",
      skillAndStrategy: "技能组 / 策略"
    },
    description: "平台现在会按渠道实例、部门/团队范围、在线人工、AI 座席、排班和实时负载做默认智能分配。这里仅保留少量例外规则。",
    form: {
      editRule: "编辑调度规则",
      createRule: "新增调度规则",
      editModule: "编辑模块",
      createModule: "新增模块",
      editSkillGroup: "编辑技能组",
      createSkillGroup: "新增技能组",
      create: "创建",
      ruleNamePlaceholder: "WhatsApp 售后 VIP",
      ruleName: "规则名称",
      ruleNameRequired: "请输入规则名称",
      priorityRequired: "请输入优先级",
      enabled: "启用",
      matchConditions: "命中条件",
      channel: "渠道",
      anyChannel: "任意渠道",
      channelInstance: "号码/渠道实例",
      anyChannelInstance: "任意号码/实例",
      language: "语言",
      anyLanguage: "任意语言",
      customerTier: "客户等级",
      anyTier: "任意等级",
      defaultDispatch: "默认调度策略",
      defaultDispatchHint: "智能分配会结合在线人工、AI、排班和负载自动选择最合适的处理方。偏人工和偏AI只影响默认倾向。",
      serviceTarget: "服务目标",
      humanStrategy: "人工分配策略",
      aiStrategy: "AI 分配策略",
      routingAction: "调度动作",
      executionMode: "执行模式",
      executionHint: "执行模式决定当前规则是先走 AI、先走人工，还是只允许其中一种处理方式。",
      humanTarget: "人工目标",
      targetDepartment: "目标部门",
      anyDepartment: "不限部门",
      targetTeam: "目标团队",
      anyTeamInDepartment: "部门内任意团队",
      targetSkillGroup: "目标技能组",
      targetSkillGroupRequired: "请选择技能组",
      assignmentStrategy: "分配策略",
      aiAgent: "AI 座席",
      autoSelectAi: "留空按 AI 策略自动选",
      aiAssignmentStrategy: "AI 分配策略",
      capacityAndOverrides: "容量与覆盖策略",
      humanToAiThreshold: "人工→AI 阈值(%)",
      noOverflow: "不溢出",
      aiToHumanThreshold: "AI→人工 阈值(%)",
      aiSoftConcurrencyLimit: "AI 软并发上限",
      loadEstimate: "负载估算",
      hybridStrategy: "混合策略",
      customerRequestsHuman: "客户要求人工",
      aiUnhandled: "AI 无法处理",
      humanKeywords: "人工关键词（每行一个）",
      humanKeywordsPlaceholder: "人工\n转人工\n客服",
      fallbackTarget: "回退目标",
      fallbackDepartment: "回退部门",
      fallbackReuseHumanTarget: "沿用人工目标",
      fallbackTeam: "回退团队",
      fallbackSkillGroup: "回退技能组",
      fallbackStrategy: "回退策略",
      aiHint: "固定 AI 座席优先；留空时按 AI 分配策略在启用 AI 座席中选择。",
      moduleCode: "模块编码",
      moduleCodeRequired: "请输入模块编码",
      moduleName: "模块名称",
      moduleNameRequired: "请输入模块名称",
      description: "描述",
      skillGroupModule: "所属模块",
      skillGroupModuleRequired: "请选择模块",
      skillGroupCode: "技能组编码",
      skillGroupCodeRequired: "请输入技能组编码",
      skillGroupName: "技能组名称",
      skillGroupNameRequired: "请输入技能组名称"
    },
    confirm: {
      deleteRuleTitle: "删除这个规则？",
      deleteRuleDescription: "删除后该路由规则将立即停止生效。",
      deleteModuleTitle: "删除这个模块？",
      deleteModuleDescription: "删除前需先清空该模块下的技能组。",
      deleteSkillGroupTitle: "删除这个技能组？",
      deleteSkillGroupDescription: "若技能组仍被坐席或路由规则引用，将无法删除。"
    },
    state: {
      active: "启用",
      inactive: "停用",
      createModuleFirst: "先创建模块，再维护技能组。"
    },
    summary: {
      priority: "优先级 {{count}}",
      auto: "自动",
      any: "任意",
      anyDepartment: "任意部门",
      autoTeam: "自动选团队",
      reuseHumanTarget: "沿用人工目标",
      strategyLine: "人工: {{humanStrategy}} | AI: {{aiStrategy}}"
    },
    messages: {
      ruleUpdated: "调度规则已更新",
      ruleCreated: "调度规则已创建",
      ruleDeleted: "调度规则已删除",
      ruleMissing: "当前规则不存在或已不属于，列表已刷新，请重新选择后再试。",
      moduleUpdated: "模块已更新",
      moduleCreated: "模块已创建",
      moduleDeleted: "模块已删除",
      skillGroupUpdated: "技能组已更新",
      skillGroupCreated: "技能组已创建",
      skillGroupDeleted: "技能组已删除"
    },
    options: {
      strategy: {
        least_busy: "最小负载",
        balanced_new_case: "均衡新事项",
        round_robin: "轮询",
        sticky: "粘性分配"
      },
      language: {
        zh: "中文",
        en: "English",
        id: "Bahasa Indonesia"
      },
      moduleMode: {
        ai_first: "AI 优先",
        human_first: "人工优先",
        ai_autonomous: "AI 自主",
        workflow_first: "工作流优先"
      },
      executionMode: {
        ai_first: "AI 优先",
        human_first: "人工优先",
        ai_only: "仅 AI",
        human_only: "仅人工",
        hybrid: "混合",
        hybrid_smart: "智能分配",
        human_preferred: "偏人工",
        ai_preferred: "偏AI"
      },
      hybridStrategy: {
        load_balanced: "按负载均衡",
        prefer_human: "优先人工",
        prefer_ai: "优先 AI"
      },
      override: {
        force_human: "强制人工",
        allow_policy: "仍按策略"
      },
      aiUnhandled: {
        force_human: "强制人工",
        queue_human: "进入人工队列",
        allow_policy: "仍按策略"
      }
    }
  }
};
