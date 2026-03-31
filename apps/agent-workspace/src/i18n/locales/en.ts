import skillAssist from "./modules/en/skill-assist";

export default {
  login: {
    subtitle: "Agent access required to enter workspace",
    emailLabel: "Email",
    emailPlaceholder: "Enter your email",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    loading: "Signing in…",
    submit: "Enter Workspace",
    noAgentAccess: "Account has no agent access"
  },
  header: {
    title: "NuyChat Workspace",
    agent: "Agent",
    unbound: "Unbound",
    socket: {
      connected: "Connected",
      error: "Connection failed",
      disconnected: "Disconnected",
      connecting: "Connecting…"
    },
    language: "Language",
    logout: "Sign Out"
  },
  inbox: {
    views: { all: "All", mine: "Mine", follow_up: "Follow-up" },
    search: "Search customers, messages…",
    tier: { all: "All", vip: "VIP", premium: "Premium", standard: "Standard" },
    followUpHint: "Conversations with open tickets",
    empty: "No conversations",
    unknown: "Unknown Customer",
    noMessage: "(No messages)",
    myOpenTicket: "Has open ticket",
    loading: "Loading…"
  },
  timeline: {
    selectConversation: "Select a conversation",
    processing: "Processing…",
    assign: "Take Over",
    handoff: "Return to AI",
    transfer: "Transfer",
    transferring: "Transferring…",
    resolve: "Resolve",
    resolved: "✓ Resolved",
    lockedBanner: "🔒 Read-only · Assigned to another agent",
    resolveBanner: "{{count}} open ticket(s) remaining",
    endConversation: "End Conversation",
    cancel: "Cancel",
    transferTitle: "Transfer to:",
    selectAgent: "— Select agent —",
    transferNote: "Note (optional)",
    confirmTransfer: "Confirm Transfer",
    closePreview: "Close image preview",
    copyFailed: "Copy failed. Check browser permissions.",
    deleted: "[Deleted]",
    attachment: "[Attachment]",
    message: "[Message]",
    nonText: "[Non-text message]"
  },
  composer: {
    replyPrefix: "Reply:",
    cancelReply: "Cancel reply",
    removeAttachment: "Remove attachment",
    clearAttachments: "Clear attachments",
    clear: "Clear",
    retry: "Retry",
    retryUpload: "Retry upload",
    uploadFailed: "Failed: {{error}}",
    placeholderLocked: "Read-only · Cannot reply",
    placeholderResolved: "Send a message to reactivate…",
    placeholderOwned: "Type a message…",
    placeholderNotOwned: "Take over to reply",
    emoji: "Emoji",
    addAttachment: "Add attachment",
    sticker: "Send sticker",
    send: "Send",
    enterToSend: "Enter to send",
    charCount: "{{count}} chars",
    tools: {
      summary: "Summary",
      summaryTitle: "Summarize customer issue",
      polish: "Polish",
      polishTitle: "Improve current draft",
      translate: "Translate",
      translateTitle: "Translate to customer language"
    }
  },
  msgList: {
    selectHint: "Select a conversation to start",
    noMessages: "No messages",
    replyLabel: "Reply",
    react: "React",
    moreActions: "More actions",
    quoteReply: "Quote reply",
    addToTask: "Add to task",
    copyContent: "Copy",
    attachment: "Attachment",
    unknown: "Unknown",
    preview: "Preview",
    download: "Download",
    msgStatus: {
      read: "Read",
      delivered: "Delivered",
      sent: "Sent",
      failed: "Failed",
      deleted: "Deleted"
    }
  },
  rp: {
    tabs: { case: "Case", customer: "Customer", copilot: "AI", skills: "Skills", orders: "Tasks" },
    case: {
      empty: "No case",
      id: "Case ID",
      status: "Status",
      type: "Type",
      title: "Title",
      openedAt: "Opened",
      lastActivity: "Last activity",
      summary: "Summary",
      noSummary: "No summary",
      tasks: "Tickets",
      noTasks: "No tickets"
    },
    customer: {
      tabs: { base: "Info", history: "History", orders: "Orders", analysis: "AI Analysis" },
      name: "Name",
      customerId: "Customer ID",
      tier: "Tier",
      channel: "Channel",
      language: "Language",
      firstContact: "First contact",
      noHistory: "No history",
      unnamed: "Unnamed",
      orderClues: "Order clues",
      noOrderClues: "No orders",
      analysisSummary: "Customer Analysis",
      noAnalysis: "No analysis",
      currentIntent: "Intent: {{value}}",
      currentSentiment: "Sentiment: {{value}}",
      profileSummary: "Profile Summary",
      currentConversation: "Current Conversation",
      keyMemory: "Key Memories",
      currentState: "Current State",
      agentSuggestion: "Agent Suggestions",
      longTermMemory: "Long-term Memory",
      activeState: "Active States",
      noStateDetail: "No details",
      sentimentTrend: "Sentiment Trend",
      knowledgeRec: "Knowledge Recommendations",
      noContent: "No content"
    },
    copilot: {
      summary: "Conversation Summary",
      noSummary: "No summary",
      intentSentiment: "Intent · Sentiment",
      aiTrace: "AI Reasoning Traces",
      noTrace: "No AI orchestration triggered",
      skillsLabel: "Skills:",
      handoffLabel: "Handoff:",
      errorLabel: "Error:",
      steps: "Steps ({{count}})"
    },
    skills: {
      recommended: "AI Recommended Skills",
      noRecommendation: "No recommendations",
      useOnly: "Use only",
      addPref: "Add pref",
      execute: "Execute",
      executing: "Executing…",
      applyTop3: "Apply Top 3",
      clearPrefs: "Clear prefs",
      skillDone: "Completed",
      installed: "Installed Skills",
      needsParams: "Needs params",
      collapse: "Collapse",
      required: "Required",
      confirm: "Execute",
      cancelParam: "Cancel"
    },
    orders: {
      title: "Tasks",
      create: "+ New task",
      cancelCreate: "Cancel",
      quotedMsg: "Quoted: {{preview}}",
      titlePlaceholder: "Task title *",
      descPlaceholder: "Description (optional)",
      assigneePlaceholder: "Assignee (optional)",
      confirm: "Create",
      creating: "Creating…",
      orderMarks: "Order refs",
      loading: "Loading…",
      empty: "No tasks",
      start: "Start",
      done: "Done",
      dueAt: "Due {{time}}",
      createdAt: "Created {{time}}",
      quoted: "Quoted: {{preview}}",
      status: {
        open: "Open",
        in_progress: "In Progress",
        done: "Done",
        cancelled: "Cancelled"
      }
    },
    memoryType: {
      unresolved_issue: "Unresolved Issue",
      preference: "Preference",
      fact: "Customer Fact",
      commitment: "Commitment",
      outcome: "Outcome",
      risk_flag: "Risk Flag",
      profile_trait: "Profile Trait"
    }
  },
  emoji: {
    search: "Search emoji…",
    searchResults: "Search results",
    empty: "No emoji",
    recent: "Recent",
    recentUsed: "Recently used",
    categories: {
      smileys: "Smileys",
      hands: "Gestures",
      animals: "Animals",
      food: "Food",
      activities: "Activities",
      travel: "Travel",
      objects: "Objects",
      symbols: "Symbols"
    }
  },
  utils: {
    today: "Today",
    yesterday: "Yesterday",
    convStatus: {
      open: "Active",
      queued: "Queued",
      bot_active: "AI Active",
      human_active: "Agent Active",
      resolved: "Resolved"
    },
    sentiment: {
      positive: "Positive",
      neutral: "Neutral",
      negative: "Negative",
      angry: "Angry"
    },
    intent: {
      order_inquiry: "Order Inquiry",
      delivery_inquiry: "Delivery Inquiry",
      refund_request: "Refund",
      cancellation: "Cancellation",
      complaint: "Complaint",
      payment_inquiry: "Payment",
      general_inquiry: "General Inquiry"
    }
  },
  validation: {
    stickerOnlyWebp: "WhatsApp stickers require WEBP format",
    unsupportedType: "File type not supported",
    fileTooLarge: "File exceeds limit: max {{size}}MB"
  },
  ...skillAssist
} as const;
