export function ChatHeader(props: {
  tenantName: string;
  tenantSlug: string;
  customerRef: string;
  displayName: string | null;
  deviceType?: string;
}) {
  return (
    <header className="chat-header">
      <div>
        <p className="chat-title">NuyChat 在线客服</p>
        <p className="chat-meta">组织: {props.tenantName} ({props.tenantSlug})</p>
      </div>
      <div className="chat-user">
        <span>{props.displayName || "访客"}</span>
        <small>{props.customerRef}{props.deviceType ? ` · ${props.deviceType}` : ""}</small>
      </div>
    </header>
  );
}
