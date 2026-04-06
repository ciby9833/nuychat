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
  listWaWorkbenchConversations,
  releaseWaConversation,
  sendWaMediaMessage,
  sendWaReaction,
  sendWaTextMessage,
  takeoverWaConversation,
  uploadWaAttachment
} from "../api";
import type { WaAccountItem, WaConversationDetail, WaConversationItem, WaMessageItem } from "../types";

type UploadingAttachment = {
  localId: string;
  fileName: string;
  mimeType: string;
  url: string;
};

export function useWaWorkspace(session: Session | null) {
  const [accounts, setAccounts] = useState<WaAccountItem[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<WaConversationItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WaConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [quotedMessageId, setQuotedMessageId] = useState<string | null>(null);
  const [uploadingAttachments, setUploadingAttachments] = useState<UploadingAttachment[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);

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
      setSelectedConversationId((current) => current ?? rows[0]?.waConversationId ?? null);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, assignedToMeOnly, session]);

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
    } catch (nextError) {
      setError((nextError as Error).message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedConversationId, session]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

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
    }) => {
      setAccounts((current) => current.map((item) => (
        item.waAccountId === event.waAccountId
          ? {
              ...item,
              accountStatus: event.accountStatus
            }
          : item
      )));
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
  }, [selectedConversationId, session]);

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
    selectedConversation,
    selectedConversationId,
    setSelectedConversationId,
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
    sendCurrentMessage,
    uploadFiles,
    takeoverCurrentConversation,
    releaseCurrentConversation,
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
