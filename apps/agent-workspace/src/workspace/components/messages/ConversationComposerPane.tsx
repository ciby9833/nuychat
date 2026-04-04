/**
 * 功能名称: 会话输入区
 * 菜单路径: 座席工作台 / 消息 / 会话详情 / 回复输入区
 * 文件职责: 承载回复输入、附件上传、引用回复、AI 辅助插入和发送动作。
 * 交互页面:
 * - ./MessagesWorkspace.tsx: 消息工作台页面中作为中间列底部输入区使用。
 * - ../TimelinePanel.tsx: 管理输入态、上传态与发送动作。
 * - ../MessageComposer.tsx: 具体渲染输入组件与工具栏。
 */

import { MessageComposer } from "../MessageComposer";
import type { ChannelCapability } from "../../constants";
import type { ComposerSkillAssist, MessageAttachment, MessageItem } from "../../types";

type UploadItem = {
  key: string;
  file: File;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
  mode: "attachment" | "sticker";
};

type ConversationComposerPaneProps = {
  detailOpen: boolean;
  capability: ChannelCapability;
  reply: string;
  pendingAttachments: MessageAttachment[];
  composerSkillAssist: ComposerSkillAssist | null;
  replyTarget: MessageItem | null;
  aiSuggestions: string[];
  isAssignedToMe: boolean;
  isResolved: boolean;
  isLockedByAnotherAgent: boolean;
  canSend: boolean;
  uploading: boolean;
  uploadItems: UploadItem[];
  composerError: string;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  onSelectFiles: (files: File[], mode: "attachment" | "sticker") => void;
  onRetryUpload: (key: string) => void;
  onClearAttachments: () => void;
  onRemoveAttachment: (index: number) => void;
  onSetReplyTarget: (messageId: string | null) => void;
  onClearComposerState: () => void;
  messagePreview: (message: MessageItem | null | undefined) => string;
};

export function ConversationComposerPane(props: ConversationComposerPaneProps) {
  return (
    <div className="shrink-0">
      <MessageComposer {...props} />
    </div>
  );
}
