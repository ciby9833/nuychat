export default {
  qaModule: {
    filter: {
      title: "质检管理",
      refresh: "刷新",
      rules: "维度配置",
      create: "新建质检",
      agentPlaceholder: "按坐席筛选",
      tagPlaceholder: "按标签筛选（如：态度问题）",
      minScorePlaceholder: "最低分",
      query: "查询"
    },
    stats: {
      total: "质检总数",
      average: "当前页平均分",
      rules: "质检维度"
    },
    table: {
      title: "质检记录列表",
      reviewTime: "质检时间",
      caseId: "事项ID",
      conversationId: "会话ID",
      agent: "坐席",
      reviewer: "质检员",
      score: "得分",
      tags: "标签",
      status: "状态",
      actions: "操作",
      publish: "发布",
      revertDraft: "转草稿",
      emptyTag: "-"
    },
    status: {
      draft: "草稿",
      published: "已发布"
    },
    rulesModal: {
      title: "质检维度配置",
      code: "编码",
      name: "名称",
      weight: "权重",
      enabled: "启用",
      active: "启用",
      inactive: "停用"
    },
    createModal: {
      title: "新建质检记录",
      conversation: "会话",
      conversationRequired: "请选择会话",
      unknownCustomer: "未知客户",
      caseLabel: "事项 {{id}}",
      conversationLabel: "会话 {{id}}",
      reviewedSuffix: "（已质检）",
      score: "总分(0-100)",
      tags: "标签（逗号分隔）",
      tagsPlaceholder: "态度问题, 解决能力, AI 使用不当",
      note: "点评",
      status: "状态",
      publish: "发布",
      draft: "草稿"
    },
    messages: {
      loadFailed: "加载质检数据失败: {{message}}",
      reviewSaved: "质检记录已保存",
      saveFailed: "保存失败: {{message}}",
      rulesUpdated: "质检维度已更新",
      updateFailed: "更新失败: {{message}}",
      statusUpdateFailed: "状态更新失败: {{message}}"
    }
  }
};
