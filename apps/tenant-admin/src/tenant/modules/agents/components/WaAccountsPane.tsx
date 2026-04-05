// 作用: 在坐席与成员管理内维护独立 WA 账号池、扫码登录、成员授权和负责人。
// 菜单路径: 系统设置 -> 坐席与成员管理 -> WA账号管理。
// 交互: 调用 WA 管理端 API，依赖成员列表完成负责人/可见成员分配。

import { LinkOutlined, MessageOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Modal,
  QRCode,
  Select,
  Space,
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
} | null;

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
      expiresAt: task.expiresAt
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
      qrCode: string | null;
      heartbeatAt: string | null;
      disconnectReason: string | null;
      autoReconnectCount: number;
      sessionRef: string | null;
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
                    heartbeatAt: event.heartbeatAt,
                    disconnectReason: event.disconnectReason,
                    autoReconnectCount: event.autoReconnectCount,
                    sessionRef: event.sessionRef ?? current.session.sessionRef,
                    qrCode: event.qrCode ?? current.session.qrCode
                  }
                : {
                    connectionState: event.connectionState,
                    sessionRef: event.sessionRef ?? "",
                    loginMode: "admin_scan",
                    heartbeatAt: event.heartbeatAt,
                    disconnectReason: event.disconnectReason,
                    autoReconnectCount: event.autoReconnectCount,
                    qrCode: event.qrCode
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
            qrCode: event.qrCode
          };
        }
        return current;
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
    if (!loginTask || refreshingLoginTask || qrCountdownMs > 0) return;

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
                expiresAt: nextTask.expiresAt
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
            {isImageQrCode ? (
              <img
                src={loginTask.qrCode}
                alt={`WA QR ${loginTask.accountName}`}
                style={{ width: 280, height: 280, objectFit: "contain", borderRadius: 12, border: "1px solid #f0f0f0", background: "#fff", padding: 8 }}
              />
            ) : (
              <QRCode value={loginTask.qrCode} size={280} />
            )}
            <Typography.Text>使用 WhatsApp 扫码登录</Typography.Text>
            <Tag color={refreshingLoginTask ? "processing" : qrCountdownMs <= 15000 ? "gold" : "default"}>
              {refreshingLoginTask ? "二维码刷新中" : `将在 ${countdownLabel} 后刷新`}
            </Tag>
            <Typography.Paragraph copyable={{ text: loginTask.qrCode }} style={{ width: "100%", marginBottom: 0, wordBreak: "break-all" }}>
              如果二维码无法识别，可复制原始二维码串用于排查。
            </Typography.Paragraph>
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
            <Typography.Text>心跳时间: {health.session?.heartbeatAt ? new Date(health.session.heartbeatAt).toLocaleString() : "暂无"}</Typography.Text>
            <Typography.Text>重连次数: {health.session?.autoReconnectCount ?? 0}</Typography.Text>
            <Typography.Text>登录入口: {health.session?.loginMode ?? "暂无"}</Typography.Text>
            <Typography.Text>掉线原因: {health.session?.disconnectReason ?? "暂无"}</Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">加载中...</Typography.Text>
        )}
      </Modal>
    </>
  );
}
