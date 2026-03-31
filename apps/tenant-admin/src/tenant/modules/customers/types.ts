/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理
 * 文件职责: 统一导出 customers 模块使用的类型与表单类型。
 * 主要交互文件:
 * - ./CustomersTab.tsx
 * - ./components/CustomersFilterBar.tsx
 * - ./components/CustomersTable.tsx
 * - ./components/CustomerTagsCard.tsx
 * - ./components/CustomerSegmentsTable.tsx
 * - ./modals/CustomerTagsModal.tsx
 * - ./modals/CustomerSegmentModal.tsx
 */

import type {
  CustomerListItem,
  CustomerListResponse,
  CustomerSegmentItem,
  CustomerTagItem
} from "../../types";

export type { CustomerListItem, CustomerListResponse, CustomerSegmentItem, CustomerTagItem };

export type CustomersFilters = {
  search?: string;
  tagId?: string;
  segmentId?: string;
};

export type CustomerTagFormValues = {
  code: string;
  name: string;
  color?: string;
  description?: string;
};

export type CustomerSegmentFormValues = {
  code: string;
  name: string;
  description?: string;
  tagsAny?: string;
  minConversationCount?: number;
  minTaskCount?: number;
  minCaseCount?: number;
  minOpenCaseCount?: number;
  daysSinceLastConversationGte?: number;
  daysSinceLastCaseActivityGte?: number;
};
