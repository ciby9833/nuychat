export default {
  qaModule: {
    common: {
      empty: "Belum ada data QA",
      emptyQueue: "Tidak ada case di antrean ini",
      unknownCustomer: "Pelanggan tidak dikenal",
      unrecognized: "Tidak dikenali",
      emptyMessage: "(pesan kosong)",
      yes: "Ya",
      no: "Tidak"
    },
    toolbar: {
      title: "Routing Risiko QA",
      guideline: "Panduan QA",
      refresh: "Refresh",
      search: "Cari",
      searchPlaceholder: "Cari judul case, pelanggan, atau case ID",
      agentPlaceholder: "Filter agen"
    },
    tabs: {
      risk: "Antrian Risiko",
      sample: "Antrian Sampel",
      autoPass: "Lolos Otomatis",
      reviewed: "Sudah Direview",
      diff: "Selisih AI"
    },
    dashboard: {
      todayQaCount: "Jumlah QA Hari Ini",
      autoPassRate: "Rasio Lolos Otomatis",
      riskCaseCount: "Case Risiko",
      sampleCaseCount: "Case Sampel",
      averageScore: "Skor Rata-rata",
      aiVsHumanDiff: "Selisih AI vs Manusia",
      agentAverages: "Rata-rata Skor per Agen",
      agent: "Agen",
      score: "Skor",
      helper: "Halaman ini berfokus pada hasil agar tenant bisa melihat kualitas layanan tanpa membuka semua case."
    },
    card: {
      owner: "Agen Penanggung Jawab",
      aiScore: "Skor AI",
      confidence: "Confidence",
      humanScore: "Skor Manual",
      scoreDiff: "Selisih Skor"
    },
    detail: {
      title: "Detail QA",
      customer: "Pelanggan",
      owner: "Agen Penanggung Jawab",
      status: "Status",
      conversation: "Percakapan",
      messagesTitle: "Alur Pesan (Hanya Case Ini)",
      aiEvidence: "Bukti Utama AI",
      timelineTitle: "Timeline Segment",
      messageCount: "Jumlah Pesan",
      reviewTitle: "Review AI dan Aksi Manual",
      currentQueue: "Antrian Saat Ini",
      enterReasons: "Alasan Masuk",
      aiScore: "Skor AI",
      aiVerdict: "Verdict AI",
      aiConfidence: "Confidence AI",
      riskLevel: "Level Risiko",
      humanVerdict: "Verdict Manual",
      notReviewed: "Belum direview",
      reviewAction: "Aksi Review",
      totalScore: "Total Skor",
      verdict: "Verdict",
      tags: "Tag",
      tagsPlaceholder: "Pisahkan tag dengan koma",
      summary: "Ringkasan Review"
    },
    guideline: {
      title: "Panduan QA",
      description: "Tenant mengelola panduan Markdown secara langsung. AI membaca panduan tersebut bersama konteks case dan segment untuk menilai otomatis.",
      helper: "Gunakan struktur stabil seperti Resolution, Courtesy, Accuracy, Compliance, dan Timeliness agar output model lebih konsisten.",
      name: "Nama Panduan",
      nameRequired: "Masukkan nama panduan",
      content: "Konten Markdown",
      contentRequired: "Masukkan isi panduan",
      insertTemplate: "Masukkan Template Rekomendasi",
      defaultName: "Panduan QA Default"
    },
    actions: {
      viewDetail: "Lihat Detail",
      confirm: "Setujui",
      modify: "Ubah",
      reject: "Tolak",
      submitReview: "Kirim Review"
    },
    messages: {
      reviewSaved: "Review QA berhasil disimpan",
      guidelineSaved: "Panduan QA berhasil diperbarui"
    }
  }
};
