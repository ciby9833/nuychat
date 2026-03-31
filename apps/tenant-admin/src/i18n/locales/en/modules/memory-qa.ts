export default {
  memoryQa: {
    stats: {
      recentTrace: "Recent 7-day traces",
      datasets: "Evaluation datasets",
      reports: "Evaluation reports",
      avgPrecision: "Average precision"
    },
    tabs: {
      traces: "Encoder Traces",
      evaluation: "Evaluation"
    },
    filters: {
      conversationId: "Filter by conversationId",
      customerId: "Filter by customerId",
      sourceKind: "Source kind",
      status: "Status"
    },
    sourceKinds: {
      conversation: "Conversation",
      task: "Task"
    },
    statuses: {
      completed: "Completed",
      skipped: "Skipped"
    },
    actions: {
      refresh: "Refresh",
      detail: "Details",
      createDataset: "New dataset",
      runEvaluation: "Run evaluation"
    },
    traces: {
      time: "Time",
      source: "Source",
      status: "Status",
      conversation: "Conversation",
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
      title: "Evaluation Datasets",
      name: "Name",
      sampleCount: "Sample Count",
      updatedAt: "Updated At",
      modalTitle: "New Evaluation Dataset",
      description: "Description",
      payload: "Dataset JSON",
      payloadHint: "Paste the JSON array exported by `memory:eval:export` and complete the gold memories.",
      nameRequired: "Please enter a name",
      payloadRequired: "Please enter the JSON dataset",
      namePlaceholder: "For example: March Memory QA Batch",
      invalidJson: "Dataset JSON format is invalid",
      invalidRows: "Dataset must be a non-empty JSON array",
      created: "Evaluation dataset created"
    },
    reports: {
      title: "Evaluation Reports",
      dataset: "Dataset",
      precision: "Precision",
      duplicateRate: "Duplicate Rate",
      staleRate: "Stale Rate",
      createdAt: "Created At",
      reportTitle: "Memory Eval Report",
      report: "Report",
      samples: "Samples",
      created: "Created",
      reportJson: "Report JSON",
      runCompleted: "Evaluation completed"
    },
    common: {
      action: "Action",
      emptyValue: "-"
    }
  }
};
