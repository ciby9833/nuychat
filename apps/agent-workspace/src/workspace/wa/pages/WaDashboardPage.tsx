/**
 * 功能名称: WA 工作台路由页
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 作为 `/dashboard/wa` 的页面入口，挂载 WA 工作台主界面。
 * 交互页面:
 * - ../../pages/DashboardPage.tsx: 在统一 dashboard 壳层下把 `/dashboard/wa` 路由分发到这里。
 * - ../components/WaWorkspace.tsx: 提供 WA 会话三栏聊天界面。
 */

import { Suspense, lazy } from "react";
import { Navigate } from "react-router-dom";

import type { Session } from "../../types";

const WaWorkspace = lazy(() => import("../components/WaWorkspace").then((module) => ({ default: module.WaWorkspace })));

type WaDashboardPageProps = {
  enabled: boolean;
  session: Session;
};

export function WaDashboardPage({ enabled, session }: WaDashboardPageProps) {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>}>
      {enabled ? <WaWorkspace session={session} /> : <Navigate to="/dashboard/home" replace />}
    </Suspense>
  );
}
