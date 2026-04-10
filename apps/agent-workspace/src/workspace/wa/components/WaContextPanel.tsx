/**
 * 功能名称: WA 右侧上下文面板
 * 菜单路径: 工作台 / WA工作台 / 右侧上下文栏
 * 文件职责: 展示当前聊天对象、接管状态与群成员信息，布局接近 WhatsApp Web 资料侧栏。
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
  const title =
    detail?.conversation.displayName ||
    detail?.conversation.subject ||
    detail?.conversation.contactPhoneE164 ||
    detail?.conversation.contactJid ||
    detail?.conversation.chatJid ||
    "未选择会话";
  const subtitle = detail?.conversation.conversationType === "group"
    ? detail?.conversation.chatJid
    : (detail?.conversation.contactPhoneE164 || detail?.conversation.contactJid || "单聊");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f8fa] text-[#111b21]">
      <div className="border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
        <div className="text-[15px] font-medium text-[#111b21]">会话信息</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col items-center border-b border-[#d1d7db] px-6 py-8 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#d9fdd3] text-3xl font-semibold text-[#005c4b]">
            {detail?.conversation.conversationType === "group" ? "+" : title.slice(0, 1).toUpperCase()}
          </div>
          <div className="mt-4 text-[22px] font-medium text-[#111b21]">{title}</div>
          <div className="mt-1 text-sm text-[#667781]">{subtitle}</div>
          <div className="mt-2 text-xs text-[#667781]">
            {detail?.conversation.conversationType === "group" ? `${detail?.members.length ?? 0} 位成员` : "私聊"}
          </div>
        </div>

        <div className="border-b border-[#d1d7db] px-5 py-5">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#667781]">当前回复人</div>
          <div className="mt-3 text-[18px] font-medium text-[#111b21]">{detail?.conversation.currentReplierName || "未接管"}</div>
          <div className="mt-1 text-sm text-[#667781]">{detail?.permissions.canReply ? "你可以回复" : "你当前仅可查看"}</div>
        </div>

        {detail?.permissions.canForceAssign ? (
          <div className="border-b border-[#d1d7db] px-5 py-5">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#667781]">主管分配</div>
            <div className="mt-3 space-y-2">
              {session.memberships.map((membership) => (
                <button
                  key={membership.membershipId}
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() => { void onForceAssign(membership.membershipId); }}
                  className="flex w-full items-center justify-between rounded-[10px] border border-[#d1d7db] bg-white px-3 py-2 text-left text-xs text-[#54656f] transition-colors hover:bg-[#f5f6f6] disabled:opacity-50"
                >
                  <span>{membership.tenantName}</span>
                  <span>{membership.role}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="px-5 py-5">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#667781]">成员</div>
          <div className="mt-3 space-y-2">
            {detail?.members.map((member) => (
              <div key={member.memberRowId} className="rounded-[10px] border border-[#d1d7db] bg-white px-3 py-2 text-xs text-[#667781]">
                <div className="font-medium text-[#111b21]">{member.displayName || member.participantJid}</div>
                <div className="mt-1 text-[#667781]">{member.isAdmin ? "管理员" : "成员"}</div>
              </div>
            ))}
            {!detail?.members.length ? <div className="text-xs text-[#667781]">当前没有成员数据</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
