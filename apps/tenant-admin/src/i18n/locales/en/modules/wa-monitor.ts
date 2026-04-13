export default {
  waMonitor: {
    tab: "WA Monitor",
    pageTitle: "WA Account Monitor",
    refresh: "Refresh",
    providerUnavailable: "WhatsApp provider is unavailable",
    providerUnavailableDesc: "Check the WA runtime configuration first.",
    stats: {
      accountCount: "Accounts",
      online: "Online",
      connecting: "Connecting",
      offline: "Offline",
      criticalAlert: "Critical Alerts",
      warningAlert: "Warnings"
    },
    alerts: {
      title: "Critical Alerts",
      empty: "No active alerts",
      critical: "Critical",
      warning: "Warning"
    },
    health: {
      title: "Account Health Dashboard",
      provider: "Provider",
      currentStatus: "Current Status",
      lastConnected: "Last Connected",
      lastDisconnected: "Last Disconnected",
      connectionState: "Connection State",
      loginPhase: "Login Phase",
      heartbeatAt: "Heartbeat",
      reconnectCount: "Reconnect Count",
      loginMode: "Login Mode",
      disconnectReason: "Disconnect Reason",
      noSession: "No session",
      empty: "N/A",
      loading: "Loading..."
    },
    pane: {
      title: "Standalone WA Account Pool",
      accountCount: "Accounts {{count}}",
      onlineCount: "Online {{count}}",
      refresh: "Refresh",
      create: "New WA Account",
      description: "WA account management stays in the current seats and members area, and the member WA Seat switch is also maintained here.",
      table: {
        account: "Account",
        status: "Status",
        owner: "Owner",
        members: "Collaborators",
        lastConnected: "Last Connected",
        actions: "Actions",
        unset: "Unset",
        empty: "N/A"
      },
      actions: {
        startLogin: "Scan Login",
        manageMembers: "Assign Members",
        viewHealth: "Health",
        logout: "Logout WA",
        reconnect: "Reconnect",
        delete: "Delete",
        deleteConfirm: "Delete this WA account?",
        deleteWarning: "This will permanently remove all conversations and messages. This action cannot be undone.",
        deleteSuccess: "WA account deleted",
        deleteOk: "Delete",
        deleteCancel: "Cancel"
      },
      createModal: {
        title: "New WA Account",
        name: "Account Name",
        nameRequired: "Enter an account name",
        namePlaceholder: "Sales Team Main",
        phone: "Phone Number",
        phonePlaceholder: "+6281234567890",
        owner: "Owner",
        optional: "Optional",
        success: "WA account created"
      },
      loginModal: {
        title: "Scan Login: {{name}}",
        retry: "Scan Again",
        close: "Close",
        rescan: "Please rescan",
        refreshingQr: "Refreshing QR",
        refreshAfter: "Refreshes in {{value}}",
        disconnectReason: "Disconnect reason: {{value}}",
        connectedSuccess: "WA account {{name}} connected successfully",
        loggedOutSuccess: "WA session logged out"
      },
      accessModal: {
        title: "Assign Members: {{name}}",
        owner: "Owner",
        ownerPlaceholder: "Select owner",
        members: "Collaborators",
        membersPlaceholder: "Select view/collab members",
        success: "WA account members updated"
      },
      reconnectSuccess: "Reconnect triggered",
      healthModal: {
        title: "Health Status: {{name}}"
      }
    },
    insightTabs: {
      report: "Daily Conversation Report",
      replyPool: "Smart Reply Pool"
    },
    report: {
      title: "Daily Report / {{date}}",
      totalMessages: "Total Messages",
      manualReplies: "Manual Replies",
      avgResponse: "Average Response Time",
      unrepliedTop10: "Top 10 Unreplied",
      noUnreplied: "No unreplied messages",
      waiting: "Waiting {{value}}"
    },
    replyPool: {
      title: "Smart Reply Pool",
      description: "Loaded on demand. These are conversations flagged by rules for human follow-up and are not part of the first screen load.",
      empty: "No pending follow-up items",
      group: "Group",
      direct: "Direct",
      unread: "Unread {{count}}",
      waiting: "Waiting {{value}}",
      unassigned: "Unassigned"
    }
  }
};
