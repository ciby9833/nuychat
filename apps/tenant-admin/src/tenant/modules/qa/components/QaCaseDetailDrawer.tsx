import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  List,
  Radio,
  Row,
  Space,
  Tag,
  Timeline,
  Typography
} from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { QaCaseDetail, QaReviewFormValues } from "../types";

type Props = {
  open: boolean;
  loading: boolean;
  saving: boolean;
  detail: QaCaseDetail | null;
  onClose: () => void;
  onSubmit: (values: QaReviewFormValues) => void;
};

export function QaCaseDetailDrawer({
  open,
  loading,
  saving,
  detail,
  onClose,
  onSubmit
}: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm<QaReviewFormValues>();

  useEffect(() => {
    if (!detail) return;
    form.setFieldsValue({
      action: "confirm",
      totalScore: detail.caseReview?.totalScore ?? detail.aiReview?.score ?? undefined,
      verdict: detail.caseReview?.verdict ?? detail.aiReview?.verdict ?? undefined,
      tags: detail.caseReview?.tags.join(", ") ?? detail.aiReview?.riskReasons.join(", ") ?? "",
      summary: detail.caseReview?.summary ?? detail.aiReview?.caseSummary ?? ""
    });
  }, [detail, form]);

  const evidenceItems = Array.isArray(detail?.aiReview?.evidence) ? detail?.aiReview?.evidence as Array<Record<string, unknown>> : [];

  return (
    <Drawer
      title={detail?.case.title || t("qaModule.detail.title")}
      open={open}
      onClose={onClose}
      width="92vw"
      destroyOnClose
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Descriptions size="small" bordered column={3}>
          <Descriptions.Item label={t("qaModule.detail.customer")}>{detail?.case.customerName || detail?.case.customerRef || "-"}</Descriptions.Item>
          <Descriptions.Item label={t("qaModule.detail.owner")}>{detail?.case.resolvedByAgentName || "-"}</Descriptions.Item>
          <Descriptions.Item label={t("qaModule.detail.status")}>{detail?.case.status || "-"}</Descriptions.Item>
          <Descriptions.Item label="Case ID">{detail?.case.caseId || "-"}</Descriptions.Item>
          <Descriptions.Item label={t("qaModule.detail.conversation")}>{detail?.case.conversationId || "-"}</Descriptions.Item>
          <Descriptions.Item label="Segment">{detail?.case.segmentCount || 0}</Descriptions.Item>
        </Descriptions>

        <Row gutter={16} align="top">
          <Col xs={24} xl={10}>
            <Card loading={loading} title={t("qaModule.detail.messagesTitle")}>
              {evidenceItems.length > 0 ? (
                <>
                  <Alert
                    type="warning"
                    showIcon
                    message={t("qaModule.detail.aiEvidence")}
                    description={(
                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        {evidenceItems.map((item, index) => (
                          <Typography.Paragraph key={`${String(item.messageId ?? index)}`} style={{ marginBottom: 0 }}>
                            “{String(item.quote ?? "")}” {item.reason ? `· ${String(item.reason)}` : ""}
                          </Typography.Paragraph>
                        ))}
                      </Space>
                    )}
                  />
                  <Divider />
                </>
              ) : null}
              <List
                dataSource={detail?.messages ?? []}
                renderItem={(message) => (
                  <List.Item key={message.messageId}>
                    <List.Item.Meta
                      title={`${message.senderName || message.senderType || "unknown"} · ${message.createdAt}`}
                      description={(
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Space wrap>
                            <Tag>{message.direction}</Tag>
                            <Tag>{message.segmentId || "no-segment"}</Tag>
                          </Space>
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {message.text || t("qaModule.common.emptyMessage")}
                          </Typography.Paragraph>
                        </Space>
                      )}
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} xl={7}>
            <Card loading={loading} title={t("qaModule.detail.timelineTitle")}>
              <Timeline
                items={(detail?.segments ?? []).map((segment) => ({
                  color: segment.ownerType === "human" ? "blue" : segment.ownerType === "ai" ? "green" : "gray",
                  children: (
                    <Space direction="vertical" size={4}>
                      <Typography.Text strong>
                        {segment.ownerAgentName || segment.ownerAiAgentName || segment.ownerType}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {segment.startedAt} {segment.endedAt ? `→ ${segment.endedAt}` : ""}
                      </Typography.Text>
                      <Typography.Text>
                        {t("qaModule.detail.messageCount")}：{segment.messageCount} · {t("qaModule.detail.status")}：{segment.status}
                      </Typography.Text>
                      <Space wrap>
                        <Tag>{segment.segmentId}</Tag>
                        {segment.transferredFromSegmentId ? <Tag>from {segment.transferredFromSegmentId}</Tag> : null}
                        {segment.closedReason ? <Tag>{segment.closedReason}</Tag> : null}
                      </Space>
                    </Space>
                  )
                }))}
              />
            </Card>
          </Col>

          <Col xs={24} xl={7}>
            <Card loading={loading} title={t("qaModule.detail.reviewTitle")}>
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label={t("qaModule.detail.currentQueue")}>{detail?.task?.queueType ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label={t("qaModule.detail.enterReasons")}>{detail?.task?.enteredBy.join(" · ") || "-"}</Descriptions.Item>
                  <Descriptions.Item label={t("qaModule.detail.aiScore")}>{detail?.aiReview?.score ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label={t("qaModule.detail.aiVerdict")}>{detail?.aiReview?.verdict ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label={t("qaModule.detail.aiConfidence")}>
                    {detail?.task?.confidence !== null && detail?.task?.confidence !== undefined
                      ? `${Math.round(detail.task.confidence * 100)}%`
                      : "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("qaModule.detail.riskLevel")}>{detail?.aiReview?.riskLevel ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label={t("qaModule.detail.humanVerdict")}>{detail?.caseReview?.verdict ?? t("qaModule.detail.notReviewed")}</Descriptions.Item>
                </Descriptions>

                <Space wrap>
                  {(detail?.aiReview?.riskReasons ?? []).map((item) => <Tag key={item}>{item}</Tag>)}
                </Space>

                <Form form={form} layout="vertical" onFinish={onSubmit}>
                  <Form.Item name="action" label={t("qaModule.detail.reviewAction")} initialValue="confirm">
                    <Radio.Group
                      optionType="button"
                      buttonStyle="solid"
                      options={[
                        { label: t("qaModule.actions.confirm"), value: "confirm" },
                        { label: t("qaModule.actions.modify"), value: "modify" },
                        { label: t("qaModule.actions.reject"), value: "reject" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="totalScore" label={t("qaModule.detail.totalScore")}>
                    <InputNumber min={0} max={100} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name="verdict" label={t("qaModule.detail.verdict")}>
                    <Input placeholder="pass / needs_review / fail" />
                  </Form.Item>
                  <Form.Item name="tags" label={t("qaModule.detail.tags")}>
                    <Input placeholder={t("qaModule.detail.tagsPlaceholder")} />
                  </Form.Item>
                  <Form.Item name="summary" label={t("qaModule.detail.summary")}>
                    <Input.TextArea rows={6} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving} block>
                    {t("qaModule.actions.submitReview")}
                  </Button>
                </Form>
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </Drawer>
  );
}
