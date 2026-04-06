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
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-[#d7dbdf] bg-[#f0f2f5] px-4 py-3">
        <div className="text-[15px] font-semibold text-[#111b21]">会话信息</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="rounded-2xl border border-[#d7dbdf] bg-[#f7f8fa] px-4 py-3">
          <div className="text-xs font-medium text-[#667781]">当前回复人</div>
          <div className="mt-2 text-sm font-semibold text-[#111b21]">{detail?.conversation.currentReplierName || "未接管"}</div>
          <div className="mt-1 text-xs text-[#667781]">{detail?.permissions.canReply ? "你可以回复" : "你只能查看"}</div>
        </div>

        {detail?.permissions.canForceAssign ? (
          <div className="mt-4 rounded-2xl border border-[#d7dbdf] bg-white px-4 py-3">
            <div className="text-xs font-medium text-[#667781]">主管分配</div>
            <div className="mt-3 space-y-2">
              {session.memberships.map((membership) => (
                <button
                  key={membership.membershipId}
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() => { void onForceAssign(membership.membershipId); }}
                  className="flex w-full items-center justify-between rounded-xl border border-[#e9edef] px-3 py-2 text-left text-xs text-[#54656f] hover:bg-[#f5f6f6] disabled:opacity-50"
                >
                  <span>{membership.tenantName}</span>
                  <span>{membership.role}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-[#d7dbdf] bg-white px-4 py-3">
          <div className="text-xs font-medium text-[#667781]">成员</div>
          <div className="mt-3 space-y-2">
            {detail?.members.map((member) => (
              <div key={member.memberRowId} className="rounded-xl border border-[#e9edef] bg-[#f7f8fa] px-3 py-2 text-xs text-[#54656f]">
                <div className="font-medium text-[#111b21]">{member.displayName || member.participantJid}</div>
                <div className="mt-1 text-[#667781]">{member.isAdmin ? "管理员" : "成员"}</div>
              </div>
            ))}
            {!detail?.members.length ? <div className="text-xs text-[#8696a0]">当前没有成员数据</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
