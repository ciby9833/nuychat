// 功能菜单
import { ReloadOutlined, UserOutlined } from "@ant-design/icons";
import { AutoComplete, Button, Card, Col, Empty, Input, List, Popconfirm, Row, Segmented, Select, Space, Switch, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import {
  adminMediaUrl,
  bindAdminJidToCustomer,
  getWaMonitorConversationDetail,
  getWaMonitorDashboard,
  listAdminWaCustomerContacts,
  listAdminWaMembersWithBindings,
  listAdminWaTeamMembers,
  listWaMonitorConversations,
  loadMoreWaMonitorMessages,
  setWaMonitorTarget,
  unbindAdminJidFromCustomer
} from "../../api";
import type {
  WaCustomerContact,
  WaMemberWithBinding,
  WaMonitorConversationDetail,
  WaMonitorConversationItem,
  WaMonitorDashboard,
  WaTeamMember
} from "../../types";

type ConversationFilter = "all" | "group" | "direct";

function formatMonitorDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function mapToneToStatusColor(tone: string) {
  switch (tone) {
    case "success":
      return "green";
    case "danger":
      return "red";
    case "processing":
      return "blue";
    case "warning":
      return "gold";
    default:
      return "default";
  }
}

function bubbleStyle(direction: string) {
  const outbound = direction === "outbound";
  return {
    alignSelf: outbound ? "flex-end" : "flex-start",
    background: outbound ? "#dcf8c6" : "#fff",
    border: "1px solid #ece5dd",
    borderRadius: 16,
    padding: "10px 12px",
    maxWidth: "78%",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)"
  } satisfies React.CSSProperties;
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AttachmentItem = NonNullable<WaMonitorConversationDetail["messages"][number]["attachments"]>[number];

function isImageAttachment(mimeType: string | null | undefined, attachmentType: string) {
  return Boolean(mimeType?.startsWith("image/")) || attachmentType === "image" || attachmentType === "sticker";
}

function isVideoAttachment(mimeType: string | null | undefined, attachmentType: string) {
  return Boolean(mimeType?.startsWith("video/")) || attachmentType === "video";
}

function isAudioAttachment(mimeType: string | null | undefined, attachmentType: string) {
  return Boolean(mimeType?.startsWith("audio/")) || attachmentType === "audio" || attachmentType === "ptt" || attachmentType === "voice";
}

/** Image with graceful error fallback — swaps to a placeholder if the URL fails to load */
function AttachmentImage({ src, alt, style, href }: { src: string; alt: string; style?: CSSProperties; href: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#f5f5f5", borderRadius: 10, border: "1px solid #e8e8e8" }}>
        <span style={{ fontSize: 20 }}>🖼</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{alt}</Typography.Text>
      </div>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: "inline-block" }}>
      <img src={src} alt={alt} style={style} onError={() => setErrored(true)} />
    </a>
  );
}

function renderAttachment(
  item: AttachmentItem,
  labels: { voiceMessage: string; fileAttachment: string },
  resolveUrl: (attachmentId: string) => string | null
) {
  // Always route through the admin media proxy — WA CDN URLs are encrypted
  const proxyUrl = resolveUrl(item.attachmentId);
  const sourceUrl = proxyUrl ?? item.storageUrl ?? item.previewUrl;
  const displayUrl = proxyUrl ?? item.previewUrl ?? item.storageUrl;
  const isSticker = item.attachmentType === "sticker";

  // ── Image / Sticker ─────────────────────────────────────────────────────────
  if (isImageAttachment(item.mimeType, item.attachmentType)) {
    if (!displayUrl && !sourceUrl) {
      // Media not downloaded yet — show descriptive placeholder
      return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#f5f5f5", borderRadius: 10, border: "1px solid #e8e8e8" }}>
          <span style={{ fontSize: 20 }}>{isSticker ? "🏷" : "🖼"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {isSticker ? "贴纸" : (item.fileName ?? "图片")}
          </Typography.Text>
        </div>
      );
    }
    return (
      <AttachmentImage
        src={displayUrl ?? sourceUrl ?? ""}
        alt={item.fileName ?? (isSticker ? "贴纸" : "图片")}
        href={sourceUrl ?? displayUrl ?? "#"}
        style={{
          display: "block",
          maxWidth: isSticker ? 110 : 300,
          maxHeight: isSticker ? 110 : 300,
          borderRadius: isSticker ? 0 : 12,
          objectFit: "contain",
          border: isSticker ? "none" : "1px solid #ece5dd"
        }}
      />
    );
  }

  // ── Video ────────────────────────────────────────────────────────────────────
  if (isVideoAttachment(item.mimeType, item.attachmentType)) {
    if (sourceUrl) {
      return (
        <div style={{ maxWidth: 300 }}>
          <video
            controls
            preload="metadata"
            src={sourceUrl}
            poster={item.previewUrl ?? undefined}
            style={{ width: "100%", maxHeight: 220, borderRadius: 12, display: "block" }}
          />
          {item.fileName ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.fileName}</Typography.Text>
          ) : null}
        </div>
      );
    }
    // No playable URL — thumbnail or solid placeholder with play icon
    return (
      <div style={{ position: "relative", display: "inline-block", borderRadius: 12, overflow: "hidden" }}>
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt="视频"
            style={{ maxWidth: 260, maxHeight: 180, display: "block", filter: "brightness(0.7)" }}
          />
        ) : (
          <div style={{ width: 260, height: 150, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography.Text style={{ color: "#aaa", fontSize: 12 }}>视频未下载</Typography.Text>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 16 }}>▶</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Audio / PTT ──────────────────────────────────────────────────────────────
  if (isAudioAttachment(item.mimeType, item.attachmentType)) {
    const isPtt = item.attachmentType === "ptt" || item.attachmentType === "voice";
    const durationLabel = item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : null;
    if (sourceUrl) {
      return (
        <div style={{ minWidth: 200 }}>
          <audio controls preload="none" src={sourceUrl} style={{ width: "100%", height: 36 }} />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {isPtt ? "🎙 " : "🎵 "}{durationLabel ?? item.fileName ?? labels.voiceMessage}
          </Typography.Text>
        </div>
      );
    }
    return (
      <div style={{ padding: "8px 12px", background: "#f0f0f0", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{isPtt ? "🎙" : "🎵"}</span>
        <Typography.Text style={{ fontSize: 13 }}>{durationLabel ?? labels.voiceMessage}</Typography.Text>
      </div>
    );
  }

  // ── Document / generic file ──────────────────────────────────────────────────
  return (
    <a
      href={sourceUrl ?? "#"}
      target={sourceUrl ? "_blank" : undefined}
      rel="noreferrer"
      style={{ display: "block", padding: "10px 12px", background: "#f5f5f5", borderRadius: 12, border: "1px solid #ece5dd", color: "inherit", textDecoration: "none" }}
    >
      <Typography.Text strong style={{ display: "block" }}>
        📎 {item.fileName ?? labels.fileAttachment}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {[item.mimeType, formatFileSize(item.fileSize)].filter(Boolean).join(" · ") || item.attachmentType}
      </Typography.Text>
    </a>
  );
}

function renderQuotedPreview(preview: NonNullable<WaMonitorConversationDetail["messages"][number]["quotedMessagePreview"]>) {
  const label = preview.senderDisplayName ?? "对方";
  const body = preview.bodyText
    ?? (preview.attachmentFileName ? `📎 ${preview.attachmentFileName}` : null)
    ?? `（${preview.messageType}）`;
  return (
    <div
      style={{
        borderLeft: "3px solid #25D366",
        paddingLeft: 8,
        marginBottom: 6,
        background: "rgba(0,0,0,0.04)",
        borderRadius: "0 6px 6px 0",
        padding: "4px 8px 4px 10px"
      }}
    >
      <Typography.Text style={{ display: "block", fontSize: 12, color: "#25D366", fontWeight: 600 }}>
        {label}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
        {body}
      </Typography.Text>
    </div>
  );
}

export function WaConversationsTab() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<WaMonitorDashboard | null>(null);
  const [conversations, setConversations] = useState<WaMonitorConversationItem[]>([]);
  const [detail, setDetail] = useState<WaMonitorConversationDetail | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("all");
  const [loading, setLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [targetUpdatingId, setTargetUpdatingId] = useState<string | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const keepScrollOffsetRef = useRef<number | null>(null);

  // 成员客户绑定
  const [membersWithBindings, setMembersWithBindings] = useState<WaMemberWithBinding[]>([]);
  const [teamMembers, setTeamMembers] = useState<WaTeamMember[]>([]);
  const [customerList, setCustomerList] = useState<WaCustomerContact[]>([]);
  const [bindingJid, setBindingJid] = useState<string | null>(null);
  const [bindingCustomerSearch, setBindingCustomerSearch] = useState("");
  const [bindingCustomerId, setBindingCustomerId] = useState<string | null>(null);
  const [bindingOwnerMembershipId, setBindingOwnerMembershipId] = useState<string>("");
  const [bindingSaving, setBindingSaving] = useState(false);

  // 当群聊会话选中时加载成员绑定数据
  useEffect(() => {
    const convId = detail?.conversation.waConversationId;
    const convType = detail?.conversation.conversationType;
    if (!convId || convType !== "group") {
      setMembersWithBindings([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [nextMembers, nextTeam, nextCustomers] = await Promise.all([
          listAdminWaMembersWithBindings(convId),
          listAdminWaTeamMembers(),
          listAdminWaCustomerContacts({ pageSize: 500 }).then((r) => r.rows)
        ]);
        if (cancelled) return;
        setMembersWithBindings(nextMembers);
        setTeamMembers(nextTeam);
        setCustomerList(nextCustomers);
      } catch (error) {
        if (!cancelled) void message.error((error as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.conversation.waConversationId, detail?.conversation.conversationType]);

  const handleBindMember = useCallback(async (participantJid: string) => {
    if (!bindingCustomerSearch.trim()) return;
    setBindingSaving(true);
    try {
      const result = await bindAdminJidToCustomer({
        participantJid,
        waCustomerContactId: bindingCustomerId ?? null,
        customerName: bindingCustomerId ? null : bindingCustomerSearch.trim(),
        ownerMembershipId: bindingOwnerMembershipId || null,
        sourceConversationId: selectedConversationId
      });
      setMembersWithBindings((current) =>
        current.map((m) =>
          m.participantJid === participantJid
            ? {
                ...m,
                customerContactId: result.customer.waCustomerContactId,
                customerName: result.customer.displayName,
                ownerMembershipId: result.customer.ownerMembershipId,
                ownerName: result.customer.ownerName
              }
            : m
        )
      );
      if (!customerList.some((c) => c.waCustomerContactId === result.customer.waCustomerContactId)) {
        setCustomerList((prev) => [...prev, result.customer]);
      }
      setBindingJid(null);
      setBindingCustomerSearch("");
      setBindingCustomerId(null);
      void message.success("绑定成功");
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setBindingSaving(false);
    }
  }, [bindingCustomerId, bindingCustomerSearch, bindingOwnerMembershipId, customerList, selectedConversationId]);

  const handleUnbindMember = useCallback(async (participantJid: string) => {
    try {
      await unbindAdminJidFromCustomer(participantJid);
      setMembersWithBindings((current) =>
        current.map((m) =>
          m.participantJid === participantJid
            ? { ...m, customerContactId: null, customerName: null, ownerMembershipId: null, ownerName: null, bindingRemarks: null }
            : m
        )
      );
      void message.success("已解除绑定");
    } catch (error) {
      void message.error((error as Error).message);
    }
  }, []);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const nextDashboard = await getWaMonitorDashboard();
      setDashboard(nextDashboard);
      setSelectedAccountId((current) => {
        if (current && nextDashboard.accounts.some((item) => item.waAccountId === current)) return current;
        return nextDashboard.accounts[0]?.waAccountId ?? null;
      });
      setSelectedConversationId(null);
      setDetail(null);
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selectedAccountId) {
      setConversations([]);
      setSelectedConversationId(null);
      setDetail(null);
      return;
    }
    let cancelled = false;
    setConversationLoading(true);
    void (async () => {
      try {
        const rows = await listWaMonitorConversations(selectedAccountId, {
          search: conversationSearch,
          type: conversationFilter === "all" ? null : conversationFilter
        });
        if (cancelled) return;
        setConversations(rows);
        setSelectedConversationId((current) => current && rows.some((item) => item.waConversationId === current) ? current : null);
      } catch (error) {
        if (!cancelled) void message.error((error as Error).message);
      } finally {
        if (!cancelled) setConversationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, conversationFilter, conversationSearch]);

  useEffect(() => {
    if (!selectedConversationId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const next = await getWaMonitorConversationDetail(selectedConversationId);
        if (!cancelled) setDetail(next);
      } catch (error) {
        if (!cancelled) void message.error((error as Error).message);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId]);

  const loadMoreMessages = useCallback(async () => {
    if (!detail || !selectedConversationId || loadingMoreMessages || !detail.hasMore || detail.messages.length === 0) return;
    const oldestSeq = detail.messages[0]?.logicalSeq;
    if (!oldestSeq) return;
    const viewport = messageViewportRef.current;
    keepScrollOffsetRef.current = viewport ? viewport.scrollHeight - viewport.scrollTop : null;
    setLoadingMoreMessages(true);
    try {
      const next = await loadMoreWaMonitorMessages(selectedConversationId, { beforeSeq: oldestSeq, limit: 50 });
      setDetail((current) => {
        if (!current) return current;
        const seen = new Set(current.messages.map((item) => item.waMessageId));
        const merged = [...next.messages.filter((item) => !seen.has(item.waMessageId)), ...current.messages];
        return {
          ...current,
          messages: merged,
          hasMore: next.hasMore
        };
      });
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [detail, loadingMoreMessages, selectedConversationId]);

  const toggleMonitorTarget = useCallback(async (row: WaMonitorConversationItem, checked: boolean) => {
    setTargetUpdatingId(row.waConversationId);
    try {
      const target = await setWaMonitorTarget({
        waAccountId: row.waAccountId,
        waConversationId: row.waConversationId,
        isActive: checked
      });
      setConversations((current) => current.map((item) => item.waConversationId === row.waConversationId
        ? { ...item, monitorTargetId: target.targetId, monitorEnabled: target.isActive }
        : item));
      setDetail((current) => current?.conversation.waConversationId === row.waConversationId
        ? {
            ...current,
            conversation: {
              ...current.conversation,
              monitorTargetId: target.targetId,
              monitorEnabled: target.isActive
            }
          }
        : current);
      void message.success(checked ? t("waConversations.monitor.enabled") : t("waConversations.monitor.disabled"));
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setTargetUpdatingId(null);
    }
  }, [t]);

  const selectedAccount = useMemo(
    () => dashboard?.accounts.find((item) => item.waAccountId === selectedAccountId) ?? null,
    [dashboard, selectedAccountId]
  );

  useEffect(() => {
    setSelectedConversationId(null);
    setDetail(null);
  }, [selectedAccountId]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport || !detail) return;
    if (keepScrollOffsetRef.current != null) {
      const previousOffset = keepScrollOffsetRef.current;
      keepScrollOffsetRef.current = null;
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - previousOffset);
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [detail?.conversation.waConversationId, detail?.messages]);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Typography.Title level={3} style={{ margin: 0 }}>{t("waConversations.pageTitle")}</Typography.Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => void loadBase()} loading={loading}>{t("waConversations.refresh")}</Button>
        </Col>
      </Row>

      <Row gutter={12} align="stretch" style={{ flexWrap: "nowrap" }}>
        {/* ── 左栏：会话列表 ── */}
        <Col flex="320px" style={{ minWidth: 0 }}>
          <Card
            style={{ height: "100%" }}
            title={t("waConversations.listTitle")}
            extra={selectedAccount ? (
              <Space size={6}>
                <Tag color={mapToneToStatusColor(selectedAccount.status.tone)} style={{ margin: 0 }}>
                  {selectedAccount.status.label}
                </Tag>
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}
                  title={selectedAccount.displayName}
                >
                  {selectedAccount.displayName}
                </Typography.Text>
              </Space>
            ) : "-"}
          >
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Select
                value={selectedAccountId ?? undefined}
                onChange={(value) => setSelectedAccountId(value)}
                options={(dashboard?.accounts ?? []).map((item) => ({
                  label: `${item.displayName} (${item.phoneE164 ?? item.instanceKey})`,
                  value: item.waAccountId
                }))}
                placeholder={t("waConversations.accountSelector.placeholder")}
                style={{ width: "100%" }}
              />

              <Input.Search
                placeholder={t("waConversations.searchPlaceholder")}
                allowClear
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
              />

              <Segmented<ConversationFilter>
                value={conversationFilter}
                onChange={(value) => setConversationFilter(value)}
                block
                options={[
                  { label: t("waConversations.filter.all"), value: "all" },
                  { label: t("waConversations.filter.group"), value: "group" },
                  { label: t("waConversations.filter.direct"), value: "direct" }
                ]}
              />

              {selectedAccount ? (
                <Space wrap size={4}>
                  <Tag style={{ fontSize: 11 }}>{t("waConversations.accountMeta.members")}: {selectedAccount.memberCount}</Tag>
                  <Tag style={{ fontSize: 11 }}>{t("waConversations.accountMeta.unread")}: {selectedAccount.unreadMessageCount}</Tag>
                </Space>
              ) : null}

              <div style={{ height: 720, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 10, marginTop: 2 }}>
                <List
                  loading={conversationLoading}
                  dataSource={conversations}
                  locale={{ emptyText: t("waConversations.list.empty") }}
                  renderItem={(row) => (
                    <List.Item
                      onClick={() => setSelectedConversationId(row.waConversationId)}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        background: row.waConversationId === selectedConversationId ? "#e6f4ff" : "#fff",
                        borderBottom: "1px solid #f5f5f5",
                        // Override antd List.Item's default flex — we own the layout
                        display: "block"
                      }}
                    >
                      {/* ── Row 1: name (left) + time (right) ── */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.displayName}
                        </div>
                        <div style={{ flexShrink: 0, fontSize: 11, color: "rgba(0,0,0,0.35)", whiteSpace: "nowrap" }}>
                          {row.lastMessageAt ? new Date(row.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </div>
                      </div>

                      {/* ── Row 2: last message preview (left) + unread badge (right) ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "rgba(0,0,0,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.lastMessagePreview || t("waConversations.list.noMessages")}
                        </div>
                        {row.unreadCount > 0 ? (
                          <div style={{
                            flexShrink: 0,
                            minWidth: 18,
                            height: 18,
                            borderRadius: 9,
                            background: "#1677ff",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 5px"
                          }}>
                            {row.unreadCount}
                          </div>
                        ) : null}
                      </div>

                      {/* ── Row 3: type tag (left) + monitor switch (right) ── */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                        <Tag style={{ fontSize: 11, margin: 0, padding: "0 5px", color: "rgba(0,0,0,0.45)", borderColor: "rgba(0,0,0,0.15)", background: "transparent" }}>
                          {row.conversationType === "group" ? t("waConversations.filter.group") : t("waConversations.filter.direct")}
                        </Tag>
                        <Switch
                          size="small"
                          checked={Boolean(row.monitorEnabled)}
                          loading={targetUpdatingId === row.waConversationId}
                          checkedChildren={t("waConversations.monitor.on")}
                          unCheckedChildren={t("waConversations.monitor.off")}
                          onClick={(checked, event) => {
                            event.stopPropagation();
                            void toggleMonitorTarget(row, checked);
                          }}
                        />
                      </div>
                    </List.Item>
                  )}
                />
              </div>
            </Space>
          </Card>
        </Col>

        {/* ── 中栏：消息浏览 ── */}
        <Col flex="1" style={{ minWidth: 0 }}>
          <Card
            style={{ height: "100%" }}
            title={t("waConversations.messageTitle")}
            extra={
              detail ? (
                <Space size={6} wrap>
                  <Tag style={{ margin: 0 }}>
                    {detail.conversation.conversationType === "group" ? t("waConversations.filter.group") : t("waConversations.filter.direct")}
                  </Tag>
                  <Tag style={{ margin: 0 }}>{t("waConversations.detail.unread", { count: detail.conversation.unreadCount })}</Tag>
                  <Tag color={detail.conversation.monitorEnabled ? "green" : "default"} style={{ margin: 0 }}>
                    {detail.conversation.monitorEnabled ? t("waConversations.monitor.enabledTag") : t("waConversations.monitor.disabledTag")}
                  </Tag>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {detail.conversation.displayName}
                  </Typography.Text>
                </Space>
              ) : (
                <Typography.Text type="secondary">{t("waConversations.detail.selectConversation")}</Typography.Text>
              )
            }
          >
            {!selectedConversationId ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("waConversations.detail.clickToLoad")} style={{ padding: "60px 0" }} />
            ) : detailLoading ? (
              <Space direction="vertical" size={8} style={{ width: "100%", padding: 24 }}>
                <Typography.Text type="secondary">{t("waConversations.detail.loading")}</Typography.Text>
              </Space>
            ) : detail ? (
              <div
                ref={messageViewportRef}
                style={{ height: 760, overflowY: "auto", padding: 12, background: "#efeae2", borderRadius: 12, border: "1px solid #e5ddd5" }}
              >
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {detail.hasMore ? (
                    <div style={{ textAlign: "center" }}>
                      <Button onClick={() => void loadMoreMessages()} loading={loadingMoreMessages}>
                        {t("waConversations.detail.loadMore")}
                      </Button>
                    </div>
                  ) : null}
                  {detail.messages.map((item) => {
                    // Pure reaction messages render as a floating emoji pill
                    if (item.messageType === "reaction" && item.bodyText) {
                      return (
                        <div
                          key={item.waMessageId}
                          style={{ alignSelf: item.direction === "outbound" ? "flex-end" : "flex-start" }}
                        >
                          <span style={{
                            display: "inline-block",
                            fontSize: 22,
                            padding: "2px 8px",
                            background: "rgba(255,255,255,0.85)",
                            borderRadius: 20,
                            border: "1px solid #ece5dd",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.08)"
                          }}>
                            {item.bodyText}
                          </span>
                        </div>
                      );
                    }

                    const attachLabels = {
                      voiceMessage: t("waConversations.detail.voiceMessage"),
                      fileAttachment: t("waConversations.detail.fileAttachment")
                    };
                    const resolveAttachUrl = adminMediaUrl;

                    return (
                      <div key={item.waMessageId} style={bubbleStyle(item.direction)}>
                        {/* Sender name — inbound group messages */}
                        {item.direction === "inbound" && item.senderDisplayName ? (
                          <Typography.Text style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#075E54" }}>
                            {item.senderDisplayName}
                          </Typography.Text>
                        ) : null}

                        {/* Revoked */}
                        {item.revokedAt ? (
                          <Typography.Text type="secondary" style={{ fontSize: 13, fontStyle: "italic" }}>
                            🚫 此消息已被撤回
                          </Typography.Text>
                        ) : (
                          <>
                            {/* Quoted message block */}
                            {item.quotedMessagePreview ? renderQuotedPreview(item.quotedMessagePreview) : null}

                            {/* Attachments (images, video, audio, docs) */}
                            {item.attachments?.length ? (
                              <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: item.bodyText ? 8 : 4 }}>
                                {item.attachments.map((attachment) => (
                                  <div key={attachment.attachmentId}>
                                    {renderAttachment(attachment, attachLabels, resolveAttachUrl)}
                                  </div>
                                ))}
                              </Space>
                            ) : null}

                            {/* Body text */}
                            {item.bodyText ? (
                              <Typography.Paragraph style={{ marginBottom: 4, whiteSpace: "pre-wrap" }}>
                                {item.bodyText}
                              </Typography.Paragraph>
                            ) : item.attachments?.length ? null : (
                              <Typography.Paragraph style={{ marginBottom: 4, fontStyle: "italic", color: "#8c8c8c", fontSize: 13 }}>
                                {`（${item.messageType}）`}
                              </Typography.Paragraph>
                            )}
                          </>
                        )}

                        {/* Emoji reactions on this message */}
                        {item.reactions?.length ? (
                          <Space size={4} wrap style={{ marginTop: 4 }}>
                            {item.reactions.map((r) => (
                              <span
                                key={r.reactionId}
                                title={r.actorJid ?? undefined}
                                style={{
                                  fontSize: 13,
                                  padding: "1px 5px",
                                  background: "rgba(255,255,255,0.85)",
                                  borderRadius: 12,
                                  border: "1px solid #e0d9d0",
                                  cursor: "default"
                                }}
                              >
                                {r.emoji}
                              </span>
                            ))}
                          </Space>
                        ) : null}

                        {/* Footer */}
                        <Space size={5} style={{ marginTop: 3 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {formatMonitorDate(item.providerTs ?? item.createdAt)}
                          </Typography.Text>
                          {item.editedAt ? (
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>已编辑</Typography.Text>
                          ) : null}
                          {item.direction === "outbound" && item.deliveryStatus && item.deliveryStatus !== "pending" ? (
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                              {item.deliveryStatus === "read" ? "✓✓" : item.deliveryStatus === "delivered" ? "✓✓" : "✓"}
                            </Typography.Text>
                          ) : null}
                        </Space>
                      </div>
                    );
                  })}
                </Space>
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("waConversations.detail.loadFailed")} style={{ padding: "60px 0" }} />
            )}
          </Card>
        </Col>

        {/* ── 右栏：群成员标注 ── */}
        <Col flex="300px" style={{ minWidth: 0 }}>
          <Card
            style={{ height: "100%" }}
            styles={{ body: { padding: 0 } }}
            title={
              <Space size={6}>
                <UserOutlined />
                <span>群成员标注</span>
                {detail?.conversation.conversationType === "group" && membersWithBindings.length > 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    ({membersWithBindings.length})
                  </Typography.Text>
                ) : null}
              </Space>
            }
          >
            {!detail || detail.conversation.conversationType !== "group" ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  !detail
                    ? "请选择一个会话"
                    : "该会话不是群聊"
                }
                style={{ padding: "60px 0" }}
              />
            ) : (
              <div style={{ height: 800, overflowY: "auto" }}>
                <List
                  size="small"
                  dataSource={membersWithBindings}
                  locale={{ emptyText: "暂无成员数据" }}
                  renderItem={(member) => (
                    <List.Item
                      style={{
                        padding: "10px 14px",
                        display: "block",
                        borderBottom: "1px solid #f5f5f5"
                      }}
                    >
                      {/* 成员信息行 */}
                      <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
                        <Space direction="vertical" size={1} style={{ flex: 1, minWidth: 0 }}>
                          <Space size={4}>
                            <Typography.Text strong style={{ fontSize: 13 }}>
                              {member.displayName ?? member.phoneE164 ?? member.participantJid}
                            </Typography.Text>
                            {member.isAdmin ? (
                              <Tag color="gold" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", margin: 0 }}>
                                管理员
                              </Tag>
                            ) : null}
                          </Space>
                          {member.phoneE164 && member.phoneE164 !== member.displayName ? (
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                              {member.phoneE164}
                            </Typography.Text>
                          ) : null}
                        </Space>

                        {/* 操作按钮 */}
                        {member.customerContactId ? null : (
                          <Button
                            size="small"
                            type={bindingJid === member.participantJid ? "primary" : "default"}
                            ghost={bindingJid === member.participantJid}
                            onClick={() => {
                              if (bindingJid === member.participantJid) {
                                setBindingJid(null);
                              } else {
                                setBindingJid(member.participantJid);
                                setBindingCustomerId(null);
                                setBindingCustomerSearch("");
                                setBindingOwnerMembershipId("");
                              }
                            }}
                          >
                            标注
                          </Button>
                        )}
                      </Space>

                      {/* 已绑定客户展示 */}
                      {member.customerContactId ? (
                        <Space style={{ marginTop: 6, width: "100%", justifyContent: "space-between" }} align="center">
                          <Space size={4} wrap>
                            <Tag icon={<UserOutlined />} color="blue" style={{ margin: 0 }}>
                              {member.customerName}
                            </Tag>
                            {member.ownerName ? (
                              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                {member.ownerName}
                              </Typography.Text>
                            ) : null}
                          </Space>
                          <Popconfirm
                            title="确认解除绑定？"
                            okText="解除"
                            okType="danger"
                            cancelText="取消"
                            onConfirm={() => void handleUnbindMember(member.participantJid)}
                          >
                            <Button size="small" type="link" danger style={{ padding: 0 }}>
                              解除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ) : null}

                      {/* 内联标注表单 */}
                      {bindingJid === member.participantJid ? (
                        <Space
                          direction="vertical"
                          size={8}
                          style={{
                            width: "100%",
                            marginTop: 10,
                            padding: "10px 12px",
                            background: "#f7f9fc",
                            borderRadius: 8,
                            border: "1px solid #e8edf5"
                          }}
                        >
                          <AutoComplete
                            value={bindingCustomerSearch}
                            onChange={(value) => {
                              setBindingCustomerSearch(value);
                              setBindingCustomerId(null);
                            }}
                            onSelect={(value: string, option: { value: string; customerId: string }) => {
                              setBindingCustomerSearch(value);
                              setBindingCustomerId(option.customerId);
                            }}
                            options={customerList
                              .filter(
                                (c) =>
                                  !bindingCustomerSearch ||
                                  c.displayName.toLowerCase().includes(bindingCustomerSearch.toLowerCase())
                              )
                              .slice(0, 20)
                              .map((c) => ({
                                value: c.displayName,
                                label: c.displayName,
                                customerId: c.waCustomerContactId
                              }))}
                            placeholder="搜索或输入新客户名称"
                            style={{ width: "100%" }}
                          />
                          <Select
                            value={bindingOwnerMembershipId || undefined}
                            onChange={(value: string) => setBindingOwnerMembershipId(value ?? "")}
                            options={teamMembers.map((m) => ({
                              label: m.displayName ?? m.role,
                              value: m.membershipId
                            }))}
                            placeholder="负责销售（可选）"
                            allowClear
                            style={{ width: "100%" }}
                          />
                          <Space size={6} style={{ width: "100%" }}>
                            <Button
                              type="primary"
                              size="small"
                              style={{ flex: 1 }}
                              loading={bindingSaving}
                              disabled={!bindingCustomerSearch.trim()}
                              onClick={() => void handleBindMember(member.participantJid)}
                            >
                              保存
                            </Button>
                            <Button
                              size="small"
                              style={{ flex: 1 }}
                              disabled={bindingSaving}
                              onClick={() => setBindingJid(null)}
                            >
                              取消
                            </Button>
                          </Space>
                        </Space>
                      ) : null}
                    </List.Item>
                  )}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
