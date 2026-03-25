// 作用: AI 配置列表表格组件
// 菜单路径: 客户中心 -> AI 配置管理 -> 配置列表
// 作者：吴川

import { Button, Card, Popconfirm, Space, Table, Tag, Typography } from "antd";

import type { AIConfigProfile } from "../../../types";

export function AIConfigTable({
  rows,
  selectedId,
  onCreate,
  onSelect,
  onEdit,
  onSetDefault,
  onDelete
}: {
  rows: AIConfigProfile[];
  selectedId: string | null;
  onCreate: () => void;
  onSelect: (cfg: AIConfigProfile) => void;
  onEdit: (cfg: AIConfigProfile) => void;
  onSetDefault: (configId: string) => void;
  onDelete: (configId: string) => void;
}) {
  return (
    <Card
      title="模型驱动配置"
      extra={<Button onClick={onCreate}>新建配置</Button>}
    >
      <Table<AIConfigProfile>
        rowKey="config_id"
        size="small"
        dataSource={rows}
        pagination={false}
        onRow={(record) => ({ onClick: () => onSelect(record) })}
        rowClassName={(record) => (record.config_id === selectedId ? "ant-table-row-selected" : "")}
        columns={[
          {
            title: "名称",
            dataIndex: "name",
            render: (_, r) => (
              <Space>
                <Typography.Text>{r.name}</Typography.Text>
                {r.is_default ? <Tag color="blue">默认</Tag> : null}
                {!r.is_active ? <Tag>停用</Tag> : null}
              </Space>
            )
          },
          { title: "Provider", dataIndex: "provider", width: 140 },
          { title: "Model", dataIndex: "model_name", width: 220 },
          {
            title: "操作",
            width: 220,
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={(e) => { e.stopPropagation(); onSelect(r); }}>
                  查看
                </Button>
                <Button size="small" onClick={(e) => { e.stopPropagation(); onEdit(r); }}>
                  编辑
                </Button>
                {!r.is_default ? (
                  <Button size="small" onClick={(e) => { e.stopPropagation(); onSetDefault(r.config_id); }}>
                    设为默认
                  </Button>
                ) : null}
                <Popconfirm
                  title="删除这个配置？"
                  description="至少保留一个 AI 配置。"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    onDelete(r.config_id);
                  }}
                >
                  <Button danger size="small" onClick={(e) => e.stopPropagation()}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
}
