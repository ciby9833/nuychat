export default {
  waMonitor: {
    tab: "WA监控",
    pageTitle: "WA账号监控",
    refresh: "刷新",
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
      warning: "提醒"
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
        reconnect: "重连"
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
    report: {
      title: "日报 / {{date}}",
      totalMessages: "总消息数",
      manualReplies: "人工回复数",
      avgResponse: "平均响应时间",
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
