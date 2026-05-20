// 功能菜单
import { ReloadOutlined, UserOutlined } from "@ant-design/icons";
import { AutoComplete, Button, Card, Col, Empty, Input, List, Popconfirm, Row, Segmented, Select, Space, Switch, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
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
                <Tag color={mapToneToStatusColor(selectedAccount.status.tone)}>{selectedAccount.status.label}</Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{selectedAccount.displayName}</Typography.Text>
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
                        borderBottom: "1px solid #f5f5f5"
                      }}
                    >
                      <Space direction="vertical" size={3} style={{ width: "100%" }}>
                        <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
                          <Space direction="vertical" size={0} style={{ flex: 1, minWidth: 0 }}>
                            <Typography.Text strong ellipsis>{row.displayName}</Typography.Text>
                            <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                              {row.contactPhoneE164 ?? row.chatJid}
                            </Typography.Text>
                          </Space>
                          <Space direction="vertical" size={3} align="end" style={{ flexShrink: 0 }}>
                            <Tag style={{ fontSize: 11, margin: 0 }}>
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
                            {row.unreadCount > 0 ? <Tag color="blue" style={{ margin: 0 }}>{row.unreadCount}</Tag> : null}
                          </Space>
                        </Space>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                          {row.lastMessagePreview || t("waConversations.list.noMessages")}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {row.lastMessageAt ? formatMonitorDate(row.lastMessageAt) : "-"}
                        </Typography.Text>
                      </Space>
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
