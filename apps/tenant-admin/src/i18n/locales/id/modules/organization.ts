export default {
  organizationModule: {
    department: {
      listTitle: "Daftar departemen",
      create: "Departemen baru",
      all: "Semua departemen",
      teamsCount: "{{count}} tim",
      loading: "Memuat...",
      empty: "Belum ada departemen. Buat departemen baru untuk mulai."
    },
    teams: {
      titleWithDept: "Tim {{name}}",
      titleAll: "Semua tim",
      create: "Tim baru",
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
      create: "Buat",
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
      create: "Buat",
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
      memberAdded: "Anggota ditambahkan"
    }
  }
};
