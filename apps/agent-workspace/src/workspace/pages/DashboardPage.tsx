import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { useWorkspaceDashboard } from "../hooks/useWorkspaceDashboard";
import { WorkspaceShell } from "../components/layout/WorkspaceShell";
import type { WorkspaceSection } from "../components/layout/WorkspaceSidebar";
import { TooltipProvider } from "../../components/ui/tooltip";

const HomeOverview = lazy(() => import("../components/home/HomeOverview").then((module) => ({ default: module.HomeOverview })));
const MessagesWorkspace = lazy(() => import("../components/messages/MessagesWorkspace").then((module) => ({ default: module.MessagesWorkspace })));
const TasksWorkspace = lazy(() => import("../components/tasks/TasksWorkspace").then((module) => ({ default: module.TasksWorkspace })));

export function DashboardPage() {
  const vm = useWorkspaceDashboard();
  const location = useLocation();
  const navigate = useNavigate();
  const [rightWidth, setRightWidth] = useState(300);

  const section = useMemo<WorkspaceSection>(() => {
    if (location.pathname.endsWith("/tasks")) return "tasks";
    if (location.pathname.endsWith("/messages")) return "messages";
    return "home";
  }, [location.pathname]);

  useEffect(() => {
    if (section === "tasks") {
      vm.setLeftPanelMode("tasks");
      vm.setRightTab("orders");
      void vm.loadMyTasks();
      return;
    }
    if (section === "messages") {
      vm.setLeftPanelMode("conversations");
      return;
    }
    void vm.loadMyTasks();
  }, [section, vm.loadMyTasks, vm.setLeftPanelMode, vm.setRightTab]);

  const startRightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setRightWidth(Math.max(240, Math.min(560, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (!vm.isLoggedIn || !vm.session) return null;

  return (
    <TooltipProvider>
      <WorkspaceShell
        section={section}
        unreadCount={vm.totalUnreadMessages}
        taskCount={vm.filteredMyTasks.length}
        onNavigate={(next) => navigate(`/dashboard/${next}`)}
        header={{
          tenantId: vm.tenantId,
          tenantSlug: vm.tenantSlug,
          agentId: vm.agentId,
          socketStatus: vm.socketStatus,
          memberships: vm.memberships,
          session: vm.session,
          onSwitchTenant: vm.onSwitchTenant,
          onLogout: vm.onLogout
        }}
      >
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>}>
          <Routes>
            <Route
              index
              element={<Navigate to="/dashboard/home" replace />}
            />
            <Route
              path="home"
              element={
                <HomeOverview
                  unreadConversations={vm.unreadConversations}
                  totalUnreadMessages={vm.totalUnreadMessages}
                  myTasks={vm.filteredMyTasks}
                  onOpenConversation={(conversationId) => {
                    vm.openConversation(conversationId);
                    navigate("/dashboard/messages");
                  }}
                  onOpenTask={(task) => {
                    vm.openTaskConversation(task);
                    navigate("/dashboard/tasks");
                  }}
                  onOpenMessages={() => navigate("/dashboard/messages")}
                  onOpenTasks={() => navigate("/dashboard/tasks")}
                />
              }
            />
            <Route
              path="messages"
              element={<MessagesWorkspace vm={vm} rightWidth={rightWidth} onStartResize={startRightResize} />}
            />
            <Route
              path="tasks"
              element={<TasksWorkspace vm={vm} />}
            />
            <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
          </Routes>
        </Suspense>
      </WorkspaceShell>
    </TooltipProvider>
  );
}
