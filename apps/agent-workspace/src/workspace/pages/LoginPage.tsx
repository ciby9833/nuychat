import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { changeLanguage, LANGS } from "../../i18n";
import { API_BASE_URL } from "../api";
import { writeSession } from "../session";
import type { MembershipSummary, Session } from "../types";

export function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      let data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        user: {
          identityId: string;
          email: string;
          role: string;
          tenantId: string;
          tenantSlug: string;
          membershipId: string;
          agentId?: string | null;
          waSeatEnabled?: boolean;
        };
        memberships: MembershipSummary[];
      };

      if (!data.user.agentId && !data.user.waSeatEnabled) {
        const workspaceMembership = data.memberships.find((membership) => membership.agentId || membership.waSeatEnabled);
        if (workspaceMembership && workspaceMembership.membershipId !== data.user.membershipId) {
          const switchRes = await fetch(`${API_BASE_URL}/api/auth/switch-tenant`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.accessToken}`
            },
            body: JSON.stringify({ membershipId: workspaceMembership.membershipId })
          });
          if (!switchRes.ok) throw new Error(`${switchRes.status} ${switchRes.statusText}`);
          data = (await switchRes.json()) as typeof data;
        }
      }

      if (!data.user.agentId && !data.user.waSeatEnabled) {
        throw new Error(t("login.noAgentAccess"));
      }

      const session: Session = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        identityId: data.user.identityId,
        email: data.user.email,
        role: data.user.role,
        tenantId: data.user.tenantId,
        tenantSlug: data.user.tenantSlug,
        membershipId: data.user.membershipId,
        agentId: data.user.agentId ?? null,
        waSeatEnabled: data.user.waSeatEnabled ?? false,
        memberships: data.memberships
      };
      writeSession(session);
      navigate(data.user.waSeatEnabled && !data.user.agentId ? "/dashboard/wa" : "/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="relative w-80 bg-white rounded-2xl shadow-xl p-8">
        <div className="absolute right-4 top-4">
          <label className="sr-only" htmlFor="login-language">{t("header.language")}</label>
          <select
            id="login-language"
            value={i18n.language}
            onChange={(e) => { changeLanguage(e.target.value); }}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {LANGS.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-md shadow-blue-500/30">
            N
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-800 mb-1">NuyChat</h1>
          <p className="text-sm text-slate-500">{t("login.subtitle")}</p>
        </div>

        {/* Form */}
        <form
          className="flex flex-col gap-4"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">{t("login.emailLabel")}</label>
            <input
              type="email"
              name="workspace-email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-colors"
              placeholder={t("login.emailPlaceholder")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">{t("login.passwordLabel")}</label>
            <input
              type="password"
              name="workspace-password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-colors"
              placeholder={t("login.passwordPlaceholder")}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-9 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-blue-500/20 mt-1"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {t("login.loading")}
              </span>
            ) : t("login.submit")}
          </button>
        </form>
      </div>
    </main>
  );
}
