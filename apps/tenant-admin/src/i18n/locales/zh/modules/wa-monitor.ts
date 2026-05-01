export default {
  waMonitor: {
    tab: "WA监控",
    pageTitle: "WA账号监控",
    refresh: "刷新",
    backfill: {
      button: "增量分析",
      success: "已扫描 {{scanned}} 条，处理 {{processed}} 条"
    },
    judgment: {
      button: "WA智能对话判断",
      title: "WA智能对话判断",
      enabled: "启用 AI 判断",
      prompt: "判断说明",
      promptRequired: "请输入判断说明",
      conditions: "识别条件",
      conditionsRequired: "请输入识别条件",
      save: "保存",
      cancel: "取消",
      saveSuccess: "WA智能对话判断配置已保存",
      updatedAt: "更新于 {{value}}"
    },
    providerUnavailable: "WhatsApp provider 当前不可用",
    providerUnavailableDesc: "请先检查 WA 运行时配置。",
    stats: {
      accountCount: "账号数",
      online: "在线",
      connecting: "连接中",
      offline: "离线",
      criticalAlert: "严重告警",
      warningAlert: "一般告警"
    },
    alerts: {
      title: "关键告警",
      empty: "当前没有活跃告警",
      critical: "严重",
      warning: "提醒",
      expand: "展开全部 {{count}} 条",
      collapse: "收起"
    },
    health: {
      title: "账号健康仪表盘",
      provider: "Provider",
      currentStatus: "当前状态",
      lastConnected: "最近连接",
      lastDisconnected: "最近掉线",
      connectionState: "连接态",
      loginPhase: "登录阶段",
      heartbeatAt: "心跳时间",
      reconnectCount: "重连次数",
      loginMode: "登录入口",
      disconnectReason: "掉线原因",
      noSession: "暂无session",
      empty: "暂无",
      loading: "加载中..."
    },
    pane: {
      title: "独立 WA 账号池",
      accountCount: "账号数 {{count}}",
      onlineCount: "在线 {{count}}",
      refresh: "刷新",
      create: "新增WA账号",
      description: "WA 账号管理仍放在当前坐席与成员管理区域内，成员 WA Seat 开关也在本页协同维护。",
      table: {
        account: "账号",
        status: "状态",
        owner: "负责人",
        members: "协同成员",
        lastConnected: "最近连接",
        actions: "操作",
        unset: "未设置",
        empty: "暂无"
      },
      actions: {
        startLogin: "扫码登录",
        manageMembers: "成员分配",
        viewHealth: "健康状态",
        logout: "退出WA",
        reconnect: "重连",
        delete: "删除",
        deleteConfirm: "确认删除此WA账号？",
        deleteWarning: "删除后将清除该账号所有会话与消息记录，此操作不可恢复。",
        deleteSuccess: "WA账号已删除",
        deleteOk: "确认删除",
        deleteCancel: "取消"
      },
      createModal: {
        title: "新增WA账号",
        name: "账号名称",
        nameRequired: "请输入账号名称",
        namePlaceholder: "销售一组主号",
        phone: "手机号",
        phonePlaceholder: "+6281234567890",
        owner: "负责人",
        optional: "可选",
        success: "WA账号已创建"
      },
      loginModal: {
        title: "扫码登录: {{name}}",
        retry: "重新扫码",
        close: "关闭",
        rescan: "请重新扫码",
        refreshingQr: "二维码刷新中",
        refreshAfter: "将在 {{value}} 后刷新",
        disconnectReason: "掉线原因: {{value}}",
        connectedSuccess: "WA账号 {{name}} 已连接成功",
        loggedOutSuccess: "已退出 WA 会话"
      },
      accessModal: {
        title: "成员分配: {{name}}",
        owner: "负责人",
        ownerPlaceholder: "选择负责员工",
        members: "协同成员",
        membersPlaceholder: "选择可查看/协同成员",
        success: "WA账号成员分配已更新"
      },
      reconnectSuccess: "已触发重连",
      healthModal: {
        title: "健康状态: {{name}}"
      }
    },
    insightTabs: {
      report: "每日会话分析报表",
      replyPool: "智能待回复池"
    },
    reportTabs: {
      health: "账号健康",
      accounts: "按 WA 账号",
      members: "按客服",
      time: "按时间",
      messages: "消息明细",
      unreplied: "未回复明细"
    },
    report: {
      title: "日报 / {{date}}",
      totalMessages: "总消息数",
      customerMessages: "客户消息数",
      serviceMessages: "客服消息数",
      manualReplies: "人工回复数",
      requiresReply: "需回复",
      replied: "已回复",
      unreplied: "未回复",
      avgResponse: "平均响应时间",
      accountReport: "按 WA 账号",
      memberReport: "按客服成员",
      account: "账号",
      member: "客服成员",
      unknownMember: "未知成员",
      conversation: "会话",
      type: "类型",
      preview: "消息预览",
      customerMessage: "客户消息",
      sender: "发送人",
      context: "上下文",
      agent: "客服",
      analysisReason: "判断理由",
      confidence: "置信度",
      firstReplyAt: "首次回复时间",
      firstReplyText: "首次回复内容",
      yes: "是",
      no: "否",
      customerMessageAt: "客户消息时间",
      timeBucket: "时间",
      byHour: "按小时",
      byDay: "按天",
      exportExcel: "导出 Excel",
      paginationTotal: "共 {{count}} 条",
      monitoredConversations: "监控会话",
      firstReplies: "首次回复",
      avgFirstReply: "平均首次回复",
      participatedConversations: "参与会话",
      unrepliedTop10: "未回复消息 Top 10",
      noUnreplied: "暂无未回复消息",
      waiting: "等待 {{value}}"
    },
    replyPool: {
      title: "智能待回复池",
      description: "仅按需加载。这里是规则筛出的待人工关注会话，不参与首屏加载。",
      empty: "当前没有待回复项",
      group: "群聊",
      direct: "私聊",
      unread: "未读 {{count}}",
      waiting: "等待 {{value}}",
      unassigned: "未接管"
    }
  }
};
