/**
 * 菜单路径与名称: 客户中心 -> Overview / 概览
 * 文件职责: 负责概览数据加载、错误状态维护，以及会话状态分布数据的派生。
 * 主要交互文件:
 * - ../OverviewTab.tsx
 * - ../components/OverviewSummaryCards.tsx
 * - ../components/OverviewStatusTable.tsx
 * - ../../../api
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../../api";
import type { OverviewData, StatusRow } from "../types";

export function useOverviewData() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<OverviewData>("/api/admin/overview"));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusRows = useMemo<StatusRow[]>(() => {
    if (!data) return [];
    return Object.entries(data.conversations.byStatus).map(([status, count]) => ({ status, count }));
  }, [data]);

  return {
    data,
    error,
    statusRows,
    load
  };
}
