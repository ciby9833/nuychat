import { Button, Card, Col, Drawer, Form, Input, InputNumber, Row, Select, Space, Statistic, Table, Tag } from "antd";
import { useMemo, useState } from "react";

import type {
  BillingInvoiceStatus,
  BillingPaymentReconcileInput,
  BillingStatementExportOptions,
  PlatformBillingOverviewResponse
} from "../types";

function shortDate(v: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString();
}

export function BillingPanel({
  data,
  filters,
  onFilterChange,
  onCloseCycle,
  onReconcile,
  onExport
}: {
  data: PlatformBillingOverviewResponse | null;
  filters: { search: string; status: BillingInvoiceStatus | "all" };
  onFilterChange: (next: { search: string; status: BillingInvoiceStatus | "all" }) => void;
  onCloseCycle: (input: { periodStart: string; periodEnd: string; dueDays: number; currency: string; tenantId?: string }) => Promise<void>;
  onReconcile: (invoiceId: string, input: BillingPaymentReconcileInput) => Promise<void>;
  onExport: (invoiceId: string, format: "csv" | "pdf", options: BillingStatementExportOptions) => Promise<void>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cycleForm] = Form.useForm<{ periodStart: string; periodEnd: string; dueDays: number; currency: string; tenantId?: string }>();
  const [templateForm] = Form.useForm<BillingStatementExportOptions>();
  const [busy, setBusy] = useState(false);
  const items = data?.items ?? [];

  const closeCycle = async () => {
    const values = await cycleForm.validateFields();
    setBusy(true);
    try {
      await onCloseCycle(values);
      setDrawerOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const templateValues = useMemo((): BillingStatementExportOptions => ({
    lang: templateForm.getFieldValue("lang") ?? "en",
    includeTax: templateForm.getFieldValue("includeTax") ?? true,
    taxRate: templateForm.getFieldValue("taxRate") ?? 0.1,
    brandName: templateForm.getFieldValue("brandName") ?? "NuyChat Platform",
    companyName: templateForm.getFieldValue("companyName") ?? "NuyChat Technology Ltd.",
    companyAddress: templateForm.getFieldValue("companyAddress") ?? "N/A",
    supportEmail: templateForm.getFieldValue("supportEmail") ?? "support@nuychat.local",
    website: templateForm.getFieldValue("website") ?? "https://nuychat.local",
    taxId: templateForm.getFieldValue("taxId") ?? "N/A"
  }), [templateForm]);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="查询模块" extra={<Button type="primary" onClick={() => setDrawerOpen(true)}>结算配置</Button>}>
        <Space wrap>
          <Input.Search placeholder="搜索 tenant/invoice" allowClear style={{ width: 320 }} value={filters.search} onChange={(e) => onFilterChange({ ...filters, search: e.target.value })} />
          <Select
            value={filters.status}
            style={{ width: 200 }}
            options={[
              { value: "all", label: "all" },
              { value: "issued", label: "issued" },
              { value: "partially_paid", label: "partially_paid" },
              { value: "paid", label: "paid" },
              { value: "overdue", label: "overdue" },
              { value: "void", label: "void" }
            ]}
            onChange={(value) => onFilterChange({ ...filters, status: value })}
          />
        </Space>
      </Card>

      <Card title="列表模块 - 账单摘要">
        <Row gutter={12}>
          <Col xs={24} md={6}><Card><Statistic title="Total Due" value={data?.summary.totalDue ?? 0} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="Total Paid" value={data?.summary.totalPaid ?? 0} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="Outstanding" value={data?.summary.totalOutstanding ?? 0} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="Overdue" value={data?.summary.overdueInvoices ?? 0} /></Card></Col>
        </Row>
      </Card>

      <Card title="列表模块 - 发票列表" extra={<Tag>{items.length} 条</Tag>}>
        <Table
          rowKey="invoiceId"
          dataSource={items}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Invoice", dataIndex: "invoiceNo" },
            { title: "Tenant", dataIndex: "tenantSlug" },
            { title: "Period", render: (_, r) => `${r.periodStart} ~ ${r.periodEnd}` },
            { title: "Currency", dataIndex: "currency" },
            { title: "Seat License", dataIndex: "seatLicenseAmount" },
            { title: "AI Usage", dataIndex: "aiUsageAmount" },
            { title: "Due", dataIndex: "amountDue" },
            { title: "Paid", dataIndex: "amountPaid" },
            { title: "Outstanding", dataIndex: "outstanding" },
            { title: "Status", dataIndex: "status", render: (v) => <Tag color={v === "paid" ? "green" : v === "overdue" ? "red" : "gold"}>{v}</Tag> },
            { title: "DueAt", dataIndex: "dueAt", render: (v) => shortDate(v) },
            {
              title: "操作",
              render: (_, item) => (
                <Space>
                  <Button size="small" onClick={() => { void onExport(item.invoiceId, "csv", templateValues); }}>CSV</Button>
                  <Button size="small" onClick={() => { void onExport(item.invoiceId, "pdf", templateValues); }}>PDF</Button>
                  {item.outstanding > 0 && item.status !== "void" ? (
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        void onReconcile(item.invoiceId, {
                          amount: item.outstanding,
                          method: "bank_transfer",
                          note: "full settlement"
                        });
                      }}
                    >
                      Reconcile
                    </Button>
                  ) : (
                    <span>{shortDate(item.paidAt)}</span>
                  )}
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Drawer title="结算配置" placement="right" width={520} onClose={() => setDrawerOpen(false)} open={drawerOpen}>
        <Form form={cycleForm} layout="vertical" initialValues={{ dueDays: 7, currency: "USD" }}>
          <Form.Item label="Period Start" name="periodStart" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item label="Period End" name="periodEnd" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item label="Due Days" name="dueDays" rules={[{ required: true }]}><InputNumber min={1} max={90} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="Currency" name="currency" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Tenant ID" name="tenantId"><Input /></Form.Item>
        </Form>

        <Form
          form={templateForm}
          layout="vertical"
          initialValues={{
            lang: "en",
            includeTax: true,
            taxRate: 0.1,
            brandName: "NuyChat Platform",
            companyName: "NuyChat Technology Ltd.",
            companyAddress: "N/A",
            supportEmail: "support@nuychat.local",
            website: "https://nuychat.local",
            taxId: "N/A"
          }}
        >
          <Form.Item label="Statement Language" name="lang"><Select options={[{ value: "en", label: "English" }, { value: "zh-CN", label: "简体中文" }, { value: "id", label: "Bahasa Indonesia" }]} /></Form.Item>
          <Form.Item label="Tax Rate" name="taxRate"><InputNumber min={0} max={1} step={0.01} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="Include Tax" name="includeTax"><Select options={[{ value: true, label: "true" }, { value: false, label: "false" }]} /></Form.Item>
          <Form.Item label="Brand" name="brandName"><Input /></Form.Item>
          <Form.Item label="Company" name="companyName"><Input /></Form.Item>
          <Form.Item label="Tax ID" name="taxId"><Input /></Form.Item>
          <Form.Item label="Address" name="companyAddress"><Input /></Form.Item>
          <Form.Item label="Support Email" name="supportEmail"><Input /></Form.Item>
          <Form.Item label="Website" name="website"><Input /></Form.Item>
        </Form>

        <Button type="primary" loading={busy} onClick={() => { void closeCycle(); }}>Close Billing Cycle</Button>
      </Drawer>
    </Space>
  );
}
