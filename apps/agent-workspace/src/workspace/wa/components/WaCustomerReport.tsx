/**
 * 功能名称: WA 客户监控报表
 * 菜单路径: 工作台 / WA工作台 / 客户
 * 文件职责:
 * - 按客户维度展示消息量、回复率、平均响应时长、待回复数。
 * - 一张表，颜色编码状态，简洁直观。
 * 交互页面:
 * - ./WaWorkspace.tsx: 通过"客户"tab切入。
 */

import type { Session } from "../../types";
import type { WaAccountItem, WaCustomerStats, WaTeamMember } from "../types";
import { useCallback, useEffect, useState } from "react";
import { getWaCustomerReport, listWaTeamMembers } from "../api";

type WaCustomerReportProps = {
  session: Session;
  accounts: WaAccountItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return `${Math.round(sec / 60)}分钟`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 ? `${h}时${m}分` : `${h}时`;
}

function fmtRelativeTime(isoStr: string | null): string {
  if (!isoStr) return "—";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function fmtPct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

type StatusInfo = { label: string; color: string; bg: string; dot: string };

function getStatusInfo(row: WaCustomerStats): StatusInfo {
  if (row.pendingCount === 0) {
    return { label: "正常", color: "text-green-700", bg: "bg-green-50", dot: "bg-green-500" };
  }
  // Estimate urgency: if last message is recent and pending > 0
  const lastMsgAge = row.lastMessageAt
    ? (Date.now() - new Date(row.lastMessageAt).getTime()) / 1000
    : null;
  if (lastMsgAge != null && lastMsgAge > 24 * 3600) {
    return { label: `${row.pendingCount}条超期`, color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" };
  }
  return { label: `${row.pendingCount}条待回复`, color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-400" };
}

// ─── Component ────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { label: "7天", value: 7 },
  { label: "30天", value: 30 },
  { label: "本季度", value: 90 },
  { label: "全部", value: 366 }
];

export function WaCustomerReport({ session, accounts }: WaCustomerReportProps) {
  const [days, setDays] = useState(30);
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<WaCustomerStats[]>([]);
  const [teamMembers, setTeamMembers] = useState<WaTeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWaCustomerReport(session, {
        days,
        waAccountId: accountFilter || null,
        ownerMembershipId: ownerFilter || null
      });
      setRows(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session, days, accountFilter, ownerFilter]);

  useEffect(() => {
    void load();
    void listWaTeamMembers(session).then(setTeamMembers).catch(() => undefined);
  }, [load, session]);

  const filteredRows = search.trim()
    ? rows.filter((r) =>
        r.displayName.toLowerCase().includes(search.toLowerCase()) ||
        (r.ownerName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const totalPending = rows.reduce((s, r) => s + r.pendingCount, 0);
  const avgReplyRate = rows.length > 0
    ? rows.filter((r) => r.replyRate != null).reduce((s, r) => s + (r.replyRate ?? 0), 0) /
      Math.max(1, rows.filter((r) => r.replyRate != null).length)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f0f2f5]">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#d1d7db] bg-white px-5 py-3">
        <span className="text-[15px] font-semibold text-[#111b21]">客户监控</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Day range toggle */}
          <div className="flex items-center rounded-[8px] border border-[#d1d7db] bg-[#f0f2f5] p-0.5">
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className={`rounded-[6px] px-3 py-1 text-xs font-medium transition-colors ${
                  days === opt.value
                    ? "bg-white text-[#111b21] shadow-sm"
                    : "text-[#667781] hover:text-[#111b21]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Account filter */}
          {accounts.length > 1 && (
            <select
              className="rounded-[8px] border border-[#d1d7db] bg-white px-2.5 py-1.5 text-xs text-[#111b21] outline-none focus:border-[#00a884]"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="">全部账号</option>
              {accounts.map((a) => (
                <option key={a.waAccountId} value={a.waAccountId}>{a.displayName}</option>
              ))}
            </select>
          )}

          {/* Owner filter */}
          <select
            className="rounded-[8px] border border-[#d1d7db] bg-white px-2.5 py-1.5 text-xs text-[#111b21] outline-none focus:border-[#00a884]"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="">全部销售</option>
            {teamMembers.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.displayName || m.membershipId}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            className="w-[140px] rounded-[8px] border border-[#d1d7db] bg-white px-2.5 py-1.5 text-xs text-[#111b21] outline-none focus:border-[#00a884]"
            placeholder="搜索客户…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            type="button"
            onClick={() => { void load(); }}
            disabled={loading}
            className="rounded-[8px] bg-[#00a884] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-[#008f6e]"
          >
            {loading ? "加载中…" : "刷新"}
          </button>
        </div>
      </div>

      {/* ── Summary strip ── */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-6 border-b border-[#d1d7db] bg-white px-5 py-2 text-xs text-[#667781]">
          <span>共 <b className="text-[#111b21]">{rows.length}</b> 位客户</span>
          <span>待回复 <b className={totalPending > 0 ? "text-red-600" : "text-[#111b21]"}>{totalPending}</b> 条</span>
          {avgReplyRate != null && (
            <span>平均回复率 <b className="text-[#111b21]">{Math.round(avgReplyRate * 100)}%</b></span>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-[#667781]">加载中…</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-[#667781]">
            <span>暂无客户数据</span>
            <span className="text-xs">在群聊成员列表中点击「标注」即可添加客户</span>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-[#f0f2f5] text-left">
                <th className="px-4 py-2.5 font-medium text-[#667781]">客户</th>
                <th className="px-4 py-2.5 font-medium text-[#667781]">负责销售</th>
                <th className="px-4 py-2.5 text-right font-medium text-[#667781]">消息</th>
                <th className="px-4 py-2.5 text-right font-medium text-[#667781]">已回复/需回</th>
                <th className="px-4 py-2.5 text-right font-medium text-[#667781]">回复率</th>
                <th className="px-4 py-2.5 text-right font-medium text-[#667781]">均响应</th>
                <th className="px-4 py-2.5 font-medium text-[#667781]">最近发言</th>
                <th className="px-4 py-2.5 font-medium text-[#667781]">状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const status = getStatusInfo(row);
                const isExpanded = expandedId === row.waCustomerContactId;

                return (
                  <>
                    <tr
                      key={row.waCustomerContactId}
                      className={`cursor-pointer border-b border-[#f0f2f5] bg-white transition-colors hover:bg-[#f9fafb] ${isExpanded ? "bg-[#f9fafb]" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : row.waCustomerContactId)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#111b21]">{row.displayName}</div>
                        {row.remarks && (
                          <div className="mt-0.5 truncate text-[10px] text-[#667781]">{row.remarks}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#54656f]">{row.ownerName ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-[#111b21]">{row.totalMessages}</td>
                      <td className="px-4 py-3 text-right text-[#111b21]">
                        {row.requiresReplyCount > 0
                          ? `${row.repliedCount} / ${row.requiresReplyCount}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={
                          row.replyRate == null ? "text-[#667781]"
                          : row.replyRate >= 0.9 ? "text-green-600 font-medium"
                          : row.replyRate >= 0.6 ? "text-amber-600"
                          : "text-red-600 font-medium"
                        }>
                          {fmtPct(row.replyRate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[#54656f]">
                        {fmtDuration(row.avgReplyDurationSec)}
                      </td>
                      <td className="px-4 py-3 text-[#54656f]">{fmtRelativeTime(row.lastMessageAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${status.bg} ${status.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>
                    </tr>

                    {/* Expanded: conversation breakdown */}
                    {isExpanded && row.conversations.length > 0 && (
                      <tr key={`${row.waCustomerContactId}-exp`} className="bg-[#f9fafb]">
                        <td colSpan={8} className="px-6 pb-3 pt-1">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-[#667781]">所在群聊</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {row.conversations.map((conv) => (
                              <span
                                key={conv.waConversationId}
                                className="rounded-[6px] border border-[#d1d7db] bg-white px-2.5 py-1 text-[11px] text-[#54656f]"
                              >
                                {conv.subject || "未命名群聊"}
                                <span className="ml-1.5 text-[#667781]">{conv.messageCount}条</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
