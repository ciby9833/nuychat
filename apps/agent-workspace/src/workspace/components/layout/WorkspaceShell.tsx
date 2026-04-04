import type { ReactNode } from "react";

import type { Session } from "../../types";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceSidebar, type WorkspaceSection } from "./WorkspaceSidebar";

type WorkspaceShellProps = {
  section: WorkspaceSection;
  unreadCount: number;
  taskCount: number;
  onNavigate: (section: WorkspaceSection) => void;
  header: {
    tenantId: string;
    tenantSlug: string;
    agentId: string | null;
    socketStatus: string;
    memberships: Session["memberships"];
    session: Session;
    onSwitchTenant: (membershipId: string) => Promise<void>;
    onLogout: () => Promise<void>;
  };
  children: ReactNode;
};

export function WorkspaceShell(props: WorkspaceShellProps) {
  const { section, unreadCount, taskCount, onNavigate, header, children } = props;

  return (
    <div className="flex h-screen min-w-[1180px] overflow-hidden bg-slate-50">
      <WorkspaceSidebar
        section={section}
        unreadCount={unreadCount}
        taskCount={taskCount}
        onNavigate={onNavigate}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceHeader {...header} />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
