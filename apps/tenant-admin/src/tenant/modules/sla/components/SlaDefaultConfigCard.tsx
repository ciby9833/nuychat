import { Button, Card, Col, Descriptions, Drawer, Form, InputNumber, Modal, Row, Select, Space, Tag, Typography } from "antd";
import type { FormInstance } from "antd/es/form";
import { useTranslation } from "react-i18next";

import type { SlaDefaultConfig, SlaDefaultConfigFormValues } from "../types";

type SlaDefaultConfigCardProps = {
  loading: boolean;
  saving: boolean;
  open: boolean;
  config: SlaDefaultConfig | null;
  form: FormInstance<SlaDefaultConfigFormValues>;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
};

export function SlaDefaultConfigCard({
  loading,
  saving,
  open,
  config,
  form,
  onOpenChange,
  onSave
}: SlaDefaultConfigCardProps) {
  const { t } = useTranslation();

  const handleSave = () => {
    Modal.confirm({
      title: t("slaModule.config.confirmTitle"),
      content: t("slaModule.config.confirmDescription"),
      okText: t("slaModule.config.confirmSave"),
      cancelText: t("slaModule.config.confirmCancel"),
      onOk: onSave
    });
  };

  const summaryItems = [
    {
      key: "first-response",
      label: t("slaModule.config.firstResponseTargetSec"),
      children: formatSeconds(config?.firstResponseTargetSec)
    },
    {
      key: "assignment-accept",
      label: t("slaModule.config.assignmentAcceptTargetSec"),
      children: formatNullableSeconds(config?.assignmentAcceptTargetSec, t)
    },
    {
      key: "subsequent-response",
      label: t("slaModule.config.subsequentResponseTargetSec"),
      children: formatNullableSeconds(config?.subsequentResponseTargetSec, t)
    },
    {
      key: "subsequent-reassign-when",
      label: t("slaModule.config.subsequentResponseReassignWhen"),
      children: config?.subsequentResponseReassignWhen === "always"
        ? t("slaModule.reassignModes.always")
        : t("slaModule.reassignModes.ownerUnavailable")
    },
    {
      key: "follow-up",
      label: t("slaModule.config.followUpTargetSec"),
      children: formatNullableSeconds(config?.followUpTargetSec, t)
    },
    {
      key: "follow-up-close-mode",
      label: t("slaModule.config.followUpCloseMode"),
      children: config?.followUpCloseMode === "semantic"
        ? t("slaModule.closeModes.semantic")
        : t("slaModule.closeModes.waitingCustomer")
    }
  ];

  return (
    <>
      <Card
        loading={loading}
        title={t("slaModule.config.title")}
        extra={<Button type="primary" onClick={() => onOpenChange(true)}>{t("slaModule.config.edit")}</Button>}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Typography.Text type="secondary">{t("slaModule.config.description")}</Typography.Text>

          <Descriptions column={2} bordered size="small" items={summaryItems} />

          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Tag color="blue">{t("slaModule.scenes.firstResponse")}</Tag>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                {t("slaModule.scenes.firstResponseHelp")}
              </Typography.Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Tag color="orange">{t("slaModule.scenes.assignmentAccept")}</Tag>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                {t("slaModule.scenes.assignmentAcceptHelp")}
              </Typography.Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Tag color="purple">{t("slaModule.scenes.subsequentResponse")}</Tag>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                {t("slaModule.scenes.subsequentResponseHelp")}
              </Typography.Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Tag color="green">{t("slaModule.scenes.followUp")}</Tag>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                {t("slaModule.scenes.followUpHelp")}
              </Typography.Paragraph>
            </Col>
          </Row>

          {config?.updatedAt ? (
            <Typography.Text type="secondary">
              {t("slaModule.config.updatedAt", { value: new Date(config.updatedAt).toLocaleString() })}
            </Typography.Text>
          ) : null}
        </Space>
      </Card>

      <Drawer
        title={t("slaModule.config.editTitle")}
        width={560}
        open={open}
        destroyOnHidden
        onClose={() => onOpenChange(false)}
        extra={
          <Space>
            <Button onClick={() => onOpenChange(false)}>{t("slaModule.config.cancel")}</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>{t("slaModule.config.save")}</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="firstResponseTargetSec"
            label={t("slaModule.config.firstResponseTargetSec")}
            rules={[{ required: true, type: "number", min: 1 }]}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Typography.Paragraph type="secondary">{t("slaModule.scenes.firstResponseHelp")}</Typography.Paragraph>

          <Form.Item name="assignmentAcceptTargetSec" label={t("slaModule.config.assignmentAcceptTargetSec")}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Typography.Paragraph type="secondary">{t("slaModule.scenes.assignmentAcceptHelp")}</Typography.Paragraph>

          <Form.Item name="subsequentResponseTargetSec" label={t("slaModule.config.subsequentResponseTargetSec")}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="subsequentResponseReassignWhen"
            label={t("slaModule.config.subsequentResponseReassignWhen")}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: "owner_unavailable", label: t("slaModule.reassignModes.ownerUnavailable") },
                { value: "always", label: t("slaModule.reassignModes.always") }
              ]}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary">{t("slaModule.scenes.subsequentResponseHelp")}</Typography.Paragraph>

          <Form.Item name="followUpTargetSec" label={t("slaModule.config.followUpTargetSec")}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Typography.Paragraph type="secondary">{t("slaModule.scenes.followUpHelp")}</Typography.Paragraph>

          <Form.Item
            name="followUpCloseMode"
            label={t("slaModule.config.followUpCloseMode")}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: "waiting_customer", label: t("slaModule.closeModes.waitingCustomer") },
                { value: "semantic", label: t("slaModule.closeModes.semantic") }
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}

function formatSeconds(value: number | null | undefined) {
  return typeof value === "number" ? `${value}s` : "-";
}

function formatNullableSeconds(value: number | null | undefined, t: (key: string) => string) {
  return typeof value === "number" ? `${value}s` : t("slaModule.config.disabled");
}
