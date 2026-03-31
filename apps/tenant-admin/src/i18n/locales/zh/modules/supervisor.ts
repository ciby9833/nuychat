export default {
  supervisorModule: {
    summary: {
      title: "主管监控工作台",
      refreshing: "刷新中...",
      refresh: "刷新",
      broadcast: "广播通知",
      waitingQueue: "等待队列",
      onlineAgents: "在线坐席",
      aiProcessing: "AI 处理中",
      todayConversations: "今日会话",
      slaBreaches: "SLA 违约(未处理)",
      todayCsat: "今日 CSAT"
    },
    filter: {
      title: "筛选",
      department: "部门",
      team: "团队",
      agent: "坐席",
      scopeAll: "全部会话",
      scopeWaiting: "等待中",
      scopeException: "异常会话",
      scopeActive: "处理中",
      scopeResolved: "已结束",
      apply: "应用筛选"
    },
    conversations: {
      title: "会话监控",
      description: "用于定位等待/异常/已解决会话，具体处理请进入“人工会话”",
      customerConversation: "客户/会话",
      conversationPrefix: "会话 {{id}}",
      casePrefix: "事项 {{id}}",
      channel: "渠道",
      currentResponsible: "当前负责对象",
      reservedResponsible: "预分配对象",
      lastCustomerMessage: "最后客户消息",
      waitingDuration: "等待时长",
      minutes: "{{count}} 分钟",
      firstResponse: "已首响",
      replied: "已回复",
      notReplied: "未回复",
      reassignCount: "重分配次数",
      exceptionReason: "异常原因",
      organization: "组织归属",
      status: "状态",
      actions: "操作",
      viewConversation: "查看会话",
      goHandle: "去处理",
      viewTooltip: "打开人工会话页查看详情与处理动作",
      handleTooltip: "主管工作台用于发现问题，具体介入/转接/关闭请在人工会话页处理",
      empty: "-",
      aiSuffix: " (AI)"
    },
    agents: {
      title: "坐席状态",
      agent: "坐席",
      email: "邮箱",
      status: "状态",
      activeConversations: "处理中会话",
      lastSeen: "最近活跃",
      empty: "-"
    },
    broadcastModal: {
      title: "广播通知",
      placeholder: "输入要发送给全部在线坐席的通知内容"
    },
    messages: {
      loadFailed: "加载主管工作台失败: {{message}}",
      broadcastRequired: "请输入广播内容",
      broadcastSuccess: "广播已发送，覆盖 {{count}} 位在线坐席",
      broadcastFailed: "广播失败: {{message}}"
    }
  }
};
