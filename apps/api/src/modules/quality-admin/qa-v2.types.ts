export type QaTaskQueueType = "auto_pass" | "risk" | "sample";

export type QaTaskStatus =
  | "queued"
  | "ai_running"
  | "ai_completed"
  | "review_required"
  | "reviewed_confirmed"
  | "reviewed_modified"
  | "reviewed_rejected"
  | "skipped";

export type QaReviewMode = "ai_only" | "human_required" | "human_sampled";

export type QaTaskSource = "risk_trigger" | "auto_sampling" | "manual_assign" | "appeal_recheck";

export type QaTaskRow = {
  qa_task_id: string;
  tenant_id: string;
  case_id: string;
  source: QaTaskSource;
  review_mode: QaReviewMode;
  queue_type: QaTaskQueueType | null;
  status: QaTaskStatus;
  ai_status: string;
  risk_level: string | null;
  risk_reasons: unknown;
  confidence: number | null;
  recommended_action: string | null;
  assigned_reviewer_identity_id: string | null;
  guideline_id: string | null;
  guideline_version: number | null;
  created_at: string;
  updated_at: string;
};

export type QaAiReviewRecord = {
  score: number;
  verdict: string;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
  manualReviewRecommended: boolean;
  recommendedAction: "auto_pass" | "risk_review" | "sample_review";
  caseSummary: string;
  evidence: Array<{ messageId?: string | null; quote: string; reason: string }>;
  segmentReviews: Array<{
    segmentId: string;
    score: number;
    ownerType: string;
    tags: string[];
    comment: string;
    dimensionScores?: Record<string, number>;
  }>;
};

export type QaCaseSegment = {
  segmentId: string;
  ownerType: string;
  ownerAgentId: string | null;
  ownerAgentName: string | null;
  ownerAiAgentId: string | null;
  ownerAiAgentName: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  openedReason: string | null;
  closedReason: string | null;
  transferredFromSegmentId: string | null;
  messageCount: number;
};

export type QaCaseMessage = {
  messageId: string;
  segmentId: string | null;
  direction: string;
  senderType: string | null;
  senderId: string | null;
  senderName: string | null;
  createdAt: string;
  text: string;
};

export type QaCaseEvidence = {
  caseId: string;
  conversationId: string;
  customerId: string;
  customerName: string | null;
  customerRef: string | null;
  customerTier: string | null;
  channelType: string;
  title: string;
  summary: string | null;
  status: string;
  openedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastActivityAt: string | null;
  finalOwnerType: string | null;
  finalOwnerId: string | null;
  finalOwnerName: string | null;
  resolvedByAgentId: string | null;
  resolvedByAgentName: string | null;
  segmentCount: number;
  hasHumanSegments: boolean;
  hasAiSegments: boolean;
  reassignCount: number;
  hasSlaBreach: boolean;
  messages: QaCaseMessage[];
  segments: QaCaseSegment[];
};

export type QaGuidelineView = {
  guidelineId: string;
  name: string;
  contentMd: string;
  version: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};
