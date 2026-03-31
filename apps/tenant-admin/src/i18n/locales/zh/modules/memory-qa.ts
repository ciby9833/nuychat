export default {
  memoryQa: {
    stats: {
      recentTrace: "近 7 天 Trace",
      datasets: "评测数据集",
      reports: "评测报告",
      avgPrecision: "平均 Precision"
    },
    tabs: {
      traces: "Encoder Traces",
      evaluation: "Evaluation"
    },
    filters: {
      conversationId: "按 conversationId 过滤",
      customerId: "按 customerId 过滤",
      sourceKind: "来源类型",
      status: "状态"
    },
    sourceKinds: {
      conversation: "会话",
      task: "任务"
    },
    statuses: {
      completed: "已完成",
      skipped: "已跳过"
    },
    actions: {
      refresh: "刷新",
      detail: "详情",
      createDataset: "新建数据集",
      runEvaluation: "运行评测"
    },
    traces: {
      time: "时间",
      source: "来源",
      status: "状态",
      conversation: "会话",
      final: "Final",
      candidate: "Candidate",
      traceTitle: "Memory Encoder Trace",
      traceId: "Trace ID",
      metrics: "Metrics",
      inputContext: "Input Context",
      eventFrame: "Event Frame",
      candidateItems: "Candidate Items",
      reviewedItems: "Reviewed Items",
      finalItems: "Final Items"
    },
    datasets: {
      title: "评测数据集",
      name: "名称",
      sampleCount: "样本数",
      updatedAt: "更新时间",
      modalTitle: "新建评测数据集",
      description: "说明",
      payload: "数据集 JSON",
      payloadHint: "粘贴 `memory:eval:export` 导出的 JSON 数组，并补完 gold memories。",
      nameRequired: "请输入名称",
      payloadRequired: "请输入 JSON 数据集",
      namePlaceholder: "例如：March Memory QA Batch",
      invalidJson: "数据集 JSON 格式不正确",
      invalidRows: "数据集必须是非空 JSON 数组",
      created: "评测数据集已创建"
    },
    reports: {
      title: "评测报告",
      dataset: "数据集",
      precision: "Precision",
      duplicateRate: "Duplicate Rate",
      staleRate: "Stale Rate",
      createdAt: "创建时间",
      reportTitle: "Memory Eval Report",
      report: "Report",
      samples: "Samples",
      created: "Created",
      reportJson: "Report JSON",
      runCompleted: "评测已完成"
    },
    common: {
      action: "操作",
      emptyValue: "-"
    }
  }
};
