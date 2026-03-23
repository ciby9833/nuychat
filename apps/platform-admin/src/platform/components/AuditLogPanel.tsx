import { Card, Input, Select, Space, Table, Tag } from "antd";
import { useMemo, useState } from "react";
import type { PlatformAuditLogItem } from "../types";

function shortDate(v: string) {
  return new Date(v).toLocaleString();
}

export function AuditLogPanel({ items, total }: { items: PlatformAuditLogItem[]; total: number }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchKeyword = !keyword || [item.action, item.targetType, item.actorEmail ?? item.actorIdentityId].join(" ").toLowerCase().includes(keyword);
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      return matchKeyword && matchStatus;
    });
  }, [items, search, statusFilter]);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="查询模块" extra={<Tag color="blue">Total: {total}</Tag>}>
        <Space wrap>
          <Input.Search placeholder="搜索 action/target/actor" allowClear style={{ width: 320 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            value={statusFilter}
            style={{ width: 180 }}
            options={[{ value: "all", label: "全部状态" }, { value: "success", label: "success" }, { value: "failed", label: "failed" }]}
            onChange={setStatusFilter}
          />
        </Space>
      </Card>

      <Card title="列表模块" extra={<Tag>{filteredItems.length} 条</Tag>}>
        <Table<PlatformAuditLogItem>
          rowKey="auditId"
          dataSource={filteredItems}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: "Action", dataIndex: "action" },
            { title: "Target Type", dataIndex: "targetType" },
            { title: "Target", dataIndex: "targetId", render: (v) => v ? `${String(v).slice(0, 8)}...` : "-" },
            { title: "Actor", render: (_, r) => r.actorEmail ?? r.actorIdentityId.slice(0, 8) },
            { title: "Status", dataIndex: "status", render: (v) => <Tag color={v === "success" ? "green" : "red"}>{v}</Tag> },
            { title: "Time", dataIndex: "createdAt", render: (v) => shortDate(v) }
          ]}
        />
      </Card>
    </Space>
  );
}
