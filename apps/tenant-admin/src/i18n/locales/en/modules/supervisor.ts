export default {
  supervisorModule: {
    summary: {
      title: "Supervisor Workbench",
      refreshing: "Refreshing...",
      refresh: "Refresh",
      broadcast: "Broadcast",
      waitingQueue: "Waiting Queue",
      onlineAgents: "Online Agents",
      aiProcessing: "AI Processing",
      todayConversations: "Today's Conversations",
      slaBreaches: "SLA Breaches (Open)",
      todayCsat: "Today's CSAT"
    },
    filter: {
      title: "Filters",
      department: "Department",
      team: "Team",
      agent: "Agent",
      scopeAll: "All Conversations",
      scopeWaiting: "Waiting",
      scopeException: "Exceptional",
      scopeActive: "In Progress",
      scopeResolved: "Resolved",
      apply: "Apply Filters"
    },
    conversations: {
      title: "Conversation Monitoring",
      description: "Use this view to locate waiting, exceptional, and resolved conversations. For actual handling, go to Human Conversations.",
      customerConversation: "Customer / Conversation",
      conversationPrefix: "Conversation {{id}}",
      casePrefix: "Case {{id}}",
      channel: "Channel",
      currentResponsible: "Current Owner",
      reservedResponsible: "Reserved Owner",
      lastCustomerMessage: "Last Customer Message",
      waitingDuration: "Waiting Duration",
      minutes: "{{count}} min",
      firstResponse: "First Response",
      replied: "Replied",
      notReplied: "Not Replied",
      reassignCount: "Reassign Count",
      exceptionReason: "Exception Reason",
      organization: "Organization",
      status: "Status",
      actions: "Actions",
      viewConversation: "View Conversation",
      goHandle: "Handle",
      viewTooltip: "Open Human Conversations to view details and actions.",
      handleTooltip: "Supervisor workbench is for finding issues. Intervention, transfer, and closing should be done in Human Conversations.",
      empty: "-",
      aiSuffix: " (AI)"
    },
    agents: {
      title: "Agent Status",
      agent: "Agent",
      email: "Email",
      status: "Status",
      activeConversations: "Active Conversations",
      lastSeen: "Last Seen",
      empty: "-"
    },
    broadcastModal: {
      title: "Broadcast",
      placeholder: "Enter the message to send to all online agents"
    },
    messages: {
      loadFailed: "Failed to load supervisor workbench: {{message}}",
      broadcastRequired: "Please enter broadcast content",
      broadcastSuccess: "Broadcast sent to {{count}} online agents",
      broadcastFailed: "Broadcast failed: {{message}}"
    }
  }
};
