export default {
  aiSeats: {
    title: "AI Seat",
    modelPlatformManaged: "Model saat ini disediakan terpusat oleh platform: {{model}}",
    modelTenantManaged: "Model saat ini dikonfigurasi sendiri oleh perusahaan: {{model}}",
    stats: {
      licensed: "Berlisensi",
      used: "Diaktifkan",
      remaining: "Tersisa"
    },
    intro: {
      title: "Penjelasan Seat",
      description: "Setiap AI seat dapat memiliki peran, persona, skenario layanan, system prompt, dan deskripsi yang berbeda."
    },
    actions: {
      create: "Buat AI Seat",
      backToList: "Kembali ke Daftar",
      save: "Simpan",
      view: "Lihat",
      edit: "Edit",
      disable: "Nonaktifkan",
      enable: "Aktifkan",
      delete: "Hapus"
    },
    editor: {
      createTitle: "Buat AI Seat",
      editTitle: "Edit AI Seat · {{name}}",
      innerCreateTitle: "Buat AI Seat",
      name: "Nama",
      nameRequired: "Masukkan nama AI seat",
      namePlaceholder: "AI pra-penjualan / AI purna jual / AI shift malam",
      role: "Peran",
      rolePlaceholder: "Konsultan pra-penjualan / CS purna jual / Spesialis komplain",
      personality: "Persona",
      personalityPlaceholder: "Contoh: sabar, menenangkan, profesional, langsung",
      scenePrompt: "Skenario Layanan",
      scenePromptPlaceholder: "Contoh: konsultasi refund, cek logistik, layanan malam",
      systemPrompt: "System Prompt",
      systemPromptPlaceholder: "Aturan sistem dan batasan jawaban khusus seat ini",
      description: "Deskripsi",
      descriptionPlaceholder: "Tambahkan penjelasan tentang tanggung jawab utama AI seat ini",
      status: "Status",
      statusRequired: "Pilih status"
    },
    table: {
      title: "Daftar AI Seat",
      colName: "Nama",
      colRole: "Peran",
      colPersonality: "Persona",
      colDescription: "Deskripsi",
      colStatus: "Status",
      colCreatedAt: "Dibuat Pada",
      colAction: "Aksi",
      deleteConfirm: "Hapus instance CS AI ini?"
    },
    status: {
      draft: "Draft",
      active: "Aktif",
      inactive: "Nonaktif"
    },
    common: {
      empty: "-"
    },
    errors: {
      seatLimitExceeded: "Kuota AI seat sudah penuh. Tidak dapat mengaktifkan instance CS AI baru. Hubungi administrator platform untuk menambah kapasitas."
    }
  }
};
