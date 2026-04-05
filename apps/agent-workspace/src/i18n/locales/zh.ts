import messages from "./modules/zh/messages";
import skillAssist from "./modules/zh/skill-assist";
import tasks from "./modules/zh/tasks";

export default {
  ...messages,
  ...tasks,
  nav: {
    home: "首页",
    messages: "消息",
    tasks: "任务",
    whatsapp: "WA"
  },
  home: {
    title: "工作总览",
    cards: {
      unread: "未读消息",
      tasks: "我的任务",
      urgent: "高优任务"
    },
    unreadSection: "未读会话",
    taskSection: "待处理任务",
    openMessages: "进入消息页",
    openTasks: "进入任务页",
    emptyUnread: "当前没有新的未读会话",
    emptyTasks: "当前没有待处理任务",
    unknown: "未知客户",
    noMessage: "(暂无消息)"
  },
  login: {
    subtitle: "需开启接待权限方可登录",
    emailLabel: "邮箱",
    emailPlaceholder: "请输入邮箱",
    passwordLabel: "密码",
    passwordPlaceholder: "请输入密码",
    loading: "登录中…",
    submit: "进入工作台",
    noAgentAccess: "当前账号未开通客服或WhatsApp工作台资格"
  },
  header: {
    title: "NuyChat 工作台",
    agent: "坐席",
    unbound: "未绑定",
    socket: {
      connected: "实时连接正常",
      error: "连接失败",
      disconnected: "已断开",
      connecting: "连接中…"
    },
    language: "语言",
    logout: "退出登录"
  },
  ...skillAssist
} as const;
