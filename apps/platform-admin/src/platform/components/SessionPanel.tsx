import { Button, Card, Col, Form, Input, Row, Select, Space, Table, Tag } from "antd";
import type { PlatformSessionItem } from "../types";

function shortDate(v: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString();
}

export function SessionPanel({
  items,
  total,
  filters,
  onFilterChange,
  onBulkRevoke,
  onRevoke
}: {
  items: PlatformSessionItem[];
  total: number;
  filters: {
    scope: "all" | "tenant" | "platform";
    status: "active" | "revoked" | "expired";
    identityId: string;
    tenantId: string;
  };
  onFilterChange: (next: {
    scope: "all" | "tenant" | "platform";
    status: "active" | "revoked" | "expired";
    identityId: string;
    tenantId: string;
  }) => void;
  onBulkRevoke: () => Promise<void>;
  onRevoke: (scope: "tenant" | "platform", sessionId: string) => Promise<void>;
}) {
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="查询模块" extra={<Tag color="blue">匹配总数: {total}</Tag>}>
        <Form layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={6}>
              <Form.Item label="Scope">
                <Select
                  value={filters.scope}
                  onChange={(value) => onFilterChange({ ...filters, scope: value })}
                  options={[
                    { value: "all", label: "all" },
                    { value: "tenant", label: "tenant" },
                    { value: "platform", label: "platform" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Status">
                <Select
                  value={filters.status}
                  onChange={(value) => onFilterChange({ ...filters, status: value })}
                  options={[
                    { value: "active", label: "active" },
                    { value: "revoked", label: "revoked" },
                    { value: "expired", label: "expired" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Identity ID">
                <Input value={filters.identityId} onChange={(e) => onFilterChange({ ...filters, identityId: e.target.value.trim() })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Tenant ID">
                <Input value={filters.tenantId} onChange={(e) => onFilterChange({ ...filters, tenantId: e.target.value.trim() })} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <Button danger onClick={() => { void onBulkRevoke(); }}>Revoke Filtered Active Sessions</Button>
      </Card>

      <Card title="列表模块">
        <Table<PlatformSessionItem>
          rowKey={(record) => `${record.scope}:${record.sessionId}`}
          dataSource={items}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Scope", dataIndex: "scope", render: (value) => <Tag>{String(value).toUpperCase()}</Tag> },
            { title: "Session", dataIndex: "sessionId", render: (value) => `${String(value).slice(0, 8)}...` },
            { title: "Identity", dataIndex: "identityId", render: (value) => `${String(value).slice(0, 8)}...` },
            { title: "Tenant", dataIndex: "tenantId", render: (value) => value ? `${String(value).slice(0, 8)}...` : "-" },
            { title: "Status", dataIndex: "status", render: (value) => <Tag color={value === "active" ? "green" : "default"}>{value}</Tag> },
            { title: "Last Used", dataIndex: "lastUsedAt", render: (value) => shortDate(value) },
            {
              title: "Action",
              render: (_, record) => record.status === "active"
                ? <Button size="small" onClick={() => { void onRevoke(record.scope, record.sessionId); }}>Force Logout</Button>
                : <span>{shortDate(record.revokedAt)}</span>
            }
          ]}
        />
      </Card>
    </Space>
  );
}
