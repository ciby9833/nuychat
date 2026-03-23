// 作用: AI 座席列表表格（含启用/停用/删除操作）
// 菜单路径: 客户中心 -> AI 座席管理 -> 实例列表
// 作者：吴川

import { Button, Card, Popconfirm, Space, Table, Tag } from "antd";

import type { TenantAIAgent } from "../../../types";

export function AISeatsTable({
  rows,
  onEdit,
  onToggleStatus,
  onDelete,
  onCreate
}: {
  rows: TenantAIAgent[];
  onEdit: (item: TenantAIAgent) => void;
  onToggleStatus: (item: TenantAIAgent) => void;
  onDelete: (aiAgentId: string) => void;
  onCreate: () => void;
}) {
  return (
    <Card title="AI 客服实例" extra={<Button type="primary" onClick={onCreate}>新增 AI 座席</Button>}>
      <Table<TenantAIAgent>
        rowKey="aiAgentId"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "角色", dataIndex: "roleLabel", render: (value: string | null) => value ?? "-" },
          { title: "人格", dataIndex: "personality", render: (value: string | null) => value ?? "-" },
          { title: "说明", dataIndex: "description", render: (value: string | null) => value ?? "-" },
          {
            title: "状态",
            dataIndex: "status",
            render: (value: string) => <Tag color={value === "active" ? "green" : value === "draft" ? "gold" : "default"}>{value}</Tag>
          },
          { title: "创建时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString() },
          {
            title: "操作",
            render: (_: unknown, item: TenantAIAgent) => (
              <Space>
                <Button size="small" onClick={() => onEdit(item)}>编辑</Button>
                <Button size="small" onClick={() => onToggleStatus(item)}>
                  {item.status === "active" ? "停用" : "启用"}
                </Button>
                <Popconfirm
                  title="删除这个 AI 客服实例？"
                  onConfirm={() => onDelete(item.aiAgentId)}
                >
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
}
