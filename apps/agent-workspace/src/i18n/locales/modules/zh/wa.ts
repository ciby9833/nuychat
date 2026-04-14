export default {
  wa: {
    common: {
      whatsapp: "WhatsApp",
      loading: "加载中…",
      waShort: "WA"
    },
    workspace: {
      offlineTitle: "账号已离线",
      offlineDetail: "当前 WhatsApp 账号未连接，请联系管理员重新登录后再使用工作台。"
    },
    conversationList: {
      tabs: {
        chats: "聊天",
        groups: "群聊",
        channels: "频道"
      },
      allAccounts: "全部账号",
      syncTitle: "同步群组与通讯录",
      searchPlaceholder: "搜索或开始新聊天",
      assignedToMeOnly: "只看我当前接管",
      listLoading: "加载中…",
      noMessage: "暂无消息",
      unassigned: "未接管",
      empty: {
        search: "没有匹配的会话",
        channels: "暂无频道消息",
        groups: "暂无群聊",
        chats: "暂无会话"
      },
      contacts: "联系人",
      avatarAlt: "头像"
    },
    chat: {
      selectConversation: "选择会话",
      unassigned: "未接管",
      directChat: "单聊",
      takeover: "接管",
      takeoverLoading: "接管中...",
      release: "释放",
      releaseLoading: "释放中...",
      loadingConversation: "会话加载中...",
      loadMore: "加载更多历史消息",
      loadMoreLoading: "加载中...",
      unreadDivider: "{{count}} 条未读消息",
      quotedMessage: "引用消息",
      mediaMessage: "媒体消息",
      reply: "回复",
      sendFailed: "发送失败",
      emptyConversation: "这个聊天暂时还没有消息",
      quoteReply: "引用回复",
      clearQuote: "取消引用",
      mention: "提及",
      mentionMembers: "提及群成员",
      attachment: "附件",
      composerPlaceholder: "输入消息内容，或粘贴图片",
      sendBlocked: "当前由其他成员接管，无法发送消息",
      unknownFormat: "（消息内容加载中或格式未知）",
      imageAlt: "图片",
      imageLabel: "图片",
      videoLabel: "视频",
      voiceMessage: "语音消息",
      fileLabel: "文件",
      download: "下载",
      stickerAlt: "贴纸",
      locationAlt: "位置",
      openInMaps: "在地图中查看",
      contactCard: "联系人",
      contactCardLabel: "联系人名片",
      unsupported: "此消息类型暂不支持（{{type}}）",
      revoked: "此消息已被撤回",
      reactionBy: "{{actor}} 回应了",
      otherParty: "对方",
      failedNoAttachmentImage: "image (无附件)",
      failedNoAttachmentVideo: "video (无附件)",
      failedNoAttachmentAudio: "audio (无附件)",
      failedNoAttachmentDocument: "document (无附件)"
    },
    context: {
      noConversation: "未选择会话",
      directChat: "单聊",
      title: "会话信息",
      memberCount: "{{count}} 位成员",
      currentReplier: "当前回复人",
      unassigned: "未接管",
      canReply: "你可以回复",
      readOnly: "你当前仅可查看",
      supervisorAssign: "主管分配",
      members: "成员",
      admin: "管理员",
      member: "成员",
      noMembers: "当前没有成员数据"
    }
  }
} as const;
