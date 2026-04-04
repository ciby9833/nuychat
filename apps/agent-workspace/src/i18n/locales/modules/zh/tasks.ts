export default {
  tasksWorkspace: {
    pageTitle: "任务工作台",
    listTitle: "我的任务",
    listSubtitle: "按状态查看任务并进入处理详情。",
    loading: "正在加载任务...",
    empty: "当前没有待处理任务",
    status: {
      open: "待开始",
      in_progress: "处理中",
      done: "已完成",
      cancelled: "已取消"
    },
    priority: {
      urgent: "紧急",
      high: "高优",
      normal: "普通",
      low: "低优"
    },
    replyStatus: {
      pending: "待回复客户",
      sent: "已回复客户",
      waived: "无需回复"
    },
    filters: {
      recent3Days: "近 3 天",
      recent7Days: "近 7 天",
      recent30Days: "近 30 天",
      allTime: "全部时间",
      taskPlaceholder: "搜索任务事项",
      customerPlaceholder: "搜索客户"
    },
    detail: {
      empty: "请选择左侧任务查看详情和处理动作",
      unknownCustomer: "未知客户",
      previewConversation: "预览会话上下文",
      assignee: "负责人 {{name}}",
      dueAt: "截止 {{time}}",
      taskDescription: "任务说明",
      sourceMessage: "来源消息",
      actions: "处理动作",
      start: "开始处理",
      resetToOpen: "退回待开始",
      done: "直接完结",
      doneWithReply: "回复并完结",
      confirmAction: "确认",
      confirmStart: "确认将任务状态更新为处理中",
      confirmReset: "确认将任务退回待开始",
      confirmDoneOnly: "确认将任务直接完结",
      confirmDoneWithReply: "确认按当前回复设置完结任务",
      sendResultToCustomer: "处理完成后发送结果给客户",
      customerReplyPlaceholder: "输入要发送给客户的处理结果",
      cancel: "取消",
      confirmDone: "确认完结",
      collaboration: "处理协作记录",
      collaborationEmpty: "还没有处理协作记录",
      addRecord: "新增处理记录",
      addRecordPlaceholder: "输入当前处理进展、协作说明或结论",
      addRecordAction: "记录处理",
      loading: "正在加载任务详情..."
    },
    preview: {
      titleFallback: "会话上下文预览",
      loading: "正在加载会话上下文...",
      empty: "暂无可预览的会话内容",
      currentOwner: "当前 {{name}}",
      unknownSender: "unknown",
      openAttachment: "打开",
      attachmentFallback: "附件"
    }
  }
};
