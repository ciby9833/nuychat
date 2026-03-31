export default {
  qaModule: {
    filter: {
      title: "Manajemen QA",
      refresh: "Refresh",
      rules: "Pengaturan dimensi",
      create: "Review QA baru",
      agentPlaceholder: "Filter berdasarkan agen",
      tagPlaceholder: "Filter berdasarkan tag (misalnya: masalah sikap)",
      minScorePlaceholder: "Skor minimum",
      query: "Cari"
    },
    stats: {
      total: "Total review",
      average: "Rata-rata skor di halaman",
      rules: "Dimensi QA"
    },
    table: {
      title: "Daftar review QA",
      reviewTime: "Waktu review",
      caseId: "ID kasus",
      conversationId: "ID percakapan",
      agent: "Agen",
      reviewer: "Reviewer",
      score: "Skor",
      tags: "Tag",
      status: "Status",
      actions: "Aksi",
      publish: "Publikasikan",
      revertDraft: "Kembali ke draft",
      emptyTag: "-"
    },
    status: {
      draft: "DRAFT",
      published: "DIPUBLIKASIKAN"
    },
    rulesModal: {
      title: "Pengaturan dimensi QA",
      code: "Kode",
      name: "Nama",
      weight: "Bobot",
      enabled: "Aktif",
      active: "Aktif",
      inactive: "Nonaktif"
    },
    createModal: {
      title: "Review QA baru",
      conversation: "Percakapan",
      conversationRequired: "Pilih percakapan",
      unknownCustomer: "Pelanggan tidak dikenal",
      caseLabel: "Kasus {{id}}",
      conversationLabel: "Percakapan {{id}}",
      reviewedSuffix: "(Sudah direview)",
      score: "Total skor (0-100)",
      tags: "Tag (pisahkan dengan koma)",
      tagsPlaceholder: "Masalah sikap, kemampuan menyelesaikan, penggunaan AI yang tidak tepat",
      note: "Catatan",
      status: "Status",
      publish: "Publikasikan",
      draft: "Draft"
    },
    messages: {
      loadFailed: "Gagal memuat data QA: {{message}}",
      reviewSaved: "Review QA disimpan",
      saveFailed: "Gagal menyimpan: {{message}}",
      rulesUpdated: "Dimensi QA diperbarui",
      updateFailed: "Gagal memperbarui: {{message}}",
      statusUpdateFailed: "Gagal memperbarui status: {{message}}"
    }
  }
};
