/**
 * 菜单路径与名称: 客户中心 -> 调度审计
 * 文件职责: 提供模块内统一的字段格式化、状态翻译与候选详情渲染能力。
 * 主要交互文件:
 * - ./components/ExecutionTable.tsx
 * - ./components/FilterBar.tsx
 * - ./modals/DetailDrawer.tsx
 * - ../../../../i18n/locales/en/modules/dispatch-audit.ts
 * - ../../../../i18n/locales/zh/modules/dispatch-audit.ts
 * - ../../../../i18n/locales/id/modules/dispatch-audit.ts
 */

import { Space, Tag, Typography } from "antd";
import type { TFunction } from "i18next";

function formatFallbackLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function formatIdentifier(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function isKnownOwnerType(value: string) {
  return ["system", "agent", "human", "ai"].includes(value);
}

function formatOwnerType(t: TFunction, value: string | null | undefined) {
  if (!value) return t("dispatchAudit.common.none");
  return t(`dispatchAudit.ownerTypes.${value}`, { defaultValue: value });
}

function formatConversationStatus(t: TFunction, value: string) {
  return t(`dispatchAudit.conversationStatuses.${value}`, { defaultValue: value });
}

function formatQueueStatus(t: TFunction, value: string) {
  return t(`dispatchAudit.queueStatuses.${value}`, { defaultValue: value });
}

function formatSelectionMode(t: TFunction, value: string) {
  return t(`dispatchAudit.selectionModes.${value}`, { defaultValue: value });
}

function formatMode(t: TFunction, value: string) {
  return t(`dispatchAudit.modes.${value}`, { defaultValue: value });
}

function formatAction(t: TFunction, value: string) {
  return t(`dispatchAudit.actions.${value}`, { defaultValue: value });
}

function formatStrategy(t: TFunction, value: string) {
  return t(`dispatchAudit.strategies.${value}`, { defaultValue: value });
}

export function formatDecisionReasonText(t: TFunction, value: string): string {
  const [mode, reason] = value.includes(":") ? value.split(":", 2) : [null, value];
  if (mode && reason) {
    return t("dispatchAudit.patterns.modeReason", {
      mode: formatMode(t, mode),
      reason: formatDecisionReasonText(t, reason),
      defaultValue: `${mode}: ${reason}`
    });
  }
  return t(`dispatchAudit.reasons.${value}`, { defaultValue: value });
}

function formatFieldLabel(t: TFunction, key: string) {
  return t(`dispatchAudit.fields.${key}`, { defaultValue: formatFallbackLabel(key) });
}

function formatValue(t: TFunction, key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return t("dispatchAudit.common.none");
  if (typeof value === "boolean") {
    return value ? t("dispatchAudit.common.yes") : t("dispatchAudit.common.no");
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (key === "decisionReason" || key === "reason" || key === "rejectReason") {
      return formatDecisionReasonText(t, value);
    }
    if (key === "conversationStatus") return formatConversationStatus(t, value);
    if (key === "status") return formatQueueStatus(t, value);
    if (key === "selectionMode") return formatSelectionMode(t, value);
    if (key === "mode" || key === "operatingMode") return formatMode(t, value);
    if (key === "action") return formatAction(t, value);
    if (key === "strategy") return formatStrategy(t, value);
    if ((key === "currentHandlerType" || key === "selectedOwnerType") && isKnownOwnerType(value)) {
      return formatOwnerType(t, value);
    }
    if (key.endsWith("Id")) return formatIdentifier(value);
    return value;
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? t("dispatchAudit.common.none")
      : value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(", ");
  }
  return JSON.stringify(value);
}

export function formatTriggerType(t: TFunction, value: string | null | undefined) {
  if (!value) return t("dispatchAudit.common.none");
  return t(`dispatchAudit.triggerTypes.${value}`, { defaultValue: value });
}

export function formatDecisionType(t: TFunction, value: string | null | undefined) {
  if (!value) return t("dispatchAudit.common.none");
  return t(`dispatchAudit.decisionTypes.${value}`, { defaultValue: value });
}

export function formatCandidateType(t: TFunction, value: string | null | undefined) {
  if (!value) return t("dispatchAudit.common.none");
  return t(`dispatchAudit.candidateTypes.${value}`, { defaultValue: value });
}

export function formatCandidateStage(t: TFunction, value: string | null | undefined) {
  if (!value) return t("dispatchAudit.common.none");
  return t(`dispatchAudit.candidateStages.${value}`, { defaultValue: value });
}

export function formatTransitionType(t: TFunction, value: string | null | undefined) {
  if (!value) return t("dispatchAudit.common.none");
  return t(`dispatchAudit.transitionTypes.${value}`, { defaultValue: value });
}

export function formatOwnerDisplay(t: TFunction, ownerType: string | null | undefined, ownerId: string | null | undefined) {
  const typeText = formatOwnerType(t, ownerType);
  if (!ownerId) return typeText;
  return t("dispatchAudit.patterns.ownerWithId", {
    ownerType: typeText,
    ownerId: formatIdentifier(ownerId),
    defaultValue: `${typeText} / ${formatIdentifier(ownerId)}`
  });
}

export function renderSummary(t: TFunction, summary: Record<string, unknown>) {
  const entries = Object.entries(summary);
  if (entries.length === 0) return <Typography.Text type="secondary">{t("dispatchAudit.common.none")}</Typography.Text>;
  return (
    <Space direction="vertical" size={4}>
      {entries.map(([key, value]) => (
        <Typography.Text key={key} style={{ fontSize: 12 }}>
          <b>{formatFieldLabel(t, key)}</b>: {formatValue(t, key, value)}
        </Typography.Text>
      ))}
    </Space>
  );
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

export function renderCandidateDetails(t: TFunction, details: Record<string, unknown>) {
  const todayNewCaseCount = readNumber(details.todayNewCaseCount);
  const activeAssignments = readNumber(details.activeAssignments);
  const reservedAssignments = readNumber(details.reservedAssignments);
  const hasBalancedNewCaseMetrics =
    todayNewCaseCount !== null &&
    activeAssignments !== null &&
    reservedAssignments !== null;

  if (!hasBalancedNewCaseMetrics) {
    return renderSummary(t, details);
  }

  const score = (4 * todayNewCaseCount) + (2 * activeAssignments) + reservedAssignments;

  return (
    <Space direction="vertical" size={4}>
      <Space wrap>
        <Tag color="blue">{t("dispatchAudit.candidateDetails.score", { score })}</Tag>
        <Tag>{t("dispatchAudit.candidateDetails.todayNewCaseCount", { count: todayNewCaseCount })}</Tag>
        <Tag>{t("dispatchAudit.candidateDetails.activeAssignments", { count: activeAssignments })}</Tag>
        <Tag>{t("dispatchAudit.candidateDetails.reservedAssignments", { count: reservedAssignments })}</Tag>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("dispatchAudit.candidateDetails.balancedFormula")}
      </Typography.Text>
      {renderSummary(t, details)}
    </Space>
  );
}
