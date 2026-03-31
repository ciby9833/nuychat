/**
 * 菜单路径与名称: 客户中心 -> Cases / 会话事项
 * 文件职责: 管理事项列表查询条件、分页请求、加载态与错误提示。
 * 主要交互文件:
 * - ../CasesTab.tsx
 * - ../../../api
 * - ../types.ts
 */

import { message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { listConversationCases } from "../../../api";
import type { ConversationCaseListResponse } from "../types";

type LoadCasesInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
};

export function useCasesData() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [data, setData] = useState<ConversationCaseListResponse | null>(null);

  const load = useCallback(async (next?: LoadCasesInput) => {
    setLoading(true);
    try {
      const result = await listConversationCases({
        page: next?.page ?? 1,
        pageSize: next?.pageSize ?? data?.pageSize ?? 20,
        search: next?.search ?? (search.trim() || undefined),
        status: next?.status ?? status
      });
      setData(result);
    } catch (error) {
      void message.error(`${t("cases.loadError")}: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [data?.pageSize, search, status, t]);

  useEffect(() => {
    void load({ page: 1, pageSize: 20 });
  }, [load]);

  return {
    loading,
    search,
    status,
    data,
    setSearch,
    setStatus,
    load
  };
}
