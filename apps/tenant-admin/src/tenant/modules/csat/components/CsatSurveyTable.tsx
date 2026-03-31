import { Button, Card, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo } from "react";

import type { CsatSurveyItem, CsatSurveyListResponse } from "../types";

type CsatSurveyTableProps = {
  loading: boolean;
  surveys: CsatSurveyListResponse | null;
  onMarkSent: (row: CsatSurveyItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
};

export function CsatSurveyTable({ loading, surveys, onMarkSent, onPageChange }: CsatSurveyTableProps) {
  const columns = useMemo<ColumnsType<CsatSurveyItem>>(
    () => [
      { title: "计划发送", dataIndex: "scheduledAt", render: (value: string) => dayjs(value).format("MM-DD HH:mm") },
      { title: "客户", dataIndex: "customerName", render: (value: string | null, row) => value ?? row.customerRef ?? "-" },
      { title: "坐席", dataIndex: "agentName", render: (value: string | null) => value ?? "-" },
      { title: "事项ID", dataIndex: "caseId", ellipsis: true, render: (value: string | null) => value ?? "-" },
      { title: "会话ID", dataIndex: "conversationId", ellipsis: true },
      { title: "渠道", dataIndex: "channelType", render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
      {
        title: "状态",
        dataIndex: "status",
        render: (value: CsatSurveyItem["status"]) => {
          const colorMap: Record<CsatSurveyItem["status"], string> = {
            scheduled: "gold",
            sent: "blue",
            responded: "green",
            expired: "default",
            failed: "red"
          };
          return <Tag color={colorMap[value]}>{value.toUpperCase()}</Tag>;
        }
      },
      {
        title: "操作",
        render: (_value, row) => (
          <Button size="small" disabled={row.status !== "scheduled"} onClick={() => onMarkSent(row)}>
            标记已发送
          </Button>
        )
      }
    ],
    [onMarkSent]
  );

  return (
    <Card title="CSAT 调查列表">
      <Table<CsatSurveyItem>
        rowKey="surveyId"
        loading={loading}
        dataSource={surveys?.items ?? []}
        columns={columns}
        pagination={{
          current: surveys?.page ?? 1,
          pageSize: surveys?.pageSize ?? 20,
          total: surveys?.total ?? 0,
          onChange: onPageChange
        }}
      />
    </Card>
  );
}
