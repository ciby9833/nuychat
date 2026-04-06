/**
 * 作用:
 * - 统一 WA 账号 session 的展示态与可执行动作规则。
 *
 * 交互:
 * - 被账号列表、健康接口、登录任务返回复用。
 * - 前端仅消费这里产出的 uiStatus/actions，不再自行猜测登录状态。
 */

export type WaUiStatusCode =
  | "never_logged_in"
  | "qr_required"
  | "qr_scanned"
  | "connecting"
  | "syncing"
  | "connected"
  | "session_expired"
  | "failed"
  | "offline";

export type WaUiStatus = {
  code: WaUiStatusCode;
  label: string;
  detail: string;
  tone: "default" | "warning" | "success" | "danger" | "processing";
};

export type WaSyncStatusCode =
  | "none"
  | "syncing_history"
  | "syncing_chats"
  | "syncing_groups"
  | "ready";

export type WaSyncStatus = {
  code: WaSyncStatusCode;
  label: string;
  detail: string;
  tone: "default" | "warning" | "success" | "danger" | "processing";
};

export type WaSessionSnapshot = {
  connectionState: string;
  loginPhase: string | null;
  disconnectReason: string | null;
  qrCodeAvailable: boolean;
  historySyncedAt?: string | null;
  chatsSyncedAt?: string | null;
  groupsSyncedAt?: string | null;
  hasGroupChats?: boolean | null;
};

export function normalizeWaSessionSnapshot<T extends WaSessionSnapshot | null>(session: T): T {
  if (!session) return session;
  const syncReady =
    Boolean(session.historySyncedAt) &&
    Boolean(session.chatsSyncedAt) &&
    (!session.hasGroupChats || Boolean(session.groupsSyncedAt));

  if (session.connectionState === "open" && syncReady) {
    return {
      ...session,
      loginPhase: "connected"
    } as T;
  }

  return session;
}

export function deriveWaAccountStatus(input: {
  storedAccountStatus?: string | null;
  session: WaSessionSnapshot | null;
}) {
  const session = normalizeWaSessionSnapshot(input.session);
  if (!session) {
    return input.storedAccountStatus ?? "offline";
  }
  if (session.connectionState === "open") {
    return "online";
  }
  if (["qr_required", "qr_scanned", "connecting", "syncing"].includes(session.loginPhase ?? "")) {
    return "pending_login";
  }
  if (session.disconnectReason === "401") {
    return "offline";
  }
  if (["close", "idle"].includes(session.connectionState)) {
    return "offline";
  }
  return input.storedAccountStatus ?? "offline";
}

export function deriveWaUiStatus(input: {
  accountStatus: string;
  session: WaSessionSnapshot | null;
}): WaUiStatus {
  const session = normalizeWaSessionSnapshot(input.session);
  if (!session) {
    return {
      code: "never_logged_in",
      label: "未登录",
      detail: "当前账号尚未建立 WhatsApp 会话。",
      tone: "default"
    };
  }

  if (session.disconnectReason === "401") {
    return {
      code: "session_expired",
      label: "会话失效",
      detail: "当前登录已失效，需要重新扫码登录。",
      tone: "danger"
    };
  }

  switch (session.loginPhase) {
    case "qr_required":
      return {
        code: "qr_required",
        label: "扫码中",
        detail: session.qrCodeAvailable ? "请使用 WhatsApp 扫码登录。" : "正在准备二维码，请稍候。",
        tone: "warning"
      };
    case "qr_scanned":
      return {
        code: "qr_scanned",
        label: "已扫码",
        detail: "请在手机 WhatsApp 中确认继续登录。",
        tone: "processing"
      };
    case "connecting":
      return {
        code: "connecting",
        label: "连接中",
        detail: "系统正在与 WhatsApp 建立会话。",
        tone: "processing"
      };
    case "syncing":
      return {
        code: "connected",
        label: "在线",
        detail: "账号已登录，后台正在继续同步数据。",
        tone: "success"
      };
    case "connected":
      return {
        code: "connected",
        label: "在线",
        detail: "账号已连接，可进入 WA 工作台处理消息。",
        tone: "success"
      };
    case "failed":
      return {
        code: "failed",
        label: "登录失败",
        detail: "连接已中断，请重新发起扫码。",
        tone: "danger"
      };
    default:
      if (input.accountStatus === "online") {
        return {
          code: "connected",
          label: "在线",
          detail: "账号已连接，可进入 WA 工作台处理消息。",
          tone: "success"
        };
      }
      return {
        code: "offline",
        label: "离线",
        detail: "当前账号未处于在线状态。",
          tone: "default"
      };
  }
}

export function deriveWaSyncStatus(input: {
  uiStatusCode: WaUiStatusCode;
  session: WaSessionSnapshot | null;
}): WaSyncStatus {
  const session = normalizeWaSessionSnapshot(input.session);
  if (input.uiStatusCode !== "connected" || !session) {
    return {
      code: "none",
      label: "未同步",
      detail: "当前账号未进入后台同步阶段。",
      tone: "default"
    };
  }

  if (!session.historySyncedAt) {
    return {
      code: "syncing_history",
      label: "同步消息",
      detail: "已登录成功，正在同步历史消息。",
      tone: "processing"
    };
  }

  if (!session.chatsSyncedAt) {
    return {
      code: "syncing_chats",
      label: "同步会话",
      detail: "正在同步聊天列表与联系人会话。",
      tone: "processing"
    };
  }

  if (session.hasGroupChats && !session.groupsSyncedAt) {
    return {
      code: "syncing_groups",
      label: "同步群组",
      detail: "正在同步群聊和群成员数据。",
      tone: "processing"
    };
  }

  return {
    code: "ready",
    label: "同步完成",
    detail: "消息、会话与群组数据已完成初始化同步。",
    tone: "success"
  };
}

export function deriveWaActions(input: {
  lastConnectedAt: string | null;
  session: WaSessionSnapshot | null;
}) {
  const session = normalizeWaSessionSnapshot(input.session);
  const loginInProgress = ["qr_required", "qr_scanned", "connecting", "syncing"].includes(session?.loginPhase ?? "");
  const connected = session?.connectionState === "open" && session?.loginPhase === "connected";
  const sessionExpired = session?.disconnectReason === "401";
  const canReconnect = Boolean(input.lastConnectedAt) && !loginInProgress && !sessionExpired;
  const canLogout = Boolean(session) && !loginInProgress;
  const canStartLogin = !connected && !loginInProgress;

  return {
    canStartLogin,
    canManageMembers: true,
    canViewHealth: true,
    canLogout,
    logoutReason: !session
      ? "当前账号还没有登录会话"
      : loginInProgress
        ? "当前账号正在登录中"
        : null,
    canReconnect,
    startLoginReason: connected
      ? "当前账号已在线，无需重新扫码登录"
      : loginInProgress
        ? "当前账号正在登录中"
        : null,
    reconnectReason: !input.lastConnectedAt
      ? "请先完成扫码登录后再重连"
      : sessionExpired
        ? "当前会话已失效，请重新扫码登录"
        : loginInProgress
          ? "当前账号正在登录中"
          : null
  };
}
