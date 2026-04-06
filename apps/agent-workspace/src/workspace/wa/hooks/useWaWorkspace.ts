/**
 * 功能名称: WA 工作台状态管理
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 管理 WA 账号列表、会话列表、详情、接管、发送与上传状态。
 * 交互页面:
 * - ../components/WaWorkspace.tsx: 消费当前 hook 暴露的页面视图模型。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

import type { Session } from "../../types";
import { API_BASE_URL } from "../../api";
import {
  forceAssignWaConversation,
  getWaWorkbenchConversationDetail,
  listWaWorkbenchAccounts,
  listWaWorkbenchContacts,
  listWaWorkbenchConversations,
  loadMoreWaMessages,
  openWaWorkbenchContactConversation,
  releaseWaConversation,
  sendWaMediaMessage,
  sendWaReaction,
  sendWaTextMessage,
  takeoverWaConversation,
  uploadWaAttachment
} from "../api";
import type { WaAccountItem, WaContactItem, WaConversationDetail, WaConversationItem, WaMessageItem } from "../types";

type UploadingAttachment = {
  localId: string;
  fileName: string;
  mimeType: string;
  url: string;
};

function sortWaConversations(rows: WaConversationItem[]) {
  return [...rows].sort((left, right) => {
    const leftTs = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
    const rightTs = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
    if (rightTs !== leftTs) return rightTs - leftTs;
    return right.unreadCount - left.unreadCount;
  });
}

export function useWaWorkspace(session: Session | null) {
  const [accounts, setAccounts] = useState<WaAccountItem[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<WaConversationItem[]>([]);
  const [contacts, setContacts] = useState<WaContactItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // Capture unread count at the moment the user clicks a conversation, before
  // loadDetail() resets it server-side. WaChatPanel uses this to scroll to the
  // first unread message instead of always jumping to the very bottom.
  const [unreadCountBeforeOpen, setUnreadCountBeforeOpen] = useState(0);
  const [detail, setDetail] = useState<WaConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [quotedMessageId, setQuotedMessageId] = useState<string | null>(null);
  const [uploadingAttachments, setUploadingAttachments] = useState<UploadingAttachment[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!session?.waSeatEnabled) return;
    const rows = await listWaWorkbenchAccounts(session);
    setAccounts(rows);
    setAccountId((current) => current ?? rows[0]?.waAccountId ?? null);
  }, [session]);

  const loadConversations = useCallback(async () => {
    if (!session?.waSeatEnabled) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listWaWorkbenchConversations(session, {
        accountId,
        assignedToMe: assignedToMeOnly
      });
      setConversations(rows);
      setSelectedConversationId((current) => {
        if (!current) return rows[0]?.waConversationId ?? null;
        return rows.some((item) => item.waConversationId === current)
          ? current
          : (rows[0]?.waConversationId ?? null);
      });
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, assignedToMeOnly, session]);

  const loadContacts = useCallback(async () => {
    if (!session?.waSeatEnabled || !accountId) {
      setContacts([]);
      return;
    }
    try {
      const rows = await listWaWorkbenchContacts(session, { accountId });
      setContacts(rows);
    } catch {
      setContacts([]);
    }
  }, [accountId, session]);

  const loadDetail = useCallback(async () => {
    if (!session?.waSeatEnabled || !selectedConversationId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const next = await getWaWorkbenchConversationDetail(session, selectedConversationId);
      setDetail(next);
      // Assume there may be more if exactly 100 messages are returned (the default limit).
      setHasMoreMessages(next.messages.length >= 100);
    } catch (nextError) {
      setError((nextError as Error).message);
      setDetail(null);
      setHasMoreMessages(false);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedConversationId, session]);

  const openContactConversation = useCallback(async (contactId: string) => {
    if (!session || !accountId) return;
    setActionLoading("open-contact");
    setError("");
    try {
      const next = await openWaWorkbenchContactConversation(session, { accountId, contactId });
      setDetail(next);
      setSelectedConversationId(next.conversation.waConversationId);
      await loadConversations();
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setActionLoading(null);
    }
  }, [accountId, loadConversations, session]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!session?.accessToken || !session.waSeatEnabled) return;

    const socket = io(API_BASE_URL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      auth: {
        token: session.accessToken
      }
    });

    socket.on("wa.account.updated", (event: {
      waAccountId: string;
      accountStatus: string;
      connectionState: string;
      uiStatus: {
        code: string;
        label: string;
        detail: string;
        tone: "default" | "warning" | "success" | "danger" | "processing";
      };
      syncStatus: {
        code: string;
        label: string;
        detail: string;
        tone: "default" | "warning" | "success" | "danger" | "processing";
      };
    }) => {
      setAccounts((current) => current.map((item) => (
        item.waAccountId === event.waAccountId
          ? {
              ...item,
              accountStatus: event.accountStatus,
              uiStatus: event.uiStatus,
              syncStatus: event.syncStatus
            }
          : item
      )));
    });

    socket.on("wa.conversation.updated", (event: {
      waAccountId: string;
      conversation: WaConversationItem;
    }) => {
      setConversations((current) => {
        const target = event.conversation;
        const scoped = accountId && target.waAccountId !== accountId
          ? current.filter((item) => item.waConversationId !== target.waConversationId)
          : (() => {
              const next = current.filter((item) => item.waConversationId !== target.waConversationId);
              next.unshift(target);
              return next;
            })();
        return sortWaConversations(scoped);
      });

      if (event.conversation.waConversationId === selectedConversationId) {
        void loadDetail();
      }
    });

    socket.on("wa.message.updated", (event: {
      waConversationId: string;
      waMessageId: string;
      providerMessageId: string | null;
      deliveryStatus: string;
      receiptSummary: {
        totalReceipts: number;
        latestStatus: string | null;
        latestAt: string | null;
        statusCounts: Record<string, number>;
      } | null;
    }) => {
      if (event.waConversationId !== selectedConversationId) return;
      setDetail((current) => {
        if (!current || current.conversation.waConversationId !== event.waConversationId) return current;
        return {
          ...current,
          messages: current.messages.map((message) => (
            message.waMessageId === event.waMessageId || message.providerMessageId === event.providerMessageId
              ? {
                  ...message,
                  deliveryStatus: event.deliveryStatus,
                  receiptSummary: event.receiptSummary ?? message.receiptSummary
                }
              : message
          ))
        };
      });
    });

    return () => {
      socket.close();
    };
  }, [accountId, loadDetail, selectedConversationId, session]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.waConversationId === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const quotedMessage = useMemo(
    () => detail?.messages.find((item) => item.providerMessageId === quotedMessageId || item.waMessageId === quotedMessageId) ?? null,
    [detail?.messages, quotedMessageId]
  );

  const sendCurrentMessage = useCallback(async () => {
    if (!session || !selectedConversationId) return;
    if (!composerText.trim() && uploadingAttachments.length === 0) return;

    setActionLoading("send");
    setError("");
    try {
      if (uploadingAttachments.length === 0) {
        await sendWaTextMessage(session, selectedConversationId, {
          clientMessageId: crypto.randomUUID(),
          text: composerText.trim(),
          quotedMessageId
        });
      } else {
        const [attachment] = uploadingAttachments;
        const mediaType =
          attachment.mimeType.startsWith("image/") ? "image" :
          attachment.mimeType.startsWith("video/") ? "video" :
          attachment.mimeType.startsWith("audio/") ? "audio" :
          "document";
        await sendWaMediaMessage(session, selectedConversationId, {
          clientMessageId: crypto.randomUUID(),
          type: mediaType,
          text: composerText.trim() || null,
          quotedMessageId,
          attachment: {
            url: attachment.url,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName
          }
        });
      }
      setComposerText("");
      setQuotedMessageId(null);
      setUploadingAttachments([]);
      await loadConversations();
      await loadDetail();
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setActionLoading(null);
    }
  }, [composerText, loadConversations, loadDetail, quotedMessageId, selectedConversationId, session, uploadingAttachments]);

  const uploadFiles = useCallback(async (files: FileList | null) => {
    if (!session || !files?.length) return;
    setActionLoading("upload");
    setError("");
    try {
      const uploaded = await Promise.all(Array.from(files).map(async (file) => {
        const result = await uploadWaAttachment(session, file);
        return {
          localId: crypto.randomUUID(),
          fileName: result.fileName,
          mimeType: result.mimeType,
          url: result.url
        } satisfies UploadingAttachment;
      }));
      setUploadingAttachments((current) => [...current, ...uploaded]);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setActionLoading(null);
    }
  }, [session]);

  const takeoverCurrentConversation = useCallback(async () => {
    if (!session || !selectedConversationId) return;
    setActionLoading("takeover");
    try {
      await takeoverWaConversation(session, selectedConversationId);
      await loadConversations();
      await loadDetail();
    } finally {
      setActionLoading(null);
    }
  }, [loadConversations, loadDetail, selectedConversationId, session]);

  const releaseCurrentConversation = useCallback(async () => {
    if (!session || !selectedConversationId) return;
    setActionLoading("release");
    try {
      await releaseWaConversation(session, selectedConversationId);
      await loadConversations();
      await loadDetail();
    } finally {
      setActionLoading(null);
    }
  }, [loadConversations, loadDetail, selectedConversationId, session]);

  // Wraps setSelectedConversationId so we can capture the conversation's
  // current unread count before detail loading resets it on the server.
  const selectConversation = useCallback((id: string | null) => {
    if (id) {
      const conv = conversations.find((item) => item.waConversationId === id);
      setUnreadCountBeforeOpen(conv?.unreadCount ?? 0);
    } else {
      setUnreadCountBeforeOpen(0);
    }
    setSelectedConversationId(id);
  }, [conversations]);

  const loadMoreMessages = useCallback(async () => {
    if (!session || !selectedConversationId || !detail || loadingMoreMessages) return;
    const oldestSeq = detail.messages[0]?.logicalSeq;
    if (oldestSeq == null) return;
    setLoadingMoreMessages(true);
    try {
      const result = await loadMoreWaMessages(session, selectedConversationId, { beforeSeq: oldestSeq, limit: 50 });
      setDetail((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: [...result.messages, ...current.messages]
        };
      });
      setHasMoreMessages(result.hasMore);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [detail, loadingMoreMessages, selectedConversationId, session]);

  const reactToMessage = useCallback(async (message: WaMessageItem, emoji: string) => {
    if (!session || !detail) return;
    setActionLoading(`reaction:${message.waMessageId}`);
    try {
      await sendWaReaction(session, message.waMessageId, {
        conversationId: detail.conversation.waConversationId,
        emoji
      });
      await loadDetail();
    } finally {
      setActionLoading(null);
    }
  }, [detail, loadDetail, session]);

  return {
    accounts,
    accountId,
    setAccountId,
    conversations,
    contacts,
    selectedConversation,
    selectedConversationId,
    setSelectedConversationId,
    selectConversation,
    unreadCountBeforeOpen,
    detail,
    loading,
    detailLoading,
    composerText,
    setComposerText,
    quotedMessageId,
    setQuotedMessageId,
    quotedMessage,
    uploadingAttachments,
    setUploadingAttachments,
    actionLoading,
    error,
    assignedToMeOnly,
    setAssignedToMeOnly,
    loadAccounts,
    loadConversations,
    loadDetail,
    openContactConversation,
    sendCurrentMessage,
    uploadFiles,
    takeoverCurrentConversation,
    releaseCurrentConversation,
    hasMoreMessages,
    loadingMoreMessages,
    loadMoreMessages,
    reactToMessage,
    forceAssignWaConversation: async (memberId: string) => {
      if (!session || !selectedConversationId) return;
      setActionLoading("force-assign");
      try {
        await forceAssignWaConversation(session, selectedConversationId, memberId);
        await loadConversations();
        await loadDetail();
      } finally {
        setActionLoading(null);
      }
    }
  };
}
