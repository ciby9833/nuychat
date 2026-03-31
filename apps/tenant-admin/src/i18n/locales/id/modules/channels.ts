export default {
  channelsModule: {
    grid: {
      filterTitle: "Filter Saluran",
      allTypes: "Semua Saluran",
      allStatuses: "Semua Status",
      listTitle: "Daftar Saluran",
      count: "{{count}} item",
      refresh: "Segarkan",
      editConfig: "Edit Konfigurasi",
      bindWhatsApp: "Hubungkan WhatsApp",
      rebindWhatsApp: "Hubungkan Ulang WhatsApp"
    },
    detail: {
      title: "Detail Saluran",
      empty: "Pilih kartu saluran terlebih dahulu untuk melihat detail.",
      channelType: "Tipe Saluran",
      status: "Status",
      channelId: "ID Saluran",
      identifier: "Identitas",
      webHint: "Saat menanamkan saluran web, gunakan `publicChannelKey`. Anda dapat langsung menyalin kode berikut.",
      webIdentifier: "Identitas Web",
      customerUrl: "URL Langsung Pelanggan",
      embedCode: "Kode Embed",
      copy: "Salin",
      copyEmbedCode: "Salin Kode Embed",
      whatsappBound: "Binding WhatsApp selesai",
      whatsappUnbound: "Nomor WhatsApp belum terhubung",
      whatsappEnabledDesc: "Klik tombol di bawah untuk membuka Meta Embedded Signup dan menyelesaikan otorisasi serta binding nomor.",
      whatsappDisabledDesc: "Meta Embedded Signup belum dikonfigurasi di platform, jadi binding belum dapat dimulai.",
      platformWebhookUrl: "Platform Webhook URL",
      displayNumber: "Nomor Tampil",
      businessAccount: "Business Account",
      copyWebhookUrl: "Salin Webhook URL",
      webhookIntroTitle: "Saluran webhook digunakan untuk integrasi HTTP sistem pihak ketiga",
      webhookIntroDesc: "Sistem pihak ketiga mengirim pesan pelanggan via POST ke URL inbound yang dihasilkan sistem; NuyChat mengirim balasan via POST ke callback outbound yang Anda konfigurasikan.",
      inboundUrl: "URL Inbound Sistem",
      outboundUrl: "Alamat Callback Outbound Pihak Ketiga",
      webhookSecret: "Webhook Secret",
      configured: "Sudah Dikonfigurasi",
      notConfigured: "Belum Dikonfigurasi",
      copyInboundUrl: "Salin URL Inbound",
      configureOutbound: "Konfigurasi Callback Outbound",
      webhookReadonlyHint: "`URL Inbound Sistem` dibuat otomatis dari `API_PUBLIC_BASE` dan `channel_id` saat ini, sehingga tidak dapat diubah manual."
    },
    modal: {
      title: "Edit Konfigurasi Saluran",
      titleWithType: "Edit Konfigurasi Saluran · {{type}}",
      channelId: "ID Saluran",
      channelIdRequired: "Masukkan ID saluran",
      channelIdPlaceholder: "Contoh: web-demo / whatsapp-demo",
      active: "Aktif",
      widgetName: "Nama Widget",
      widgetNamePlaceholder: "Contoh: NuyChat Web",
      publicChannelKey: "Identitas Web (publicChannelKey)",
      publicChannelKeyRequired: "Masukkan publicChannelKey",
      publicChannelKeyPlaceholder: "Contoh: demo-web-public",
      allowedOrigins: "Asal yang Diizinkan (dipisah koma)",
      allowedOriginsPlaceholder: "Contoh: http://localhost:5176,https://www.example.com",
      thirdPartyOutboundUrl: "Alamat Callback Outbound Pihak Ketiga"
    },
    status: {
      active: "active",
      inactive: "inactive"
    },
    helper: {
      copySuccess: "{{title}} berhasil disalin",
      copyFailed: "Gagal menyalin, silakan salin manual"
    },
    signup: {
      sdkInitTimeout: "Inisialisasi Facebook SDK timeout",
      sdkLoadFailed: "Gagal memuat Facebook SDK",
      signupTimeout: "Embedded Signup timeout atau tidak mengembalikan hasil binding",
      authIncomplete: "Otorisasi Meta belum selesai"
    },
    messages: {
      configUpdated: "Konfigurasi saluran diperbarui",
      embeddedSignupMissing: "Meta Embedded Signup belum dikonfigurasi di platform",
      whatsappBound: "Nomor WhatsApp berhasil dihubungkan"
    }
  }
};
