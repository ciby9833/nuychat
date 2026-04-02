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
  executionMode: "ai_first" | "human_first" | "ai_only" | "human_only" | "hybrid";
  targetDepartmentId?: string;
  targetTeamId?: string;
  targetSkillGroupCode: string;
  aiAgentId?: string;
  aiAssignmentStrategy: "round_robin" | "least_busy" | "sticky";
  assignmentStrategy: "round_robin" | "least_busy" | "balanced_new_case" | "sticky";
  humanToAiThresholdPct?: number;
  aiToHumanThresholdPct?: number;
  aiSoftConcurrencyLimit?: number;
  hybridStrategy?: "load_balanced" | "prefer_human" | "prefer_ai";
  customerRequestsHuman: "force_human" | "allow_policy";
  humanRequestKeywords?: string;
  aiUnhandled: "force_human" | "queue_human" | "allow_policy";
  fallbackDepartmentId?: string;
  fallbackTeamId?: string;
  fallbackSkillGroupCode?: string;
  fallbackAssignmentStrategy?: "round_robin" | "least_busy" | "balanced_new_case" | "sticky";
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
  { value: "ai_first", labelKey: "routing.options.executionMode.ai_first" },
  { value: "human_first", labelKey: "routing.options.executionMode.human_first" },
  { value: "ai_only", labelKey: "routing.options.executionMode.ai_only" },
  { value: "human_only", labelKey: "routing.options.executionMode.human_only" },
  { value: "hybrid", labelKey: "routing.options.executionMode.hybrid" }
] as const;

export const HYBRID_STRATEGY_OPTIONS = [
  { value: "load_balanced", labelKey: "routing.options.hybridStrategy.load_balanced" },
  { value: "prefer_human", labelKey: "routing.options.hybridStrategy.prefer_human" },
  { value: "prefer_ai", labelKey: "routing.options.hybridStrategy.prefer_ai" }
] as const;

export const OVERRIDE_OPTIONS = [
  { value: "force_human", labelKey: "routing.options.override.force_human" },
  { value: "allow_policy", labelKey: "routing.options.override.allow_policy" }
] as const;

export const AI_UNHANDLED_OPTIONS = [
  { value: "force_human", labelKey: "routing.options.aiUnhandled.force_human" },
  { value: "queue_human", labelKey: "routing.options.aiUnhandled.queue_human" },
  { value: "allow_policy", labelKey: "routing.options.aiUnhandled.allow_policy" }
] as const;
