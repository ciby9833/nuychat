/**
 * 功能名称: WA 右侧上下文面板
 * 菜单路径: 工作台 / WA工作台 / 右侧上下文栏
 * 文件职责: 展示会话负责人、群成员和后续 Copilot 占位区。
 * 交互页面:
 * - ./WaWorkspace.tsx: 组合完整 WA 工作台三栏页面。
 */

import type { Session } from "../../types";
import type { WaConversationDetail } from "../types";

type WaContextPanelProps = {
  detail: WaConversationDetail | null;
  session: Session;
  onForceAssign: (memberId: string) => Promise<void>;
  actionLoading: string | null;
};

export function WaContextPanel(props: WaContextPanelProps) {
  const { detail, session, onForceAssign, actionLoading } = props;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-sm font-semibold text-slate-900">上下文与协同</div>
        <div className="mt-1 text-xs text-slate-500">这里保留给 Copilot、风险、摘要和成员信息。</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium text-slate-500">当前回复人</div>
          <div className="mt-2 text-sm font-semibold text-slate-900">{detail?.conversation.currentReplierName || "未接管"}</div>
          <div className="mt-1 text-xs text-slate-500">我的权限: {detail?.permissions.canReply ? "可回复" : "仅查看/提示"}</div>
        </div>

        {detail?.permissions.canForceAssign ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium text-slate-500">主管强制分配</div>
            <div className="mt-3 space-y-2">
              {session.memberships.map((membership) => (
                <button
                  key={membership.membershipId}
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() => { void onForceAssign(membership.membershipId); }}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <span>{membership.tenantName}</span>
                  <span>{membership.role}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium text-slate-500">群成员 / 可见信息</div>
          <div className="mt-3 space-y-2">
            {detail?.members.map((member) => (
              <div key={member.memberRowId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div className="font-medium text-slate-900">{member.displayName || member.participantJid}</div>
                <div className="mt-1 text-slate-500">{member.isAdmin ? "管理员" : "普通成员"}</div>
              </div>
            ))}
            {!detail?.members.length ? <div className="text-xs text-slate-400">当前没有群成员同步数据</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
