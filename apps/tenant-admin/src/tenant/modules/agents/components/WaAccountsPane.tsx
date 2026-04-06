// 作用: 在坐席与成员管理内维护独立 WA 账号池、扫码登录、成员授权和负责人。
// 菜单路径: 系统设置 -> 坐席与成员管理 -> WA账号管理。
// 交互: 调用 WA 管理端 API，依赖成员列表完成负责人/可见成员分配。

import { CheckCircleFilled, LinkOutlined, LoadingOutlined, MessageOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Modal,
  QRCode,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

import {
  API_BASE,
  createWaAccount,
  createWaAccountLoginTask,
  getWaAccountHealth,
  assignWaAccountMembers,
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
  loginPhase: string;
  connectionState: string;
  disconnectReason: string | null;
} | null;

function getLoginPhaseMeta(loginPhase: string | null | undefined) {
  switch (loginPhase) {
    case "qr_required":
      return { title: "使用 WhatsApp 扫码登录", detail: "请在手机 WhatsApp 中扫码。", color: "default" as const };
    case "qr_scanned":
      return { title: "已扫码，等待手机确认", detail: "请在手机上确认继续登录。", color: "processing" as const };
    case "connecting":
      return { title: "正在建立连接", detail: "系统正在与 WhatsApp 建立会话。", color: "processing" as const };
    case "syncing":
      return { title: "正在同步聊天和群组", detail: "首次登录可能需要几十秒。", color: "processing" as const };
    case "connected":
      return { title: "登录成功", detail: "账号已连接，可进入 WA 工作台处理会话。", color: "success" as const };
    case "failed":
      return { title: "登录失败", detail: "连接已中断，请重新发起扫码。", color: "error" as const };
    default:
      return { title: "等待登录状态", detail: "正在获取当前账号会话状态。", color: "default" as const };
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
      qrCode: task.qrCode,
      expiresAt: task.expiresAt,
      loginPhase: "qr_required",
      connectionState: "qr_required",
      disconnectReason: null
    });
  };

  useEffect(() => {
    const session = readTenantSession();
    if (!session?.accessToken) return;

    const socket = io(API_BASE, {
      transports: ["websocket", "polling"],
      reconnection: true,
      auth: {
        token: session.accessToken
      }
    });

    socket.on("wa.account.updated", (event: {
      waAccountId: string;
      accountStatus: string;
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
              accountStatus: event.accountStatus,
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
        const isConnected = event.accountStatus === "online" || event.connectionState === "open";
        if (isConnected) {
          connectedAccountName = current.accountName;
          return null;
        }
        if (event.qrCode && event.qrCode !== current.qrCode) {
          return {
            ...current,
            qrCode: event.qrCode,
            loginPhase: event.loginPhase,
            connectionState: event.connectionState,
            disconnectReason: event.disconnectReason
          };
        }
        return {
          ...current,
          qrCode: event.qrCode ?? current.qrCode,
          loginPhase: event.loginPhase,
          connectionState: event.connectionState,
          disconnectReason: event.disconnectReason
        };
      });

      if (connectedAccountName) {
        void message.success(`WA账号 ${connectedAccountName} 已连接成功`);
        onReload();
      }
    });

    return () => {
      socket.close();
    };
  }, [onReload, selectedAccount?.waAccountId]);

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
    if (!loginTask || loginTask.loginPhase !== "qr_required" || refreshingLoginTask || qrCountdownMs > 0) return;

    let cancelled = false;
    setRefreshingLoginTask(true);
    void (async () => {
      try {
        const nextTask = await createWaAccountLoginTask(loginTask.waAccountId);
        if (!cancelled) {
          setLoginTask((current) => current && current.waAccountId === loginTask.waAccountId
            ? {
                ...current,
                qrCode: nextTask.qrCode,
                expiresAt: nextTask.expiresAt,
                loginPhase: "qr_required",
                connectionState: "qr_required",
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

  const countdownLabel = (() => {
    const totalSeconds = Math.ceil(qrCountdownMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  })();
  const isImageQrCode = typeof loginTask?.qrCode === "string" && loginTask.qrCode.startsWith("data:image/");
  const loginPhaseMeta = getLoginPhaseMeta(loginTask?.loginPhase);
  const shouldShowQr = loginTask?.loginPhase === "qr_required";
  const showLoadingState = loginTask?.loginPhase && loginTask.loginPhase !== "qr_required" && loginTask.loginPhase !== "connected" && loginTask.loginPhase !== "failed";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Space size="large">
          <Typography.Text strong>独立 WA 账号池</Typography.Text>
          <Typography.Text type="secondary">账号数 {waAccounts.length}</Typography.Text>
          <Typography.Text type="secondary">
            在线 {waAccounts.filter((item) => item.accountStatus === "online").length}
          </Typography.Text>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={onReload} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>新增WA账号</Button>
        </Space>
      </div>

      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        WA 账号管理仍放在当前坐席与成员管理区域内，成员 WA Seat 开关也在本页协同维护。
      </Typography.Paragraph>

      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
        <Table<WaAccountListItem>
          rowKey="waAccountId"
          loading={loading}
          dataSource={waAccounts}
          pagination={waAccounts.length > 10 ? { pageSize: 10, size: "small" } : false}
          columns={[
            {
              title: "账号",
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
              title: "状态",
              width: 120,
              render: (_, row) => (
                <Tag color={row.accountStatus === "online" ? "green" : row.accountStatus === "offline" ? "default" : "gold"}>
                  {row.accountStatus}
                </Tag>
              )
            },
            {
              title: "负责人",
              width: 160,
              render: (_, row) => row.primaryOwnerName
                ? <Typography.Text>{row.primaryOwnerName}</Typography.Text>
                : <Typography.Text type="secondary">未设置</Typography.Text>
            },
            {
              title: "协同成员",
              width: 120,
              render: (_, row) => <Tag>{row.memberCount}</Tag>
            },
            {
              title: "最近连接",
              width: 180,
              render: (_, row) => row.lastConnectedAt
                ? new Date(row.lastConnectedAt).toLocaleString()
                : <Typography.Text type="secondary">暂无</Typography.Text>
            },
            {
              title: "操作",
              width: 360,
              render: (_, row) => (
                <Space wrap>
                  <Button size="small" icon={<LinkOutlined />} onClick={() => {
                    void (async () => {
                      try {
                        await openLoginTask(row);
                      } catch (err) {
                        void message.error((err as Error).message);
                      }
                    })();
                  }}>
                    扫码登录
                  </Button>
                  <Button size="small" onClick={() => openAccess(row)}>成员分配</Button>
                  <Button size="small" onClick={() => { void loadHealth(row); }}>健康状态</Button>
                  <Button
                    size="small"
                    disabled={!row.lastConnectedAt}
                    title={!row.lastConnectedAt ? "请先完成扫码登录后再重连" : undefined}
                    onClick={() => {
                    void (async () => {
                      try {
                        await reconnectWaAccount(row.waAccountId);
                        void message.success("已触发重连");
                        onReload();
                      } catch (err) {
                        void message.error((err as Error).message);
                      }
                    })();
                  }}
                  >
                    重连
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </div>

      <Modal
        title="新增WA账号"
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
              void message.success("WA账号已创建");
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
          <Form.Item name="displayName" label="账号名称" rules={[{ required: true, message: "请输入账号名称" }]}>
            <Input placeholder="销售一组主号" />
          </Form.Item>
          <Form.Item name="phoneE164" label="手机号">
            <Input placeholder="+6281234567890" />
          </Form.Item>
          <Form.Item name="primaryOwnerMembershipId" label="负责人">
            <Select allowClear showSearch options={memberOptions} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`扫码登录: ${loginTask?.accountName ?? ""}`}
        open={!!loginTask}
        footer={null}
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
            ) : loginTask.loginPhase === "connected" ? (
              <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid #f0f0f0", background: "#f6ffed" }}>
                <CheckCircleFilled style={{ fontSize: 48, color: "#52c41a" }} />
              </div>
            ) : (
              <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid #f0f0f0", background: "#fff2f0" }}>
                <Typography.Text type="danger">请重新扫码</Typography.Text>
              </div>
            )}
            <Typography.Text strong>{loginPhaseMeta.title}</Typography.Text>
            <Typography.Text type="secondary">{loginPhaseMeta.detail}</Typography.Text>
            {shouldShowQr ? (
              <Tag color={refreshingLoginTask ? "processing" : qrCountdownMs <= 15000 ? "gold" : "default"}>
                {refreshingLoginTask ? "二维码刷新中" : `将在 ${countdownLabel} 后刷新`}
              </Tag>
            ) : null}
            {loginTask.disconnectReason ? (
              <Typography.Text type="danger">掉线原因: {loginTask.disconnectReason}</Typography.Text>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        title={`成员分配: ${showAccess?.displayName ?? ""}`}
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
              void message.success("WA账号成员分配已更新");
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
          <Form.Item name="primaryOwnerMembershipId" label="负责人">
            <Select allowClear showSearch options={memberOptions} placeholder="选择负责员工" />
          </Form.Item>
          <Form.Item name="memberIds" label="协同成员">
            <Select mode="multiple" showSearch options={memberOptions} placeholder="选择可查看/协同成员" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`健康状态: ${selectedAccount?.displayName ?? ""}`}
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
            <Typography.Text>账号状态: {health.accountStatus}</Typography.Text>
            <Typography.Text>Provider: {health.providerKey}</Typography.Text>
            <Typography.Text>最近连接: {health.lastConnectedAt ? new Date(health.lastConnectedAt).toLocaleString() : "暂无"}</Typography.Text>
            <Typography.Text>最近掉线: {health.lastDisconnectedAt ? new Date(health.lastDisconnectedAt).toLocaleString() : "暂无"}</Typography.Text>
            <Typography.Text>连接态: {health.session?.connectionState ?? "暂无session"}</Typography.Text>
            <Typography.Text>登录阶段: {health.session?.loginPhase ?? "暂无"}</Typography.Text>
            <Typography.Text>心跳时间: {health.session?.heartbeatAt ? new Date(health.session.heartbeatAt).toLocaleString() : "暂无"}</Typography.Text>
            <Typography.Text>重连次数: {health.session?.autoReconnectCount ?? 0}</Typography.Text>
            <Typography.Text>登录入口: {health.session?.loginMode ?? "暂无"}</Typography.Text>
            <Typography.Text>掉线原因: {health.session?.disconnectReason ?? "暂无"}</Typography.Text>
            <Typography.Text>手机确认: {health.session?.phoneConnected == null ? "暂无" : health.session.phoneConnected ? "已连接" : "未连接"}</Typography.Text>
            <Typography.Text>在线态: {health.session?.isOnline == null ? "暂无" : health.session.isOnline ? "在线" : "离线"}</Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">加载中...</Typography.Text>
        )}
      </Modal>
    </>
  );
}
