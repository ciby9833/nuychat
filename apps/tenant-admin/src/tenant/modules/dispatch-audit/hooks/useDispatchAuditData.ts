// 作用: 调度审计数据加载、筛选、详情查看 hook
// 菜单路径: 客户中心 -> 调度审计
// 作者：吴川

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getDispatchExecutionDetail, listDispatchExecutions, listDispatchOpsSuggestions } from "../../../api";
import type { DispatchExecutionDetail, DispatchExecutionListItem, DispatchOpsSuggestionGroup } from "../../../types";
import type { DatePreset, RangeValue } from "../types";

export function useDispatchAuditData() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DispatchExecutionListItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [triggerType, setTriggerType] = useState<string | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<RangeValue>([dayjs(), dayjs()]);
  const [selected, setSelected] = useState<DispatchExecutionDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<DispatchOpsSuggestionGroup>({
    aiAgents: [],
    teams: [],
    customerSegments: []
  });

  const range = useMemo(() => {
    if (datePreset === "custom") {
      return {
        from: customRange?.[0]?.format("YYYY-MM-DD"),
        to: customRange?.[1]?.format("YYYY-MM-DD")
      };
    }

    const today = dayjs();
    if (datePreset === "yesterday") {
      const yesterday = today.subtract(1, "day").format("YYYY-MM-DD");
      return { from: yesterday, to: yesterday };
    }
    if (datePreset === "last7d") {
      return {
        from: today.subtract(6, "day").format("YYYY-MM-DD"),
        to: today.format("YYYY-MM-DD")
      };
    }
    const current = today.format("YYYY-MM-DD");
    return { from: current, to: current };
  }, [customRange, datePreset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, suggestionData] = await Promise.all([
        listDispatchExecutions({
          caseId: caseId.trim() || undefined,
          conversationId: conversationId.trim() || undefined,
          triggerType,
          from: range.from,
          to: range.to
        }),
        listDispatchOpsSuggestions({
          from: range.from,
          to: range.to
        })
      ]);
      setItems(data.items);
      setSuggestions(suggestionData.groups);
    } finally {
      setLoading(false);
    }
  }, [caseId, conversationId, triggerType, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (executionId: string) => {
    setDetailLoading(true);
    setDrawerOpen(true);
    try {
      const data = await getDispatchExecutionDetail(executionId);
      setSelected(data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDrawerOpen(false);
    setSelected(null);
  }, []);

  const stats = useMemo(() => ({
    total: items.length,
    ai: items.filter((item) => item.decisionType === "ai_selection").length,
    manual: items.filter((item) => item.decisionType === "manual_transition").length
  }), [items]);

  return {
    loading, items, stats, suggestions,
    caseId, setCaseId, conversationId, setConversationId,
    triggerType, setTriggerType,
    datePreset, setDatePreset, customRange, setCustomRange,
    selected, drawerOpen, detailLoading,
    load, openDetail, closeDetail
  };
}
