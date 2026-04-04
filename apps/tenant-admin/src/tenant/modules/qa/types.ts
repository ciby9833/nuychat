import type { Dayjs } from "dayjs";

import type { QaCaseDetail, QaDashboardData, QaGuideline, QaTaskItem } from "../../types";
import type { AgentProfile } from "../../types";

export type { AgentProfile, QaCaseDetail, QaDashboardData, QaGuideline, QaTaskItem };

export type QaQueueType = "risk" | "sample" | "auto_pass" | "reviewed" | "diff";

export type QaQueueFilters = {
  search: string;
  queueType: QaQueueType;
  agentIds: string[];
  dateRange: [Dayjs | null, Dayjs | null];
};

export type QaReviewAction = "confirm" | "modify" | "reject";

export type QaReviewFormValues = {
  action: QaReviewAction;
  totalScore?: number;
  verdict?: string;
  tags?: string;
  summary?: string;
};
