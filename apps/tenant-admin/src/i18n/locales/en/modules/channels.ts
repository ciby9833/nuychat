export default {
  channelsModule: {
    grid: {
      filterTitle: "Channel Filters",
      allTypes: "All Channels",
      allStatuses: "All Statuses",
      listTitle: "Channel List",
      count: "{{count}} items",
      refresh: "Refresh",
      editConfig: "Edit Configuration",
      bindWhatsApp: "Bind WhatsApp",
      rebindWhatsApp: "Rebind WhatsApp"
    },
    detail: {
      title: "Channel Details",
      empty: "Select a channel card to view details first.",
      channelType: "Channel Type",
      status: "Status",
      channelId: "Channel ID",
      identifier: "Identifier",
      webHint: "Use `publicChannelKey` when embedding a web channel. You can copy the code below directly.",
      webIdentifier: "Web Identifier",
      customerUrl: "Direct Customer URL",
      embedCode: "Embed Code",
      copy: "Copy",
      copyEmbedCode: "Copy Embed Code",
      whatsappBound: "WhatsApp binding completed",
      whatsappUnbound: "WhatsApp number is not bound yet",
      whatsappEnabledDesc: "Click the button below to open Meta Embedded Signup and complete number authorization and binding.",
      whatsappDisabledDesc: "Meta Embedded Signup is not configured on the platform yet, so binding cannot be started.",
      platformWebhookUrl: "Platform Webhook URL",
      displayNumber: "Display Number",
      businessAccount: "Business Account",
      copyWebhookUrl: "Copy Webhook URL",
      webhookIntroTitle: "Webhook channels are used for third-party HTTP integrations",
      webhookIntroDesc: "Third-party systems POST customer messages to the generated inbound URL; NuyChat POSTs replies to your configured outbound callback URL.",
      inboundUrl: "System Inbound URL",
      outboundUrl: "Third-Party Outbound Callback URL",
      webhookSecret: "Webhook Secret",
      configured: "Configured",
      notConfigured: "Not Configured",
      copyInboundUrl: "Copy Inbound URL",
      configureOutbound: "Configure Outbound Callback",
      webhookReadonlyHint: "`System Inbound URL` is generated automatically from `API_PUBLIC_BASE` and the current `channel_id`, and cannot be edited manually."
    },
    modal: {
      title: "Edit Channel Configuration",
      titleWithType: "Edit Channel Configuration - {{type}}",
      channelId: "Channel ID",
      channelIdRequired: "Please enter a channel ID",
      channelIdPlaceholder: "Example: web-demo / whatsapp-demo",
      active: "Enabled",
      widgetName: "Widget Name",
      widgetNamePlaceholder: "Example: NuyChat Web",
      publicChannelKey: "Web Identifier (publicChannelKey)",
      publicChannelKeyRequired: "Please enter publicChannelKey",
      publicChannelKeyPlaceholder: "Example: wc-your-tenant",
      allowedOrigins: "Allowed Origins (comma-separated)",
      allowedOriginsPlaceholder: "Example: http://localhost:5176,https://www.example.com",
      thirdPartyOutboundUrl: "Third-Party Outbound Callback URL"
    },
    status: {
      active: "active",
      inactive: "inactive"
    },
    helper: {
      copySuccess: "{{title}} copied",
      copyFailed: "Copy failed, please copy manually"
    },
    signup: {
      sdkInitTimeout: "Facebook SDK initialization timed out",
      sdkLoadFailed: "Failed to load Facebook SDK",
      signupTimeout: "Embedded Signup timed out or returned no binding result",
      authIncomplete: "Meta authorization was not completed"
    },
    messages: {
      configUpdated: "Channel configuration updated",
      embeddedSignupMissing: "Meta Embedded Signup is not configured on the platform yet",
      whatsappBound: "WhatsApp number bound"
    }
  }
};
