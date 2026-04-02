export default {
  organizationModule: {
    department: {
      listTitle: "Daftar departemen",
      create: "Departemen baru",
      edit: "Edit departemen",
      delete: "Hapus departemen",
      deleteConfirmTitle: "Hapus departemen?",
      deleteConfirmDescription: "Departemen \"{{name}}\" akan dihapus. Tindakan ini tidak bisa dibatalkan.",
      deleteBlockedHint: "Departemen ini masih punya {{count}} tim. Hapus atau pindahkan timnya terlebih dulu.",
      all: "Semua departemen",
      teamsCount: "{{count}} tim",
      loading: "Memuat...",
      empty: "Belum ada departemen. Buat departemen baru untuk mulai."
    },
    teams: {
      titleWithDept: "Tim {{name}}",
      titleAll: "Semua tim",
      create: "Tim baru",
      edit: "Edit tim",
      delete: "Hapus tim",
      deleteConfirmTitle: "Hapus tim?",
      deleteConfirmDescription: "Tim \"{{name}}\" akan dihapus dan relasi anggota juga akan dilepas.",
      actions: "Aksi",
      emptyWithDept: "Belum ada tim di departemen ini. Buat tim baru.",
      empty: "Belum ada tim",
      team: "Tim",
      supervisor: "Supervisor",
      members: "Anggota",
      noSupervisor: "—",
      noMembers: "Belum ada anggota",
      addMember: "+ Tambah anggota",
      removeMember: "Hapus {{name}}"
    },
    deptModal: {
      title: "Departemen baru",
      editTitle: "Edit departemen",
      create: "Buat",
      save: "Simpan",
      code: "Kode departemen",
      codeRequired: "Masukkan kode departemen",
      codeExtra: "Huruf kecil dan tanda hubung, misalnya: after-sales",
      name: "Nama departemen",
      nameRequired: "Masukkan nama departemen",
      parent: "Departemen induk (opsional)",
      parentPlaceholder: "Departemen tingkat atas"
    },
    teamModal: {
      title: "Tim baru",
      editTitle: "Edit tim",
      create: "Buat",
      save: "Simpan",
      department: "Departemen",
      departmentRequired: "Pilih departemen",
      code: "Kode tim",
      codeRequired: "Masukkan kode tim",
      codeExtra: "Contoh: after-sales-a",
      name: "Nama tim",
      nameRequired: "Masukkan nama tim",
      supervisor: "Agen supervisor (opsional)",
      supervisorPlaceholder: "Tanpa supervisor"
    },
    messages: {
      memberRemoved: "Anggota dihapus",
      memberAdded: "Anggota ditambahkan",
      departmentDeleted: "Departemen dihapus",
      teamDeleted: "Tim dihapus"
    }
  }
};
