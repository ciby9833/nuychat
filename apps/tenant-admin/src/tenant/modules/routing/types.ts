/**
 * 菜单路径与名称: 客户中心 -> 路由
 * 文件职责: 维护路由模块表单类型与选项常量。
 * 主要交互文件:
 * - ./helpers.ts
 * - ./components/ModuleTable.tsx
 * - ./components/RuleTable.tsx
 * - ./modals/RuleEditorDrawer.tsx
 * - ./modals/ModuleEditorModal.tsx
 * - ./modals/SkillGroupEditorModal.tsx
 */

export type ModuleFormValues = {
  code: string;
  name: string;
  description?: string;
  operatingMode: "human_first" | "ai_first" | "ai_autonomous" | "workflow_first";
  isActive: boolean;
};

export type SkillGroupFormValues = {
  moduleId: string;
  code: string;
  name: string;
  priority: number;
  isActive: boolean;
};

export type RuleFormValues = {
  name: string;
  priority: number;
  channelType?: string;
  channelId?: string;
  customerLanguage?: string;
  customerTier?: string;
  executionMode: "ai_first" | "human_first" | "hybrid";
  targetDepartmentId?: string;
  targetTeamId?: string;
  targetSkillGroupCode?: string;
  assignmentStrategy: "round_robin" | "least_busy" | "balanced_new_case" | "sticky";
  aiAssignmentStrategy: "round_robin" | "least_busy" | "sticky";
  isActive: boolean;
};

export const STRATEGY_OPTIONS = [
  { value: "least_busy", labelKey: "routing.options.strategy.least_busy" },
  { value: "balanced_new_case", labelKey: "routing.options.strategy.balanced_new_case" },
  { value: "round_robin", labelKey: "routing.options.strategy.round_robin" },
  { value: "sticky", labelKey: "routing.options.strategy.sticky" }
] as const;

export const AI_STRATEGY_OPTIONS = [
  { value: "least_busy", labelKey: "routing.options.strategy.least_busy" },
  { value: "round_robin", labelKey: "routing.options.strategy.round_robin" },
  { value: "sticky", labelKey: "routing.options.strategy.sticky" }
] as const;

export const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "web", label: "Web Chat" },
  { value: "webhook", label: "Webhook" }
];

export const LANGUAGE_OPTIONS = [
  { value: "zh", labelKey: "routing.options.language.zh" },
  { value: "en", labelKey: "routing.options.language.en" },
  { value: "id", labelKey: "routing.options.language.id" }
];

export const TIER_OPTIONS = [
  { value: "vip", label: "VIP" },
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" }
];

export const MODULE_MODE_OPTIONS = [
  { value: "ai_first", labelKey: "routing.options.moduleMode.ai_first" },
  { value: "human_first", labelKey: "routing.options.moduleMode.human_first" },
  { value: "ai_autonomous", labelKey: "routing.options.moduleMode.ai_autonomous" },
  { value: "workflow_first", labelKey: "routing.options.moduleMode.workflow_first" }
] as const;

export const EXECUTION_MODE_OPTIONS = [
  { value: "hybrid", labelKey: "routing.options.executionMode.hybrid" },
  { value: "human_first", labelKey: "routing.options.executionMode.human_first" },
  { value: "ai_first", labelKey: "routing.options.executionMode.ai_first" }
] as const;
