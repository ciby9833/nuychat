export default {
  wa: {
    common: {
      whatsapp: "WhatsApp",
      loading: "Loading…",
      waShort: "WA"
    },
    workspace: {
      offlineTitle: "Account offline",
      offlineDetail: "This WhatsApp account is disconnected. Ask an admin to reconnect it before using the workspace."
    },
    conversationList: {
      tabs: {
        chats: "Chats",
        groups: "Groups",
        channels: "Channels"
      },
      allAccounts: "All accounts",
      syncTitle: "Sync groups and contacts",
      searchPlaceholder: "Search or start a new chat",
      assignedToMeOnly: "Only my active takeovers",
      listLoading: "Loading…",
      noMessage: "No messages yet",
      unassigned: "Unassigned",
      empty: {
        search: "No matching conversations",
        channels: "No channel messages",
        groups: "No groups",
        chats: "No conversations"
      },
      contacts: "Contacts",
      avatarAlt: "Avatar"
    },
    chat: {
      selectConversation: "Select a conversation",
      unassigned: "Unassigned",
      directChat: "Direct chat",
      takeover: "Take over",
      takeoverLoading: "Taking over...",
      release: "Release",
      releaseLoading: "Releasing...",
      loadingConversation: "Loading conversation...",
      loadMore: "Load older messages",
      loadMoreLoading: "Loading...",
      unreadDivider: "{{count}} unread messages",
      quotedMessage: "Quoted message",
      mediaMessage: "Media message",
      reply: "Reply",
      sendFailed: "Send failed",
      emptyConversation: "This chat has no messages yet",
      quoteReply: "Quote reply",
      clearQuote: "Clear quote",
      mention: "Mention",
      mentionMembers: "Mention members",
      attachment: "Attachment",
      composerPlaceholder: "Type a message, or paste an image",
      sendBlocked: "This conversation is currently taken over by another member",
      unknownFormat: "(Message still loading or unsupported format)",
      imageAlt: "Image",
      imageLabel: "Image",
      videoLabel: "Video",
      voiceMessage: "Voice message",
      fileLabel: "File",
      download: "Download",
      stickerAlt: "Sticker",
      locationAlt: "Location",
      openInMaps: "Open in Maps",
      contactCard: "Contact",
      contactCardLabel: "Contact card",
      unsupported: "Unsupported message type ({{type}})",
      revoked: "This message was deleted",
      reactionBy: "{{actor}} reacted",
      otherParty: "Other side",
      failedNoAttachmentImage: "image (missing attachment)",
      failedNoAttachmentVideo: "video (missing attachment)",
      failedNoAttachmentAudio: "audio (missing attachment)",
      failedNoAttachmentDocument: "document (missing attachment)"
    },
    context: {
      noConversation: "No conversation selected",
      directChat: "Direct chat",
      title: "Conversation info",
      memberCount: "{{count}} members",
      currentReplier: "Current replier",
      unassigned: "Unassigned",
      canReply: "You can reply",
      readOnly: "View only",
      supervisorAssign: "Supervisor assignment",
      members: "Members",
      admin: "Admin",
      member: "Member",
      noMembers: "No member data"
    }
  }
} as const;
