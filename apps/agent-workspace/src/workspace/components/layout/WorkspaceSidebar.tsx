/**
 * 功能名称: 工作台侧边栏
 * 菜单路径: 座席工作台 / 全局导航
 * 文件职责: 提供首页、消息、任务、WA 工作台入口，并展示未读消息与任务数量角标。
 * 交互页面:
 * - ../../pages/DashboardPage.tsx: 根据当前路由高亮菜单并处理导航切换。
 * - ./WorkspaceShell.tsx: 作为全局工作台壳层左侧导航区域。
 */

import { AppstoreOutlined, CheckSquareOutlined, MessageOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { cn } from "../../../lib/utils";

export type WorkspaceSection = "home" | "messages" | "tasks" | "wa";

type WorkspaceSidebarProps = {
  section: WorkspaceSection;
  unreadCount: number;
  taskCount: number;
  waEnabled?: boolean;
  onNavigate: (section: WorkspaceSection) => void;
};

const ITEMS: Array<{ key: WorkspaceSection; labelKey: string; icon: React.ReactNode }> = [
  { key: "home", labelKey: "nav.home", icon: <AppstoreOutlined /> },
  { key: "messages", labelKey: "nav.messages", icon: <MessageOutlined /> },
  { key: "tasks", labelKey: "nav.tasks", icon: <CheckSquareOutlined /> },
  { key: "wa", labelKey: "nav.whatsapp", icon: <MessageOutlined /> }
];

export function WorkspaceSidebar({ section, unreadCount, taskCount, waEnabled = false, onNavigate }: WorkspaceSidebarProps) {
  const { t } = useTranslation();
  const visibleItems = ITEMS.filter((item) => item.key !== "wa" || waEnabled);

  return (
    <aside className="flex h-full w-[88px] shrink-0 flex-col items-center border-r border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-3 py-4">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#dbeafe_0%,#bfdbfe_48%,#e0f2fe_100%)] text-lg font-bold text-blue-700 shadow-sm">
          N
      </div>

      <div className="flex flex-1 flex-col items-center gap-2">
        {visibleItems.map((item) => {
          const badge = item.key === "messages" ? unreadCount : item.key === "tasks" ? taskCount : 0;
          const active = section === item.key;

          return (
            <button
              key={item.key}
              type="button"
              title={t(item.labelKey)}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors",
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              )}
            >
              <span className="text-base">{item.icon}</span>
              {badge > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
