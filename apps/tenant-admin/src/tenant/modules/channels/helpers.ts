// 作用: 渠道管理辅助函数（标识读取、剪贴板）
// 菜单路径: 客户中心 -> 渠道配置
// 作者：吴川

import { message } from "antd";

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
    message.success(`${title} 已复制`);
  } catch {
    message.error("复制失败，请手动复制");
  }
}
