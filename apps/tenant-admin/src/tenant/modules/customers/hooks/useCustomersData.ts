/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理
 * 文件职责: 负责客户、标签、分组数据加载，以及标签分配、标签创建、分组创建、状态切换等操作。
 * 主要交互文件:
 * - ../CustomersTab.tsx
 * - ../components/CustomerTagsCard.tsx
 * - ../components/CustomerSegmentsTable.tsx
 * - ../../../api
 */

import { Form, message } from "antd";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";

import {
  applySegment,
  assignCustomerTags,
  createCustomerSegment,
  createCustomerTag,
  listCustomerSegments,
  listCustomers,
  listCustomerTags,
  patchCustomerSegment,
  patchCustomerTag
} from "../../../api";
import type {
  CustomerListItem,
  CustomerListResponse,
  CustomerSegmentFormValues,
  CustomerSegmentItem,
  CustomerTagFormValues,
  CustomerTagItem,
  CustomersFilters
} from "../types";

const DEFAULT_PAGE_SIZE = 30;

function buildSegmentRule(values: CustomerSegmentFormValues) {
  const tagsAny = values.tagsAny
    ? values.tagsAny.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
    : [];

  const rule: Record<string, unknown> = {};
  if (tagsAny.length > 0) rule.tagsAny = tagsAny;
  if (values.minConversationCount) rule.minConversationCount = values.minConversationCount;
  if (values.minTaskCount) rule.minTaskCount = values.minTaskCount;
  if (values.minCaseCount) rule.minCaseCount = values.minCaseCount;
  if (values.minOpenCaseCount) rule.minOpenCaseCount = values.minOpenCaseCount;
  if (values.daysSinceLastConversationGte) rule.daysSinceLastConversationGte = values.daysSinceLastConversationGte;
  if (values.daysSinceLastCaseActivityGte) rule.daysSinceLastCaseActivityGte = values.daysSinceLastCaseActivityGte;
  return rule;
}

export function useCustomersData() {
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<CustomersFilters>({});
  const [customers, setCustomers] = useState<CustomerListResponse | null>(null);
  const [tags, setTags] = useState<CustomerTagItem[]>([]);
  const [segments, setSegments] = useState<CustomerSegmentItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [segmentModalOpen, setSegmentModalOpen] = useState(false);
  const [assignTagIds, setAssignTagIds] = useState<string[]>([]);
  const [tagForm] = Form.useForm<CustomerTagFormValues>();
  const [segmentForm] = Form.useForm<CustomerSegmentFormValues>();

  const load = useCallback(async (nextFilters: CustomersFilters = filters) => {
    setLoading(true);
    try {
      const [customerData, tagData, segmentData] = await Promise.all([
        listCustomers({ ...nextFilters, page: 1, pageSize: DEFAULT_PAGE_SIZE }),
        listCustomerTags({ active: true }),
        listCustomerSegments({ active: true })
      ]);
      setCustomers(customerData);
      setTags(tagData);
      setSegments(segmentData);
    } catch (err) {
      void message.error(i18next.t("customersModule.messages.loadTagDataFailed", { message: (err as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCustomerPage = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const customerData = await listCustomers({ ...filters, page, pageSize });
      setCustomers(customerData);
    } catch (err) {
      void message.error(i18next.t("customersModule.messages.loadCustomersFailed", { message: (err as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const openAssignModal = useCallback((customer: CustomerListItem) => {
    setSelectedCustomer(customer);
    setAssignTagIds(customer.tags.map((tag) => tag.tagId));
    setTagModalOpen(true);
  }, []);

  const submitAssignTags = useCallback(async () => {
    if (!selectedCustomer) return;
    try {
      await assignCustomerTags(selectedCustomer.customerId, { tagIds: assignTagIds, source: "manual" });
      void message.success(i18next.t("customersModule.messages.tagsUpdated"));
      setTagModalOpen(false);
      await load(filters);
    } catch (err) {
      void message.error(i18next.t("customersModule.messages.saveFailed", { message: (err as Error).message }));
    }
  }, [assignTagIds, filters, load, selectedCustomer]);

  const submitCreateTag = useCallback(async () => {
    const values = await tagForm.validateFields();
    try {
      await createCustomerTag(values);
      void message.success(i18next.t("customersModule.messages.tagCreated"));
      tagForm.resetFields();
      await load(filters);
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [filters, load, tagForm]);

  const submitCreateSegment = useCallback(async () => {
    const values = await segmentForm.validateFields();
    try {
      await createCustomerSegment({
        code: values.code,
        name: values.name,
        description: values.description,
        rule: buildSegmentRule(values),
        isActive: true
      });
      void message.success(i18next.t("customersModule.messages.segmentCreated"));
      segmentForm.resetFields();
      setSegmentModalOpen(false);
      await load(filters);
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [filters, load, segmentForm]);

  const toggleTagStatus = useCallback(async (tag: CustomerTagItem) => {
    try {
      await patchCustomerTag(tag.tagId, { isActive: !tag.isActive });
      await load(filters);
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [filters, load]);

  const runSegment = useCallback(async (segment: CustomerSegmentItem) => {
    try {
      const firstTag = tags.find((tag) => tag.code === String((segment.rule.tagsAny as string[] | undefined)?.[0] ?? ""));
      const result = await applySegment(segment.segmentId, firstTag ? { applyTagId: firstTag.tagId } : {});
      void message.success(i18next.t("customersModule.messages.matchedCustomers", { count: result.matchedCount }));
      await load(filters);
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [filters, load, tags]);

  const toggleSegmentStatus = useCallback(async (segment: CustomerSegmentItem) => {
    try {
      await patchCustomerSegment(segment.segmentId, { isActive: !segment.isActive });
      await load(filters);
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [filters, load]);

  return {
    loading,
    filters,
    customers,
    tags,
    segments,
    selectedCustomer,
    tagModalOpen,
    segmentModalOpen,
    assignTagIds,
    tagForm,
    segmentForm,
    setFilters,
    setTagModalOpen,
    setSegmentModalOpen,
    setAssignTagIds,
    load,
    loadCustomerPage,
    openAssignModal,
    submitAssignTags,
    submitCreateTag,
    submitCreateSegment,
    toggleTagStatus,
    runSegment,
    toggleSegmentStatus
  };
}
