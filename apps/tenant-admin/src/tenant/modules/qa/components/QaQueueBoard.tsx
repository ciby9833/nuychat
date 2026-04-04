import { Alert, Button, Card, Col, Empty, Row, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { QaTaskItem } from "../types";

type Props = {
  loading: boolean;
  tasks: QaTaskItem[];
  onOpenCase: (task: QaTaskItem) => void;
};

function queueColor(queueType: QaTaskItem["queueType"]) {
  if (queueType === "risk") return "red";
  if (queueType === "sample") return "gold";
  return "green";
}

function queueLabel(queueType: QaTaskItem["queueType"], t: (key: string) => string) {
  if (queueType === "risk") return t("qaModule.tabs.risk");
  if (queueType === "sample") return t("qaModule.tabs.sample");
  if (queueType === "auto_pass") return t("qaModule.tabs.autoPass");
  return "unknown";
}

export function QaQueueBoard({ loading, tasks, onOpenCase }: Props) {
  const { t } = useTranslation();
  if (!loading && tasks.length === 0) {
    return <Empty description={t("qaModule.common.emptyQueue")} />;
  }

  return (
    <Row gutter={[16, 16]}>
      {tasks.map((task) => (
        <Col key={task.qaTaskId} xs={24} lg={12} xl={8}>
          <Card
            loading={loading}
            title={task.caseTitle || task.caseId}
            extra={<Tag color={queueColor(task.queueType)}>{queueLabel(task.queueType, t)}</Tag>}
            actions={[<Button type="link" onClick={() => onOpenCase(task)}>{t("qaModule.actions.viewDetail")}</Button>]}
          >
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Typography.Text type="secondary">
                {task.customerName || task.customerRef || t("qaModule.common.unknownCustomer")} · {task.channelType}
              </Typography.Text>
              <Typography.Text>
                {t("qaModule.card.owner")}：{task.resolvedByAgentName || t("qaModule.common.unrecognized")}
              </Typography.Text>
              <Typography.Text>
                {t("qaModule.card.aiScore")}：{task.aiScore ?? "-"} / 100 · {t("qaModule.card.confidence")}：{task.confidence !== null ? `${Math.round(task.confidence * 100)}%` : "-"}
              </Typography.Text>
              <Typography.Text>
                {t("qaModule.card.humanScore")}：{task.humanScore ?? "-"} · {t("qaModule.card.scoreDiff")}：{task.scoreDiff ?? "-"}
              </Typography.Text>
              <Typography.Text>
                Segment：{task.segmentCount} · Human：{task.hasHumanSegments ? t("qaModule.common.yes") : t("qaModule.common.no")} · AI：{task.hasAiSegments ? t("qaModule.common.yes") : t("qaModule.common.no")}
              </Typography.Text>
              {task.aiCaseSummary ? (
                <Alert type="info" showIcon={false} message={task.aiCaseSummary} />
              ) : null}
              <Space wrap>
                {task.riskReasons.map((reason) => (
                  <Tag key={reason}>{reason}</Tag>
                ))}
                {task.humanStatus ? <Tag color="blue">{task.humanStatus}</Tag> : null}
              </Space>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
