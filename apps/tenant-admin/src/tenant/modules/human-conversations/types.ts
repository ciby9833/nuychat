import type {
  HumanConversationDetail,
  HumanConversationListItem,
  SupervisorAgentStatus
} from "../../types";

export type { HumanConversationDetail, HumanConversationListItem, SupervisorAgentStatus };

export type DatePreset = "today" | "yesterday" | "last7d" | "custom";
export type Scope = "all" | "waiting" | "exception" | "active" | "resolved";
