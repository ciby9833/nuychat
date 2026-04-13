/**
 * 作用:
 * - 统一 WA 账号 session 的主状态与可执行动作规则。
 *
 * 交互:
 * - 被账号列表、健康接口、登录任务返回复用。
 * - 前端仅消费这里产出的 status/actions，不再自行猜测登录状态。
 */

export type WaStatusCode =
  | "never_logged_in"
  | "qr_required"
  | "qr_scanned"
  | "connecting"
  | "connected"
  | "session_expired"
  | "failed"
  | "offline";

export type WaStatus = {
  code: WaStatusCode;
  label: string;
  detail: string;
  tone: "default" | "warning" | "success" | "danger" | "processing";
};

export type WaSessionSnapshot = {
  connectionState: string;
  loginPhase: string | null;
  disconnectReason: string | null;
  qrCodeAvailable: boolean;
  heartbeatAt?: string | null;
  historySyncedAt?: string | null;
  chatsSyncedAt?: string | null;
  groupsSyncedAt?: string | null;
  hasGroupChats?: boolean | null;
};

const STALE_PENDING_SESSION_MS = 2 * 60 * 1000;

function isStalePendingSession(session: WaSessionSnapshot | null) {
  if (!session) return false;
  if (!["connecting", "qr_required", "qr_scanned"].includes(session.loginPhase ?? "")) return false;
  if (!session.heartbeatAt) return true;
  const heartbeatAt = new Date(session.heartbeatAt).getTime();
  if (!Number.isFinite(heartbeatAt)) return true;
  return Date.now() - heartbeatAt > STALE_PENDING_SESSION_MS;
}

export function normalizeWaSessionSnapshot<T extends WaSessionSnapshot | null>(session: T): T {
  if (!session) return session;
  if (session.connectionState === "open") {
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
  const status = deriveWaStatus({
    accountStatus: input.storedAccountStatus ?? "offline",
    session: input.session
  });
  if (status.code === "connected") return "online";
  if (["qr_required", "qr_scanned", "connecting"].includes(status.code)) return "pending_login";
  return "offline";
}

export function deriveWaStatus(input: {
  accountStatus: string;
  session: WaSessionSnapshot | null;
}): WaStatus {
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

  if (isStalePendingSession(session)) {
    return {
      code: "offline",
      label: "离线",
      detail: "上一次登录未完成，需重新扫码登录。",
      tone: "default"
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

export function deriveWaUiStatus(input: {
  accountStatus: string;
  session: WaSessionSnapshot | null;
}): WaStatus {
  return deriveWaStatus(input);
}

export function deriveWaActions(input: {
  status: WaStatus;
  hasSession: boolean;
  lastConnectedAt: string | null;
  session: WaSessionSnapshot | null;
}) {
  const session = normalizeWaSessionSnapshot(input.session);
  const loginInProgress = ["qr_required", "qr_scanned", "connecting"].includes(input.status.code);
  const connected = input.status.code === "connected";
  const sessionExpired = input.status.code === "session_expired";
  const wasManuallyLoggedOut = session?.disconnectReason === "manual_logout";
  const canReconnect =
    Boolean(input.lastConnectedAt) &&
    !connected &&
    !loginInProgress &&
    !sessionExpired &&
    !wasManuallyLoggedOut;
  const canLogout = input.hasSession && !loginInProgress && !wasManuallyLoggedOut;
  const canStartLogin = !connected && !loginInProgress;

  const canDelete = !connected && !loginInProgress;

  return {
    canStartLogin,
    canManageMembers: true,
    canViewHealth: true,
    canDelete,
    deleteReason: connected
      ? "当前账号在线，请先退出后再删除"
      : loginInProgress
        ? "当前账号正在登录中，请等待完成后再删除"
        : null,
    canLogout,
    logoutReason: !input.hasSession
      ? "当前账号还没有登录会话"
      : wasManuallyLoggedOut
        ? "当前账号已主动退出"
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
      : connected
        ? "当前账号已在线，无需重连"
        : wasManuallyLoggedOut
          ? "账号已主动退出，请重新扫码登录"
          : sessionExpired
            ? "当前会话已失效，请重新扫码登录"
            : loginInProgress
              ? "当前账号正在登录中"
              : null
  };
}
