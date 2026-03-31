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
  SlaDefinitionItem,
  SlaTriggerAction,
  SlaTriggerPolicyItem
} from "../../types";

export type { SlaBreachItem, SlaBreachListResponse, SlaDefinitionItem, SlaTriggerAction, SlaTriggerPolicyItem };

export type BreachFilter = {
  status?: "open" | "acknowledged" | "resolved";
  metric?: string;
  from?: string;
  to?: string;
};

export type SlaDefinitionFormValues = {
  name: string;
  priority: string;
  firstResponseTargetSec: number;
  assignmentAcceptTargetSec: number | null;
  followUpTargetSec: number | null;
  resolutionTargetSec: number;
};

export type SlaTriggerPolicyFormValues = {
  name: string;
  priority: string;
  firstResponseActions: SlaTriggerAction[];
  assignmentAcceptActions: SlaTriggerAction[];
  followUpActions: SlaTriggerAction[];
  resolutionActions: SlaTriggerAction[];
};
