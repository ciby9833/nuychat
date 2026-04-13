// 作用: 在坐席与成员管理内维护独立 WA 账号池、扫码登录、成员授权和负责人。
// 菜单路径: 系统设置 -> 坐席与成员管理 -> WA账号管理。
// 交互: 调用 WA 管理端 API，依赖成员列表完成负责人/可见成员分配。

import { CheckCircleFilled, DeleteOutlined, LinkOutlined, LoadingOutlined, MessageOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  QRCode,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";

import {
  API_BASE,
  createWaAccount,
  createWaAccountLoginTask,
  deleteWaAccount,
  getWaAccountHealth,
  assignWaAccountMembers,
  logoutWaAccount,
  reconnectWaAccount,
  updateWaAccountOwner
} from "../../../api";
import { readTenantSession } from "../../../session";
import type { MemberListItem, WaAccountHealth, WaAccountListItem } from "../../../types";

type CreateWaAccountForm = {
  displayName: string;
  phoneE164?: string;
  primaryOwnerMembershipId?: string;
};

type AccessForm = {
  primaryOwnerMembershipId?: string;
  memberIds: string[];
};

type LoginTaskModalState = {
  waAccountId: string;
  accountName: string;
  qrCode: string;
  expiresAt: string;
  status: {
    code: string;
    label: string;
    detail: string;
    tone: "default" | "warning" | "success" | "danger" | "processing";
  };
  disconnectReason: string | null;
} | null;

function mapToneToTagColor(tone: "default" | "warning" | "success" | "danger" | "processing") {
  switch (tone) {
    case "success":
      return "green";
    case "danger":
      return "red";
    case "processing":
      return "processing";
    case "warning":
      return "gold";
    default:
      return "default";
  }
}

export function WaAccountsPane({
  waAccounts,
  members,
  loading,
  onReload
}: {
  waAccounts: WaAccountListItem[];
  members: MemberListItem[];
  loading: boolean;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<WaAccountListItem | null>(null);
  const [showAccess, setShowAccess] = useState<WaAccountListItem | null>(null);
  const [health, setHealth] = useState<WaAccountHealth | null>(null);
  const [loginTask, setLoginTask] = useState<LoginTaskModalState>(null);
  const [saving, setSaving] = useState(false);
  const [refreshingLoginTask, setRefreshingLoginTask] = useState(false);
  const [qrCountdownMs, setQrCountdownMs] = useState(0);
  const [createForm] = Form.useForm<CreateWaAccountForm>();
  const [accessForm] = Form.useForm<AccessForm>();
  const onReloadRef = useRef(onReload);

  useEffect(() => {
    onReloadRef.current = onReload;
  }, [onReload]);

  const memberOptions = members.map((member) => ({
    value: member.membershipId,
    label: `${member.displayName ?? member.email}${member.waSeatEnabled ? " / WA座席" : ""}`
  }));

  const openAccess = (account: WaAccountListItem) => {
    setShowAccess(account);
    accessForm.setFieldsValue({
      primaryOwnerMembershipId: account.primaryOwnerMembershipId ?? undefined,
      memberIds: account.memberIds
    });
  };

  const loadHealth = async (account: WaAccountListItem) => {
    try {
      const next = await getWaAccountHealth(account.waAccountId);
      setSelectedAccount(account);
      setHealth(next);
    } catch (err) {
      void message.error((err as Error).message);
    }
  };

  const openLoginTask = async (account: WaAccountListItem) => {
    const task = await createWaAccountLoginTask(account.waAccountId);
    setLoginTask({
      waAccountId: account.waAccountId,
      accountName: account.displayName,
      qrCode: task.qrCode ?? "",
      expiresAt: task.expiresAt,
      status: task.status,
      disconnectReason: null
    });
  };

  useEffect(() => {
    const session = readTenantSession();
    if (!session?.accessToken) return;

    const socket = io(API_BASE, {
      transports: ["polling", "websocket"],
      reconnection: true,
      auth: {
        token: session.accessToken
      }
    });

    socket.on("wa.account.updated", (event: {
      waAccountId: string;
      status: {
        code: string;
        label: string;
        detail: string;
        tone: "default" | "warning" | "success" | "danger" | "processing";
      };
      connectionState: string;
      loginPhase: string;
      qrCode: string | null;
      heartbeatAt: string | null;
      disconnectReason: string | null;
      autoReconnectCount: number;
      sessionRef: string | null;
      isOnline: boolean | null;
      phoneConnected: boolean | null;
      receivedPendingNotifications: boolean | null;
    }) => {
      let connectedAccountName: string | null = null;

      if (selectedAccount?.waAccountId === event.waAccountId) {
        setHealth((current) => current && current.waAccountId === event.waAccountId
          ? {
              ...current,
              status: event.status,
              session: current.session
                ? {
                    ...current.session,
                    connectionState: event.connectionState,
                    loginPhase: event.loginPhase,
                    heartbeatAt: event.heartbeatAt,
                    disconnectReason: event.disconnectReason,
                    autoReconnectCount: event.autoReconnectCount,
                    sessionRef: event.sessionRef ?? current.session.sessionRef,
                    qrCode: event.qrCode ?? current.session.qrCode,
                    isOnline: event.isOnline,
                    phoneConnected: event.phoneConnected,
                    receivedPendingNotifications: event.receivedPendingNotifications
                  }
                : {
                    connectionState: event.connectionState,
                    loginPhase: event.loginPhase,
                    sessionRef: event.sessionRef ?? "",
                    loginMode: "admin_scan",
                    heartbeatAt: event.heartbeatAt,
                    disconnectReason: event.disconnectReason,
                    autoReconnectCount: event.autoReconnectCount,
                    qrCode: event.qrCode,
                    isOnline: event.isOnline,
                    phoneConnected: event.phoneConnected,
                    receivedPendingNotifications: event.receivedPendingNotifications
                  }
            }
          : current);
      }

      setLoginTask((current) => {
        if (!current || current.waAccountId !== event.waAccountId) return current;
        const isConnected = event.status.code === "connected";
        if (isConnected) {
          connectedAccountName = current.accountName;
          return null;
        }
        if (event.qrCode && event.qrCode !== current.qrCode) {
          return {
            ...current,
            qrCode: event.qrCode,
            status: event.status,
            disconnectReason: event.disconnectReason
          };
        }
        if (
          (event.qrCode ?? current.qrCode) === current.qrCode &&
          event.status.code === current.status.code &&
          event.disconnectReason === current.disconnectReason
        ) {
          return current;
        }
        return {
          ...current,
          qrCode: event.qrCode ?? current.qrCode,
          status: event.status,
          disconnectReason: event.disconnectReason
        };
      });

      if (connectedAccountName) {
        void message.success(t("waMonitor.pane.loginModal.connectedSuccess", { name: connectedAccountName }));
        onReloadRef.current();
      }
    });

    return () => {
      socket.close();
    };
  }, [selectedAccount?.waAccountId]);

  useEffect(() => {
    if (!loginTask) {
      setQrCountdownMs(0);
      return;
    }

    const tick = () => {
      const remaining = new Date(loginTask.expiresAt).getTime() - Date.now();
      setQrCountdownMs(Math.max(0, remaining));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [loginTask]);

  useEffect(() => {
    if (!loginTask || loginTask.status.code !== "qr_required" || refreshingLoginTask || qrCountdownMs > 0) return;

    let cancelled = false;
    setRefreshingLoginTask(true);
    void (async () => {
      try {
        const nextTask = await createWaAccountLoginTask(loginTask.waAccountId);
        if (!cancelled) {
          setLoginTask((current) => current && current.waAccountId === loginTask.waAccountId
            ? {
                ...current,
                qrCode: nextTask.qrCode ?? current.qrCode,
                expiresAt: nextTask.expiresAt,
                status: nextTask.status,
                disconnectReason: null
              }
            : current);
        }
      } catch (err) {
        if (!cancelled) {
          void message.error((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setRefreshingLoginTask(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loginTask, qrCountdownMs, refreshingLoginTask]);

  useEffect(() => {
    if (!loginTask) return;

    let cancelled = false;
    const syncHealth = async () => {
      try {
        const next = await getWaAccountHealth(loginTask.waAccountId);
        if (cancelled || !next.session) return;

        setHealth((current) => current && current.waAccountId === next.waAccountId ? next : current);

        const isConnected = next.status.code === "connected";
        if (isConnected) {
          setLoginTask((current) => current?.waAccountId === next.waAccountId ? null : current);
          void message.success(t("waMonitor.pane.loginModal.connectedSuccess", { name: loginTask.accountName }));
          onReloadRef.current();
          return;
        }

        setLoginTask((current) => current?.waAccountId === next.waAccountId
          ? (() => {
              const nextQrCode = next.session?.qrCode ?? current.qrCode;
              const nextDisconnectReason = next.session?.disconnectReason ?? current.disconnectReason;
              if (
                nextQrCode === current.qrCode &&
                next.status.code === current.status.code &&
                nextDisconnectReason === current.disconnectReason
              ) {
                return current;
              }
              return {
                ...current,
                qrCode: nextQrCode,
                status: next.status,
                disconnectReason: nextDisconnectReason
              };
            })()
          : current);
      } catch {
        // ignore polling failures and wait for next cycle
      }
    };

    void syncHealth();
    const timer = window.setInterval(() => {
      void syncHealth();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loginTask]);

  const countdownLabel = (() => {
    const totalSeconds = Math.ceil(qrCountdownMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  })();
  const isImageQrCode = typeof loginTask?.qrCode === "string" && loginTask.qrCode.startsWith("data:image/");
  const shouldShowQr = loginTask?.status.code === "qr_required" && Boolean(loginTask.qrCode);
  const showLoadingState = Boolean(
    loginTask?.status.code &&
    ((loginTask.status.code === "qr_required" && !loginTask.qrCode) ||
      !["qr_required", "connected", "failed", "session_expired"].includes(loginTask.status.code))
  );
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Space size="large">
          <Typography.Text strong>{t("waMonitor.pane.title")}</Typography.Text>
          <Typography.Text type="secondary">{t("waMonitor.pane.accountCount", { count: waAccounts.length })}</Typography.Text>
          <Typography.Text type="secondary">
            {t("waMonitor.pane.onlineCount", { count: waAccounts.filter((item) => item.status.code === "connected").length })}
          </Typography.Text>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={onReload} loading={loading}>{t("waMonitor.pane.refresh")}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>{t("waMonitor.pane.create")}</Button>
        </Space>
      </div>

      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        {t("waMonitor.pane.description")}
      </Typography.Paragraph>

      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
        <Table<WaAccountListItem>
          rowKey="waAccountId"
          loading={loading}
          dataSource={waAccounts}
          pagination={waAccounts.length > 10 ? { pageSize: 10, size: "small" } : false}
          columns={[
            {
              title: t("waMonitor.pane.table.account"),
              render: (_, row) => (
                <Space>
                  <MessageOutlined style={{ color: "#25d366" }} />
                  <div>
                    <Typography.Text strong>{row.displayName}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.phoneE164 ?? row.instanceKey}
                    </Typography.Text>
                  </div>
                </Space>
              )
            },
            {
              title: t("waMonitor.pane.table.status"),
              width: 120,
              render: (_, row) => {
                return <Tag color={mapToneToTagColor(row.status.tone)}>{row.status.label}</Tag>;
              }
            },
            {
              title: t("waMonitor.pane.table.owner"),
              width: 160,
              render: (_, row) => row.primaryOwnerName
                ? <Typography.Text>{row.primaryOwnerName}</Typography.Text>
                : <Typography.Text type="secondary">{t("waMonitor.pane.table.unset")}</Typography.Text>
            },
            {
              title: t("waMonitor.pane.table.members"),
              width: 120,
              render: (_, row) => <Tag>{row.memberCount}</Tag>
            },
            {
              title: t("waMonitor.pane.table.lastConnected"),
              width: 180,
              render: (_, row) => row.lastConnectedAt
                ? new Date(row.lastConnectedAt).toLocaleString()
                : <Typography.Text type="secondary">{t("waMonitor.pane.table.empty")}</Typography.Text>
            },
            {
              title: t("waMonitor.pane.table.actions"),
              width: 360,
              render: (_, row) => {
                return (
                <Space wrap>
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    disabled={!row.actions.canStartLogin}
                    title={row.actions.startLoginReason ?? undefined}
                    onClick={() => {
                    void (async () => {
                      try {
                        await openLoginTask(row);
                      } catch (err) {
                        void message.error((err as Error).message);
                      }
                    })();
                  }}>
                    {t("waMonitor.pane.actions.startLogin")}
                  </Button>
                  <Button size="small" disabled={!row.actions.canManageMembers} onClick={() => openAccess(row)}>{t("waMonitor.pane.actions.manageMembers")}</Button>
                  <Button size="small" disabled={!row.actions.canViewHealth} onClick={() => { void loadHealth(row); }}>{t("waMonitor.pane.actions.viewHealth")}</Button>
                  <Button
                    size="small"
                    disabled={!row.actions.canLogout}
                    title={row.actions.logoutReason ?? undefined}
                    onClick={() => {
                    void (async () => {
                      try {
                        await logoutWaAccount(row.waAccountId);
                        setHealth((current) => current?.waAccountId === row.waAccountId ? null : current);
                        setLoginTask((current) => current?.waAccountId === row.waAccountId ? null : current);
                        void message.success(t("waMonitor.pane.loginModal.loggedOutSuccess"));
                        onReload();
                      } catch (err) {
                        void message.error((err as Error).message);
                      }
                    })();
                  }}
                  >
                    {t("waMonitor.pane.actions.logout")}
                  </Button>
                  <Button
                    size="small"
                    disabled={!row.actions.canReconnect}
                    title={row.actions.reconnectReason ?? undefined}
                    onClick={() => {
                    void (async () => {
                      try {
                        await reconnectWaAccount(row.waAccountId);
                        void message.success(t("waMonitor.pane.reconnectSuccess"));
                        onReload();
                      } catch (err) {
                        void message.error((err as Error).message);
                      }
                    })();
                  }}
                  >
                    {t("waMonitor.pane.actions.reconnect")}
                  </Button>
                  <Popconfirm
                    title={t("waMonitor.pane.actions.deleteConfirm")}
                    description={t("waMonitor.pane.actions.deleteWarning")}
                    onConfirm={() => {
                      void (async () => {
                        try {
                          await deleteWaAccount(row.waAccountId);
                          void message.success(t("waMonitor.pane.actions.deleteSuccess"));
                          onReload();
                        } catch (err) {
                          void message.error((err as Error).message);
                        }
                      })();
                    }}
                    okText={t("waMonitor.pane.actions.deleteOk")}
                    cancelText={t("waMonitor.pane.actions.deleteCancel")}
                    okButtonProps={{ danger: true }}
                    disabled={!row.actions.canDelete}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={!row.actions.canDelete}
                      title={row.actions.deleteReason ?? undefined}
                    >
                      {t("waMonitor.pane.actions.delete")}
                    </Button>
                  </Popconfirm>
                </Space>
              );
              }
            }
          ]}
        />
      </div>

      <Modal
        title={t("waMonitor.pane.createModal.title")}
        open={showCreate}
        onCancel={() => setShowCreate(false)}
        onOk={() => {
          void (async () => {
            const values = await createForm.validateFields();
            setSaving(true);
            try {
              await createWaAccount({
                displayName: values.displayName.trim(),
                phoneE164: values.phoneE164?.trim() || null,
                primaryOwnerMembershipId: values.primaryOwnerMembershipId || null
              });
              void message.success(t("waMonitor.pane.createModal.success"));
              setShowCreate(false);
              createForm.resetFields();
              onReload();
            } catch (err) {
              void message.error((err as Error).message);
            } finally {
              setSaving(false);
            }
          })();
        }}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="displayName" label={t("waMonitor.pane.createModal.name")} rules={[{ required: true, message: t("waMonitor.pane.createModal.nameRequired") }]}>
            <Input placeholder={t("waMonitor.pane.createModal.namePlaceholder")} />
          </Form.Item>
          <Form.Item name="phoneE164" label={t("waMonitor.pane.createModal.phone")}>
            <Input placeholder={t("waMonitor.pane.createModal.phonePlaceholder")} />
          </Form.Item>
          <Form.Item name="primaryOwnerMembershipId" label={t("waMonitor.pane.createModal.owner")}>
            <Select allowClear showSearch options={memberOptions} placeholder={t("waMonitor.pane.createModal.optional")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("waMonitor.pane.loginModal.title", { name: loginTask?.accountName ?? "" })}
        open={!!loginTask}
        footer={loginTask ? (
          <Space>
            {["failed", "session_expired"].includes(loginTask.status.code) ? (
              <Button
                type="primary"
                loading={refreshingLoginTask}
                onClick={() => {
                  void (async () => {
                    if (!loginTask) return;
                    setRefreshingLoginTask(true);
                    try {
                      const nextTask = await createWaAccountLoginTask(loginTask.waAccountId);
                      setLoginTask((current) => current?.waAccountId === loginTask.waAccountId
                        ? {
                            ...current,
                            qrCode: nextTask.qrCode ?? "",
                            expiresAt: nextTask.expiresAt,
                            status: nextTask.status,
                            disconnectReason: null
                          }
                        : current);
                    } catch (err) {
                      void message.error((err as Error).message);
                    } finally {
                      setRefreshingLoginTask(false);
                    }
                  })();
                }}
              >
                {t("waMonitor.pane.loginModal.retry")}
              </Button>
            ) : null}
            <Button onClick={() => setLoginTask(null)}>{t("waMonitor.pane.loginModal.close")}</Button>
          </Space>
        ) : null}
        onCancel={() => setLoginTask(null)}
        destroyOnHidden
        width={520}
      >
        {loginTask ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 8 }}>
            {shouldShowQr ? (
              isImageQrCode ? (
                <img
                  src={loginTask.qrCode}
                  alt={`WA QR ${loginTask.accountName}`}
                  style={{ width: 280, height: 280, objectFit: "contain", borderRadius: 12, border: "1px solid #f0f0f0", background: "#fff", padding: 8 }}
                />
              ) : (
                <QRCode value={loginTask.qrCode} size={280} />
              )
            ) : showLoadingState ? (
              <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid #f0f0f0", background: "#fafafa" }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
              </div>
            ) : loginTask.status.code === "connected" ? (
              <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid #f0f0f0", background: "#f6ffed" }}>
                <CheckCircleFilled style={{ fontSize: 48, color: "#52c41a" }} />
              </div>
            ) : (
              <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid #f0f0f0", background: "#fff2f0" }}>
                <Typography.Text type="danger">{t("waMonitor.pane.loginModal.rescan")}</Typography.Text>
              </div>
            )}
            <Typography.Text strong>{loginTask.status.label}</Typography.Text>
            <Typography.Text type="secondary">{loginTask.status.detail}</Typography.Text>
            {shouldShowQr ? (
              <Tag color={refreshingLoginTask ? "processing" : qrCountdownMs <= 15000 ? "gold" : "default"}>
                {refreshingLoginTask ? t("waMonitor.pane.loginModal.refreshingQr") : t("waMonitor.pane.loginModal.refreshAfter", { value: countdownLabel })}
              </Tag>
            ) : null}
            {loginTask.disconnectReason ? (
              <Typography.Text type="danger">{t("waMonitor.pane.loginModal.disconnectReason", { value: loginTask.disconnectReason })}</Typography.Text>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        title={t("waMonitor.pane.accessModal.title", { name: showAccess?.displayName ?? "" })}
        open={!!showAccess}
        onCancel={() => setShowAccess(null)}
        onOk={() => {
          void (async () => {
            if (!showAccess) return;
            const values = await accessForm.validateFields();
            setSaving(true);
            try {
              await assignWaAccountMembers(showAccess.waAccountId, values.memberIds ?? []);
              await updateWaAccountOwner(showAccess.waAccountId, values.primaryOwnerMembershipId ?? null);
              void message.success(t("waMonitor.pane.accessModal.success"));
              setShowAccess(null);
              onReload();
            } catch (err) {
              void message.error((err as Error).message);
            } finally {
              setSaving(false);
            }
          })();
        }}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={accessForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="primaryOwnerMembershipId" label={t("waMonitor.pane.accessModal.owner")}>
            <Select allowClear showSearch options={memberOptions} placeholder={t("waMonitor.pane.accessModal.ownerPlaceholder")} />
          </Form.Item>
          <Form.Item name="memberIds" label={t("waMonitor.pane.accessModal.members")}>
            <Select mode="multiple" showSearch options={memberOptions} placeholder={t("waMonitor.pane.accessModal.membersPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("waMonitor.pane.healthModal.title", { name: selectedAccount?.displayName ?? "" })}
        open={!!selectedAccount}
        footer={null}
        onCancel={() => {
          setSelectedAccount(null);
          setHealth(null);
        }}
        destroyOnHidden
      >
        {health ? (
          <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 12 }}>
            <Typography.Text>{t("waMonitor.health.provider")}: {health.providerKey}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.currentStatus")}: {health.status.label}</Typography.Text>
            <Typography.Text type="secondary">{health.status.detail}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.lastConnected")}: {health.lastConnectedAt ? new Date(health.lastConnectedAt).toLocaleString() : t("waMonitor.health.empty")}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.lastDisconnected")}: {health.lastDisconnectedAt ? new Date(health.lastDisconnectedAt).toLocaleString() : t("waMonitor.health.empty")}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.connectionState")}: {health.session?.connectionState ?? t("waMonitor.health.noSession")}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.loginPhase")}: {health.session?.loginPhase ?? t("waMonitor.health.empty")}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.heartbeatAt")}: {health.session?.heartbeatAt ? new Date(health.session.heartbeatAt).toLocaleString() : t("waMonitor.health.empty")}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.reconnectCount")}: {health.session?.autoReconnectCount ?? 0}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.loginMode")}: {health.session?.loginMode ?? t("waMonitor.health.empty")}</Typography.Text>
            <Typography.Text>{t("waMonitor.health.disconnectReason")}: {health.session?.disconnectReason ?? t("waMonitor.health.empty")}</Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">{t("waMonitor.health.loading")}</Typography.Text>
        )}
      </Modal>
    </>
  );
}
