/**
 * 功能名称: WA 工作台状态管理
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 管理 WA 账号列表、会话列表、详情、接管、发送与上传状态。
 * 交互页面:
 * - ../components/WaWorkspace.tsx: 消费当前 hook 暴露的页面视图模型。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import type { Session } from "../../types";
import { API_BASE_URL } from "../../api";
import {
  archiveWaConversation,
  deleteWaMessage,
  editWaMessage,
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
  triggerWaAccountSync,
  uploadWaAttachment
} from "../api";
import type { WaAccountItem, WaContactItem, WaConversationDetail, WaConversationItem, WaMessageItem } from "../types";

type UploadingAttachment = {
  localId: string;
  fileName: string;
  mimeType: string;
  url: string;
};

type SelectedMention = {
  jid: string;
  label: string;
};

type ComposerDraft = {
  composerText: string;
  selectedMentions: SelectedMention[];
  quotedMessage: WaMessageItem | null;
  uploadingAttachments: UploadingAttachment[];
};

function isSeatVisibleWaConversation(conversation: Pick<WaConversationItem, "chatJid">) {
  return conversation.chatJid !== "status@broadcast" && !conversation.chatJid.endsWith("@newsletter");
}

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
  const [selectedMentions, setSelectedMentions] = useState<SelectedMention[]>([]);
  // Store the full quoted message item directly so clearing it is always
  // reliable — deriving it from detail.messages caused race conditions where a
  // loadDetail() triggered by socket events would re-surface a cleared quote.
  const [quotedMessage, setQuotedMessage] = useState<WaMessageItem | null>(null);
  const [uploadingAttachments, setUploadingAttachments] = useState<UploadingAttachment[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Stable refs so socket callbacks can read the latest values without triggering re-subscription.
  const selectedConversationIdRef = useRef<string | null>(null);
  const loadDetailRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const accountIdRef = useRef<string | null>(null);
  const accountsRef = useRef<WaAccountItem[]>([]);
  const draftKeyRef = useRef<string | null>(null);
  const composerTextRef = useRef("");
  const selectedMentionsRef = useRef<SelectedMention[]>([]);
  const quotedMessageRef = useRef<WaMessageItem | null>(null);
  const uploadingAttachmentsRef = useRef<UploadingAttachment[]>([]);
  const composerDraftsRef = useRef<Record<string, ComposerDraft>>({});

  const activeDraftKey = accountId && selectedConversationId
    ? `${accountId}:${selectedConversationId}`
    : null;

  const persistDraft = useCallback((key: string | null) => {
    if (!key) return;
    const draft: ComposerDraft = {
      composerText: composerTextRef.current,
      selectedMentions: selectedMentionsRef.current,
      quotedMessage: quotedMessageRef.current,
      uploadingAttachments: uploadingAttachmentsRef.current
    };
    const hasDraft =
      draft.composerText.length > 0 ||
      draft.selectedMentions.length > 0 ||
      Boolean(draft.quotedMessage) ||
      draft.uploadingAttachments.length > 0;
    if (hasDraft) {
      composerDraftsRef.current[key] = draft;
    } else {
      delete composerDraftsRef.current[key];
    }
  }, []);

  const restoreDraft = useCallback((key: string | null) => {
    const draft = key ? composerDraftsRef.current[key] : null;
    setComposerText(draft?.composerText ?? "");
    setSelectedMentions(draft?.selectedMentions ?? []);
    setQuotedMessage(draft?.quotedMessage ?? null);
    setUploadingAttachments(draft?.uploadingAttachments ?? []);
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!session?.waSeatEnabled) return;
    const rows = await listWaWorkbenchAccounts(session);
    accountsRef.current = rows;
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
        assignedToMe: assignedToMeOnly,
        archived: archivedOnly
      });
      const visibleRows = rows.filter(isSeatVisibleWaConversation);
      setConversations(visibleRows);
      setSelectedConversationId((current) => {
        if (!current) return visibleRows[0]?.waConversationId ?? null;
        return visibleRows.some((item) => item.waConversationId === current)
          ? current
          : (visibleRows[0]?.waConversationId ?? null);
      });
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, archivedOnly, assignedToMeOnly, session]);

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
      // Immediately zero out the unread badge in the conversation list so it doesn't
      // wait for the server-side wa.conversation.updated socket event (which might
      // arrive during a brief socket reconnect window and be missed).
      setConversations((current) =>
        current.map((item) =>
          item.waConversationId === selectedConversationId
            ? { ...item, unreadCount: 0 }
            : item
        )
      );
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

  // Keep refs in sync so socket callbacks always see the latest values.
  selectedConversationIdRef.current = selectedConversationId;
  loadDetailRef.current = loadDetail;
  accountIdRef.current = accountId;
  accountsRef.current = accounts;
  composerTextRef.current = composerText;
  selectedMentionsRef.current = selectedMentions;
  quotedMessageRef.current = quotedMessage;
  uploadingAttachmentsRef.current = uploadingAttachments;

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
    const previousKey = draftKeyRef.current;
    if (previousKey === activeDraftKey) return;
    persistDraft(previousKey);
    draftKeyRef.current = activeDraftKey;
    restoreDraft(activeDraftKey);
  }, [activeDraftKey, persistDraft, restoreDraft]);

  useEffect(() => {
    if (!session?.accessToken || !session.waSeatEnabled) return;

    const socket = io(API_BASE_URL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      auth: { token: session.accessToken }
    });

    socket.on("wa.account.updated", (event: {
      waAccountId: string;
      status: { code: string; label: string; detail: string; tone: "default" | "warning" | "success" | "danger" | "processing" };
      connectionState: string;
    }) => {
      setAccounts((current) => current.map((item) =>
        item.waAccountId === event.waAccountId
          ? { ...item, status: event.status, session: item.session ? { ...item.session, connectionState: event.connectionState } : item.session }
          : item
      ));
    });

    socket.on("wa.conversation.updated", (event: { waAccountId: string; conversation: WaConversationItem }) => {
      const currentAccountId = accountIdRef.current;
      setConversations((current) => {
        const target = event.conversation;
        if (!isSeatVisibleWaConversation(target)) {
          return current.filter((item) => item.waConversationId !== target.waConversationId);
        }
        // If a specific account is selected and this event is for a different account, hide it.
        const scoped = currentAccountId && target.waAccountId !== currentAccountId
          ? current.filter((item) => item.waConversationId !== target.waConversationId)
          : (() => {
              const next = current.filter((item) => item.waConversationId !== target.waConversationId);
              // Preserve the local unreadCount=0 if we already read this conversation.
              const currentSelected = selectedConversationIdRef.current;
              const incomingConv = currentSelected === target.waConversationId
                ? { ...target, unreadCount: 0 }  // don't let server re-badge a currently-open conversation
                : target;
              next.unshift(incomingConv);
              return next;
            })();
        return sortWaConversations(scoped);
      });

      // Reload messages if this conversation is currently open (new message arrived).
      if (event.conversation.waConversationId === selectedConversationIdRef.current) {
        void loadDetailRef.current();
      }
    });

    socket.on("wa.message.updated", (event: {
      waConversationId: string;
      waMessageId: string;
      providerMessageId: string | null;
      deliveryStatus: string;
      receiptSummary: { totalReceipts: number; latestStatus: string | null; latestAt: string | null; statusCounts: Record<string, number> } | null;
    }) => {
      if (event.waConversationId !== selectedConversationIdRef.current) return;
      setDetail((current) => {
        if (!current || current.conversation.waConversationId !== event.waConversationId) return current;
        return {
          ...current,
          messages: current.messages.map((message) =>
            message.waMessageId === event.waMessageId || message.providerMessageId === event.providerMessageId
              ? { ...message, deliveryStatus: event.deliveryStatus, receiptSummary: event.receiptSummary ?? message.receiptSummary }
              : message
          )
        };
      });
    });

    return () => { socket.close(); };
    // Only reconnect when the session token changes — NOT on every conversation switch.
    // Conversation ID and loadDetail are accessed via refs to avoid this dependency.
  }, [session]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.waConversationId === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const sendCurrentMessage = useCallback(async () => {
    if (!session || !selectedConversationId) return;
    if (!composerText.trim() && uploadingAttachments.length === 0) return;

    // Derive the ID used by the backend — prefer the WhatsApp provider ID so
    // the backend can build a proper quote context without an extra DB lookup.
    const quotedMessageId = quotedMessage?.providerMessageId || quotedMessage?.waMessageId || null;

    setActionLoading("send");
    setError("");
    try {
      if (uploadingAttachments.length === 0) {
        await sendWaTextMessage(session, selectedConversationId, {
          clientMessageId: crypto.randomUUID(),
          text: composerText.trim(),
          quotedMessageId,
          mentionJids: selectedMentions.map((item) => item.jid)
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
          mentionJids: selectedMentions.map((item) => item.jid),
          attachment: {
            url: attachment.url,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName
          }
        });
      }
      setComposerText("");
      setSelectedMentions([]);
      setUploadingAttachments([]);
      const draftKey = draftKeyRef.current;
      if (draftKey) delete composerDraftsRef.current[draftKey];
      await loadConversations();
      await loadDetail();
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      // Always clear the quoted message — either it was sent successfully, or the
      // send failed (user should re-select the quote if they want to retry).
      setQuotedMessage(null);
      setSelectedMentions([]);
      setActionLoading(null);
    }
  }, [composerText, loadConversations, loadDetail, quotedMessage, selectedConversationId, selectedMentions, session, uploadingAttachments]);

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

  const archiveConversation = useCallback(async (waConversationId: string, archive: boolean) => {
    if (!session) return;
    setActionLoading(`archive:${waConversationId}`);
    try {
      await archiveWaConversation(session, waConversationId, archive);
      await loadConversations();
      if (selectedConversationId === waConversationId && archive && !archivedOnly) {
        setSelectedConversationId(null);
        setDetail(null);
      } else if (selectedConversationId === waConversationId) {
        await loadDetail();
      }
    } finally {
      setActionLoading(null);
    }
  }, [archivedOnly, loadConversations, loadDetail, selectedConversationId, session]);

  const editMessage = useCallback(async (message: WaMessageItem, text: string) => {
    if (!session || !text.trim()) return;
    setActionLoading(`edit:${message.waMessageId}`);
    try {
      await editWaMessage(session, message.waMessageId, {
        text: text.trim(),
        mentionJids: message.mentions?.map((item) => item.jid) ?? null
      });
      await loadConversations();
      await loadDetail();
    } finally {
      setActionLoading(null);
    }
  }, [loadConversations, loadDetail, session]);

  const deleteMessage = useCallback(async (message: WaMessageItem, scope: "me" | "everyone") => {
    if (!session) return;
    setActionLoading(`delete:${message.waMessageId}`);
    try {
      await deleteWaMessage(session, message.waMessageId, scope);
      await loadConversations();
      await loadDetail();
    } finally {
      setActionLoading(null);
    }
  }, [loadConversations, loadDetail, session]);

  // Wraps setSelectedConversationId so we can capture the conversation's
  // current unread count before detail loading resets it on the server.
  // Composer drafts are stored per account + conversation, so switching away and
  // back behaves like WhatsApp Web: unfinished text stays with that chat.
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

  const triggerSync = useCallback(async () => {
    if (!session || !accountId || syncing) return;
    const selectedAccount = accountsRef.current.find((item) => item.waAccountId === accountId) ?? null;
    if (!selectedAccount || selectedAccount.status.code !== "connected") return;
    setSyncing(true);
    try {
      await triggerWaAccountSync(session, accountId);
      // Reload conversations after a short delay to pick up synced data
      setTimeout(() => { void loadConversations(); }, 3000);
    } finally {
      setSyncing(false);
    }
  }, [accountId, loadConversations, session, syncing]);

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

  const addMention = useCallback((mention: SelectedMention) => {
    setSelectedMentions((current) =>
      current.some((item) => item.jid === mention.jid) ? current : [...current, mention]
    );
    setComposerText((current) => {
      const nextToken = `@${mention.label}`;
      return current.includes(nextToken) ? current : `${current}${current.trim().length ? " " : ""}${nextToken} `;
    });
  }, []);

  const removeMention = useCallback((jid: string) => {
    setSelectedMentions((current) => current.filter((item) => item.jid !== jid));
  }, []);

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
    selectedMentions,
    addMention,
    removeMention,
    quotedMessage,
    setQuotedMessage,
    uploadingAttachments,
    setUploadingAttachments,
    actionLoading,
    error,
    assignedToMeOnly,
    setAssignedToMeOnly,
    archivedOnly,
    setArchivedOnly,
    loadAccounts,
    loadConversations,
    loadDetail,
    openContactConversation,
    sendCurrentMessage,
    uploadFiles,
    takeoverCurrentConversation,
    releaseCurrentConversation,
    archiveConversation,
    editMessage,
    deleteMessage,
    hasMoreMessages,
    loadingMoreMessages,
    loadMoreMessages,
    reactToMessage,
    syncing,
    triggerSync,
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
