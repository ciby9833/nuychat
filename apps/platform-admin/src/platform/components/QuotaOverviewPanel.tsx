import { Button, Card, Col, Drawer, Form, Input, Row, Select, Space, Statistic, Table, Tag } from "antd";
import { useState } from "react";
import type { PlatformQuotaItem, PlatformQuotaOverviewResponse, QuotaStatus } from "../types";

function pct(v: number | null) {
  if (v === null) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

export function QuotaOverviewPanel({
  data,
  filters,
  onFilterChange,
  onUpdateTenant
}: {
  data: PlatformQuotaOverviewResponse | null;
  filters: { search: string; status: QuotaStatus | "all" };
  onFilterChange: (next: { search: string; status: QuotaStatus | "all" }) => void;
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
    }
  ) => Promise<void>;
}) {
  const items: PlatformQuotaItem[] = data?.items ?? [];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlatformQuotaItem | null>(null);
  const [form] = Form.useForm<{ planCode?: string; licensedSeats?: number | null; licensedAiSeats?: number | null; status: "active" | "suspended" | "inactive" }>();

  const openEditor = (item: PlatformQuotaItem) => {
    setSelectedItem(item);
    form.setFieldsValue({
      planCode: item.planCode ?? undefined,
      licensedSeats: item.quotaLimit,
      licensedAiSeats: item.aiSeatLimit,
      status: item.tenantStatus as "active" | "suspended" | "inactive"
    });
    setDrawerOpen(true);
  };

  const submitEdit = async () => {
    if (!selectedItem) return;
    const values = await form.validateFields();
    setBusy(true);
    try {
      await onUpdateTenant(selectedItem.tenantId, {
        planCode: values.planCode || undefined,
        licensedSeats: values.licensedSeats ?? null,
        licensedAiSeats: values.licensedAiSeats ?? null,
        status: values.status
      });
      setDrawerOpen(false);
      setSelectedItem(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="查询模块">
        <Form layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label="Search">
                <Input value={filters.search} onChange={(e) => onFilterChange({ ...filters, search: e.target.value })} placeholder="tenant name/slug" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Status">
                <Select
                  value={filters.status}
                  onChange={(value) => onFilterChange({ ...filters, status: value })}
                  options={[
                    { value: "all", label: "all" },
                    { value: "healthy", label: "healthy" },
                    { value: "warning", label: "warning" },
                    { value: "exceeded", label: "exceeded" },
                    { value: "unlimited", label: "unlimited" }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Row gutter={12}>
        <Col xs={24} md={6}><Card><Statistic title="Used Seats" value={data?.summary.totalQuotaUsed ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Licensed Seats" value={data?.summary.totalQuotaLimit ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Licensed AI Seats" value={data?.summary.totalAiSeatLimit ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Used AI Seats" value={data?.summary.totalAiSeatUsed ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Exceeded Tenants" value={data?.summary.exceededTenants ?? 0} /></Card></Col>
      </Row>

      <Row gutter={12}>
        <Col xs={24} md={6}><Card><Statistic title="Total Accounts" value={data?.summary.totalAccounts ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Warning Tenants" value={data?.summary.warningTenants ?? 0} /></Card></Col>
      </Row>

      <Card title="列表模块" extra={<Tag>{items.length} 条</Tag>}>
        <Table<PlatformQuotaItem>
          rowKey="tenantId"
          dataSource={items}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Tenant", dataIndex: "tenantName" },
            { title: "Slug", dataIndex: "tenantSlug" },
            { title: "Plan", dataIndex: "planCode", render: (v) => v ?? "no-plan" },
            { title: "Used Seats", dataIndex: "quotaUsed" },
            { title: "Licensed Seats", dataIndex: "quotaLimit", render: (v) => v ?? "unlimited" },
            { title: "Used AI Seats", dataIndex: "aiSeatUsed" },
            { title: "AI Seats", dataIndex: "aiSeatLimit" },
            { title: "Total Accounts", dataIndex: "totalAccounts" },
            { title: "Usage", dataIndex: "usageRatio", render: (v) => pct(v) },
            { title: "Status", dataIndex: "quotaStatus", render: (v) => <Tag color={v === "healthy" ? "green" : v === "warning" ? "gold" : v === "exceeded" ? "red" : "blue"}>{v}</Tag> },
            {
              title: "操作",
              render: (_, item) => <Button size="small" onClick={() => openEditor(item)}>调整授权</Button>
            }
          ]}
        />
      </Card>

      <Drawer
        title={selectedItem ? `调整授权 - ${selectedItem.tenantName}` : "调整授权"}
        placement="right"
        width={420}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedItem(null);
        }}
        open={drawerOpen}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Plan" name="planCode">
            <Input placeholder="starter / pro / enterprise" />
          </Form.Item>
          <Form.Item label="Licensed Seats" name="licensedSeats">
            <Input type="number" min={1} />
          </Form.Item>
          <Form.Item label="Licensed AI Seats" name="licensedAiSeats">
            <Input type="number" min={0} />
          </Form.Item>
          <Form.Item label="Tenant Status" name="status" rules={[{ required: true }]}>
            <Select options={[
              { value: "active", label: "active" },
              { value: "suspended", label: "suspended" },
              { value: "inactive", label: "inactive" }
            ]} />
          </Form.Item>
          <Button type="primary" loading={busy} onClick={() => { void submitEdit(); }}>保存调整</Button>
        </Form>
      </Drawer>
    </Space>
  );
}
