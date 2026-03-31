/**
 * 作用：集中定义 AI 运行策略页面使用的检查项、意图和展示文案。
 * 页面/菜单：租户管理端「AI 配置 > AI 运行策略」。
 */
import type { CapabilityListItem } from "../../../../types";
import i18next from "i18next";

export function buildRuntimeCheckOptions(capabilities: CapabilityListItem[]) {
  return capabilities.map((item) => ({
    value: `capability:${item.code}`,
    label: `${i18next.t("aiConfig.runtimePolicy.capabilityPrefix")} · ${item.name}`
  }));
}

export const INTENT_OPTIONS = [
  { value: "general_inquiry", label: "general_inquiry" },
  { value: "order_inquiry", label: "order_inquiry" },
  { value: "delivery_inquiry", label: "delivery_inquiry" },
  { value: "refund_request", label: "refund_request" },
  { value: "cancellation", label: "cancellation" },
  { value: "complaint", label: "complaint" },
  { value: "payment_inquiry", label: "payment_inquiry" }
];

export const ON_MISSING_LABEL: Record<string, string> = {
  handoff: i18next.t("aiConfig.runtimePolicy.onMissingHandoff"),
  defer: i18next.t("aiConfig.runtimePolicy.onMissingDefer")
};
