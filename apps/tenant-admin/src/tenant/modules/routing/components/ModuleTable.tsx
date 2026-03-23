// 作用: 模块列表表格组件
// 菜单名称: 模块列表
// 作者：吴川
// 创建时间：2024-06-20 15:00
import { DeleteOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tag } from "antd";

import type { ModuleItem } from "../../../types";
import { MODULE_MODE_OPTIONS } from "../types";

export function ModuleTable({
  modules,
  loading,
  onEdit,
  onDelete
}: {
  modules: ModuleItem[];
  loading: boolean;
  onEdit: (item: ModuleItem) => void;
  onDelete: (moduleId: string) => void;
}) {
  return (
    <Table<ModuleItem>
      rowKey="moduleId"
      loading={loading}
      dataSource={modules}
      pagination={false}
      size="middle"
      columns={[
        { title: "模块", render: (_, row) => `${row.name} (${row.code})` },
        {
          title: "运行模式",
          dataIndex: "operatingMode",
          width: 140,
          render: (value: string) =>
            MODULE_MODE_OPTIONS.find((o) => o.value === value)?.label ?? value
        },
        {
          title: "状态",
          dataIndex: "isActive",
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
                title="删除这个模块？"
                description="删除前需先清空该模块下的技能组。"
                onConfirm={() => onDelete(row.moduleId)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )
        }
      ]}
    />
  );
}
