// 用于事项管理，展示会话事项列表，并提供搜索和筛选功能
// 菜单路径：客户中心 -> 事项管理
// 作者：吴川
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listConversationCases } from "../../api";
import type { ConversationCaseItem, ConversationCaseListResponse } from "../../types";

const STATUS_COLORS: Record<string, string> = {
  open: "blue",
  in_progress: "processing",
  waiting_customer: "gold",
  waiting_internal: "orange",
  resolved: "green",
  closed: "default"
};

export function CasesTab() {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [data, setData] = useState<ConversationCaseListResponse | null>(null);

  const load = useCallback(async (next?: { page?: number; pageSize?: number; search?: string; status?: string }) => {
    setLoading(true);
    try {
      const result = await listConversationCases({
        page: next?.page ?? 1,
        pageSize: next?.pageSize ?? data?.pageSize ?? 20,
        search: next?.search ?? (search.trim() || undefined),
        status: next?.status ?? status
      });
      setData(result);
    } catch (error) {
      message.error(`加载事项列表失败: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [data?.pageSize, search, status]);

  useEffect(() => {
    void load({ page: 1, pageSize: 20 });
  }, [load]);

  const columns = useMemo(
    () => [
      {
        title: "事项",
        key: "case",
        render: (_: unknown, row: ConversationCaseItem) => (
          <div>
            <div><code>{row.caseId.slice(0, 8)}</code>{row.title ? ` · ${row.title}` : ""}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              会话 {row.conversationId.slice(0, 8)}
            </Typography.Text>
          </div>
        )
      },
      {
        title: "客户",
        key: "customer",
        render: (_: unknown, row: ConversationCaseItem) => row.customerName ?? row.customerRef ?? "-"
      },
      {
        title: "渠道",
        dataIndex: "channelType",
        render: (value: string) => <Tag>{value.toUpperCase()}</Tag>
      },
      {
        title: "负责人",
        key: "owner",
        render: (_: unknown, row: ConversationCaseItem) =>
          row.ownerName
            ? `${row.status === "resolved" || row.status === "closed" ? "最终" : "当前"}：${row.ownerName}${row.ownerType === "ai" ? " (AI)" : ""}`
            : "-"
      },
      {
        title: "状态",
        dataIndex: "status",
        render: (value: string) => <Tag color={STATUS_COLORS[value] ?? "default"}>{value}</Tag>
      },
      {
        title: "摘要",
        dataIndex: "summary",
        ellipsis: true,
        render: (value: string | null) => value ?? "-"
      },
      {
        title: "最近活动",
        dataIndex: "lastActivityAt",
        render: (value: string) => dayjs(value).format("MM-DD HH:mm")
      }
    ],
    []
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space wrap>
          <Input.Search
            allowClear
            style={{ width: 280 }}
            placeholder="搜索事项ID / 标题 / 客户 / 会话ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => void load({ page: 1, search: search.trim() || undefined })}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="事项状态"
            value={status}
            onChange={(value) => setStatus(value)}
            options={[
              { value: "open", label: "open" },
              { value: "in_progress", label: "in_progress" },
              { value: "waiting_customer", label: "waiting_customer" },
              { value: "waiting_internal", label: "waiting_internal" },
              { value: "resolved", label: "resolved" },
              { value: "closed", label: "closed" }
            ]}
          />
          <Button type="primary" onClick={() => void load({ page: 1, status, search: search.trim() || undefined })} loading={loading}>
            查询
          </Button>
        </Space>
      </Card>

      <Card title="事项视角">
        <Table<ConversationCaseItem>
          rowKey="caseId"
          loading={loading}
          dataSource={data?.items ?? []}
          columns={columns}
          pagination={{
            current: data?.page ?? 1,
            pageSize: data?.pageSize ?? 20,
            total: data?.total ?? 0,
            onChange: (page, pageSize) => {
              void load({ page, pageSize, status, search: search.trim() || undefined });
            }
          }}
        />
      </Card>
    </Space>
  );
}
