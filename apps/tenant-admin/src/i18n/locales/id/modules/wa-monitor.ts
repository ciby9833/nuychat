export default {
  waMonitor: {
    tab: "Monitor WA",
    pageTitle: "Monitor Akun WA",
    refresh: "Muat ulang",
    providerUnavailable: "Provider WhatsApp tidak tersedia",
    providerUnavailableDesc: "Periksa konfigurasi runtime WA terlebih dahulu.",
    stats: {
      accountCount: "Jumlah akun",
      online: "Online",
      connecting: "Menghubungkan",
      offline: "Offline",
      criticalAlert: "Peringatan kritis",
      warningAlert: "Peringatan"
    },
    alerts: {
      title: "Peringatan Kritis",
      empty: "Tidak ada peringatan aktif",
      critical: "Kritis",
      warning: "Peringatan"
    },
    health: {
      title: "Dasbor Kesehatan Akun",
      provider: "Provider",
      currentStatus: "Status Saat Ini",
      lastConnected: "Terakhir Terhubung",
      lastDisconnected: "Terakhir Terputus",
      connectionState: "Status Koneksi",
      loginPhase: "Fase Login",
      heartbeatAt: "Heartbeat",
      reconnectCount: "Jumlah Reconnect",
      loginMode: "Mode Login",
      disconnectReason: "Alasan Putus",
      noSession: "Belum ada session",
      empty: "Belum ada",
      loading: "Memuat..."
    },
    pane: {
      title: "Pool Akun WA Mandiri",
      accountCount: "Jumlah akun {{count}}",
      onlineCount: "Online {{count}}",
      refresh: "Muat ulang",
      create: "Tambah Akun WA",
      description: "Pengelolaan akun WA tetap berada di area seat dan anggota saat ini, dan sakelar WA Seat anggota juga dikelola di halaman ini.",
      table: {
        account: "Akun",
        status: "Status",
        owner: "Penanggung jawab",
        members: "Kolaborator",
        lastConnected: "Terakhir terhubung",
        actions: "Aksi",
        unset: "Belum diatur",
        empty: "Belum ada"
      },
      actions: {
        startLogin: "Login Scan",
        manageMembers: "Atur Anggota",
        viewHealth: "Status Kesehatan",
        logout: "Keluar WA",
        reconnect: "Reconnect"
      },
      createModal: {
        title: "Tambah Akun WA",
        name: "Nama Akun",
        nameRequired: "Masukkan nama akun",
        namePlaceholder: "Nomor utama tim sales",
        phone: "Nomor telepon",
        phonePlaceholder: "+6281234567890",
        owner: "Penanggung jawab",
        optional: "Opsional",
        success: "Akun WA berhasil dibuat"
      },
      loginModal: {
        title: "Login Scan: {{name}}",
        retry: "Scan Ulang",
        close: "Tutup",
        rescan: "Silakan scan ulang",
        refreshingQr: "Memuat ulang QR",
        refreshAfter: "Akan diperbarui dalam {{value}}",
        disconnectReason: "Alasan putus: {{value}}",
        connectedSuccess: "Akun WA {{name}} berhasil terhubung",
        loggedOutSuccess: "Session WA telah keluar"
      },
      accessModal: {
        title: "Atur Anggota: {{name}}",
        owner: "Penanggung jawab",
        ownerPlaceholder: "Pilih penanggung jawab",
        members: "Kolaborator",
        membersPlaceholder: "Pilih anggota yang dapat melihat/berkolaborasi",
        success: "Anggota akun WA berhasil diperbarui"
      },
      reconnectSuccess: "Reconnect dipicu",
      healthModal: {
        title: "Status Kesehatan: {{name}}"
      }
    },
    insightTabs: {
      report: "Laporan Percakapan Harian",
      replyPool: "Kolam Balasan Cerdas"
    },
    report: {
      title: "Laporan Harian / {{date}}",
      totalMessages: "Total pesan",
      manualReplies: "Balasan manual",
      avgResponse: "Rata-rata waktu respons",
      unrepliedTop10: "10 Pesan Belum Dibalas",
      noUnreplied: "Tidak ada pesan belum dibalas",
      waiting: "Menunggu {{value}}"
    },
    replyPool: {
      title: "Kolam Balasan Cerdas",
      description: "Dimuat sesuai kebutuhan. Ini adalah percakapan yang ditandai aturan untuk tindak lanjut manusia dan tidak ikut dimuat di layar awal.",
      empty: "Tidak ada item yang menunggu balasan",
      group: "Grup",
      direct: "Pribadi",
      unread: "Belum dibaca {{count}}",
      waiting: "Menunggu {{value}}",
      unassigned: "Belum diambil"
    }
  }
};
