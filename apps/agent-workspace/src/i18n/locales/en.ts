import messages from "./modules/en/messages";
import skillAssist from "./modules/en/skill-assist";
import tasks from "./modules/en/tasks";

export default {
  ...messages,
  ...tasks,
  nav: {
    home: "Home",
    messages: "Messages",
    tasks: "Tasks"
  },
  home: {
    title: "Workspace Overview",
    cards: {
      unread: "Unread Messages",
      tasks: "My Tasks",
      urgent: "High Priority"
    },
    unreadSection: "Unread Conversations",
    taskSection: "Open Tasks",
    openMessages: "Open Messages",
    openTasks: "Open Tasks",
    emptyUnread: "No unread conversations right now",
    emptyTasks: "No open tasks right now",
    unknown: "Unknown Customer",
    noMessage: "(No messages)"
  },
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
  ...skillAssist
} as const;
