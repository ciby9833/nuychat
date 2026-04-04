export default {
  qaModule: {
    common: {
      empty: "暂无质检数据",
      emptyQueue: "当前队列暂无 case",
      unknownCustomer: "未知客户",
      unrecognized: "未识别",
      emptyMessage: "（空消息）",
      yes: "是",
      no: "否"
    },
    toolbar: {
      title: "QA 风险分流",
      guideline: "QA 准则",
      refresh: "刷新",
      search: "查询",
      searchPlaceholder: "搜索 case 标题、客户或 case ID",
      agentPlaceholder: "按坐席筛选"
    },
    tabs: {
      risk: "风险池",
      sample: "抽检池",
      autoPass: "自动通过",
      reviewed: "人工已处理",
      diff: "AI差异"
    },
    dashboard: {
      todayQaCount: "今日 QA 数",
      autoPassRate: "自动通过率",
      riskCaseCount: "风险 Case",
      sampleCaseCount: "抽检 Case",
      averageScore: "平均分",
      aiVsHumanDiff: "AI/人工分差",
      agentAverages: "各坐席平均分",
      agent: "坐席",
      score: "分数",
      helper: "页面以结果为主，不要求租户逐条点开也能知道当前服务质量。"
    },
    card: {
      owner: "责任坐席",
      aiScore: "AI 分数",
      confidence: "置信度",
      humanScore: "人工分数",
      scoreDiff: "分差"
    },
    detail: {
      title: "QA 详情",
      customer: "客户",
      owner: "责任坐席",
      status: "状态",
      conversation: "会话",
      messagesTitle: "消息流（仅当前 case）",
      aiEvidence: "AI 关键证据",
      timelineTitle: "Segment 时间线",
      messageCount: "消息数",
      reviewTitle: "AI 评分与人工操作",
      currentQueue: "当前池",
      enterReasons: "进入原因",
      aiScore: "AI 总分",
      aiVerdict: "AI 判定",
      aiConfidence: "AI 置信度",
      riskLevel: "风险等级",
      humanVerdict: "人工结果",
      notReviewed: "未复核",
      reviewAction: "人工动作",
      totalScore: "总分",
      verdict: "结论",
      tags: "标签",
      tagsPlaceholder: "使用逗号分隔标签",
      summary: "复核说明"
    },
    guideline: {
      title: "QA 准则",
      description: "租户直接维护 Markdown 准则，AI 会结合 case 与 segment 上下文自动评审。",
      helper: "建议按 Resolution、Courtesy、Accuracy、Compliance、Timeliness 这类稳定结构书写，减少模型漂移。",
      name: "准则名称",
      nameRequired: "请输入准则名称",
      content: "Markdown 内容",
      contentRequired: "请输入准则内容",
      insertTemplate: "插入推荐模板",
      defaultName: "默认QA准则"
    },
    actions: {
      viewDetail: "查看详情",
      confirm: "通过",
      modify: "修改",
      reject: "驳回",
      submitReview: "提交复核"
    },
    messages: {
      reviewSaved: "QA 复核已保存",
      guidelineSaved: "QA 准则已更新"
    }
  }
};
