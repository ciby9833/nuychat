export default {
  login: {
    brand: "NuyChat Admin",
    title: "Login Admin Tenant",
    subtitle: "Masuk menggunakan akun admin tenant",
    emailLabel: "Email",
    emailPlaceholder: "Masukkan email",
    passwordLabel: "Kata Sandi",
    passwordPlaceholder: "Masukkan kata sandi",
    submit: "Masuk"
  },
  nav: {
    brand: "Admin Console",
    subbrand: "NuyChat",
    logout: "Keluar",
    groups: {
      core: "Manajemen Dasar",
      ops: "Operasional",
      sys: "Konfigurasi Platform"
    }
  },
  lang: {
    switchLabel: "Bahasa",
    zh: "中文",
    en: "English",
    id: "Indonesia"
  },
  tabs: {
    overview: "Ikhtisar",
    cases: "Kasus",
    "human-conversations": "Percakapan",
    tasks: "Tugas",
    organization: "Organisasi",
    permissions: "Izin",
    shifts: "Jadwal",
    agents: "Agen",
    "ai-seats": "AI Seat",
    "ai-conversations": "Percakapan AI",
    "memory-qa": "Memory QA",
    "dispatch-audit": "Audit Dispatch",
    ai: "Konfigurasi AI",
    capabilities: "Kemampuan AI",
    kb: "Basis Pengetahuan",
    routing: "Routing",
    channels: "Saluran",
    analytics: "Analitik",
    sla: "SLA",
    qa: "QA",
    csat: "CSAT",
    supervisor: "Supervisor",
    customers: "Pelanggan"
  },
  common: {
    refresh: "Segarkan",
    closeCurrent: "Tutup Tab Ini",
    closeAll: "Tutup Semua",
    save: "Simpan",
    cancel: "Batal",
    edit: "Edit",
    delete: "Hapus",
    create: "Buat",
    add: "Tambah",
    enable: "Aktifkan",
    disable: "Nonaktifkan",
    search: "Cari",
    confirm: "Konfirmasi Hapus",
    status: "Status",
    action: "Aksi",
    noData: "Tidak ada data",
    active: "Aktif",
    inactive: "Nonaktif",
    remove: "Hapus",
    on: "Aktif",
    off: "Nonaktif",
    total: "Total"
  },
  overview: {
    totalConversations: "Total Percakapan",
    kbEntries: "Entri KB",
    agentCount: "Jumlah Agen",
    statusDistribution: "Distribusi Status Percakapan"
  },
  cases: {
    loadError: "Gagal memuat daftar kasus",
    searchPlaceholder: "Cari ID kasus / judul / pelanggan / ID percakapan",
    statusPlaceholder: "Status kasus",
    query: "Cari",
    cardTitle: "Kasus",
    col: {
      case: "Kasus",
      customer: "Pelanggan",
      channel: "Saluran",
      owner: "Penanggung Jawab",
      status: "Status",
      summary: "Ringkasan",
      lastActivity: "Aktivitas Terakhir"
    },
    ownerFinal: "Terakhir",
    ownerCurrent: "Saat Ini"
  },
  analytics: {
    title: "Analitik Harian",
    stats: {
      totalEvents: "Total Kejadian",
      casesTouched: "Kasus Tersentuh",
      convsStarted: "Percakapan Dimulai",
      msgsReceived: "Pesan Diterima",
      msgsSent: "Pesan Dikirim",
      skillsExecuted: "Skill Dijalankan",
      convsResolved: "Percakapan Selesai"
    },
    eventDetail: "Detail Kejadian — {{date}}",
    noEvents: "Tidak ada data kejadian untuk hari ini",
    col: {
      eventType: "Tipe Kejadian",
      rawType: "Tipe Asli",
      count: "Jumlah"
    },
    events: {
      conversation_started: "Percakapan Dimulai",
      message_received: "Pesan Diterima",
      message_sent: "Pesan Dikirim",
      skill_executed: "Skill Dijalankan",
      conversation_resolved: "Percakapan Selesai"
    }
  },
  kb: {
    queryModule: "Cari",
    listModule: "Artikel",
    searchPlaceholder: "Cari artikel",
    allCategories: "Semua Kategori",
    addArticle: "Tambah Artikel",
    editArticle: "Edit Artikel",
    tagsSeparated: "Tag (pisahkan dengan koma)",
    items: "item",
    col: {
      category: "Kategori",
      title: "Judul",
      content: "Konten",
      hits: "Kunjungan",
      status: "Status"
    }
  },
  agents: {},
  routing: {
    rulesTab: "Aturan",
    modulesTab: "Modul",
    skillGroupsTab: "Kelompok Skill",
    rulesCount: "{{count}} aturan",
    enabledCount: "{{count}} aktif",
    modulesCount: "{{count}} modul",
    skillGroupsCount: "{{count}} kelompok",
    addRule: "Tambah Aturan",
    addModule: "Tambah Modul",
    addSkillGroup: "Tambah Kelompok Skill",
    hint: "Aturan mencocokkan kondisi lalu mengarahkan percakapan ke departemen/tim/kelompok skill"
  },
  dispatchAudit: {
    hint: "Menjelaskan mengapa setiap kasus diarahkan ke AI atau manusia, serta alasan perpindahan pemilik setelahnya.",
    common: {
      none: "Tidak ada",
      yes: "Ya",
      no: "Tidak"
    },
    stats: {
      total: "{{count}} catatan eksekusi",
      plans: "{{count}} rencana routing",
      aiRuntime: "{{count}} eksekusi AI",
      manual: "{{count}} perubahan manual"
    },
    filters: {
      caseId: "Filter berdasarkan ID kasus",
      conversationId: "Filter berdasarkan ID percakapan",
      triggerType: "Jenis pemicu"
    },
    columns: {
      time: "Waktu",
      case: "Kasus",
      trigger: "Pemicu",
      decisionType: "Jenis Keputusan",
      rule: "Aturan",
      reason: "Alasan",
      summary: "Ringkasan"
    },
    detail: {
      title: "Detail Eksekusi Dispatch",
      case: "Kasus",
      conversation: "Percakapan",
      trigger: "Pemicu",
      decisionType: "Jenis Keputusan",
      rule: "Aturan",
      conditions: "Kondisi Cocok",
      inputSnapshot: "Snapshot Input",
      decisionSummary: "Ringkasan Keputusan",
      decisionReason: "Alasan Keputusan",
      candidates: "Kandidat",
      transitions: "Perpindahan Tanggung Jawab"
    },
    candidateColumns: {
      type: "Tipe",
      candidate: "Kandidat",
      stage: "Tahap",
      result: "Hasil",
      reason: "Alasan",
      details: "Detail"
    },
    candidateResult: {
      accepted: "Dipilih",
      rejected: "Ditolak"
    },
    transitionColumns: {
      time: "Waktu",
      type: "Tipe",
      from: "Dari",
      to: "Ke",
      reason: "Alasan"
    },
    case: {
      short: "Kasus {{id}}",
      full: "Kasus {{id}}",
      unlinked: "Tidak terhubung ke kasus"
    },
    summary: {
      assignedAgent: "Manusia {{id}}",
      assignedAi: "AI {{id}}",
      noDirectOwner: "Tidak ada pemilik langsung"
    },
    ops: {
      title: "Saran Operasional Dispatch",
      empty: "Tidak ada saran yang menonjol pada rentang waktu ini.",
      aiAgents: "Per agen AI",
      teams: "Per tim",
      customerSegments: "Per tier / kanal"
    },
    candidateDetails: {
      score: "Skor: {{score}}",
      todayNewCaseCount: "Kasus baru hari ini: {{count}}",
      activeAssignments: "Penanganan aktif: {{count}}",
      reservedAssignments: "Ditahan: {{count}}",
      balancedFormula: "balanced_new_case = 4 * kasus baru hari ini + 2 * penanganan aktif + 1 * ditahan"
    },
    patterns: {
      modeReason: "{{mode}} / {{reason}}",
      ownerWithId: "{{ownerType}} / {{ownerId}}"
    },
    actions: {
      view: "Lihat",
      assign_ai_owner: "Tetapkan ke AI",
      assign_specific_owner: "Tetapkan ke manusia",
      enqueue_for_human: "Masukkan ke antrean manusia",
      preserve_existing_owner: "Pertahankan pemilik saat ini"
    },
    modes: {
      ai_first: "AI lebih dulu",
      human_first: "Manusia lebih dulu",
      ai_only: "Hanya AI",
      human_only: "Hanya manusia",
      hybrid: "Hybrid"
    },
    selectionModes: {
      rule: "Cocok aturan",
      fallback: "Fallback",
      none: "Tidak dipakai"
    },
    strategies: {
      least_busy: "Paling ringan",
      sticky: "Sticky",
      balanced_new_case: "Seimbang kasus baru",
      load_balanced: "Seimbang beban",
      prefer_human: "Utamakan manusia",
      prefer_ai: "Utamakan AI"
    },
    triggerTypes: {
      inbound_message: "Pesan masuk",
      ai_routing: "Routing AI",
      ai_routing_execution: "Eksekusi routing AI",
      agent_assign: "Pengambilalihan manusia",
      agent_handoff: "Serah ke antrean manusia",
      agent_transfer: "Transfer agen",
      supervisor_transfer: "Transfer supervisor",
      conversation_resolve: "Percakapan selesai",
      ai_handoff: "Serah AI ke manusia"
    },
    decisionTypes: {
      routing_plan: "Rencana routing",
      ai_runtime: "Eksekusi AI",
      manual_transition: "Perubahan manual"
    },
    candidateTypes: {
      agent: "Agen manusia",
      team: "Tim",
      department: "Departemen",
      ai_agent: "Agen AI"
    },
    candidateStages: {
      configured_target: "Pemeriksaan target tetap",
      conversation_sticky: "Sticky percakapan",
      strategy_selection: "Pemilihan strategi",
      team_scope: "Penyaringan tim",
      eligible: "Pemeriksaan kelayakan"
    },
    transitionTypes: {
      ai_takeover: "AI mengambil alih",
      ai_unavailable_to_system: "AI tidak tersedia, kembali ke antrean sistem",
      human_takeover: "Manusia mengambil alih",
      supervisor_transfer: "Transfer supervisor"
    },
    ownerTypes: {
      system: "Sistem",
      human: "Manusia",
      agent: "Agen manusia",
      ai: "AI"
    },
    conversationStatuses: {
      open: "Terbuka",
      queued: "Dalam antrean",
      bot_active: "AI aktif",
      human_active: "Manusia aktif",
      waiting_customer: "Menunggu pelanggan",
      waiting_internal: "Menunggu internal",
      resolved: "Selesai"
    },
    queueStatuses: {
      assigned: "Ditetapkan",
      pending: "Menunggu",
      resolved: "Tidak perlu antrean",
      failed: "Gagal"
    },
    reasons: {
      conversation_sticky: "Menggunakan AI yang sebelumnya menangani percakapan ini",
      conversation_sticky_other: "Percakapan ini sudah sticky ke AI lain",
      strategy_least_busy: "Dipilih oleh strategi paling ringan",
      strategy_sticky: "Dipilih oleh strategi sticky",
      configured_ai_agent_selected: "Menggunakan AI yang dikonfigurasi",
      configured_ai_agent_unavailable: "AI yang dikonfigurasi tidak tersedia",
      not_configured_target: "Bukan target AI yang dikonfigurasi",
      not_selected_by_strategy: "Tidak dipilih oleh strategi saat ini",
      policy_selected_human: "Kebijakan memutuskan untuk mengutamakan manusia",
      reserved_human_fallback: "Fallback ke manusia saat AI tidak cocok",
      preserve_existing_human_owner: "Mempertahankan pemilik manusia saat ini",
      agent_handoff_human_fallback: "Serah agen fallback ke manusia",
      ai_handoff_human_dispatch: "AI meminta serah ke manusia",
      ai_handoff_human_dispatch_fallback_any_group: "Tidak ada agen di grup target, fallback ke grup manusia lain",
      ai_handoff_forced_human: "Alur ini memaksa serah ke manusia",
      fallback_human_target: "Fallback ke target manusia default",
      no_active_ai_agent: "Tidak ada AI yang tersedia",
      "no-eligible-agent": "Tidak ada agen manusia yang layak saat ini",
      "no-skill-group": "Kelompok skill belum dikonfigurasi",
      accepted_reserved_assignment: "Mempertahankan assignment manusia yang sudah ditahan",
      excluded_for_reroute: "Dikeluarkan dari reroute ini",
      team_not_selected: "Tim kandidat tidak dipilih",
      team_has_no_eligible_agent: "Tim ini tidak memiliki agen yang layak",
      agent_on_break: "Agen sedang istirahat",
      agent_not_scheduled: "Agen tidak dijadwalkan",
      outside_shift_window: "Di luar jam kerja agen",
      agent_concurrency_disabled: "Konkurensi agen dinonaktifkan",
      agent_concurrency_full: "Agen mencapai batas konkurensi",
      "ai-replied": "AI sudah membalas dan mengambil alih",
      "conversation-resolved": "Percakapan selesai",
      "supervisor-transfer": "Dipindahkan oleh supervisor",
      sla_assignment_accept_timeout: "Waktu terima assignment habis"
    },
    fields: {
      planId: "ID rencana",
      currentHandlerId: "ID pemilik saat ini",
      currentHandlerType: "Jenis pemilik saat ini",
      conversationStatus: "Status percakapan",
      preserveHumanOwner: "Pertahankan pemilik manusia",
      channelType: "Jenis kanal",
      operatingMode: "Mode operasi",
      issueSummary: "Ringkasan isu",
      aiAgentId: "ID AI",
      aiAgentName: "Nama AI",
      selectionMode: "Mode pemilihan",
      mode: "Mode",
      action: "Aksi",
      selectedOwnerType: "Pemilik terpilih",
      moduleId: "ID modul",
      skillGroupId: "ID kelompok skill",
      departmentId: "ID departemen",
      teamId: "ID tim",
      assignedAgentId: "ID agen manusia",
      strategy: "Strategi",
      status: "Status antrean",
      activeConversationCount: "Percakapan aktif",
      lastAssignedAt: "Terakhir ditetapkan",
      teamName: "Nama tim",
      departmentName: "Nama departemen",
      totalAgents: "Total agen",
      eligibleAgents: "Agen yang layak",
      rejectBreakdown: "Rincian penolakan",
      activeAssignments: "Penanganan aktif",
      reservedAssignments: "Ditahan",
      todayNewCaseCount: "Kasus baru hari ini",
      maxConcurrency: "Batas konkurensi"
    }
  }
};
