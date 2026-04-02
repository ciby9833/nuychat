/**
 * 菜单路径与名称: 客户中心 -> 渠道配置
 * 文件职责: 定义渠道模块的表单类型与 WhatsApp Embedded Signup 返回结构。
 * 主要交互文件:
 * - ./modals/ChannelEditModal.tsx: 使用 ChannelFormValues。
 * - ./whatsapp-signup.ts: 使用 EmbeddedSignupFinishPayload。
 * - ./hooks/useChannelsData.ts: 负责消费这些类型。
 */

export type ChannelFormValues = {
  channel_id: string;
  is_active: boolean;
  widget_name?: string;
  public_channel_key?: string;
  allowed_origins?: string;
  verify_token?: string;
  outbound_webhook_url?: string;
  webhook_secret?: string;
  label?: string;
  usage_scene?: string;
};

export type EmbeddedSignupFinishPayload = {
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  businessAccountName?: string;
};
