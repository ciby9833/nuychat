import type { Session } from "../../types";

type WorkspaceHeaderProps = {
  tenantId: string;
  tenantSlug: string;
  agentId: string | null;
  socketStatus: string;
  memberships: Session["memberships"];
  session: Session;
  onSwitchTenant: (membershipId: string) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { tenantId, tenantSlug, agentId, socketStatus, memberships, session, onSwitchTenant, onLogout } = props;
  const agentName = session.email?.split("@")[0] || "Agent";
  const displayTenant = tenantSlug || tenantId;

  const socketTitle =
    socketStatus === "connected" ? "实时连接正常" :
    socketStatus === "error" ? "连接失败" :
    socketStatus === "disconnected" ? "已断开" : "连接中…";

  return (
    <header className="workspace-header">
      <div className="wh-brand">
        <div className="wh-logo">N</div>
        <div className="wh-info">
          <div className="wh-title">NuyChat 工作台</div>
          <div className="wh-subtitle">
            {displayTenant} · 坐席: {agentName}{agentId ? "" : " (未绑定)"}
          </div>
        </div>
      </div>

      <div className="wh-toolbar">
        {memberships.length > 1 && (
          <select
            className="wh-tenant-select"
            value={session.membershipId}
            onChange={(e) => { void onSwitchTenant(e.target.value); }}
          >
            {memberships.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.tenantName} ({m.tenantSlug})
              </option>
            ))}
          </select>
        )}

        <span
          className={`socket-dot ${socketStatus}`}
          title={socketTitle}
        />

        <button className="wh-logout-btn" onClick={() => { void onLogout(); }}>
          退出
        </button>
      </div>
    </header>
  );
}
