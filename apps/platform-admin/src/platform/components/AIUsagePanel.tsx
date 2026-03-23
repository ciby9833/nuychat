import { Button, Card, Col, Drawer, Form, Input, InputNumber, Row, Select, Space, Statistic, Switch, Table, Tag } from "antd";
import { useState } from "react";

import type { AIUsageStatus, PlatformAIUsageItem, PlatformAIUsageOverviewResponse } from "../types";

function money(value: number) {
  return `$${value.toFixed(4)}`;
}

function percent(value: number | null) {
  if (value === null) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export function AIUsagePanel({
  data,
  filters,
  onFilterChange,
  onUpdateBudget
}: {
  data: PlatformAIUsageOverviewResponse | null;
  filters: { search: string; status: "all" | AIUsageStatus; days: number };
  onFilterChange: (next: { search: string; status: "all" | AIUsageStatus; days: number }) => void;
  onUpdateBudget: (
    tenantId: string,
    input: {
      includedTokens?: number;
      monthlyBudgetUsd?: number | null;
      softLimitUsd?: number | null;
      hardLimitUsd?: number | null;
      enforcementMode?: "notify" | "throttle" | "block";
      isActive?: boolean;
    }
  ) => Promise<void>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlatformAIUsageItem | null>(null);
  const [form] = Form.useForm<{
    includedTokens: number;
    monthlyBudgetUsd?: number | null;
    softLimitUsd?: number | null;
    hardLimitUsd?: number | null;
    enforcementMode: "notify" | "throttle" | "block";
    isActive: boolean;
  }>();

  const items = data?.items ?? [];

  const openEditor = (item: PlatformAIUsageItem) => {
    setSelectedItem(item);
    form.setFieldsValue({
      includedTokens: item.includedTokens,
      monthlyBudgetUsd: item.monthlyBudgetUsd,
      softLimitUsd: item.softLimitUsd,
      hardLimitUsd: item.hardLimitUsd,
      enforcementMode: item.enforcementMode,
      isActive: item.policyIsActive
    });
    setDrawerOpen(true);
  };

  const submitEdit = async () => {
    if (!selectedItem) return;
    const values = await form.validateFields();
    setBusy(true);
    try {
      await onUpdateBudget(selectedItem.tenantId, {
        includedTokens: values.includedTokens,
        monthlyBudgetUsd: values.monthlyBudgetUsd ?? null,
        softLimitUsd: values.softLimitUsd ?? null,
        hardLimitUsd: values.hardLimitUsd ?? null,
        enforcementMode: values.enforcementMode,
        isActive: values.isActive
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
        <Row gutter={12}>
          <Col xs={24} md={10}>
            <Input
              placeholder="搜索公司 name/slug"
              value={filters.search}
              onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            />
          </Col>
          <Col xs={24} md={7}>
            <Select
              style={{ width: "100%" }}
              value={filters.status}
              onChange={(value) => onFilterChange({ ...filters, status: value })}
              options={[
                { value: "all", label: "all" },
                { value: "healthy", label: "healthy" },
                { value: "warning", label: "warning" },
                { value: "blocked", label: "blocked" },
                { value: "unlimited", label: "unlimited" }
              ]}
            />
          </Col>
          <Col xs={24} md={7}>
            <Select
              style={{ width: "100%" }}
              value={filters.days}
              onChange={(value) => onFilterChange({ ...filters, days: value })}
              options={[
                { value: 7, label: "Last 7 days" },
                { value: 30, label: "Last 30 days" },
                { value: 90, label: "Last 90 days" }
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={12}>
        <Col xs={24} md={6}><Card><Statistic title="Requests" value={data?.summary.totalRequests ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Total Tokens" value={data?.summary.totalTokens ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Estimated Cost" value={data?.summary.totalEstimatedCostUsd ?? 0} precision={4} prefix="$" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Billable Cost" value={data?.summary.totalBillableCostUsd ?? 0} precision={4} prefix="$" /></Card></Col>
      </Row>

      <Row gutter={12}>
        <Col xs={24} md={6}><Card><Statistic title="Input Tokens" value={data?.summary.totalInputTokens ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Output Tokens" value={data?.summary.totalOutputTokens ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Warning Tenants" value={data?.summary.warningTenants ?? 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="Blocked Tenants" value={data?.summary.blockedTenants ?? 0} /></Card></Col>
      </Row>

      <Card title="趋势观察" extra={<Tag>{data?.trend.length ?? 0} 天</Tag>}>
        <Table
          rowKey="date"
          dataSource={data?.trend ?? []}
          pagination={false}
          columns={[
            { title: "Date", dataIndex: "date" },
            { title: "Requests", dataIndex: "requestCount" },
            { title: "Tokens", dataIndex: "totalTokens" },
            { title: "Estimated Cost", dataIndex: "estimatedCostUsd", render: (value: number) => money(value) }
          ]}
        />
      </Card>

      <Card title="模型拆解" extra={<Tag>{data?.modelBreakdown.length ?? 0} 项</Tag>}>
        <Table
          rowKey={(row) => `${row.provider}:${row.model}`}
          dataSource={data?.modelBreakdown ?? []}
          pagination={false}
          columns={[
            { title: "Provider", dataIndex: "provider" },
            { title: "Model", dataIndex: "model" },
            { title: "Requests", dataIndex: "requestCount" },
            { title: "Tokens", dataIndex: "totalTokens" },
            { title: "Estimated Cost", dataIndex: "estimatedCostUsd", render: (value: number) => money(value) }
          ]}
        />
      </Card>

      <Card title="公司 AI 使用与预算" extra={<Tag>{items.length} 条</Tag>}>
        <Table<PlatformAIUsageItem>
          rowKey="tenantId"
          dataSource={items}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Tenant", dataIndex: "tenantName" },
            { title: "Slug", dataIndex: "tenantSlug" },
            { title: "Requests", dataIndex: "requestCount" },
            { title: "Input", dataIndex: "inputTokens" },
            { title: "Output", dataIndex: "outputTokens" },
            { title: "Total", dataIndex: "totalTokens" },
            { title: "Included Tokens", dataIndex: "includedTokens" },
            { title: "Estimated", dataIndex: "estimatedCostUsd", render: (value: number) => money(value) },
            { title: "Billable", dataIndex: "billableCostUsd", render: (value: number) => money(value) },
            { title: "Budget", dataIndex: "monthlyBudgetUsd", render: (value: number | null) => value === null ? "-" : money(value) },
            { title: "Usage", dataIndex: "budgetRatio", render: (value: number | null) => percent(value) },
            {
              title: "Status",
              dataIndex: "usageStatus",
              render: (value: string) => <Tag color={value === "healthy" ? "green" : value === "warning" ? "gold" : value === "blocked" ? "red" : "blue"}>{value}</Tag>
            },
            {
              title: "操作",
              render: (_, item) => <Button size="small" onClick={() => openEditor(item)}>预算策略</Button>
            }
          ]}
        />
      </Card>

      <Drawer
        title={selectedItem ? `AI 预算策略 - ${selectedItem.tenantName}` : "AI 预算策略"}
        placement="right"
        width={420}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedItem(null);
        }}
        open={drawerOpen}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Included Tokens" name="includedTokens" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Monthly Budget (USD)" name="monthlyBudgetUsd">
            <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Soft Limit (USD)" name="softLimitUsd">
            <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Hard Limit (USD)" name="hardLimitUsd">
            <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Enforcement" name="enforcementMode" rules={[{ required: true }]}>
            <Select options={[
              { value: "notify", label: "notify" },
              { value: "throttle", label: "throttle" },
              { value: "block", label: "block" }
            ]} />
          </Form.Item>
          <Form.Item label="Policy Active" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" loading={busy} onClick={() => { void submitEdit(); }}>
            保存策略
          </Button>
        </Form>
      </Drawer>
    </Space>
  );
}
