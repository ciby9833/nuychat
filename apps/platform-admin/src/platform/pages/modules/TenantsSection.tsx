import {
  Alert,
  Button,
  Card,
  Popconfirm,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography
} from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SHARED_AI_PROVIDER_OPTIONS, requiresAIProviderApiKeyOnCreate, type SharedAIProvider } from "../../../../../../packages/shared-types/src/ai-model-config";
import type { TenantDetail, TenantItem, TenantMembershipItem } from "../../types";

type DrawerMode = "none" | "create_tenant" | "create_account" | "edit_tenant" | "edit_account" | "edit_ai_config";
type TabKey = "tenant_list" | "tenant_manage";
export function TenantsSection({
  items,
  loading,
  error,
  notice,
  onCreateTenant,
  onCreateTenantAccount,
  onLoadTenantDetail,
  onToggleStatus,
  onUpdateTenantMembership,
  onUpdateTenant,
  onLoadTenantAIConfig,
  onUpdateTenantAIConfig
}: {
  items: TenantItem[];
  loading: boolean;
  error: string;
  notice: string;
  onCreateTenant: (input: {
    name: string;
    slug: string;
    planCode: string;
    operatingMode: string;
    licensedSeats?: number;
    licensedAiSeats?: number;
    aiModelAccessMode: "platform_managed" | "tenant_managed";
    aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
    aiModel?: string;
    aiApiKey?: string;
    aiBaseUrl?: string | null;
  }) => Promise<void>;
  onCreateTenantAccount: (input: {
    email: string;
    password: string;
    tenantId: string;
    role: string;
    isDefault: boolean;
  }) => Promise<void>;
  onLoadTenantDetail: (tenantId: string) => Promise<TenantDetail>;
  onToggleStatus: (item: TenantItem) => Promise<void>;
  onUpdateTenantMembership: (
    membershipId: string,
    input: { role?: string; status?: "active" | "inactive"; isDefault?: boolean }
  ) => Promise<void>;
  onUpdateTenant: (
    tenantId: string,
    input: {
      name?: string;
      slug?: string;
      status?: "active" | "suspended" | "inactive";
      planCode?: string;
      operatingMode?: string;
      licensedSeats?: number | null;
      licensedAiSeats?: number | null;
      aiModelAccessMode?: "platform_managed" | "tenant_managed";
      aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
      aiModel?: string;
      aiApiKey?: string;
      aiBaseUrl?: string | null;
    }
  ) => Promise<void>;
  onLoadTenantAIConfig: (tenantId: string) => Promise<{
    tenantId: string;
    aiModelAccessMode: "platform_managed" | "tenant_managed";
    config: TenantItem["aiConfig"];
  }>;
  onUpdateTenantAIConfig: (
    tenantId: string,
    input: {
      provider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
      model?: string;
      apiKey?: string;
      baseUrl?: string | null;
    }
  ) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("tenant_list");
  const [manageTabOpen, setManageTabOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [selectedTenantId, setSelectedTenantId] = useState<string>(items[0]?.tenantId ?? "");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("none");
  const [detailVisible, setDetailVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailBusyMembershipId, setDetailBusyMembershipId] = useState("");
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null);
  const [editingMembership, setEditingMembership] = useState<TenantMembershipItem | null>(null);
  const [aiConfigEditing, setAiConfigEditing] = useState(false);
  const [tenantForm] = Form.useForm<{
    name: string;
    slug: string;
    planCode: string;
    operatingMode: string;
    licensedSeats?: number;
    licensedAiSeats?: number;
    aiModelAccessMode: "platform_managed" | "tenant_managed";
    aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
    aiModel?: string;
    aiApiKey?: string;
    aiBaseUrl?: string | null;
  }>();
  const [accountForm] = Form.useForm<{ email: string; password: string; tenantId: string; role: string; isDefault: boolean }>();
  const [editTenantForm] = Form.useForm<{
    name: string;
    slug: string;
    planCode?: string;
    operatingMode: string;
    status: "active" | "suspended" | "inactive";
    licensedSeats?: number | null;
    licensedAiSeats?: number | null;
    aiModelAccessMode: "platform_managed" | "tenant_managed";
    aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
    aiModel?: string;
    aiApiKey?: string;
    aiBaseUrl?: string | null;
  }>();
  const [editAccountForm] = Form.useForm<{
    role: string;
    status: "active" | "inactive";
    isDefault: boolean;
  }>();
  const [aiConfigForm] = Form.useForm<{
    provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
    model: string;
    apiKey?: string;
    baseUrl?: string | null;
  }>();

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchKeyword = !keyword || [item.name, item.slug, item.plan?.code ?? "", item.operatingMode].join(" ").toLowerCase().includes(keyword);
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      return matchKeyword && matchStatus;
    });
  }, [items, search, statusFilter]);

  const selectedTenant = items.find((item) => item.tenantId === selectedTenantId) ?? filteredItems[0] ?? items[0] ?? null;

  const loadTenantDetail = async (tenantId: string) => {
    setDetailLoading(true);
    try {
      const data = await onLoadTenantDetail(tenantId);
      setTenantDetail(data);
      return data;
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreateTenant = () => {
    setDrawerError("");
    tenantForm.setFieldsValue({
      name: "",
      slug: "",
      planCode: "starter",
      operatingMode: "ai_first",
      licensedSeats: undefined,
      licensedAiSeats: 0,
      aiModelAccessMode: "platform_managed",
      aiProvider: "openai",
      aiModel: "gpt-4o-mini",
      aiApiKey: "",
      aiBaseUrl: null
    });
    setDrawerMode("create_tenant");
  };

  const openManageTenant = async (tenant: TenantItem) => {
    setSelectedTenantId(tenant.tenantId);
    setManageTabOpen(true);
    setActiveTab("tenant_manage");
    await loadTenantDetail(tenant.tenantId);
  };

  const openTenantDetail = async (tenant: TenantItem) => {
    setSelectedTenantId(tenant.tenantId);
    await loadTenantDetail(tenant.tenantId);
    setDetailVisible(true);
  };

  const openCreateAccount = () => {
    setDrawerError("");
    const tenantId = tenantDetail?.tenantId ?? selectedTenant?.tenantId;
    accountForm.setFieldsValue({
      email: "",
      password: "",
      tenantId,
      role: "admin",
      isDefault: false
    });
    setDrawerMode("create_account");
  };

  const openEditTenant = () => {
    const tenant = tenantDetail ?? selectedTenant;
    if (!tenant) return;
    setDrawerError("");
    editTenantForm.setFieldsValue({
      name: tenant.name,
      slug: tenant.slug,
      planCode: tenant.plan?.code,
      operatingMode: tenant.operatingMode,
      status: tenant.status as "active" | "suspended" | "inactive",
      licensedSeats: tenant.licensedSeats,
      licensedAiSeats: tenant.licensedAiSeats,
      aiModelAccessMode: tenant.aiModelAccessMode,
      aiProvider: tenant.aiConfig?.provider,
      aiModel: tenant.aiConfig?.model,
      aiApiKey: "",
      aiBaseUrl: tenant.aiConfig?.baseUrl ?? null
    });
    setDrawerMode("edit_tenant");
  };

  const openEditMembership = (membership: TenantMembershipItem) => {
    setDrawerError("");
    setEditingMembership(membership);
    editAccountForm.setFieldsValue({
      role: membership.role,
      status: membership.status as "active" | "inactive",
      isDefault: membership.isDefault
    });
    setDrawerMode("edit_account");
  };

  const openEditAIConfig = async () => {
    const tenant = tenantDetail ?? selectedTenant;
    if (!tenant) return;
    setDrawerError("");
    setAiConfigEditing(false);
    const aiConfig = await onLoadTenantAIConfig(tenant.tenantId);
    aiConfigForm.setFieldsValue({
      provider: aiConfig.config?.provider ?? "openai",
      model: aiConfig.config?.model ?? "gpt-4o-mini",
      apiKey: "",
      baseUrl: aiConfig.config?.baseUrl ?? null
    });
    setDrawerMode("edit_ai_config");
  };

  const closeDrawer = () => {
    setDrawerError("");
    setDrawerMode("none");
    setEditingMembership(null);
    setAiConfigEditing(false);
  };

  const submitTenant = async () => {
    const values = await tenantForm.validateFields();
    setBusy(true);
    try {
      if (values.aiModelAccessMode === "platform_managed" && requiresAIProviderApiKeyOnCreate(values.aiProvider) && !values.aiApiKey?.trim()) {
        throw new Error("该模型厂商在创建租户时必须填写 API Key");
      }
      await onCreateTenant({ ...values, slug: values.slug.toLowerCase() });
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  const submitAccount = async () => {
    const values = await accountForm.validateFields();
    setBusy(true);
    try {
      setDrawerError("");
      await onCreateTenantAccount(values);
      if (values.tenantId) {
        setSelectedTenantId(values.tenantId);
        await loadTenantDetail(values.tenantId);
      }
      closeDrawer();
    } catch (err) {
      setDrawerError((err as Error).message || "创建账号失败");
    } finally {
      setBusy(false);
    }
  };

  const submitTenantEdit = async () => {
    const tenant = tenantDetail ?? selectedTenant;
    if (!tenant) return;
      const values = await editTenantForm.validateFields();
      setBusy(true);
      try {
        const providerChanged = values.aiProvider && values.aiProvider !== tenant.aiConfig?.provider;
      const needsApiKey = values.aiModelAccessMode === "platform_managed"
        && requiresAIProviderApiKeyOnCreate(values.aiProvider)
        && (providerChanged || !tenant.aiConfig?.hasApiKey);
      if (needsApiKey && !values.aiApiKey?.trim()) {
        throw new Error(providerChanged ? "切换到该模型厂商时必须填写新的 API Key" : "该模型厂商必须填写 API Key");
      }
      await onUpdateTenant(tenant.tenantId, {
        name: values.name,
        slug: values.slug.toLowerCase(),
        planCode: values.planCode || undefined,
        operatingMode: values.operatingMode,
        status: values.status,
        licensedSeats: values.licensedSeats ?? null,
        licensedAiSeats: values.licensedAiSeats ?? null,
        aiModelAccessMode: values.aiModelAccessMode,
        aiProvider: values.aiModelAccessMode === "platform_managed" ? values.aiProvider : undefined,
        aiModel: values.aiModelAccessMode === "platform_managed" ? values.aiModel : undefined,
        aiApiKey: values.aiModelAccessMode === "platform_managed" && values.aiApiKey?.trim() ? values.aiApiKey.trim() : undefined,
        aiBaseUrl: values.aiModelAccessMode === "platform_managed" ? values.aiBaseUrl?.trim() || null : undefined
      });
      await loadTenantDetail(tenant.tenantId);
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  const submitMembershipEdit = async () => {
    if (!editingMembership) return;
    const values = await editAccountForm.validateFields();
    setBusy(true);
    try {
      await onUpdateTenantMembership(editingMembership.membershipId, values);
      if (tenantDetail?.tenantId) {
        await loadTenantDetail(tenantDetail.tenantId);
      }
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  const submitAIConfigEdit = async () => {
    const tenant = tenantDetail ?? selectedTenant;
    if (!tenant) return;
    const values = await aiConfigForm.validateFields();
    setBusy(true);
    try {
      const providerChanged = values.provider !== tenant.aiConfig?.provider;
      const needsApiKey = requiresAIProviderApiKeyOnCreate(values.provider) && (providerChanged || !tenant.aiConfig?.hasApiKey);
      if (needsApiKey && !values.apiKey?.trim()) {
        throw new Error(providerChanged ? "切换到该模型厂商时必须填写新的 API Key" : "该模型厂商必须填写 API Key");
      }
      await onUpdateTenantAIConfig(tenant.tenantId, {
        provider: values.provider,
        model: values.model,
        apiKey: values.apiKey?.trim() ? values.apiKey.trim() : undefined,
        baseUrl: values.baseUrl?.trim() ? values.baseUrl.trim() : null
      });
      await loadTenantDetail(tenant.tenantId);
      closeDrawer();
    } finally {
      setBusy(false);
    }
  };

  const updateMembership = async (
    membership: TenantMembershipItem,
    input: { role?: string; status?: "active" | "inactive"; isDefault?: boolean }
  ) => {
    setDetailBusyMembershipId(membership.membershipId);
    try {
      await onUpdateTenantMembership(membership.membershipId, input);
      const tenantId = tenantDetail?.tenantId ?? selectedTenant?.tenantId;
      if (tenantId) {
        await loadTenantDetail(tenantId);
      }
    } finally {
      setDetailBusyMembershipId("");
    }
  };

  useEffect(() => {
    if (!manageTabOpen && activeTab === "tenant_manage") {
      setActiveTab("tenant_list");
    }
  }, [activeTab, manageTabOpen]);

  useEffect(() => {
    if (!items.length) {
      setSelectedTenantId("");
      setTenantDetail(null);
      return;
    }
    if (!items.some((item) => item.tenantId === selectedTenantId)) {
      setSelectedTenantId(items[0].tenantId);
    }
  }, [items, selectedTenantId]);

  useEffect(() => {
    if (activeTab !== "tenant_manage") return;
    const tenantId = selectedTenantId || selectedTenant?.tenantId;
    if (!tenantId) return;
    if (tenantDetail?.tenantId === tenantId) return;
    void loadTenantDetail(tenantId);
  }, [activeTab, selectedTenant?.tenantId, selectedTenantId, tenantDetail?.tenantId]);

  const tenantColumns = [
    { title: "租户名称", dataIndex: "name" },
    { title: "Slug", dataIndex: "slug" },
    { title: "套餐", render: (_: unknown, record: TenantItem) => record.plan?.code ?? "no-plan" },
    { title: "已用席位", render: (_: unknown, record: TenantItem) => record.activeSeatCount },
    { title: "AI 授权", render: (_: unknown, record: TenantItem) => record.licensedAiSeats },
    { title: "账号数", render: (_: unknown, record: TenantItem) => record.totalAccountCount },
    {
      title: "模型来源",
      render: (_: unknown, record: TenantItem) => (
        <Tag color={record.aiModelAccessMode === "platform_managed" ? "blue" : "gold"}>
          {record.aiModelAccessMode === "platform_managed" ? "平台提供" : "租户自配"}
        </Tag>
      )
    },
    { title: "运行模式", dataIndex: "operatingMode" },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: string) => <Tag color={value === "active" ? "green" : "default"}>{value}</Tag>
    },
    {
      title: "操作",
      render: (_: unknown, record: TenantItem) => (
        <Space wrap>
          <Button size="small" onClick={() => { void openTenantDetail(record); }}>
            租户详情
          </Button>
          <Button size="small" type="primary" onClick={() => { void openManageTenant(record); }}>
            管理租户
          </Button>
          <Popconfirm
            title={`确认${record.status === "active" ? "停用" : "启用"}租户`}
            description={`租户：${record.name}`}
            okText="确认"
            cancelText="取消"
            onConfirm={() => onToggleStatus(record)}
          >
            <Button size="small">
              {record.status === "active" ? "停用" : "启用"}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const membershipColumns = [
    { title: "邮箱", dataIndex: "email" },
    { title: "角色", dataIndex: "role" },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: string) => <Tag color={value === "active" ? "green" : "default"}>{value}</Tag>
    },
    {
      title: "默认账号",
      dataIndex: "isDefault",
      render: (value: boolean) => (value ? <Tag color="blue">默认</Tag> : "-")
    },
    { title: "创建时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString() },
    {
      title: "操作",
      render: (_: unknown, membership: TenantMembershipItem) => (
        <Space wrap>
          <Button size="small" onClick={() => openEditMembership(membership)}>
            编辑账号
          </Button>
          <Popconfirm
            title={`确认${membership.status === "active" ? "停用" : "启用"}账号`}
            description={membership.email}
            okText="确认"
            cancelText="取消"
            onConfirm={() =>
              updateMembership(membership, {
                status: membership.status === "active" ? "inactive" : "active"
              })
            }
          >
            <Button
              size="small"
              loading={detailBusyMembershipId === membership.membershipId}
            >
              {membership.status === "active" ? "停用" : "启用"}
            </Button>
          </Popconfirm>
          <Button
            size="small"
            disabled={membership.isDefault}
            loading={detailBusyMembershipId === membership.membershipId}
            onClick={() => {
              void updateMembership(membership, { isDefault: true });
            }}
          >
            设为默认
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {(error || notice) ? (
        <Card size="small">
          {error ? <div style={{ color: "#cf1322" }}>{error}</div> : null}
          {notice ? <div style={{ color: "#389e0d" }}>{notice}</div> : null}
        </Card>
      ) : null}

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        items={[
          {
            key: "tenant_list",
            label: "租户列表",
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card
                  title="查询模块"
                  extra={
                    <Space>
                      <Tag color="blue">筛选后 {filteredItems.length} 条</Tag>
                      <Button type="primary" onClick={openCreateTenant}>
                        新增租户
                      </Button>
                    </Space>
                  }
                >
                  <Space wrap style={{ width: "100%" }}>
                    <Input.Search
                      placeholder="搜索租户名称、slug、套餐、模式"
                      allowClear
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ width: 320 }}
                    />
                    <Select
                      value={statusFilter}
                      style={{ width: 180 }}
                      options={[
                        { value: "all", label: "全部状态" },
                        { value: "active", label: "active" },
                        { value: "suspended", label: "suspended" }
                      ]}
                      onChange={setStatusFilter}
                    />
                  </Space>
                </Card>

                <Card title="租户列表">
                  <Table<TenantItem>
                    rowKey="tenantId"
                    loading={loading}
                    dataSource={filteredItems}
                    pagination={{ pageSize: 10 }}
                    columns={tenantColumns}
                  />
                </Card>
              </Space>
            )
          },
          ...(manageTabOpen
            ? [
                {
                  key: "tenant_manage",
                  label: tenantDetail?.name ? `租户管理 · ${tenantDetail.name}` : "租户管理",
                  children: selectedTenant ? (
                    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                      <Card
                        title="租户信息"
                        extra={
                          <Space>
                            <Button
                              onClick={() => {
                                setManageTabOpen(false);
                                setActiveTab("tenant_list");
                                setTenantDetail(null);
                              }}
                            >
                              关闭管理页
                            </Button>
                            <Button onClick={openEditTenant} disabled={!tenantDetail}>
                              编辑租户信息
                            </Button>
                            <Button onClick={() => { void openEditAIConfig(); }} disabled={!tenantDetail}>
                              配置 AI 模型
                            </Button>
                            <Button type="primary" onClick={openCreateAccount} disabled={!selectedTenant}>
                              新增账号
                            </Button>
                          </Space>
                        }
                      >
                        <Descriptions
                          column={3}
                          bordered
                          items={[
                            { key: "name", label: "租户名称", children: tenantDetail?.name ?? selectedTenant.name },
                            { key: "slug", label: "Slug", children: tenantDetail?.slug ?? selectedTenant.slug },
                            { key: "plan", label: "套餐", children: tenantDetail?.plan?.code ?? selectedTenant.plan?.code ?? "no-plan" },
                            { key: "mode", label: "运行模式", children: tenantDetail?.operatingMode ?? selectedTenant.operatingMode },
                            {
                              key: "status",
                              label: "状态",
                              children: <Tag color={(tenantDetail?.status ?? selectedTenant.status) === "active" ? "green" : "default"}>{tenantDetail?.status ?? selectedTenant.status}</Tag>
                            },
                            {
                              key: "seats",
                              label: "席位",
                              children: `${tenantDetail?.activeSeatCount ?? selectedTenant.activeSeatCount}/${tenantDetail?.licensedSeats ?? selectedTenant.licensedSeats ?? "unlimited"}`
                            },
                            { key: "aiSeats", label: "AI 授权座席", children: tenantDetail?.licensedAiSeats ?? selectedTenant.licensedAiSeats },
                            {
                              key: "aiAccessMode",
                              label: "模型配置权",
                              children: (tenantDetail?.aiModelAccessMode ?? selectedTenant.aiModelAccessMode) === "platform_managed" ? "平台提供" : "租户自配"
                            },
                            {
                              key: "aiModel",
                              label: "当前模型",
                              children: tenantDetail?.aiConfig ? `${tenantDetail.aiConfig.provider} / ${tenantDetail.aiConfig.model}` : "-"
                            },
                            { key: "accounts", label: "账号数", children: tenantDetail?.memberships.length ?? selectedTenant.totalAccountCount },
                            { key: "createdAt", label: "创建时间", children: tenantDetail?.createdAt ? new Date(tenantDetail.createdAt).toLocaleString() : "-" },
                            { key: "updatedAt", label: "更新时间", children: tenantDetail?.updatedAt ? new Date(tenantDetail.updatedAt).toLocaleString() : "-" }
                          ]}
                        />
                      </Card>

                      <Card title="租户账号列表">
                        <Table<TenantMembershipItem>
                          rowKey="membershipId"
                          loading={detailLoading}
                          dataSource={tenantDetail?.memberships ?? []}
                          pagination={{ pageSize: 10 }}
                          locale={{ emptyText: detailLoading ? "正在加载账号..." : "暂无账号" }}
                          columns={membershipColumns}
                        />
                      </Card>
                    </Space>
                  ) : (
                    <Card>
                      <Empty description="请先在租户列表中选择要管理的租户" />
                    </Card>
                  )
                }
              ]
            : []) as Array<{ key: TabKey; label: string; children: ReactNode }>
        ]}
      />

      <Modal
        title="租户详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={<Button onClick={() => setDetailVisible(false)}>关闭</Button>}
        width={760}
      >
        {tenantDetail ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions
              column={2}
              bordered
              items={[
                { key: "name", label: "租户名称", children: tenantDetail.name },
                { key: "slug", label: "Slug", children: tenantDetail.slug },
                { key: "plan", label: "套餐", children: tenantDetail.plan?.code ?? "no-plan" },
                { key: "mode", label: "运行模式", children: tenantDetail.operatingMode },
                { key: "status", label: "状态", children: <Tag color={tenantDetail.status === "active" ? "green" : "default"}>{tenantDetail.status}</Tag> },
                { key: "aiSeats", label: "AI 授权座席", children: tenantDetail.licensedAiSeats },
                { key: "aiAccessMode", label: "模型配置权", children: tenantDetail.aiModelAccessMode === "platform_managed" ? "平台提供" : "租户自配" },
                { key: "aiModel", label: "当前模型", children: tenantDetail.aiConfig ? `${tenantDetail.aiConfig.provider} / ${tenantDetail.aiConfig.model}` : "-" },
                { key: "accounts", label: "账号数", children: tenantDetail.memberships.length },
                { key: "createdAt", label: "创建时间", children: new Date(tenantDetail.createdAt).toLocaleString() },
                { key: "updatedAt", label: "更新时间", children: new Date(tenantDetail.updatedAt).toLocaleString() }
              ]}
            />
            <Typography.Text type="secondary">查看详情后，如需继续操作，请使用“管理租户”进入第二个 TAB 页面。</Typography.Text>
          </Space>
        ) : (
          <Empty description={detailLoading ? "正在加载租户详情..." : "暂无详情"} />
        )}
      </Modal>

      <Drawer
        title={
          drawerMode === "create_tenant"
            ? "新增租户"
            : drawerMode === "create_account"
              ? "新增账号"
                : drawerMode === "edit_tenant"
                  ? "编辑租户信息"
                  : drawerMode === "edit_ai_config"
                  ? (aiConfigEditing ? "编辑 AI 模型" : "查看 AI 模型")
                  : "编辑账号"
        }
        placement="right"
        width={440}
        onClose={closeDrawer}
        open={drawerMode !== "none"}
      >
        {drawerError ? <Alert type="error" showIcon message={drawerError} style={{ marginBottom: 16 }} /> : null}

        {drawerMode === "create_tenant" ? (
          <Form
            form={tenantForm}
            layout="vertical"
            initialValues={{
              planCode: "starter",
              operatingMode: "ai_first",
              licensedAiSeats: 0,
              aiModelAccessMode: "platform_managed",
              aiProvider: "openai",
              aiModel: "gpt-4o-mini"
            }}
          >
            <Form.Item label="租户名称" name="name" rules={[{ required: true, message: "请输入租户名称" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Slug" name="slug" rules={[{ required: true, message: "请输入 slug" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="套餐编码" name="planCode" rules={[{ required: true, message: "请输入套餐编码" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="授权席位" name="licensedSeats" extra="留空时沿用套餐默认席位">
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item label="AI 授权座席" name="licensedAiSeats" rules={[{ required: true, message: "请输入 AI 授权座席数量" }]}>
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item label="运行模式" name="operatingMode" rules={[{ required: true, message: "请选择运行模式" }]}>
              <Select
                options={[
                  { value: "human_first", label: "human_first" },
                  { value: "ai_first", label: "ai_first" },
                  { value: "ai_autonomous", label: "ai_autonomous" },
                  { value: "workflow_first", label: "workflow_first" }
                ]}
              />
            </Form.Item>
            <Form.Item label="大模型配置来源" name="aiModelAccessMode" rules={[{ required: true, message: "请选择配置来源" }]}>
              <Select
                options={[
                  { value: "platform_managed", label: "平台提供" },
                  { value: "tenant_managed", label: "租户自己配置" }
                ]}
              />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.aiModelAccessMode !== next.aiModelAccessMode}>
              {({ getFieldValue }) =>
                getFieldValue("aiModelAccessMode") === "platform_managed" ? (
                  <>
                    <Form.Item label="平台提供模型厂商" name="aiProvider" rules={[{ required: true, message: "请选择模型厂商" }]}>
                      <Select options={SHARED_AI_PROVIDER_OPTIONS.map((item: { value: SharedAIProvider; label: string }) => ({ value: item.value, label: item.label }))} />
                    </Form.Item>
                    <Form.Item label="平台提供模型" name="aiModel" rules={[{ required: true, message: "请输入模型名称" }]}>
                      <Input placeholder="gpt-4o-mini / claude-3-5-haiku-latest / gemini-2.0-flash" />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.aiProvider !== next.aiProvider}>
                      {({ getFieldValue }) =>
                        requiresAIProviderApiKeyOnCreate(getFieldValue("aiProvider")) ? (
                          <Form.Item label="平台模型 API Key" name="aiApiKey" rules={[{ required: true, message: "请输入 API Key" }]}>
                            <Input.Password autoComplete="new-password" />
                          </Form.Item>
                        ) : null
                      }
                    </Form.Item>
                    <Form.Item label="平台模型 Base URL" name="aiBaseUrl" extra="可选。适用于 OpenAI-compatible / 私有代理等场景。">
                      <Input placeholder="https://api.openai.com/v1" />
                    </Form.Item>
                  </>
                ) : (
                  <Alert type="info" showIcon message="租户自配模式下，平台不会为该租户写入或修改 AI 模型配置。" style={{ marginBottom: 16 }} />
                )
              }
            </Form.Item>
            <Button type="primary" loading={busy} onClick={() => { void submitTenant(); }}>
              创建租户
            </Button>
          </Form>
        ) : null}

        {drawerMode === "create_account" ? (
          <Form form={accountForm} layout="vertical" initialValues={{ role: "admin", isDefault: false, tenantId: selectedTenant?.tenantId }}>
            <Form.Item label="邮箱" name="email" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item label="租户" name="tenantId" rules={[{ required: true, message: "请选择租户" }]}>
              <Select
                disabled
                options={items.map((tenant) => ({ value: tenant.tenantId, label: `${tenant.name} (${tenant.slug})` }))}
              />
            </Form.Item>
            <Form.Item label="角色" name="role" rules={[{ required: true, message: "请选择角色" }]}>
              <Select
                options={[
                  { value: "admin", label: "admin" },
                  { value: "agent", label: "agent" },
                  { value: "supervisor", label: "supervisor" }
                ]}
              />
            </Form.Item>
            <Form.Item label="设为默认账号" name="isDefault">
              <Select
                options={[
                  { value: false, label: "否" },
                  { value: true, label: "是" }
                ]}
              />
            </Form.Item>
            <Button type="primary" loading={busy} onClick={() => { void submitAccount(); }}>
              创建账号
            </Button>
          </Form>
        ) : null}

        {drawerMode === "edit_tenant" ? (
          <Form form={editTenantForm} layout="vertical">
            <Form.Item label="租户名称" name="name" rules={[{ required: true, message: "请输入租户名称" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Slug" name="slug" rules={[{ required: true, message: "请输入 slug" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="套餐编码" name="planCode">
              <Input placeholder="starter / pro / enterprise" />
            </Form.Item>
            <Form.Item label="授权席位" name="licensedSeats">
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item label="AI 授权座席" name="licensedAiSeats" rules={[{ required: true, message: "请输入 AI 授权座席数量" }]}>
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item label="运行模式" name="operatingMode" rules={[{ required: true, message: "请选择运行模式" }]}>
              <Select
                options={[
                  { value: "human_first", label: "human_first" },
                  { value: "ai_first", label: "ai_first" },
                  { value: "ai_autonomous", label: "ai_autonomous" },
                  { value: "workflow_first", label: "workflow_first" }
                ]}
              />
            </Form.Item>
            <Form.Item label="大模型配置来源" name="aiModelAccessMode" rules={[{ required: true, message: "请选择配置来源" }]}>
              <Select
                options={[
                  { value: "platform_managed", label: "平台提供" },
                  { value: "tenant_managed", label: "租户自己配置" }
                ]}
              />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.aiModelAccessMode !== next.aiModelAccessMode}>
              {({ getFieldValue }) =>
                getFieldValue("aiModelAccessMode") === "platform_managed" ? (
                  <>
                    <Form.Item label="平台提供模型厂商" name="aiProvider" rules={[{ required: true, message: "请选择模型厂商" }]}>
                      <Select options={SHARED_AI_PROVIDER_OPTIONS.map((item: { value: SharedAIProvider; label: string }) => ({ value: item.value, label: item.label }))} />
                    </Form.Item>
                    <Form.Item label="平台提供模型" name="aiModel" rules={[{ required: true, message: "请输入模型名称" }]}>
                      <Input placeholder="gpt-4o-mini / deepseek-chat / qwen-plus" />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.aiProvider !== next.aiProvider}>
                      {({ getFieldValue }) => {
                        const provider = getFieldValue("aiProvider");
                        const providerChanged = provider && provider !== (tenantDetail?.aiConfig?.provider ?? selectedTenant?.aiConfig?.provider);
                        const hasExistingKey = tenantDetail?.aiConfig?.hasApiKey ?? selectedTenant?.aiConfig?.hasApiKey ?? false;
                        return requiresAIProviderApiKeyOnCreate(provider) ? (
                          <Form.Item
                            label={providerChanged ? "新的 API Key" : "API Key"}
                            name="aiApiKey"
                            rules={[{ required: providerChanged || !hasExistingKey, message: "请输入 API Key" }]}
                            extra={hasExistingKey && !providerChanged ? "出于安全原因不回显。留空则保留当前已保存密钥；填写后将替换。" : undefined}
                          >
                            <Input.Password autoComplete="new-password" placeholder={hasExistingKey && !providerChanged ? "留空则保留当前已保存密钥" : undefined} />
                          </Form.Item>
                        ) : null;
                      }}
                    </Form.Item>
                    <Form.Item label="平台模型 Base URL" name="aiBaseUrl" extra="可选。适用于 OpenAI-compatible / 私有代理等场景。">
                      <Input placeholder="https://api.openai.com/v1" />
                    </Form.Item>
                  </>
                ) : (
                  <Alert type="info" showIcon message="切换到租户自配后，租户侧可自行维护模型配置，平台侧不再改写。" style={{ marginBottom: 16 }} />
                )
              }
            </Form.Item>
            <Form.Item label="状态" name="status" rules={[{ required: true, message: "请选择状态" }]}>
              <Select
                options={[
                  { value: "active", label: "active" },
                  { value: "suspended", label: "suspended" },
                  { value: "inactive", label: "inactive" }
                ]}
              />
            </Form.Item>
            <Button type="primary" loading={busy} onClick={() => { void submitTenantEdit(); }}>
              保存租户信息
            </Button>
          </Form>
        ) : null}

        {drawerMode === "edit_account" ? (
          <Form form={editAccountForm} layout="vertical">
            <Form.Item label="邮箱">
              <Input value={editingMembership?.email} disabled />
            </Form.Item>
            <Form.Item label="角色" name="role" rules={[{ required: true, message: "请选择角色" }]}>
              <Select
                options={[
                  { value: "admin", label: "admin" },
                  { value: "agent", label: "agent" },
                  { value: "supervisor", label: "supervisor" }
                ]}
              />
            </Form.Item>
            <Form.Item label="状态" name="status" rules={[{ required: true, message: "请选择状态" }]}>
              <Select
                options={[
                  { value: "active", label: "active" },
                  { value: "inactive", label: "inactive" }
                ]}
              />
            </Form.Item>
            <Form.Item label="设为默认账号" name="isDefault" rules={[{ required: true, message: "请选择是否默认" }]}>
              <Select
                options={[
                  { value: true, label: "是" },
                  { value: false, label: "否" }
                ]}
              />
            </Form.Item>
            <Button type="primary" loading={busy} onClick={() => { void submitMembershipEdit(); }}>
              保存账号修改
            </Button>
          </Form>
        ) : null}

        {drawerMode === "edit_ai_config" ? (
          (tenantDetail?.aiModelAccessMode ?? selectedTenant?.aiModelAccessMode) === "tenant_managed" ? (
            <Alert type="warning" showIcon message="该租户当前为“租户自己配置”模式，平台不能修改模型厂商、模型或密钥。" />
          ) : !aiConfigEditing ? (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Descriptions
                column={1}
                bordered
                items={[
                  { key: "provider", label: "模型厂商", children: tenantDetail?.aiConfig?.provider ?? selectedTenant?.aiConfig?.provider ?? "-" },
                  { key: "model", label: "模型名称", children: tenantDetail?.aiConfig?.model ?? selectedTenant?.aiConfig?.model ?? "-" },
                  {
                    key: "apiKey",
                    label: "API Key",
                    children: (tenantDetail?.aiConfig?.hasApiKey ?? selectedTenant?.aiConfig?.hasApiKey) ? "已保存，出于安全原因不展示" : "未保存"
                  },
                  { key: "baseUrl", label: "Base URL", children: tenantDetail?.aiConfig?.baseUrl ?? selectedTenant?.aiConfig?.baseUrl ?? "-" }
                ]}
              />
              <Button type="primary" onClick={() => setAiConfigEditing(true)}>
                编辑配置
              </Button>
            </Space>
          ) : (
            <Form form={aiConfigForm} layout="vertical">
              <Form.Item label="模型厂商" name="provider" rules={[{ required: true, message: "请选择模型厂商" }]}>
                <Select options={SHARED_AI_PROVIDER_OPTIONS.map((item: { value: SharedAIProvider; label: string }) => ({ value: item.value, label: item.label }))} />
              </Form.Item>
              <Form.Item label="模型名称" name="model" rules={[{ required: true, message: "请输入模型名称" }]}>
                <Input />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, next) => prev.provider !== next.provider}>
                {({ getFieldValue }) => {
                  const provider = getFieldValue("provider");
                  const providerChanged = provider && provider !== (tenantDetail?.aiConfig?.provider ?? selectedTenant?.aiConfig?.provider);
                  const hasExistingKey = tenantDetail?.aiConfig?.hasApiKey ?? selectedTenant?.aiConfig?.hasApiKey ?? false;
                  return requiresAIProviderApiKeyOnCreate(provider) ? (
                    <Form.Item
                      label={providerChanged ? "新的 API Key" : "API Key"}
                      name="apiKey"
                      rules={[{ required: providerChanged || !hasExistingKey, message: "请输入 API Key" }]}
                      extra={hasExistingKey && !providerChanged ? "出于安全原因不回显。留空则保留当前已保存密钥；填写后将替换。" : undefined}
                    >
                      <Input.Password autoComplete="new-password" placeholder={hasExistingKey && !providerChanged ? "留空则保留当前已保存密钥" : undefined} />
                    </Form.Item>
                  ) : null;
                }}
              </Form.Item>
              <Form.Item label="Base URL" name="baseUrl" extra="可选。适用于 OpenAI-compatible / 私有代理等场景。">
                <Input placeholder="https://api.openai.com/v1" />
              </Form.Item>
              <Space>
                <Button onClick={() => setAiConfigEditing(false)}>
                  返回查看
                </Button>
                <Button type="primary" loading={busy} onClick={() => { void submitAIConfigEdit(); }}>
                  保存 AI 配置
                </Button>
              </Space>
            </Form>
          )
        ) : null}
      </Drawer>
    </Space>
  );
}
