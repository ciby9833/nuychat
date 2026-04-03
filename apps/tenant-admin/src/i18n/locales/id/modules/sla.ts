export default {
  slaModule: {
    config: {
      title: "Konfigurasi SLA Default",
      description: "Kelola satu SLA default tingkat tenant. Platform akan memakai konfigurasi ini untuk respons pertama, re-dispatch assignment yang belum diambil, re-dispatch respons lanjutan, dan penutupan follow-up.",
      edit: "Edit",
      editTitle: "Edit SLA Default",
      save: "Simpan Konfigurasi",
      cancel: "Batal",
      confirmTitle: "Konfirmasi Perubahan SLA",
      confirmDescription: "Setelah disimpan, waktu default baru akan langsung dipakai untuk percakapan berikutnya dan re-dispatch pengecualian.",
      confirmSave: "Simpan",
      confirmCancel: "Kembali",
      firstResponseTargetSec: "Batas Respons Pertama (detik)",
      assignmentAcceptTargetSec: "Batas Terima Assignment (detik)",
      subsequentResponseTargetSec: "Batas Respons Lanjutan (detik)",
      subsequentResponseReassignWhen: "Kapan Alihkan Ulang Saat Respons Lanjutan Timeout",
      followUpTargetSec: "Batas Follow-up (detik)",
      followUpCloseMode: "Mode Penutupan",
      disabled: "Tidak aktif",
      updatedAt: "Terakhir diperbarui: {{value}}"
    },
    closeModes: {
      waitingCustomer: "Menunggu Pelanggan",
      semantic: "Selesai Semantik"
    },
    reassignModes: {
      ownerUnavailable: "Alihkan ulang hanya jika penanggung jawab tidak tersedia",
      always: "Selalu alihkan ulang saat melewati batas"
    },
    scenes: {
      firstResponse: "Pemantauan Respons Pertama",
      firstResponseHelp: "Saat pelanggan mengirim pesan baru dan belum ada balasan dari sisi layanan dalam batas waktu, percakapan dicatat sebagai pelanggaran respons pertama dan masuk pemantauan pengecualian.",
      assignmentAccept: "Re-dispatch Belum Diambil",
      assignmentAcceptHelp: "Saat percakapan sudah ditugaskan ke agen manusia tetapi belum benar-benar diambil, sistem akan otomatis mengalihkan ulang setelah timeout.",
      subsequentResponse: "Re-dispatch Respons Lanjutan",
      subsequentResponseHelp: "Setelah sisi layanan sudah pernah membalas, jika pelanggan membalas lagi tetapi penanggung jawab saat ini tidak melanjutkan percakapan tepat waktu, sistem mencatat pelanggaran dan dapat mengalihkan ulang sesuai aturan.",
      followUp: "Penutupan Follow-up",
      followUpHelp: "Setelah sisi layanan sudah membalas, sistem dapat menutup siklus layanan saat ini jika tidak ada tindak lanjut terlalu lama."
    },
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
        subsequentResponse: "Terlambat respons lanjutan",
        followUp: "Terlambat follow-up"
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
    messages: {
      loadFailed: "Gagal memuat data SLA: {{message}}",
      configUpdated: "Konfigurasi SLA default berhasil diperbarui",
      saveFailed: "Gagal menyimpan: {{message}}",
      breachStatusFailed: "Gagal memperbarui status pelanggaran: {{message}}"
    }
  }
};
