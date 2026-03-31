export default {
  aiConversations: {
    filter: {
      allAiAgents: "Semua agen AI",
      refresh: "Segarkan",
      total: "Percakapan {{count}}",
      handoff: "Menunggu alih {{count}}",
      transferred: "Sudah dialihkan {{count}}"
    },
    status: {
      all: "Semua status",
      bot_active: "AI sedang aktif",
      handoff_required: "Menunggu alih ke manusia",
      transferred: "Sudah dialihkan ke manusia"
    },
    datePreset: {
      today: "Hari ini",
      yesterday: "Kemarin",
      last7d: "7 hari terakhir",
      custom: "Kustom"
    },
    list: {
      title: "Daftar Percakapan",
      count: "{{count}} item",
      empty: "Belum ada percakapan AI",
      anonymousCustomer: "Pelanggan Anonim",
      noMessage: "Belum ada pesan",
      highRisk: "Risiko Tinggi",
      attention: "Perlu Perhatian"
    },
    timeline: {
      emptyTitle: "Pilih percakapan di kiri untuk melihat detail",
      anonymousCustomer: "Pelanggan Anonim",
      unknownLanguage: "Tidak diketahui",
      humanHandling: "Sedang ditangani manusia",
      aiHandling: "Sedang ditangani AI",
      pendingHandoff: "Menunggu alih ke manusia",
      highRisk: "Risiko Tinggi",
      attention: "Perlu Perhatian",
      handoffReason: "Alasan alih ke manusia: {{reason}}",
      riskReason: "Risiko: {{reason}}",
      loading: "Memuat...",
      noMessages: "Belum ada riwayat pesan",
      aiName: "AI",
      humanName: "Manusia",
      reply: "Balasan"
    },
    monitor: {
      emptyTitle: "Pilih percakapan untuk melihat info monitor",
      sectionInfo: "Info Percakapan",
      aiAgent: "Agen AI",
      customerTier: "Tier Pelanggan",
      currentHandler: "Penangan Saat Ini",
      currentHandlerHuman: "Manusia",
      currentHandlerAi: "AI",
      conversationStatus: "Status Percakapan",
      assignedAgent: "Agen Manusia",
      lastAiReply: "Balasan AI Terakhir",
      none: "Belum ada",
      standard: "standard",
      sectionIntervene: "Intervensi Manusia",
      intervenePlaceholder: "Ketik pesan untuk dikirim langsung ke pelanggan...",
      sendHumanMessage: "Kirim Pesan Manusia",
      sectionActions: "Alihkan & Aksi",
      selectOnlineAgent: "Pilih agen online",
      transferToAgent: "Alihkan ke Agen Manusia",
      forceClose: "Paksa Tutup Percakapan",
      sectionTrace: "AI Trace ({{count}})",
      noTrace: "Belum ada catatan AI Trace",
      skills: "Skill: {{value}}",
      noSkills: "Tidak ada",
      handoff: "Alih ke manusia: {{reason}}",
      error: "Error: {{error}}"
    },
    helper: {
      justNow: "Baru saja",
      minutesAgo: "{{count}} menit lalu",
      hoursAgo: "{{count}} jam lalu",
      today: "Hari ini",
      yesterday: "Kemarin"
    },
    errors: {
      loadListFailed: "Gagal memuat percakapan AI: {{message}}",
      loadDetailFailed: "Gagal memuat detail percakapan: {{message}}",
      interveneEmpty: "Masukkan isi pesan untuk pelanggan",
      interveneSuccess: "Pesan intervensi manusia berhasil diantrikan",
      interveneFailed: "Intervensi gagal: {{message}}",
      transferEmpty: "Pilih agen manusia tujuan",
      transferSuccess: "Percakapan berhasil dialihkan ke agen manusia",
      transferFailed: "Alih ke manusia gagal: {{message}}",
      forceCloseSuccess: "Percakapan berhasil dipaksa tutup",
      forceCloseFailed: "Gagal menutup: {{message}}"
    }
  }
};
