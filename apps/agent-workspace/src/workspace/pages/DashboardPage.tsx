import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { useWorkspaceDashboard } from "../hooks/useWorkspaceDashboard";
import { WorkspaceShell } from "../components/layout/WorkspaceShell";
import type { WorkspaceSection } from "../components/layout/WorkspaceSidebar";
import { TooltipProvider } from "../../components/ui/tooltip";

const HomeOverview = lazy(() => import("../components/home/HomeOverview").then((module) => ({ default: module.HomeOverview })));
const MessagesWorkspace = lazy(() => import("../components/messages/MessagesWorkspace").then((module) => ({ default: module.MessagesWorkspace })));
const TasksWorkspace = lazy(() => import("../components/tasks/TasksWorkspace").then((module) => ({ default: module.TasksWorkspace })));
const WaDashboardPage = lazy(() => import("../wa/pages/WaDashboardPage").then((module) => ({ default: module.WaDashboardPage })));

export function DashboardPage() {
  const vm = useWorkspaceDashboard();
  const location = useLocation();
  const navigate = useNavigate();
  const [rightWidth, setRightWidth] = useState(300);

  const section = useMemo<WorkspaceSection>(() => {
    if (location.pathname.endsWith("/wa")) return "wa";
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
    if (section === "wa") {
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

  const seatEnabled = Boolean(vm.agentId);
  const waEnabled = vm.waSeatEnabled && vm.waRuntimeAvailable;
  const waRuntimePending = vm.waSeatEnabled && !vm.waRuntimeChecked;
  const headerProps = {
    tenantId: vm.tenantId,
    tenantSlug: vm.tenantSlug,
    agentId: vm.agentId,
    socketStatus: vm.socketStatus,
    memberships: vm.memberships,
    session: vm.session,
    onSwitchTenant: vm.onSwitchTenant,
    onLogout: vm.onLogout
  };

  return (
    <TooltipProvider>
      <WorkspaceShell
        section={section}
        unreadCount={vm.totalUnreadMessages}
        waUnreadCount={vm.waUnreadMessages}
        taskCount={vm.filteredMyTasks.length}
        seatEnabled={seatEnabled}
        waEnabled={waEnabled}
        onNavigate={(next) => navigate(`/dashboard/${next}`)}
        header={headerProps}
      >
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>}>
          <Routes>
            <Route
              index
              element={<Navigate to={waEnabled && !seatEnabled ? "/dashboard/wa" : "/dashboard/home"} replace />}
            />
            <Route
              path="home"
              element={seatEnabled ? (
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
              ) : <Navigate to={waEnabled ? "/dashboard/wa" : "/"} replace />}
            />
            <Route
              path="messages"
              element={seatEnabled ? <MessagesWorkspace vm={vm} rightWidth={rightWidth} onStartResize={startRightResize} /> : <Navigate to={waEnabled ? "/dashboard/wa" : "/"} replace />}
            />
            <Route
              path="tasks"
              element={seatEnabled ? <TasksWorkspace vm={vm} /> : <Navigate to={waEnabled ? "/dashboard/wa" : "/"} replace />}
            />
            <Route
              path="wa"
              element={
                waRuntimePending ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>
                ) : waEnabled ? (
                  <WaDashboardPage session={vm.session} />
                ) : (
                  <Navigate to="/dashboard/home" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
          </Routes>
        </Suspense>
      </WorkspaceShell>
    </TooltipProvider>
  );
}
