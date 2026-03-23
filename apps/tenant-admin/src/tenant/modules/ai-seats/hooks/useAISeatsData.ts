// 作用: AI 座席数据加载与 CRUD 操作 hook
// 菜单路径: 客户中心 -> AI 座席管理
// 作者：吴川

import { useCallback, useEffect, useState } from "react";

import {
  createTenantAIAgent,
  deleteTenantAIAgent,
  listTenantAIAgents,
  patchTenantAIAgent
} from "../../../api";
import type { TenantAIAgent, TenantAIAgentListResponse } from "../../../types";
import type { AISeatsFormValues } from "../types";
import { getAISeatErrorMessage } from "../types";

export function useAISeatsData() {
  const [data, setData] = useState<TenantAIAgentListResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await listTenantAIAgents());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (values: AISeatsFormValues, selected: TenantAIAgent | null) => {
    setBusy(true);
    setError("");
    try {
      if (selected) {
        await patchTenantAIAgent(selected.aiAgentId, values);
      } else {
        await createTenantAIAgent(values);
      }
      await load();
      return true;
    } catch (err) {
      setError(getAISeatErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (item: TenantAIAgent) => {
    try {
      await patchTenantAIAgent(item.aiAgentId, { status: item.status === "active" ? "inactive" : "active" });
      await load();
    } catch (err) {
      setError(getAISeatErrorMessage(err));
    }
  };

  const remove = async (aiAgentId: string) => {
    try {
      await deleteTenantAIAgent(aiAgentId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const rows = data?.items ?? [];
  const summary = data?.summary ?? null;

  return { rows, summary, error, busy, load, save, toggleStatus, remove };
}
