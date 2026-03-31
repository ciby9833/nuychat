import { Card, Col, Table, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { StatusRow } from "../types";

type OverviewStatusTableProps = {
  rows: StatusRow[];
  error: string;
  loading: boolean;
};

export function OverviewStatusTable({ rows, error, loading }: OverviewStatusTableProps) {
  const { t } = useTranslation();

  return (
    <Col span={24}>
      <Card title={t("overview.statusDistribution")} extra={error ? <Tag color="red">{error}</Tag> : null}>
        <Table<StatusRow>
          rowKey="status"
          loading={loading}
          dataSource={rows}
          pagination={false}
          columns={[
            { title: t("common.status"), dataIndex: "status", render: (value) => <Tag>{String(value)}</Tag> },
            { title: t("common.total"), dataIndex: "count" }
          ]}
        />
      </Card>
    </Col>
  );
}
