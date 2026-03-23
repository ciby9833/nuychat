// 作用: 渠道卡片网格（含筛选栏 + 渠道卡片列表）
// 菜单路径: 客户中心 -> 渠道配置 -> 渠道列表
// 作者：吴川

import { Button, Card, Select, Space, Tag, Typography } from "antd";

import type { ChannelConfig } from "../../../types";
import { readChannelIdentifier } from "../helpers";

export function ChannelGrid({
  filtered,
  typeFilter,
  statusFilter,
  typeOptions,
  selectedChannel,
  binding,
  onTypeFilterChange,
  onStatusFilterChange,
  onRefresh,
  onSelect,
  onEdit,
  onBindWhatsApp
}: {
  filtered: ChannelConfig[];
  typeFilter: string;
  statusFilter: "all" | "active" | "inactive";
  typeOptions: { value: string; label: string }[];
  selectedChannel: ChannelConfig | null;
  binding: boolean;
  onTypeFilterChange: (v: string) => void;
  onStatusFilterChange: (v: "all" | "active" | "inactive") => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onEdit: (row: ChannelConfig) => void;
  onBindWhatsApp: (row: ChannelConfig) => void;
}) {
  return (
    <>
      <Card title="渠道筛选">
        <Space wrap>
          <Select value={typeFilter} onChange={onTypeFilterChange} style={{ width: 180 }} options={typeOptions} />
          <Select
            value={statusFilter}
            onChange={onStatusFilterChange}
            style={{ width: 180 }}
            options={[
              { value: "all", label: "全部状态" },
              { value: "active", label: "active" },
              { value: "inactive", label: "inactive" }
            ]}
          />
          <Button onClick={onRefresh}>刷新</Button>
        </Space>
      </Card>

      <Card title="渠道列表" extra={<Tag color="blue">{filtered.length} 条</Tag>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {filtered.map((row) => {
            const active = row.config_id === selectedChannel?.config_id;
            return (
              <Card
                key={row.config_id}
                hoverable
                size="small"
                onClick={() => onSelect(row.config_id)}
                styles={{
                  body: { display: "grid", gap: 8 },
                  header: { borderBottom: "1px solid #f0f0f0" }
                }}
                style={active ? { borderColor: "#1677ff", boxShadow: "0 0 0 2px rgba(22,119,255,0.15)" } : undefined}
                title={(
                  <Space>
                    <Tag color="blue">{row.channel_type}</Tag>
                    <Typography.Text strong>{row.channel_id}</Typography.Text>
                  </Space>
                )}
                extra={<Tag color={row.is_active ? "green" : "default"}>{row.is_active ? "active" : "inactive"}</Tag>}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  标识: {readChannelIdentifier(row)}
                </Typography.Text>
                {row.channel_type === "whatsapp" ? (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    loading={binding && selectedChannel?.config_id === row.config_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onBindWhatsApp(row);
                    }}
                  >
                    {row.phone_number_id ? "重新绑定 WhatsApp" : "绑定 WhatsApp"}
                  </Button>
                ) : (
                  <Button size="small" type="primary" ghost onClick={(e) => { e.stopPropagation(); onEdit(row); }}>
                    编辑配置
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </Card>
    </>
  );
}
