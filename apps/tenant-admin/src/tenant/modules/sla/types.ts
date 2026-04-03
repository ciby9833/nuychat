/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理
 * 文件职责: 统一导出 SLA 模块使用的列表类型、筛选类型与表单类型。
 * 主要交互文件:
 * - ./hooks/useSlaData.ts: 使用筛选与表单类型。
 * - ./components/*.tsx: 使用违约、定义、策略列表类型。
 * - ./modals/*.tsx: 使用表单类型。
 */

import type {
  SlaBreachItem,
  SlaBreachListResponse,
  SlaDefaultConfig
} from "../../types";

export type { SlaBreachItem, SlaBreachListResponse, SlaDefaultConfig };

export type BreachFilter = {
  status?: "open" | "acknowledged" | "resolved";
  metric?: string;
  from?: string;
  to?: string;
};

export type SlaDefaultConfigFormValues = {
  firstResponseTargetSec: number;
  assignmentAcceptTargetSec: number | null;
  subsequentResponseTargetSec: number | null;
  subsequentResponseReassignWhen: "always" | "owner_unavailable";
  followUpTargetSec: number | null;
  followUpCloseMode: "semantic" | "waiting_customer" | null;
};
