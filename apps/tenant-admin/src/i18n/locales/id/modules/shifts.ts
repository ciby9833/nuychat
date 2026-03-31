export default {
  shiftsModule: {
    tab: {
      refresh: "Muat Ulang",
      schedule: "Jadwal Shift",
      definitions: "Definisi Shift",
      presence: "Status Real-time"
    },
    schedule: {
      agent: "Agen",
      selectedCount: "{{count}} dipilih",
      week: "Minggu",
      month: "Bulan",
      previousWeek: "Minggu Lalu",
      previousMonth: "Bulan Lalu",
      nextWeek: "Minggu Depan",
      nextMonth: "Bulan Depan",
      thisWeek: "Minggu Ini",
      thisMonth: "Bulan Ini",
      copyToNextWeek: "Salin ke Minggu Depan",
      copyToNextMonth: "Salin ke Bulan Depan",
      copyConfirmTitleWeek: "Salin ke Minggu Depan",
      copyConfirmTitleMonth: "Salin ke Bulan Depan",
      copyConfirmDescriptionWeek: "Salin semua data jadwal saat ini ke minggu depan. Jadwal yang sudah ada akan ditimpa.",
      copyConfirmDescriptionMonth: "Salin semua data jadwal saat ini ke bulan depan. Jadwal yang sudah ada akan ditimpa.",
      copyConfirmOk: "Konfirmasi Salin",
      copySourceEmpty: "Tidak ada data jadwal untuk disalin",
      copySuccessWeek: "{{count}} jadwal berhasil disalin ke minggu depan",
      copySuccessMonth: "{{count}} jadwal berhasil disalin ke bulan depan",
      unset: "Belum diatur",
      searchPlaceholder: "Cari nama agen / email",
      departmentPlaceholder: "Semua departemen",
      teamPlaceholder: "Semua tim",
      summary: "Menampilkan {{visible}} / {{total}} agen",
      bulkApply: "Jadwal Massal ({{count}})",
      clearSelection: "Batalkan Pilihan",
      selectAllCurrent: "Pilih Semua Saat Ini ({{count}})",
      noAgents: "Tidak ada agen yang cocok"
    },
    definitions: {
      title: "Template Shift",
      count: "{{count}} template",
      create: "Shift Baru",
      empty: "Belum ada shift. Klik \"Shift Baru\" untuk memulai.",
      name: "Nama Shift",
      workingHours: "Jam Kerja",
      timezone: "Zona Waktu",
      status: "Status",
      actions: "Aksi",
      enabled: "Aktif",
      disabled: "Nonaktif",
      edit: "Edit",
      disable: "Nonaktifkan",
      alreadyDisabled: "Sudah Nonaktif",
      disableTitle: "Nonaktifkan Shift",
      disableDescription: "Setelah dinonaktifkan, shift tidak bisa dipilih lagi. Jadwal historis tidak terpengaruh.",
      disableOk: "Nonaktifkan",
      modalEditTitle: "Edit Shift",
      modalCreateTitle: "Shift Baru",
      save: "Simpan",
      createOk: "Buat",
      code: "Kode Shift",
      codeRequired: "Masukkan kode",
      codePattern: "Hanya huruf kecil, angka, tanda hubung, dan garis bawah",
      codeExtra: "Contoh: morning, afternoon, night",
      nameRequired: "Masukkan nama",
      namePlaceholder: "Shift Pagi",
      startTime: "Waktu Mulai",
      endTime: "Waktu Selesai",
      timezoneLabel: "Zona Waktu"
    },
    presence: {
      totalAgents: "Total Agen",
      empty: "Belum ada data status agen",
      agent: "Agen",
      status: "Status",
      activeConversations: "Percakapan Aktif",
      lastHeartbeat: "Heartbeat Terakhir",
      actions: "Aksi",
      justNow: "Baru saja",
      minutesAgo: "{{count}} menit lalu",
      hoursAgo: "{{count}} jam lalu",
      endBreak: "Akhiri Istirahat",
      startBreak: "Mulai Istirahat"
    },
    shiftCell: {
      title: "Atur Jadwal",
      selectTemplate: "Pilih template shift",
      save: "Simpan",
      saved: "Jadwal berhasil disimpan",
      defaultScheduled: "Terjadwal"
    },
    bulkModal: {
      title: "Jadwal Massal",
      apply: "Terapkan Massal",
      selectedAgents: "Agen terpilih:",
      none: "(tidak ada)",
      applyDates: "Terapkan ke tanggal:",
      selectAll: "Pilih semua",
      workdaysOnly: "Hari kerja saja",
      clear: "Kosongkan",
      selectedDays: "{{selected}} / {{total}} hari dipilih",
      shiftType: "Tipe jadwal:",
      shiftTemplateOptional: "Template shift (opsional):",
      selectTemplate: "Pilih template shift",
      selectOneDate: "Pilih minimal satu tanggal",
      saved: "{{count}} jadwal berhasil disimpan secara massal"
    },
    breakModal: {
      title: "Mulai Istirahat - {{name}}",
      confirm: "Konfirmasi",
      breakType: "Jenis istirahat:",
      note: "Catatan (opsional):",
      notePlaceholder: "Contoh: urusan mendesak...",
      started: "{{name}} sudah masuk waktu istirahat"
    },
    helper: {
      weekdayShort: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
      weekdayFullShort: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
      statusLabels: {
        online: "Online",
        busy: "Sibuk",
        away: "Pergi",
        offline: "Offline"
      },
      shiftStatusOptions: {
        scheduled: "Jadwal Normal",
        off: "Libur",
        leave: "Cuti"
      },
      breakTypeOptions: {
        break: "Istirahat Singkat",
        lunch: "Istirahat Makan",
        training: "Pelatihan"
      },
      shiftStatusTags: {
        scheduled: "Jadwal",
        off: "Libur",
        leave: "Cuti"
      }
    },
    messages: {
      shiftUpdated: "Shift berhasil diperbarui",
      shiftCreated: "Shift berhasil dibuat",
      shiftDisabled: "Shift berhasil dinonaktifkan",
      endBreakSuccess: "Istirahat berhasil diakhiri",
      loadFailed: "Gagal memuat data shift"
    }
  }
};
