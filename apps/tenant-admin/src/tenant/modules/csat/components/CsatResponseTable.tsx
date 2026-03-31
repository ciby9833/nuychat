import { Card, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo } from "react";

import type { CsatResponseItem, CsatResponseListResponse } from "../types";

type CsatResponseTableProps = {
  loading: boolean;
  responses: CsatResponseListResponse | null;
  onPageChange: (page: number, pageSize: number) => void;
};

export function CsatResponseTable({ loading, responses, onPageChange }: CsatResponseTableProps) {
  const columns = useMemo<ColumnsType<CsatResponseItem>>(
    () => [
      { title: "回复时间", dataIndex: "respondedAt", render: (value: string) => dayjs(value).format("MM-DD HH:mm") },
      { title: "客户", dataIndex: "customerName", render: (value: string | null, row) => value ?? row.customerRef ?? "-" },
      { title: "坐席", dataIndex: "agentName", render: (value: string | null) => value ?? "-" },
      { title: "事项ID", dataIndex: "caseId", ellipsis: true, render: (value: string | null) => value ?? "-" },
      { title: "会话ID", dataIndex: "conversationId", ellipsis: true },
      {
        title: "评分",
        dataIndex: "rating",
        render: (value: number) => <Tag color={value <= 2 ? "red" : value === 3 ? "gold" : "green"}>{value} ★</Tag>
      },
      { title: "反馈", dataIndex: "feedback", render: (value: string | null) => value || "-" }
    ],
    []
  );

  return (
    <Card title="CSAT 结果列表">
      <Table<CsatResponseItem>
        rowKey="responseId"
        loading={loading}
        dataSource={responses?.items ?? []}
        columns={columns}
        pagination={{
          current: responses?.page ?? 1,
          pageSize: responses?.pageSize ?? 20,
          total: responses?.total ?? 0,
          onChange: onPageChange
        }}
      />
    </Card>
  );
}
