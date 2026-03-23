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
  { value: "least_busy", label: "最小负载" },
  { value: "balanced_new_case", label: "均衡新事项" },
  { value: "round_robin", label: "轮询" },
  { value: "sticky", label: "粘性分配" }
] as const;

export const AI_STRATEGY_OPTIONS = [
  { value: "least_busy", label: "最小负载" },
  { value: "round_robin", label: "轮询" },
  { value: "sticky", label: "粘性分配" }
] as const;

export const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "web", label: "Web Chat" },
  { value: "telegram", label: "Telegram" }
];

export const LANGUAGE_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" }
];

export const TIER_OPTIONS = [
  { value: "vip", label: "VIP" },
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" }
];

export const MODULE_MODE_OPTIONS = [
  { value: "ai_first", label: "AI 优先" },
  { value: "human_first", label: "人工优先" },
  { value: "ai_autonomous", label: "AI 自主" },
  { value: "workflow_first", label: "工作流优先" }
] as const;

export const EXECUTION_MODE_OPTIONS = [
  { value: "ai_first", label: "AI 优先" },
  { value: "human_first", label: "人工优先" },
  { value: "ai_only", label: "仅 AI" },
  { value: "human_only", label: "仅人工" },
  { value: "hybrid", label: "混合" }
] as const;

export const HYBRID_STRATEGY_OPTIONS = [
  { value: "load_balanced", label: "按负载均衡" },
  { value: "prefer_human", label: "优先人工" },
  { value: "prefer_ai", label: "优先 AI" }
] as const;

export const OVERRIDE_OPTIONS = [
  { value: "force_human", label: "强制人工" },
  { value: "allow_policy", label: "仍按策略" }
] as const;

export const AI_UNHANDLED_OPTIONS = [
  { value: "force_human", label: "强制人工" },
  { value: "queue_human", label: "进入人工队列" },
  { value: "allow_policy", label: "仍按策略" }
] as const;
