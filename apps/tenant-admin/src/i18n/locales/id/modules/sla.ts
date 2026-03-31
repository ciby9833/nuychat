export default {
  slaModule: {
    summary: {
      total: "Total Pelanggaran",
      open: "Belum Diproses",
      acknowledged: "Sudah Dikonfirmasi",
      average: "Rata-rata Lewat Batas (detik)"
    },
    filter: {
      title: "Pencarian Pelanggaran SLA",
      refresh: "Muat Ulang",
      statusPlaceholder: "Status pelanggaran",
      metricPlaceholder: "Metrik",
      query: "Cari",
      status: {
        open: "Belum Diproses",
        acknowledged: "Sudah Dikonfirmasi",
        resolved: "Sudah Diselesaikan"
      },
      metric: {
        firstResponse: "Terlambat respons pertama",
        assignmentAccept: "Terlambat menerima assignment",
        followUp: "Terlambat follow-up",
        resolution: "Terlambat penyelesaian"
      }
    },
    definitions: {
      title: "Definisi SLA",
      create: "Definisi SLA Baru",
      name: "Nama Definisi",
      priority: "Prioritas",
      firstResponseTargetSec: "Batas Respons Pertama (detik)",
      assignmentAcceptTargetSec: "Batas Terima Assignment (detik)",
      followUpTargetSec: "Batas Follow-up (detik)",
      resolutionTargetSec: "Batas Penyelesaian (detik)",
      status: "Status",
      actions: "Aksi",
      active: "Aktif",
      inactive: "Nonaktif",
      disable: "Nonaktifkan",
      enable: "Aktifkan",
      edit: "Edit"
    },
    policies: {
      title: "Kebijakan Pemicu",
      create: "Kebijakan Pemicu Baru",
      name: "Nama Kebijakan",
      priority: "Prioritas",
      firstResponseActions: "Aksi Pelanggaran Respons Pertama",
      assignmentAcceptActions: "Aksi Pelanggaran Terima Assignment",
      followUpActions: "Aksi Pelanggaran Follow-up",
      resolutionActions: "Aksi Pelanggaran Penyelesaian",
      status: "Status",
      actions: "Aksi",
      active: "Aktif",
      inactive: "Nonaktif",
      disable: "Nonaktifkan",
      enable: "Aktifkan",
      edit: "Edit"
    },
    breaches: {
      title: "Daftar Pelanggaran SLA",
      createdAt: "Waktu Terpicu",
      metric: "Metrik",
      definitionName: "Definisi SLA",
      triggerPolicyName: "Kebijakan Aksi",
      agentName: "Agen",
      caseId: "ID Kasus",
      conversationId: "ID Percakapan",
      targetSec: "Target (detik)",
      actualSec: "Aktual (detik)",
      breachSec: "Lewat Batas (detik)",
      severity: "Tingkat Keparahan",
      status: "Status",
      actions: "Penanganan",
      acknowledge: "Konfirmasi",
      resolve: "Selesaikan",
      empty: "-",
      severityWarning: "warning",
      severityCritical: "critical",
      statusOpen: "OPEN",
      statusAcknowledged: "ACK",
      statusResolved: "RESOLVED"
    },
    definitionModal: {
      editTitle: "Edit Definisi SLA",
      createTitle: "Definisi SLA Baru",
      name: "Nama Definisi",
      nameRequired: "Masukkan nama definisi",
      priority: "Prioritas",
      firstResponseTargetSec: "Batas Respons Pertama (detik)",
      assignmentAcceptTargetSec: "Batas Terima Assignment (detik)",
      assignmentAcceptExtra: "Durasi maksimum untuk kasus yang sudah ditugaskan tetapi belum benar-benar diterima.",
      assignmentAcceptPlaceholder: "Kosongkan jika tidak memantau timeout penerimaan assignment",
      followUpTargetSec: "Batas Follow-up (detik)",
      followUpExtra: "Durasi maksimum setelah penanganan ketika menunggu pelanggan atau menunggu penutupan.",
      followUpPlaceholder: "Kosongkan jika tidak memantau timeout follow-up",
      resolutionTargetSec: "Batas Penyelesaian (detik)"
    },
    triggerModal: {
      editTitle: "Edit Kebijakan Pemicu",
      createTitle: "Kebijakan Pemicu Baru",
      name: "Nama Kebijakan",
      nameRequired: "Masukkan nama kebijakan",
      priority: "Prioritas",
      firstResponseActions: "Aksi Pelanggaran Respons Pertama",
      assignmentAcceptActions: "Aksi Pelanggaran Terima Assignment",
      followUpActions: "Aksi Pelanggaran Follow-up",
      resolutionActions: "Aksi Pelanggaran Penyelesaian"
    },
    helper: {
      actionOptions: {
        alert: "Pengingat",
        escalate: "Eskalasi",
        reassign: "Alihkan Ulang",
        closeCase: "Tutup Kasus"
      },
      closeModes: {
        waitingCustomer: "Menunggu Pelanggan",
        semantic: "Selesai Semantik"
      },
      addAction: "Tambah Aksi",
      delete: "Hapus",
      emptyActions: "-",
      closeCaseWithMode: "Tutup ({{mode}})"
    },
    messages: {
      loadFailed: "Gagal memuat data SLA: {{message}}",
      definitionUpdated: "Definisi SLA berhasil diperbarui",
      definitionCreated: "Definisi SLA berhasil dibuat",
      triggerUpdated: "Kebijakan pemicu berhasil diperbarui",
      triggerCreated: "Kebijakan pemicu berhasil dibuat",
      saveFailed: "Gagal menyimpan: {{message}}",
      updateFailed: "Gagal memperbarui: {{message}}",
      breachStatusFailed: "Gagal memperbarui status pelanggaran: {{message}}"
    }
  }
};
