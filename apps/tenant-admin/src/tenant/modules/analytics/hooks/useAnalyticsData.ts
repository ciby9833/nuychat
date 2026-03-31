/**
 * 菜单路径与名称: 客户中心 -> Analytics / 数据统计
 * 文件职责: 管理 analytics 日期状态、日报数据加载、加载态与错误态。
 * 主要交互文件:
 * - ../AnalyticsTab.tsx
 * - ../../../api
 * - ../types.ts
 */

import { useCallback, useEffect, useState } from "react";

import { getTenantAnalyticsDailyReport } from "../../../api";
import type { DailyReport } from "../types";

export function useAnalyticsData(initialDate: string) {
  const [date, setDate] = useState(initialDate);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError("");
    try {
      setReport(await getTenantAnalyticsDailyReport(targetDate));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  return {
    date,
    report,
    loading,
    error,
    setDate,
    load
  };
}
