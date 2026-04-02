/**
 * 菜单路径与名称: 客户中心 -> 渠道配置 -> 渠道列表
 * 文件职责: 渲染渠道筛选区与渠道卡片列表，并提供查看、编辑、WhatsApp 绑定入口。
 * 主要交互文件:
 * - ../ChannelsTab.tsx: 负责传入筛选与操作回调。
 * - ../helpers.ts: 提供渠道标识读取方法。
 */

import { Button, Card, Select, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

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
  onBindWhatsApp,
  onCreateWhatsApp
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
  onCreateWhatsApp: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Card title={t("channelsModule.grid.filterTitle")}>
        <Space wrap>
          <Select value={typeFilter} onChange={onTypeFilterChange} style={{ width: 180 }} options={typeOptions} />
          <Select
            value={statusFilter}
            onChange={onStatusFilterChange}
            style={{ width: 180 }}
            options={[
              { value: "all", label: t("channelsModule.grid.allStatuses") },
              { value: "active", label: t("channelsModule.status.active") },
              { value: "inactive", label: t("channelsModule.status.inactive") }
            ]}
          />
          <Button onClick={onRefresh}>{t("channelsModule.grid.refresh")}</Button>
        </Space>
      </Card>

      <Card
        title={t("channelsModule.grid.listTitle")}
        extra={(
          <Space>
            <Tag color="blue">{t("channelsModule.grid.count", { count: filtered.length })}</Tag>
            <Button size="small" type="primary" onClick={onCreateWhatsApp}>{t("channelsModule.grid.addWhatsApp", "添加 WhatsApp")}</Button>
          </Space>
        )}
      >
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
                extra={<Tag color={row.is_active ? "green" : "default"}>{row.is_active ? t("channelsModule.status.active") : t("channelsModule.status.inactive")}</Tag>}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t("channelsModule.detail.identifier")}: {readChannelIdentifier(row)}
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
                    {row.phone_number_id ? t("channelsModule.grid.rebindWhatsApp") : t("channelsModule.grid.bindWhatsApp")}
                  </Button>
                ) : (
                  <Button size="small" type="primary" ghost onClick={(e) => { e.stopPropagation(); onEdit(row); }}>
                    {t("channelsModule.grid.editConfig")}
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
