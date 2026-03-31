export default {
  customersModule: {
    filter: {
      title: "Pencarian pelanggan",
      refresh: "Refresh",
      createSegment: "Segmen baru",
      searchPlaceholder: "Cari nama pelanggan / referensi pelanggan",
      tagPlaceholder: "Filter berdasarkan tag",
      segmentPlaceholder: "Filter berdasarkan segmen",
      query: "Cari"
    },
    table: {
      title: "Daftar pelanggan",
      customer: "Pelanggan",
      channel: "Saluran",
      tier: "Tier",
      conversations: "Jumlah percakapan",
      cases: "Jumlah kasus",
      openCases: "Kasus terbuka",
      tasks: "Jumlah tugas",
      lastContact: "Kontak terakhir",
      lastCase: "Kasus terbaru",
      caseWithId: "Kasus {{id}}",
      tags: "Tag",
      actions: "Aksi",
      manageTags: "Kelola tag"
    },
    segments: {
      title: "Aturan segmen",
      name: "Nama",
      code: "Kode",
      rule: "Aturan",
      status: "Status",
      actions: "Aksi",
      active: "ACTIVE",
      inactive: "DISABLED",
      run: "Jalankan segmen",
      disable: "Nonaktifkan",
      enable: "Aktifkan"
    },
    tags: {
      title: "Pustaka tag",
      disable: "Nonaktifkan",
      enable: "Aktifkan",
      codeRequired: "Kode wajib diisi",
      nameRequired: "Nama wajib diisi",
      namePlaceholder: "Nama tag",
      descriptionPlaceholder: "Deskripsi",
      add: "Tambah tag"
    },
    segmentModal: {
      title: "Segmen pelanggan baru",
      code: "Kode",
      name: "Nama",
      namePlaceholder: "Pelanggan VIP",
      description: "Deskripsi",
      tagsAny: "Cocok dengan salah satu tag (kode, pisahkan koma)",
      minConversationCount: "Minimum percakapan",
      minTaskCount: "Minimum tugas",
      minCaseCount: "Minimum kasus",
      minOpenCaseCount: "Minimum kasus terbuka",
      daysSinceLastConversationGte: "Hari sejak kontak terakhir >=",
      daysSinceLastCaseActivityGte: "Hari sejak aktivitas kasus terakhir >="
    },
    tagsModal: {
      title: "Tag pelanggan · {{name}}"
    },
    messages: {
      loadTagDataFailed: "Gagal memuat data tag pelanggan: {{message}}",
      loadCustomersFailed: "Gagal memuat daftar pelanggan: {{message}}",
      tagsUpdated: "Tag pelanggan diperbarui",
      saveFailed: "Gagal menyimpan: {{message}}",
      tagCreated: "Tag dibuat",
      segmentCreated: "Segmen dibuat",
      matchedCustomers: "Cocok dengan {{count}} pelanggan"
    }
  }
};
