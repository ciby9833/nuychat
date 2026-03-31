/**
 * 菜单路径与名称: 客户中心 -> AI 座席
 * 文件职责: 定义 AI 座席表单类型，并统一处理模块内接口错误文案。
 * 主要交互文件:
 * - ./AISeatsTab.tsx: 使用 AISeatsFormValues 作为编辑表单类型。
 * - ./hooks/useAISeatsData.ts: 通过 getAISeatErrorMessage 处理接口错误。
 * - ../../api: 提供 TenantApiError 类型来源。
 */

import i18next from "i18next";
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
    return i18next.t("aiSeats.errors.seatLimitExceeded");
  }
  return (err as Error).message;
}
