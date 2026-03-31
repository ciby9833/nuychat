export default {
  channelsModule: {
    grid: {
      filterTitle: "渠道筛选",
      allTypes: "全部渠道",
      allStatuses: "全部状态",
      listTitle: "渠道列表",
      count: "{{count}} 条",
      refresh: "刷新",
      editConfig: "编辑配置",
      bindWhatsApp: "绑定 WhatsApp",
      rebindWhatsApp: "重新绑定 WhatsApp"
    },
    detail: {
      title: "渠道详情",
      empty: "请先点击一个渠道卡片查看详情。",
      channelType: "渠道类型",
      status: "状态",
      channelId: "渠道ID",
      identifier: "标识",
      webHint: "Web 渠道嵌入时请使用 `publicChannelKey`，可直接复制以下代码。",
      webIdentifier: "Web 标识",
      customerUrl: "客户直连地址",
      embedCode: "嵌入代码",
      copy: "复制",
      copyEmbedCode: "复制嵌入代码",
      whatsappBound: "已完成 WhatsApp 绑定",
      whatsappUnbound: "尚未绑定 WhatsApp 号码",
      whatsappEnabledDesc: "点击下方按钮打开 Meta Embedded Signup，完成号码授权和绑定。",
      whatsappDisabledDesc: "平台尚未完成 Meta Embedded Signup 配置，当前无法发起绑定。",
      platformWebhookUrl: "平台 Webhook URL",
      displayNumber: "显示号码",
      businessAccount: "Business Account",
      copyWebhookUrl: "复制 Webhook URL",
      webhookIntroTitle: "Webhook 渠道用于第三方系统 HTTP 接入",
      webhookIntroDesc: "第三方系统把客户消息 POST 到系统生成的入站地址；NuyChat 会把回复 POST 到你配置的出站回调地址。",
      inboundUrl: "系统入站地址",
      outboundUrl: "第三方出站回调地址",
      webhookSecret: "Webhook Secret",
      configured: "已配置",
      notConfigured: "未配置",
      copyInboundUrl: "复制入站地址",
      configureOutbound: "配置出站回调",
      webhookReadonlyHint: "`系统入站地址` 由 `API_PUBLIC_BASE` 和当前 `channel_id` 自动生成，不能手改。"
    },
    modal: {
      title: "编辑渠道配置",
      titleWithType: "编辑渠道配置 · {{type}}",
      channelId: "渠道ID",
      channelIdRequired: "请输入渠道ID",
      channelIdPlaceholder: "例如：web-demo / whatsapp-demo",
      active: "启用",
      widgetName: "Widget 名称",
      widgetNamePlaceholder: "例如：NuyChat Web",
      publicChannelKey: "Web 标识 (publicChannelKey)",
      publicChannelKeyRequired: "请输入 publicChannelKey",
      publicChannelKeyPlaceholder: "例如：demo-web-public",
      allowedOrigins: "允许来源 (逗号分隔)",
      allowedOriginsPlaceholder: "例如：http://localhost:5176,https://www.example.com",
      thirdPartyOutboundUrl: "第三方出站回调地址"
    },
    status: {
      active: "active",
      inactive: "inactive"
    },
    helper: {
      copySuccess: "{{title}} 已复制",
      copyFailed: "复制失败，请手动复制"
    },
    signup: {
      sdkInitTimeout: "Facebook SDK 初始化超时",
      sdkLoadFailed: "加载 Facebook SDK 失败",
      signupTimeout: "Embedded Signup 超时或未返回绑定结果",
      authIncomplete: "Meta 授权未完成"
    },
    messages: {
      configUpdated: "渠道配置已更新",
      embeddedSignupMissing: "平台尚未配置 Meta Embedded Signup",
      whatsappBound: "WhatsApp 号码已绑定"
    }
  }
};
