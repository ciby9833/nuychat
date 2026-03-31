export default {
  memoryQa: {
    stats: {
      recentTrace: "Trace 7 hari terakhir",
      datasets: "Dataset evaluasi",
      reports: "Laporan evaluasi",
      avgPrecision: "Rata-rata precision"
    },
    tabs: {
      traces: "Encoder Traces",
      evaluation: "Evaluation"
    },
    filters: {
      conversationId: "Filter berdasarkan conversationId",
      customerId: "Filter berdasarkan customerId",
      sourceKind: "Jenis sumber",
      status: "Status"
    },
    sourceKinds: {
      conversation: "Percakapan",
      task: "Tugas"
    },
    statuses: {
      completed: "Selesai",
      skipped: "Dilewati"
    },
    actions: {
      refresh: "Refresh",
      detail: "Detail",
      createDataset: "Dataset baru",
      runEvaluation: "Jalankan evaluasi"
    },
    traces: {
      time: "Waktu",
      source: "Sumber",
      status: "Status",
      conversation: "Percakapan",
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
      title: "Dataset evaluasi",
      name: "Nama",
      sampleCount: "Jumlah sampel",
      updatedAt: "Waktu diperbarui",
      modalTitle: "Dataset evaluasi baru",
      description: "Deskripsi",
      payload: "JSON dataset",
      payloadHint: "Tempel array JSON hasil ekspor `memory:eval:export`, lalu lengkapi gold memories.",
      nameRequired: "Masukkan nama",
      payloadRequired: "Masukkan JSON dataset",
      namePlaceholder: "Contoh: March Memory QA Batch",
      invalidJson: "Format JSON dataset tidak valid",
      invalidRows: "Dataset harus berupa array JSON yang tidak kosong",
      created: "Dataset evaluasi berhasil dibuat"
    },
    reports: {
      title: "Laporan evaluasi",
      dataset: "Dataset",
      precision: "Precision",
      duplicateRate: "Duplicate Rate",
      staleRate: "Stale Rate",
      createdAt: "Waktu dibuat",
      reportTitle: "Memory Eval Report",
      report: "Report",
      samples: "Samples",
      created: "Created",
      reportJson: "Report JSON",
      runCompleted: "Evaluasi selesai"
    },
    common: {
      action: "Aksi",
      emptyValue: "-"
    }
  }
};
