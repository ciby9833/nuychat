export default {
  customersModule: {
    filter: {
      title: "客户查询",
      refresh: "刷新",
      createSegment: "新建分组",
      searchPlaceholder: "搜索客户名/客户标识",
      tagPlaceholder: "按标签筛选",
      segmentPlaceholder: "按分组筛选",
      query: "查询"
    },
    table: {
      title: "客户列表",
      customer: "客户",
      channel: "渠道",
      tier: "等级",
      conversations: "会话数",
      cases: "事项数",
      openCases: "进行中事项",
      tasks: "任务数",
      lastContact: "最近联系",
      lastCase: "最近事项",
      caseWithId: "事项 {{id}}",
      tags: "标签",
      actions: "操作",
      manageTags: "标签管理"
    },
    segments: {
      title: "分组规则",
      name: "名称",
      code: "编码",
      rule: "规则",
      status: "状态",
      actions: "操作",
      active: "ACTIVE",
      inactive: "DISABLED",
      run: "执行分组",
      disable: "停用",
      enable: "启用"
    },
    tags: {
      title: "标签库",
      disable: "停用",
      enable: "启用",
      codeRequired: "编码必填",
      nameRequired: "名称必填",
      namePlaceholder: "标签名",
      descriptionPlaceholder: "描述",
      add: "添加标签"
    },
    segmentModal: {
      title: "新建客户分组",
      code: "编码",
      name: "名称",
      namePlaceholder: "VIP 客户",
      description: "描述",
      tagsAny: "命中任一标签（code，逗号分隔）",
      minConversationCount: "最少会话数",
      minTaskCount: "最少任务数",
      minCaseCount: "最少事项数",
      minOpenCaseCount: "最少进行中事项数",
      daysSinceLastConversationGte: "距上次联系天数 >=",
      daysSinceLastCaseActivityGte: "距上次事项活动天数 >="
    },
    tagsModal: {
      title: "客户标签管理 · {{name}}"
    },
    messages: {
      loadTagDataFailed: "加载客户标签数据失败: {{message}}",
      loadCustomersFailed: "加载客户列表失败: {{message}}",
      tagsUpdated: "客户标签已更新",
      saveFailed: "保存失败: {{message}}",
      tagCreated: "标签已创建",
      segmentCreated: "分组已创建",
      matchedCustomers: "命中 {{count}} 个客户"
    }
  }
};
