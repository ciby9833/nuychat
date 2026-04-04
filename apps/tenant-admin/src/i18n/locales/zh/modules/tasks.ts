export default {
  tasksModule: {
    page: {
      listTitle: "任务列表",
      detailTitle: "任务详情"
    },
    filter: {
      ownerPlaceholder: "负责人",
      allOwners: "全部负责人",
      searchPlaceholder: "搜索任务/事项/客户",
      createdFrom: "创建开始",
      createdTo: "创建结束",
      dueFrom: "截止开始",
      dueTo: "截止结束"
    },
    table: {
      task: "任务",
      owner: "负责人",
      conversation: "关联会话",
      conversationPrefix: "会话 {{id}}",
      openConversation: "打开会话",
      status: "状态",
      dueAt: "截止时间",
      empty: "-"
    },
    detail: {
      empty: "选择左侧任务查看详情",
      casePrefix: "事项 {{value}}",
      customerPrefix: "客户 {{value}}",
      conversationPrefix: "会话 {{value}}",
      openConversation: "查看关联会话",
      owner: "负责人",
      unassigned: "未分配",
      status: "状态",
      dueAt: "截止时间",
      description: "描述",
      sourceMessage: "关联消息",
      comments: "回复 / 处理记录",
      noComments: "暂无记录",
      commentPlaceholder: "添加处理回复/备注",
      replyTask: "回复任务",
      finishTask: "结束任务",
      emptyValue: "-"
    },
    status: {
      all: "全部状态",
      open: "待处理",
      inProgress: "进行中",
      done: "已完成",
      cancelled: "已取消"
    }
  }
};
