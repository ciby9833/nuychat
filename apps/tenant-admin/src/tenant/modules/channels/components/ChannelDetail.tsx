/**
 * 菜单路径与名称: 客户中心 -> 渠道配置 -> 渠道详情
 * 文件职责: 渲染渠道详情面板，根据 Web、WhatsApp、Webhook 三种渠道分支展示说明与操作。
 * 主要交互文件:
 * - ../ChannelsTab.tsx: 负责传入当前选中渠道和操作回调。
 * - ../helpers.ts: 提供复制与标识读取辅助。
 * - ../hooks/useChannelsData.ts: 提供 selectedWebInfo、selectedWebhookInfo、whatsAppSetup。
 */

import { Alert, Button, Card, Descriptions, Input, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { ChannelConfig, WebChannelLinkInfo, WebhookChannelLinkInfo, WhatsAppEmbeddedSignupSetup } from "../../../types";
import { copyToClipboard, readChannelIdentifier } from "../helpers";

export function ChannelDetail({
  selectedChannel,
  selectedWebInfo,
  selectedWebhookInfo,
  whatsAppSetup,
  binding,
  onBindWhatsApp,
  onEdit
}: {
  selectedChannel: ChannelConfig | null;
  selectedWebInfo: WebChannelLinkInfo | null;
  selectedWebhookInfo: WebhookChannelLinkInfo | null;
  whatsAppSetup: WhatsAppEmbeddedSignupSetup | null;
  binding: boolean;
  onBindWhatsApp: (row: ChannelConfig) => void;
  onEdit: (row: ChannelConfig) => void;
}) {
  const { t } = useTranslation();
  if (!selectedChannel) {
    return (
      <Card title={t("channelsModule.detail.title")}>
        <Typography.Text type="secondary">{t("channelsModule.detail.empty")}</Typography.Text>
      </Card>
    );
  }

  const whatsappBound = Boolean(selectedChannel.phone_number_id);

  return (
    <Card title={t("channelsModule.detail.title")}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Descriptions size="small" bordered column={2}>
          <Descriptions.Item label={t("channelsModule.detail.channelType")}>{selectedChannel.channel_type}</Descriptions.Item>
          <Descriptions.Item label={t("channelsModule.detail.status")}>
            <Tag color={selectedChannel.is_active ? "green" : "default"}>
              {selectedChannel.is_active ? t("channelsModule.status.active") : t("channelsModule.status.inactive")}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t("channelsModule.detail.channelId")} span={2}>{selectedChannel.channel_id}</Descriptions.Item>
          <Descriptions.Item label={t("channelsModule.detail.identifier")} span={2}>{readChannelIdentifier(selectedChannel)}</Descriptions.Item>
        </Descriptions>

        {selectedChannel.channel_type === "web" ? (
          <>
            <Typography.Text type="secondary">
              {t("channelsModule.detail.webHint")}
            </Typography.Text>
            <Input
              readOnly
              addonBefore="publicChannelKey"
              value={selectedWebInfo?.publicChannelKey ?? "-"}
              addonAfter={<Button type="link" onClick={() => { void copyToClipboard(selectedWebInfo?.publicChannelKey, t("channelsModule.detail.webIdentifier")); }}>{t("channelsModule.detail.copy")}</Button>}
            />
            <Input
              readOnly
              addonBefore={t("channelsModule.detail.customerUrl")}
              value={selectedWebInfo?.customerChatUrl ?? "-"}
              addonAfter={<Button type="link" onClick={() => { void copyToClipboard(selectedWebInfo?.customerChatUrl, t("channelsModule.detail.customerUrl")); }}>{t("channelsModule.detail.copy")}</Button>}
            />
            <Input.TextArea readOnly rows={4} value={selectedWebInfo?.widgetEmbedSnippet ?? ""} />
            <Button onClick={() => { void copyToClipboard(selectedWebInfo?.widgetEmbedSnippet, t("channelsModule.detail.embedCode")); }} disabled={!selectedWebInfo?.widgetEmbedSnippet}>
              {t("channelsModule.detail.copyEmbedCode")}
            </Button>
          </>
        ) : null}

        {selectedChannel.channel_type === "whatsapp" ? (
          <>
            <Alert
              type={whatsappBound ? "success" : "info"}
              showIcon
              message={whatsappBound ? t("channelsModule.detail.whatsappBound") : t("channelsModule.detail.whatsappUnbound")}
              description={
                whatsAppSetup?.enabled
                  ? t("channelsModule.detail.whatsappEnabledDesc")
                  : t("channelsModule.detail.whatsappDisabledDesc")
              }
            />
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label={t("channelsModule.detail.platformWebhookUrl")}>
                {selectedChannel.whatsapp_webhook_url ?? whatsAppSetup?.webhookUrl ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Phone Number ID">
                {selectedChannel.phone_number_id ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label={t("channelsModule.detail.displayNumber")}>
                {selectedChannel.display_phone_number ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="WABA ID">
                {selectedChannel.waba_id ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label={t("channelsModule.detail.businessAccount")}>
                {selectedChannel.business_account_name ?? "-"}
              </Descriptions.Item>
            </Descriptions>
            <Space>
              <Button
                type="primary"
                loading={binding}
                onClick={() => { void onBindWhatsApp(selectedChannel); }}
                disabled={!whatsAppSetup?.enabled}
              >
                {whatsappBound ? t("channelsModule.grid.rebindWhatsApp") : t("channelsModule.grid.bindWhatsApp")}
              </Button>
              <Button
                onClick={() => { void copyToClipboard(selectedChannel.whatsapp_webhook_url ?? whatsAppSetup?.webhookUrl, "WhatsApp Webhook URL"); }}
                disabled={!selectedChannel.whatsapp_webhook_url && !whatsAppSetup?.webhookUrl}
              >
                {t("channelsModule.detail.copyWebhookUrl")}
              </Button>
            </Space>
          </>
        ) : null}

        {selectedChannel.channel_type === "webhook" ? (
          <>
            <Alert
              type="info"
              showIcon
              message={t("channelsModule.detail.webhookIntroTitle")}
              description={t("channelsModule.detail.webhookIntroDesc")}
            />
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label={t("channelsModule.detail.inboundUrl")}>
                {selectedWebhookInfo?.inboundWebhookUrl ?? selectedChannel.inbound_webhook_url ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label={t("channelsModule.detail.outboundUrl")}>
                {selectedWebhookInfo?.outboundWebhookUrl ?? selectedChannel.outbound_webhook_url ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Verify Token">
                {selectedChannel.verify_token ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label={t("channelsModule.detail.webhookSecret")}>
                {selectedChannel.webhook_secret ? t("channelsModule.detail.configured") : t("channelsModule.detail.notConfigured")}
              </Descriptions.Item>
            </Descriptions>
            <Space>
              <Button
                onClick={() => { void copyToClipboard(selectedWebhookInfo?.inboundWebhookUrl ?? selectedChannel.inbound_webhook_url, t("channelsModule.detail.inboundUrl")); }}
                disabled={!selectedWebhookInfo?.inboundWebhookUrl && !selectedChannel.inbound_webhook_url}
              >
                {t("channelsModule.detail.copyInboundUrl")}
              </Button>
              <Button
                onClick={() => onEdit(selectedChannel)}
              >
                {t("channelsModule.detail.configureOutbound")}
              </Button>
            </Space>
            <Typography.Text type="secondary">
              {t("channelsModule.detail.webhookReadonlyHint")}
            </Typography.Text>
          </>
        ) : null}
      </Space>
    </Card>
  );
}
