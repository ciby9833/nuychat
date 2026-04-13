export default {
  wa: {
    common: {
      whatsapp: "WhatsApp",
      loading: "Memuat…",
      waShort: "WA"
    },
    workspace: {
      offlineTitle: "Akun offline",
      offlineDetail: "Akun WhatsApp ini sedang tidak terhubung. Minta admin untuk masuk ulang sebelum menggunakan workspace."
    },
    conversationList: {
      tabs: {
        chats: "Chat",
        groups: "Grup",
        channels: "Channel"
      },
      allAccounts: "Semua akun",
      syncTitle: "Sinkronkan grup dan kontak",
      searchPlaceholder: "Cari atau mulai chat baru",
      assignedToMeOnly: "Hanya takeover saya",
      listLoading: "Memuat…",
      noMessage: "Belum ada pesan",
      unassigned: "Belum diambil",
      empty: {
        search: "Tidak ada percakapan yang cocok",
        channels: "Tidak ada pesan channel",
        groups: "Tidak ada grup",
        chats: "Tidak ada percakapan"
      },
      contacts: "Kontak",
      avatarAlt: "Avatar"
    },
    chat: {
      selectConversation: "Pilih percakapan",
      unassigned: "Belum diambil",
      directChat: "Chat pribadi",
      takeover: "Ambil alih",
      takeoverLoading: "Mengambil alih...",
      release: "Lepaskan",
      releaseLoading: "Melepaskan...",
      loadingConversation: "Memuat percakapan...",
      loadMore: "Muat pesan lama",
      loadMoreLoading: "Memuat...",
      unreadDivider: "{{count}} pesan belum dibaca",
      quotedMessage: "Pesan kutipan",
      mediaMessage: "Pesan media",
      reply: "Balas",
      sendFailed: "Gagal mengirim",
      emptyConversation: "Chat ini belum memiliki pesan",
      quoteReply: "Balas kutipan",
      clearQuote: "Hapus kutipan",
      attachment: "Lampiran",
      composerPlaceholder: "Ketik pesan, atau tempel gambar",
      sendBlocked: "Percakapan ini sedang diambil alih anggota lain",
      unknownFormat: "(Pesan masih dimuat atau format tidak didukung)",
      imageAlt: "Gambar",
      imageLabel: "Gambar",
      videoLabel: "Video",
      voiceMessage: "Pesan suara",
      fileLabel: "File",
      download: "Unduh",
      stickerAlt: "Stiker",
      locationAlt: "Lokasi",
      openInMaps: "Buka di Maps",
      contactCard: "Kontak",
      contactCardLabel: "Kartu kontak",
      unsupported: "Jenis pesan tidak didukung ({{type}})",
      revoked: "Pesan ini telah dihapus",
      reactionBy: "{{actor}} bereaksi",
      otherParty: "Lawan bicara",
      failedNoAttachmentImage: "image (tanpa lampiran)",
      failedNoAttachmentVideo: "video (tanpa lampiran)",
      failedNoAttachmentAudio: "audio (tanpa lampiran)",
      failedNoAttachmentDocument: "document (tanpa lampiran)"
    },
    context: {
      noConversation: "Belum memilih percakapan",
      directChat: "Chat pribadi",
      title: "Info percakapan",
      memberCount: "{{count}} anggota",
      currentReplier: "Penjawab saat ini",
      unassigned: "Belum diambil",
      canReply: "Anda bisa membalas",
      readOnly: "Hanya lihat",
      supervisorAssign: "Penugasan supervisor",
      members: "Anggota",
      admin: "Admin",
      member: "Anggota",
      noMembers: "Belum ada data anggota"
    }
  }
} as const;
