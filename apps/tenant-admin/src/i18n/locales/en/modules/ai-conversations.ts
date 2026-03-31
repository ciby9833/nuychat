export default {
  aiConversations: {
    filter: {
      allAiAgents: "All AI agents",
      refresh: "Refresh",
      total: "Conversations {{count}}",
      handoff: "Pending handoff {{count}}",
      transferred: "Transferred {{count}}"
    },
    status: {
      all: "All statuses",
      bot_active: "AI active",
      handoff_required: "Pending handoff",
      transferred: "Transferred to human"
    },
    datePreset: {
      today: "Today",
      yesterday: "Yesterday",
      last7d: "Last 7 Days",
      custom: "Custom"
    },
    list: {
      title: "Conversation List",
      count: "{{count}} items",
      empty: "No AI conversations",
      anonymousCustomer: "Anonymous Customer",
      noMessage: "No messages",
      highRisk: "High Risk",
      attention: "Needs Attention"
    },
    timeline: {
      emptyTitle: "Select a conversation from the left to view details",
      anonymousCustomer: "Anonymous Customer",
      unknownLanguage: "Unknown",
      humanHandling: "Handled by human",
      aiHandling: "Handled by AI",
      pendingHandoff: "Pending handoff",
      highRisk: "High Risk",
      attention: "Needs Attention",
      handoffReason: "Handoff reason: {{reason}}",
      riskReason: "Risk: {{reason}}",
      loading: "Loading...",
      noMessages: "No message history",
      aiName: "AI",
      humanName: "Human",
      reply: "Reply"
    },
    monitor: {
      emptyTitle: "Select a conversation to view monitoring details",
      sectionInfo: "Conversation Info",
      aiAgent: "AI Agent",
      customerTier: "Customer Tier",
      currentHandler: "Current Handler",
      currentHandlerHuman: "Human",
      currentHandlerAi: "AI",
      conversationStatus: "Conversation Status",
      assignedAgent: "Human Agent",
      lastAiReply: "Latest AI Reply",
      none: "None",
      standard: "standard",
      sectionIntervene: "Human Intervention",
      intervenePlaceholder: "Type a message to send directly to the customer...",
      sendHumanMessage: "Send Human Message",
      sectionActions: "Transfer & Actions",
      selectOnlineAgent: "Select an online agent",
      transferToAgent: "Transfer to Human Agent",
      forceClose: "Force Close Conversation",
      sectionTrace: "AI Trace ({{count}})",
      noTrace: "No AI Trace records",
      skills: "Skills: {{value}}",
      noSkills: "None",
      handoff: "Handoff: {{reason}}",
      error: "Error: {{error}}"
    },
    helper: {
      justNow: "Just now",
      minutesAgo: "{{count}}m ago",
      hoursAgo: "{{count}}h ago",
      today: "Today",
      yesterday: "Yesterday"
    },
    errors: {
      loadListFailed: "Failed to load AI conversations: {{message}}",
      loadDetailFailed: "Failed to load conversation details: {{message}}",
      interveneEmpty: "Please enter content to send to the customer",
      interveneSuccess: "Human intervention message queued",
      interveneFailed: "Intervention failed: {{message}}",
      transferEmpty: "Please select a target human agent",
      transferSuccess: "Conversation transferred to a human agent",
      transferFailed: "Human transfer failed: {{message}}",
      forceCloseSuccess: "Conversation force closed",
      forceCloseFailed: "Close failed: {{message}}"
    }
  }
};
