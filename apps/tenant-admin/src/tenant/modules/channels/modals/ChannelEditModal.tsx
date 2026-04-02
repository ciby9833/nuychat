/**
 * 菜单路径与名称: 客户中心 -> 渠道配置 -> 编辑渠道
 * 文件职责: 渲染渠道配置编辑弹窗，承载 Web 与 Webhook 渠道的配置表单。
 * 主要交互文件:
 * - ../ChannelsTab.tsx: 负责控制弹窗开关与提交。
 * - ../types.ts: 提供表单字段类型。
 * - ../hooks/useChannelsData.ts: 提供 form、saving、editing 和保存动作。
 */

import { Form, Input, Modal, Switch } from "antd";
import { useTranslation } from "react-i18next";

import type { ChannelConfig } from "../../../types";
import type { ChannelFormValues } from "../types";

export function ChannelEditModal({
  editing,
  form,
  saving,
  onClose,
  onSave
}: {
  editing: ChannelConfig | null;
  form: ReturnType<typeof Form.useForm<ChannelFormValues>>[0];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const canEditIdentifier = editing?.channel_type !== "webhook";

  return (
    <Modal
      title={editing ? t("channelsModule.modal.titleWithType", { type: editing.channel_type }) : t("channelsModule.modal.title")}
      open={!!editing}
      onCancel={onClose}
      onOk={onSave}
      okButtonProps={{ loading: saving }}
      okText={t("common.save")}
      cancelText={t("common.cancel")}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label={t("channelsModule.modal.channelId")} name="channel_id" rules={[{ required: true, message: t("channelsModule.modal.channelIdRequired") }]}>
          <Input placeholder={t("channelsModule.modal.channelIdPlaceholder")} disabled={!canEditIdentifier} />
        </Form.Item>
        <Form.Item label={t("channelsModule.modal.active")} name="is_active" valuePropName="checked">
          <Switch checkedChildren={t("common.active")} unCheckedChildren={t("common.inactive")} />
        </Form.Item>

        {editing?.channel_type === "web" ? (
          <>
            <Form.Item label={t("channelsModule.modal.widgetName")} name="widget_name">
              <Input placeholder={t("channelsModule.modal.widgetNamePlaceholder")} />
            </Form.Item>
            <Form.Item
              label={t("channelsModule.modal.publicChannelKey")}
              name="public_channel_key"
              rules={[{ required: true, message: t("channelsModule.modal.publicChannelKeyRequired") }]}
            >
              <Input placeholder={t("channelsModule.modal.publicChannelKeyPlaceholder")} />
            </Form.Item>
            <Form.Item label={t("channelsModule.modal.allowedOrigins")} name="allowed_origins">
              <Input placeholder={t("channelsModule.modal.allowedOriginsPlaceholder")} />
            </Form.Item>
          </>
        ) : null}

        {editing?.channel_type === "webhook" ? (
          <>
            <Form.Item label="Verify Token" name="verify_token">
              <Input />
            </Form.Item>
            <Form.Item label={t("channelsModule.modal.thirdPartyOutboundUrl")} name="outbound_webhook_url">
              <Input placeholder="https://example.com/webhook/outbound" />
            </Form.Item>
            <Form.Item label="Webhook Secret" name="webhook_secret">
              <Input.Password />
            </Form.Item>
          </>
        ) : null}

        {editing?.channel_type === "whatsapp" ? (
          <>
            <Form.Item label={t("channelsModule.modal.whatsappLabel", "标签（如：销售号、售后号）")} name="label">
              <Input placeholder={t("channelsModule.modal.whatsappLabelPlaceholder", "Sales WA")} />
            </Form.Item>
            <Form.Item label={t("channelsModule.modal.whatsappUsageScene", "用途场景")} name="usage_scene">
              <Input placeholder={t("channelsModule.modal.whatsappUsageScenePlaceholder", "sales / support / vip")} />
            </Form.Item>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}
