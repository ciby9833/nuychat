/**
 * 功能名称: WA 工作台类型定义
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 约束 WA 账号、会话、消息、成员与发送请求的数据结构。
 * 交互页面:
 * - ./api.ts: 对接 WA workbench 后端接口。
 * - ./hooks/useWaWorkspace.ts: 作为页面状态与接口编排的输入输出类型。
 */

export type WaAccountItem = {
  waAccountId: string;
  instanceKey: string;
  displayName: string;
  phoneE164: string | null;
  providerKey: string;
  accountStatus: string;
  riskLevel: string;
  primaryOwnerMembershipId: string | null;
  primaryOwnerName: string | null;
  memberIds: string[];
  memberCount: number;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
};

export type WaConversationItem = {
  waConversationId: string;
  waAccountId: string;
  chatJid: string;
  conversationType: string;
  subject: string | null;
  contactJid: string | null;
  conversationStatus: string;
  currentReplierMembershipId: string | null;
  currentReplierName: string | null;
  accountDisplayName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type WaConversationMember = {
  memberRowId: string;
  participantJid: string;
  participantType: string;
  displayName: string | null;
  isAdmin: boolean;
  joinedAt: string;
  leftAt: string | null;
};

export type WaAttachment = {
  attachmentId: string;
  attachmentType: string;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  storageUrl: string | null;
  previewUrl: string | null;
};

export type WaReaction = {
  reactionId: string;
  actorJid: string | null;
  actorMemberId: string | null;
  emoji: string;
  createdAt: string;
};

export type WaReceipt = {
  receiptId: string;
  userJid: string;
  receiptStatus: string;
  receiptAt: string | null;
  readAt: string | null;
  playedAt: string | null;
};

export type WaMessageItem = {
  waMessageId: string;
  providerMessageId: string | null;
  direction: string;
  messageType: string;
  messageScene: string;
  senderJid: string | null;
  senderMemberId: string | null;
  senderRole: string;
  participantJid: string | null;
  quotedMessageId: string | null;
  bodyText: string | null;
  logicalSeq: number;
  deliveryStatus: string;
  receiptSummary: {
    totalReceipts: number;
    latestStatus: string | null;
    latestAt: string | null;
    statusCounts: Record<string, number>;
  } | null;
  receipts: WaReceipt[];
  attachments: WaAttachment[];
  reactions: WaReaction[];
  createdAt: string;
};

export type WaConversationDetail = {
  conversation: WaConversationItem;
  messages: WaMessageItem[];
  members: WaConversationMember[];
  permissions: {
    canReply: boolean;
    canForceAssign: boolean;
  };
};
