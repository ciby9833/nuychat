export default {
  aiConversations: {
    filter: {
      allAiAgents: "全部 AI 座席",
      refresh: "刷新",
      total: "会话 {{count}}",
      handoff: "待转 {{count}}",
      transferred: "已转 {{count}}"
    },
    status: {
      all: "全部状态",
      bot_active: "AI 对话中",
      handoff_required: "待转人工",
      transferred: "已转人工"
    },
    datePreset: {
      today: "今天",
      yesterday: "昨天",
      last7d: "最近 7 天",
      custom: "自定义"
    },
    list: {
      title: "会话列表",
      count: "{{count}} 条",
      empty: "暂无 AI 会话",
      anonymousCustomer: "匿名客户",
      noMessage: "暂无消息",
      highRisk: "高风险",
      attention: "需关注"
    },
    timeline: {
      emptyTitle: "选择左侧会话查看对话详情",
      anonymousCustomer: "匿名客户",
      unknownLanguage: "未知",
      humanHandling: "人工处理中",
      aiHandling: "AI 处理中",
      pendingHandoff: "待转人工",
      highRisk: "高风险",
      attention: "需关注",
      handoffReason: "转人工原因: {{reason}}",
      riskReason: "风险: {{reason}}",
      loading: "加载中…",
      noMessages: "暂无消息记录",
      aiName: "AI",
      humanName: "人工",
      reply: "回复"
    },
    monitor: {
      emptyTitle: "选择会话查看监控信息",
      sectionInfo: "会话信息",
      aiAgent: "AI 座席",
      customerTier: "客户等级",
      currentHandler: "当前处理",
      currentHandlerHuman: "人工",
      currentHandlerAi: "AI",
      conversationStatus: "会话状态",
      assignedAgent: "人工坐席",
      lastAiReply: "最近 AI 回复",
      none: "暂无",
      standard: "standard",
      sectionIntervene: "人工介入",
      intervenePlaceholder: "输入消息直接发送给客户…",
      sendHumanMessage: "发送人工消息",
      sectionActions: "转交与操作",
      selectOnlineAgent: "选择在线坐席",
      transferToAgent: "转给人工坐席",
      forceClose: "强制关闭会话",
      sectionTrace: "AI Trace ({{count}})",
      noTrace: "暂无 AI Trace 记录",
      skills: "技能: {{value}}",
      noSkills: "无",
      handoff: "转人工: {{reason}}",
      error: "错误: {{error}}"
    },
    helper: {
      justNow: "刚刚",
      minutesAgo: "{{count}}分钟前",
      hoursAgo: "{{count}}小时前",
      today: "今天",
      yesterday: "昨天"
    },
    errors: {
      loadListFailed: "加载 AI 会话失败: {{message}}",
      loadDetailFailed: "加载会话详情失败: {{message}}",
      interveneEmpty: "请输入要发送给客户的内容",
      interveneSuccess: "人工介入消息已入队",
      interveneFailed: "介入失败: {{message}}",
      transferEmpty: "请选择目标人工坐席",
      transferSuccess: "会话已转给人工坐席",
      transferFailed: "转人工失败: {{message}}",
      forceCloseSuccess: "会话已强制关闭",
      forceCloseFailed: "关闭失败: {{message}}"
    }
  }
};
