// 作用: 渠道管理模块类型定义
// 菜单路径: 客户中心 -> 渠道配置
// 作者：吴川

export type ChannelFormValues = {
  channel_id: string;
  is_active: boolean;
  widget_name?: string;
  public_channel_key?: string;
  allowed_origins?: string;
  verify_token?: string;
  outbound_webhook_url?: string;
  webhook_secret?: string;
};

export type EmbeddedSignupFinishPayload = {
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  businessAccountName?: string;
};
