import { DeleteOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tag, Typography } from "antd";

import type { ModuleItem, SkillGroup } from "../../../types";

export function SkillGroupTable({
  groups,
  modules,
  loading,
  onEdit,
  onDelete
}: {
  groups: SkillGroup[];
  modules: ModuleItem[];
  loading: boolean;
  onEdit: (item: SkillGroup) => void;
  onDelete: (skillGroupId: string) => void;
}) {
  return (
    <>
      <Table<SkillGroup>
        rowKey="skill_group_id"
        loading={loading}
        dataSource={groups}
        pagination={false}
        size="middle"
        columns={[
          { title: "技能组", render: (_, row) => `${row.name} (${row.code})` },
          { title: "所属模块", render: (_, row) => row.module_name ?? "-" },
          { title: "优先级", dataIndex: "priority", width: 90 },
          {
            title: "状态",
            dataIndex: "is_active",
            width: 90,
            render: (value: boolean) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>)
          },
          {
            title: "操作",
            width: 130,
            render: (_, row) => (
              <Space size={4}>
                <Button size="small" onClick={() => onEdit(row)}>编辑</Button>
                <Popconfirm
                  title="删除这个技能组？"
                  description="若技能组仍被坐席或路由规则引用，将无法删除。"
                  onConfirm={() => onDelete(row.skill_group_id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
      {modules.length === 0 && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          先创建模块，再维护技能组。
        </Typography.Paragraph>
      )}
    </>
  );
}
