// 功能菜单
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Col, Empty, Input, List, Row, Segmented, Select, Space, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getWaMonitorConversationDetail,
  getWaMonitorDashboard,
  listWaMonitorConversations,
  loadMoreWaMonitorMessages
} from "../../api";
import type { WaMonitorConversationDetail, WaMonitorConversationItem, WaMonitorDashboard } from "../../types";

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

function isImageAttachment(mimeType: string | null | undefined, attachmentType: string) {
  return Boolean(mimeType?.startsWith("image/")) || attachmentType === "image";
}

function isAudioAttachment(mimeType: string | null | undefined, attachmentType: string) {
  return Boolean(mimeType?.startsWith("audio/")) || attachmentType === "audio" || attachmentType === "ptt" || attachmentType === "voice";
}

function renderAttachment(
  item: NonNullable<WaMonitorConversationDetail["messages"][number]["attachments"]>[number],
  labels: { voiceMessage: string; fileAttachment: string }
) {
  const sourceUrl = item.previewUrl ?? item.storageUrl;
  if (!sourceUrl) {
    return (
      <div style={{ padding: "8px 10px", background: "#f5f5f5", borderRadius: 12 }}>
        <Typography.Text>{item.fileName ?? item.attachmentType}</Typography.Text>
      </div>
    );
  }

  if (isImageAttachment(item.mimeType, item.attachmentType)) {
    return (
      <a href={sourceUrl} target="_blank" rel="noreferrer">
        <img
          src={sourceUrl}
          alt={item.fileName ?? "image"}
          style={{
            display: "block",
            maxWidth: 320,
            maxHeight: 320,
            borderRadius: 12,
            objectFit: "cover",
            border: "1px solid #ece5dd"
          }}
        />
      </a>
    );
  }

  if (isAudioAttachment(item.mimeType, item.attachmentType)) {
    return (
      <div style={{ minWidth: 260 }}>
        <audio controls preload="none" src={sourceUrl} style={{ width: "100%" }} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {item.fileName ?? labels.voiceMessage}
        </Typography.Text>
      </div>
    );
  }

  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        padding: "10px 12px",
        background: "#f5f5f5",
        borderRadius: 12,
        border: "1px solid #ece5dd",
        color: "inherit"
      }}
    >
      <Typography.Text strong style={{ display: "block" }}>
        {item.fileName ?? labels.fileAttachment}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {[item.mimeType, formatFileSize(item.fileSize)].filter(Boolean).join(" · ") || item.attachmentType}
      </Typography.Text>
    </a>
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
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const keepScrollOffsetRef = useRef<number | null>(null);

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

      <Row gutter={16} align="stretch">
        <Col span={9}>
          <Card
            title={t("waConversations.listTitle")}
            extra={selectedAccount ? (
              <Space size={8}>
                <Tag color={mapToneToStatusColor(selectedAccount.status.tone)}>{selectedAccount.status.label}</Tag>
                <Typography.Text type="secondary">{selectedAccount.displayName}</Typography.Text>
              </Space>
            ) : "-"}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <div>
                <Typography.Text type="secondary">{t("waConversations.accountSelector.label")}</Typography.Text>
                <Select
                  value={selectedAccountId ?? undefined}
                  onChange={(value) => setSelectedAccountId(value)}
                  options={(dashboard?.accounts ?? []).map((item) => ({
                    label: `${item.displayName} (${item.phoneE164 ?? item.instanceKey})`,
                    value: item.waAccountId
                  }))}
                  placeholder={t("waConversations.accountSelector.placeholder")}
                  style={{ width: "100%", marginTop: 6 }}
                />
              </div>

              <Space wrap size={8} style={{ width: "100%", justifyContent: "space-between" }}>
                <Input.Search
                  placeholder={t("waConversations.searchPlaceholder")}
                  allowClear
                  value={conversationSearch}
                  onChange={(event) => setConversationSearch(event.target.value)}
                  style={{ maxWidth: 320 }}
                />
                <Segmented<ConversationFilter>
                  value={conversationFilter}
                  onChange={(value) => setConversationFilter(value)}
                  options={[
                    { label: t("waConversations.filter.all"), value: "all" },
                    { label: t("waConversations.filter.group"), value: "group" },
                    { label: t("waConversations.filter.direct"), value: "direct" }
                  ]}
                />
              </Space>

              {selectedAccount ? (
                <Space wrap size={8}>
                  <Tag>{t("waConversations.accountMeta.owner")}: {selectedAccount.primaryOwnerName ?? t("waConversations.accountMeta.unset")}</Tag>
                  <Tag>{t("waConversations.accountMeta.members")}: {selectedAccount.memberCount}</Tag>
                  <Tag>{t("waConversations.accountMeta.unread")}: {selectedAccount.unreadMessageCount}</Tag>
                  <Tag>{t("waConversations.accountMeta.conversations")}: {selectedAccount.conversationCount}</Tag>
                </Space>
              ) : null}

              <div style={{ maxHeight: 780, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 12 }}>
                <List
                  loading={conversationLoading}
                  dataSource={conversations}
                  locale={{ emptyText: t("waConversations.list.empty") }}
                  renderItem={(row) => (
                    <List.Item
                      onClick={() => setSelectedConversationId(row.waConversationId)}
                      style={{
                        padding: "12px 14px",
                        cursor: "pointer",
                        background: row.waConversationId === selectedConversationId ? "#e6f4ff" : "#fff",
                        borderBottom: "1px solid #f5f5f5"
                      }}
                    >
                      <Space direction="vertical" size={4} style={{ width: "100%" }}>
                        <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
                          <Space direction="vertical" size={0}>
                            <Typography.Text strong>{row.displayName}</Typography.Text>
                            <Typography.Text type="secondary">{row.contactPhoneE164 ?? row.chatJid}</Typography.Text>
                          </Space>
                          <Space direction="vertical" size={4} align="end">
                            <Tag>{row.conversationType === "group" ? t("waConversations.filter.group") : t("waConversations.filter.direct")}</Tag>
                            {row.unreadCount > 0 ? <Tag color="blue">{row.unreadCount}</Tag> : null}
                          </Space>
                        </Space>
                        <Typography.Text type="secondary" ellipsis>{row.lastMessagePreview || t("waConversations.list.noMessages")}</Typography.Text>
                        <Space size={8}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {row.currentReplierName ?? t("waConversations.list.unassigned")}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {row.lastMessageAt ? formatMonitorDate(row.lastMessageAt) : "-"}
                          </Typography.Text>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={15}>
          <Card title={t("waConversations.messageTitle")} extra={detail?.conversation.displayName ?? t("waConversations.detail.selectConversation")}>
            {!selectedConversationId ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("waConversations.detail.clickToLoad")} />
            ) : detailLoading ? (
              <Space direction="vertical" size={8} style={{ width: "100%", padding: 12 }}>
                <Typography.Text type="secondary">{t("waConversations.detail.loading")}</Typography.Text>
              </Space>
            ) : detail ? (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space wrap size={8}>
                  <Tag>{detail.conversation.conversationType === "group" ? t("waConversations.filter.group") : t("waConversations.filter.direct")}</Tag>
                  <Tag>{t("waConversations.detail.members", { count: detail.members.length })}</Tag>
                  <Tag>{t("waConversations.detail.unread", { count: detail.conversation.unreadCount })}</Tag>
                </Space>

                <div
                  ref={messageViewportRef}
                  style={{ height: 780, overflowY: "auto", padding: 12, background: "#efeae2", borderRadius: 12, border: "1px solid #e5ddd5" }}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {detail.hasMore ? (
                      <div style={{ textAlign: "center" }}>
                        <Button onClick={() => void loadMoreMessages()} loading={loadingMoreMessages}>
                          {t("waConversations.detail.loadMore")}
                        </Button>
                      </div>
                    ) : null}
                    {detail.messages.map((item) => (
                      <div key={item.waMessageId} style={bubbleStyle(item.direction)}>
                        {item.direction === "inbound" ? (
                          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                            {item.senderDisplayName ?? item.senderRole ?? "-"}
                          </Typography.Text>
                        ) : null}
                        {item.attachments?.length ? (
                          <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: item.bodyText ? 8 : 6 }}>
                            {item.attachments.map((attachment) => (
                              <div key={attachment.attachmentId}>
                                {renderAttachment(attachment, {
                                  voiceMessage: t("waConversations.detail.voiceMessage"),
                                  fileAttachment: t("waConversations.detail.fileAttachment")
                                })}
                              </div>
                            ))}
                          </Space>
                        ) : null}
                        {item.bodyText ? (
                          <Typography.Paragraph style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>
                            {item.bodyText}
                          </Typography.Paragraph>
                        ) : item.attachments?.length ? null : (
                          <Typography.Paragraph style={{ marginBottom: 6, whiteSpace: "pre-wrap", color: "#8c8c8c" }}>
                            {item.messageType === "text" ? t("waConversations.detail.emptyMessage") : `（${item.messageType}）`}
                          </Typography.Paragraph>
                        )}
                        <Space size={8}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {formatMonitorDate(item.providerTs ?? item.createdAt)}
                          </Typography.Text>
                          {item.direction === "outbound" && item.deliveryStatus ? (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {item.deliveryStatus}
                            </Typography.Text>
                          ) : null}
                        </Space>
                      </div>
                    ))}
                  </Space>
                </div>
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("waConversations.detail.loadFailed")} />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
