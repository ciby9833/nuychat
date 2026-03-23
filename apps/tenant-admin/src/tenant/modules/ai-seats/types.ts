// 作用: AI 座席管理模块的类型定义
// 菜单路径: 客户中心 -> AI 座席管理
// 作者：吴川

import { TenantApiError } from "../../api";

export type AISeatsFormValues = {
  name: string;
  roleLabel?: string | null;
  personality?: string | null;
  scenePrompt?: string | null;
  systemPrompt?: string | null;
  description?: string | null;
  status: "draft" | "active" | "inactive";
};

export function getAISeatErrorMessage(err: unknown): string {
  if (err instanceof TenantApiError && err.code === "ai_seat_limit_exceeded") {
    return "AI 座席授权已满，无法启用新的 AI 客服实例。请联系平台管理员扩容。";
  }
  return (err as Error).message;
}
