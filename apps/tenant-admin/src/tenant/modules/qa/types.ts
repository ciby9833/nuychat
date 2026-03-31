/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理
 * 文件职责: 统一导出 qa 模块使用的类型与表单类型。
 * 主要交互文件:
 * - ./QaTab.tsx
 * - ./components/QaFilterBar.tsx
 * - ./components/QaStatsCard.tsx
 * - ./components/QaReviewsTable.tsx
 * - ./modals/QaCreateModal.tsx
 * - ./modals/QaRulesModal.tsx
 * - ./hooks/useQaData.ts
 */

import type {
  AgentProfile,
  QaConversationOption,
  QaReviewItem,
  QaReviewListResponse,
  QaScoringRuleItem
} from "../../types";

export type { AgentProfile, QaConversationOption, QaReviewItem, QaReviewListResponse, QaScoringRuleItem };

export type ReviewFilter = {
  agentId?: string;
  tag?: string;
  minScore?: number;
};

export type QaCreateFormValues = {
  conversationId: string;
  caseId?: string;
  score: number;
  tags: string;
  note: string;
  status: "draft" | "published";
};

export type QaRulesFormValues = {
  rules: Array<{
    code: string;
    name: string;
    weight: number;
    isActive: boolean;
  }>;
};
