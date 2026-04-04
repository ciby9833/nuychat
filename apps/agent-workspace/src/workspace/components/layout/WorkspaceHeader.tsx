import { useTranslation } from "react-i18next";
import { changeLanguage, LANGS } from "../../../i18n";
import type { Session } from "../../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "../../../components/ui/avatar";
import { cn } from "../../../lib/utils";

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

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  return name.slice(0, 2).toUpperCase();
}

const socketColors: Record<string, string> = {
  connected:    "bg-emerald-500",
  error:        "bg-red-500",
  disconnected: "bg-slate-400",
};

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { tenantId, tenantSlug, agentId, socketStatus, memberships, session, onSwitchTenant, onLogout } = props;
  const { t, i18n } = useTranslation();

  const agentName = session.email?.split("@")[0] ?? "Agent";
  const displayTenant = tenantSlug || tenantId;

  const socketTitle =
    socketStatus === "connected"    ? t("header.socket.connected")    :
    socketStatus === "error"        ? t("header.socket.error")        :
    socketStatus === "disconnected" ? t("header.socket.disconnected") :
    t("header.socket.connecting");

  const dotColor = socketColors[socketStatus] ?? "bg-amber-400";

  return (
    <header className="flex h-[var(--header-h)] items-center gap-3 border-b border-slate-200 bg-white px-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-blue-500/30">
          N
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold text-slate-800">{t("header.title")}</span>
          <span className="text-[11px] text-slate-400 mt-0.5">{displayTenant}</span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tenant switcher (when multiple memberships) */}
      {memberships.length > 1 && (
        <select
          className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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

      {/* Socket status */}
      <div className="flex items-center gap-1.5" title={socketTitle}>
        <span className={cn("h-2 w-2 rounded-full", dotColor)} />
        <span className="text-[11px] text-slate-400 hidden sm:inline">{socketTitle}</span>
      </div>

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[11px]">{initials(session.email ?? "AG")}</AvatarFallback>
            </Avatar>
            <span className="text-slate-700 font-medium hidden sm:inline">
              {agentName}
              {!agentId && <span className="text-amber-500 ml-1">·</span>}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* User info */}
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar className="h-9 w-9">
              <AvatarFallback>{initials(session.email ?? "AG")}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-slate-800 truncate">{agentName}</span>
              <span className="text-xs text-slate-400 truncate">{session.email}</span>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Language section */}
          <DropdownMenuLabel>{t("header.language")}</DropdownMenuLabel>
          {LANGS.map(({ code, label }) => (
            <DropdownMenuItem
              key={code}
              onClick={() => { changeLanguage(code); }}
              className={cn(i18n.language === code && "text-blue-600 font-medium")}
            >
              {i18n.language === code && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
              {i18n.language !== code && <span className="w-[13px]" />}
              {label}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {/* Logout */}
          <DropdownMenuItem
            className="text-red-600 hover:bg-red-50 focus:bg-red-50"
            onClick={() => { void onLogout(); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t("header.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
