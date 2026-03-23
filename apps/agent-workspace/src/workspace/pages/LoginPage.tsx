import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { writeSession } from "../session";
import type { MembershipSummary, Session } from "../types";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("agent@demo.com");
  const [password, setPassword] = useState("agent123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/auth/login", {
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
        };
        memberships: MembershipSummary[];
      };

      if (!data.user.agentId) {
        const agentMembership = data.memberships.find((membership) => membership.agentId);
        if (agentMembership && agentMembership.membershipId !== data.user.membershipId) {
          const switchRes = await fetch("http://localhost:3000/api/auth/switch-tenant", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.accessToken}`
            },
            body: JSON.stringify({ membershipId: agentMembership.membershipId })
          });
          if (!switchRes.ok) throw new Error(`${switchRes.status} ${switchRes.statusText}`);
          data = (await switchRes.json()) as typeof data;
        }
      }

      if (!data.user.agentId) {
        throw new Error("当前账号未开通接待资格，无法进入客服工作台");
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
        memberships: data.memberships
      };
      writeSession(session);
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="shell">
      <section className="panel">
        <span className="eyebrow">NuyChat</span>
        <h1>Agent Login</h1>
        <p>仅已启用接待资格的成员可进入客服工作台</p>
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "登录中..." : "进入工作台"}</button>
        </form>
      </section>
    </main>
  );
}
