export default {
  routing: {
    table: {
      module: "Modul",
      operatingMode: "Mode operasi",
      status: "Status",
      skillGroup: "Grup skill",
      moduleName: "Modul",
      priority: "Prioritas",
      rule: "Aturan",
      conditions: "Kondisi cocok",
      target: "Target",
      skillAndStrategy: "Grup skill / Strategi"
    },
    description: "Platform kini menggunakan pembagian cerdas bawaan berdasarkan instance kanal, cakupan departemen atau tim, agen manusia yang online, seat AI, jadwal kerja, dan beban real-time. Aturan di sini hanya untuk beberapa pengecualian.",
    smartDefaultEnabled: "Pembagian cerdas bawaan aktif",
    exceptionRulesHint: "Tambahkan aturan pengecualian hanya bila pembagian cerdas bawaan benar-benar tidak memenuhi kebutuhan bisnis.",
    exceptionRule: "Aturan Pengecualian",
    form: {
      editRule: "Edit aturan dispatch",
      createRule: "Aturan dispatch baru",
      editModule: "Edit modul",
      createModule: "Modul baru",
      editSkillGroup: "Edit grup skill",
      createSkillGroup: "Grup skill baru",
      create: "Buat",
      ruleNamePlaceholder: "WhatsApp VIP purnajual",
      ruleName: "Nama aturan",
      ruleNameRequired: "Masukkan nama aturan",
      priorityRequired: "Masukkan prioritas",
      enabled: "Aktif",
      matchConditions: "Kondisi cocok",
      channel: "Kanal",
      anyChannel: "Semua kanal",
      channelInstance: "Nomor / Instance Kanal",
      anyChannelInstance: "Semua nomor / instance",
      language: "Bahasa",
      anyLanguage: "Semua bahasa",
      customerTier: "Tier pelanggan",
      anyTier: "Semua tier",
      defaultDispatch: "Kebijakan Dispatch Default",
      defaultDispatchHint: "Penugasan cerdas akan otomatis memilih manusia atau AI terbaik berdasarkan status online, jadwal kerja, dan beban real-time. Prefer manusia dan prefer AI hanya mengubah kecenderungan default.",
      serviceTarget: "Target Layanan",
      humanStrategy: "Strategi Penugasan Manusia",
      aiStrategy: "Strategi Penugasan AI",
      routingAction: "Aksi routing",
      executionMode: "Mode eksekusi",
      executionHint: "Mode eksekusi menentukan apakah aturan memprioritaskan AI, manusia, atau hanya satu jalur penanganan.",
      humanTarget: "Target manusia",
      targetDepartment: "Departemen target",
      anyDepartment: "Semua departemen",
      targetTeam: "Tim target",
      anyTeamInDepartment: "Semua tim dalam departemen",
      targetSkillGroup: "Grup skill target",
      targetSkillGroupRequired: "Pilih grup skill",
      assignmentStrategy: "Strategi penugasan",
      aiAgent: "Agen AI",
      autoSelectAi: "Biarkan kosong untuk memilih otomatis berdasarkan strategi AI",
      aiAssignmentStrategy: "Strategi penugasan AI",
      capacityAndOverrides: "Kapasitas & override",
      humanToAiThreshold: "Ambang Manusia ke AI (%)",
      noOverflow: "Tanpa overflow",
      aiToHumanThreshold: "Ambang AI ke Manusia (%)",
      aiSoftConcurrencyLimit: "Batas soft concurrency AI",
      loadEstimate: "Estimasi beban",
      hybridStrategy: "Strategi hybrid",
      customerRequestsHuman: "Pelanggan minta manusia",
      aiUnhandled: "AI tidak dapat menangani",
      humanKeywords: "Kata kunci manusia (satu per baris)",
      humanKeywordsPlaceholder: "manusia\ntransfer ke manusia\nsupport",
      fallbackTarget: "Target fallback",
      fallbackDepartment: "Departemen fallback",
      fallbackReuseHumanTarget: "Gunakan target manusia",
      fallbackTeam: "Tim fallback",
      fallbackSkillGroup: "Grup skill fallback",
      fallbackStrategy: "Strategi fallback",
      aiHint: "Agen AI tetap diprioritaskan; bila kosong, sistem memilih dari agen AI aktif sesuai strategi AI.",
      moduleCode: "Kode modul",
      moduleCodeRequired: "Masukkan kode modul",
      moduleName: "Nama modul",
      moduleNameRequired: "Masukkan nama modul",
      description: "Deskripsi",
      skillGroupModule: "Modul",
      skillGroupModuleRequired: "Pilih modul",
      skillGroupCode: "Kode grup skill",
      skillGroupCodeRequired: "Masukkan kode grup skill",
      skillGroupName: "Nama grup skill",
      skillGroupNameRequired: "Masukkan nama grup skill"
    },
    confirm: {
      deleteRuleTitle: "Hapus aturan ini?",
      deleteRuleDescription: "Aturan routing akan langsung berhenti berlaku setelah dihapus.",
      deleteModuleTitle: "Hapus modul ini?",
      deleteModuleDescription: "Kosongkan semua grup skill di modul ini sebelum menghapusnya.",
      deleteSkillGroupTitle: "Hapus grup skill ini?",
      deleteSkillGroupDescription: "Jika grup skill ini masih direferensikan oleh agen atau aturan routing, penghapusan akan gagal."
    },
    state: {
      active: "Aktif",
      inactive: "Nonaktif",
      createModuleFirst: "Buat modul terlebih dahulu, baru kelola grup skill."
    },
    summary: {
      priority: "Prioritas {{count}}",
      auto: "Otomatis",
      any: "Semua",
      anyDepartment: "Semua departemen",
      autoTeam: "Pilih tim otomatis",
      reuseHumanTarget: "Gunakan target manusia",
      strategyLine: "Manusia: {{humanStrategy}} | AI: {{aiStrategy}}"
    },
    messages: {
      ruleUpdated: "Aturan dispatch diperbarui",
      ruleCreated: "Aturan dispatch dibuat",
      ruleDeleted: "Aturan dispatch dihapus",
      ruleMissing: "Aturan saat ini tidak ada lagi atau tidak lagi termasuk di sini. Daftar telah dimuat ulang. Pilih lagi lalu coba ulangi.",
      moduleUpdated: "Modul diperbarui",
      moduleCreated: "Modul dibuat",
      moduleDeleted: "Modul dihapus",
      skillGroupUpdated: "Grup skill diperbarui",
      skillGroupCreated: "Grup skill dibuat",
      skillGroupDeleted: "Grup skill dihapus"
    },
    options: {
      strategy: {
        least_busy: "Paling ringan",
        balanced_new_case: "Seimbang kasus baru",
        round_robin: "Round robin",
        sticky: "Penugasan sticky"
      },
      language: {
        zh: "Chinese",
        en: "English",
        id: "Bahasa Indonesia"
      },
      moduleMode: {
        ai_first: "AI lebih dulu",
        human_first: "Manusia lebih dulu",
        ai_autonomous: "AI otonom",
        workflow_first: "Workflow lebih dulu"
      },
      executionMode: {
        ai_first: "AI lebih dulu",
        human_first: "Manusia lebih dulu",
        ai_only: "Hanya AI",
        human_only: "Hanya manusia",
        hybrid: "Hybrid",
        hybrid_smart: "Pembagian cerdas",
        human_preferred: "Prefer manusia",
        ai_preferred: "Prefer AI"
      },
      hybridStrategy: {
        load_balanced: "Seimbang beban",
        prefer_human: "Utamakan manusia",
        prefer_ai: "Utamakan AI"
      },
      override: {
        force_human: "Paksa manusia",
        allow_policy: "Ikuti kebijakan"
      },
      aiUnhandled: {
        force_human: "Paksa manusia",
        queue_human: "Masuk antrean manusia",
        allow_policy: "Ikuti kebijakan"
      }
    }
  }
};
