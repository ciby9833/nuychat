export default {
  supervisorModule: {
    summary: {
      title: "Dashboard Supervisor",
      refreshing: "Sedang memuat ulang...",
      refresh: "Muat Ulang",
      broadcast: "Siaran",
      waitingQueue: "Antrian Menunggu",
      onlineAgents: "Agen Online",
      aiProcessing: "Sedang Diproses AI",
      todayConversations: "Percakapan Hari Ini",
      slaBreaches: "Pelanggaran SLA (Belum Diproses)",
      todayCsat: "CSAT Hari Ini"
    },
    filter: {
      title: "Filter",
      department: "Departemen",
      team: "Tim",
      agent: "Agen",
      scopeAll: "Semua Percakapan",
      scopeWaiting: "Menunggu",
      scopeException: "Percakapan Bermasalah",
      scopeActive: "Sedang Diproses",
      scopeResolved: "Selesai",
      apply: "Terapkan Filter"
    },
    conversations: {
      title: "Pemantauan Percakapan",
      description: "Gunakan tampilan ini untuk menemukan percakapan menunggu, bermasalah, dan selesai. Untuk penanganan, masuk ke Percakapan Manual.",
      customerConversation: "Pelanggan / Percakapan",
      conversationPrefix: "Percakapan {{id}}",
      casePrefix: "Kasus {{id}}",
      channel: "Kanal",
      currentResponsible: "Penanggung Jawab Saat Ini",
      reservedResponsible: "Penanggung Jawab Cadangan",
      queueState: "Status Permintaan / Antrean",
      lastCustomerMessage: "Pesan Pelanggan Terakhir",
      waitingDuration: "Durasi Menunggu",
      minutes: "{{count}} menit",
      queueAhead: "{{count}} pelanggan di depan",
      etaMinutes: "Estimasi {{count}} menit",
      firstResponse: "Respons Pertama",
      replied: "Sudah Dijawab",
      notReplied: "Belum Dijawab",
      reassignCount: "Jumlah Reassign",
      exceptionReason: "Alasan Pengecualian",
      organization: "Organisasi",
      status: "Status",
      actions: "Aksi",
      viewConversation: "Lihat Percakapan",
      goHandle: "Tangani",
      viewTooltip: "Buka Percakapan Manual untuk melihat detail dan aksi.",
      handleTooltip: "Dashboard supervisor digunakan untuk menemukan masalah. Intervensi, transfer, dan penutupan dilakukan di Percakapan Manual.",
      empty: "-",
      aiSuffix: " (AI)",
      humanRequested: "Minta Manusia",
      assignedWaiting: "Sudah Dialokasikan",
      pendingUnavailable: "Tidak ada manusia yang siap melayani",
      aiFallbackAllowed: "AI boleh mengambil alih"
    },
    agents: {
      title: "Status Agen",
      agent: "Agen",
      email: "Email",
      status: "Status",
      activeConversations: "Percakapan Aktif",
      lastSeen: "Terakhir Aktif",
      empty: "-"
    },
    broadcastModal: {
      title: "Siaran",
      placeholder: "Masukkan pesan yang akan dikirim ke semua agen online"
    },
    messages: {
      loadFailed: "Gagal memuat dashboard supervisor: {{message}}",
      broadcastRequired: "Masukkan isi siaran",
      broadcastSuccess: "Siaran berhasil dikirim ke {{count}} agen online",
      broadcastFailed: "Siaran gagal: {{message}}"
    }
  }
};
