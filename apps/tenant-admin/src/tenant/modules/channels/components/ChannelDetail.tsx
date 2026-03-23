// 作用: 渠道详情面板（Web/WhatsApp/Webhook 分支渲染）
// 菜单路径: 客户中心 -> 渠道配置 -> 渠道详情
// 作者：吴川

import { Alert, Button, Card, Descriptions, Input, Space, Tag, Typography } from "antd";

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
  if (!selectedChannel) {
    return (
      <Card title="渠道详情">
        <Typography.Text type="secondary">请先点击一个渠道卡片查看详情。</Typography.Text>
      </Card>
    );
  }

  const whatsappBound = Boolean(selectedChannel.phone_number_id);

  return (
    <Card title="渠道详情">
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Descriptions size="small" bordered column={2}>
          <Descriptions.Item label="渠道类型">{selectedChannel.channel_type}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={selectedChannel.is_active ? "green" : "default"}>
              {selectedChannel.is_active ? "active" : "inactive"}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="渠道ID" span={2}>{selectedChannel.channel_id}</Descriptions.Item>
          <Descriptions.Item label="标识" span={2}>{readChannelIdentifier(selectedChannel)}</Descriptions.Item>
        </Descriptions>

        {selectedChannel.channel_type === "web" ? (
          <>
            <Typography.Text type="secondary">
              Web 渠道嵌入时请使用 `publicChannelKey`，可直接复制以下代码。
            </Typography.Text>
            <Input
              readOnly
              addonBefore="publicChannelKey"
              value={selectedWebInfo?.publicChannelKey ?? "-"}
              addonAfter={<Button type="link" onClick={() => { void copyToClipboard(selectedWebInfo?.publicChannelKey, "Web 标识"); }}>复制</Button>}
            />
            <Input
              readOnly
              addonBefore="客户直连地址"
              value={selectedWebInfo?.customerChatUrl ?? "-"}
              addonAfter={<Button type="link" onClick={() => { void copyToClipboard(selectedWebInfo?.customerChatUrl, "客户直连地址"); }}>复制</Button>}
            />
            <Input.TextArea readOnly rows={4} value={selectedWebInfo?.widgetEmbedSnippet ?? ""} />
            <Button onClick={() => { void copyToClipboard(selectedWebInfo?.widgetEmbedSnippet, "嵌入代码"); }} disabled={!selectedWebInfo?.widgetEmbedSnippet}>
              复制嵌入代码
            </Button>
          </>
        ) : null}

        {selectedChannel.channel_type === "whatsapp" ? (
          <>
            <Alert
              type={whatsappBound ? "success" : "info"}
              showIcon
              message={whatsappBound ? "已完成 WhatsApp 绑定" : "尚未绑定 WhatsApp 号码"}
              description={
                whatsAppSetup?.enabled
                  ? "点击下方按钮打开 Meta Embedded Signup，完成号码授权和绑定。"
                  : "平台尚未完成 Meta Embedded Signup 配置，当前无法发起绑定。"
              }
            />
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="平台 Webhook URL">
                {selectedChannel.whatsapp_webhook_url ?? whatsAppSetup?.webhookUrl ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Phone Number ID">
                {selectedChannel.phone_number_id ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="显示号码">
                {selectedChannel.display_phone_number ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="WABA ID">
                {selectedChannel.waba_id ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Business Account">
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
                {whatsappBound ? "重新绑定 WhatsApp" : "绑定 WhatsApp"}
              </Button>
              <Button
                onClick={() => { void copyToClipboard(selectedChannel.whatsapp_webhook_url ?? whatsAppSetup?.webhookUrl, "WhatsApp Webhook URL"); }}
                disabled={!selectedChannel.whatsapp_webhook_url && !whatsAppSetup?.webhookUrl}
              >
                复制 Webhook URL
              </Button>
            </Space>
          </>
        ) : null}

        {selectedChannel.channel_type === "webhook" ? (
          <>
            <Alert
              type="info"
              showIcon
              message="Webhook 渠道用于第三方系统 HTTP 接入"
              description="第三方系统把客户消息 POST 到系统生成的入站地址；NuyChat 会把回复 POST 到你配置的出站回调地址。"
            />
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="系统入站地址">
                {selectedWebhookInfo?.inboundWebhookUrl ?? selectedChannel.inbound_webhook_url ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="第三方出站回调地址">
                {selectedWebhookInfo?.outboundWebhookUrl ?? selectedChannel.outbound_webhook_url ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Verify Token">
                {selectedChannel.verify_token ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Webhook Secret">
                {selectedChannel.webhook_secret ? "已配置" : "未配置"}
              </Descriptions.Item>
            </Descriptions>
            <Space>
              <Button
                onClick={() => { void copyToClipboard(selectedWebhookInfo?.inboundWebhookUrl ?? selectedChannel.inbound_webhook_url, "Webhook 入站地址"); }}
                disabled={!selectedWebhookInfo?.inboundWebhookUrl && !selectedChannel.inbound_webhook_url}
              >
                复制入站地址
              </Button>
              <Button
                onClick={() => onEdit(selectedChannel)}
              >
                配置出站回调
              </Button>
            </Space>
            <Typography.Text type="secondary">
              `系统入站地址` 由 `API_PUBLIC_BASE` 和当前 `channel_id` 自动生成，不能手改。
            </Typography.Text>
          </>
        ) : null}
      </Space>
    </Card>
  );
}
