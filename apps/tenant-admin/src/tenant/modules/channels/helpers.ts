/**
 * 菜单路径与名称: 客户中心 -> 渠道配置
 * 文件职责: 提供渠道标识读取和剪贴板复制辅助方法。
 * 主要交互文件:
 * - ./components/ChannelGrid.tsx: 使用 readChannelIdentifier 渲染卡片辅助信息。
 * - ./components/ChannelDetail.tsx: 使用 readChannelIdentifier 和 copyToClipboard。
 */

import { message } from "antd";
import i18next from "i18next";

import type { ChannelConfig } from "../../types";

export function readChannelIdentifier(row: ChannelConfig): string {
  if (row.channel_type === "web") return row.public_channel_key || "-";
  if (row.channel_type === "whatsapp") return row.display_phone_number || row.phone_number_id || "-";
  if (row.channel_type === "webhook") return row.outbound_webhook_url || row.inbound_webhook_url || row.verify_token || "-";
  return row.channel_id;
}

export async function copyToClipboard(value: string | null | undefined, title: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    void message.success(i18next.t("channelsModule.helper.copySuccess", { title }));
  } catch {
    void message.error(i18next.t("channelsModule.helper.copyFailed"));
  }
}
