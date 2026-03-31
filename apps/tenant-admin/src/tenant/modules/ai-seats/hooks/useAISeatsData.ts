/**
 * 菜单路径与名称: 客户中心 -> AI 座席
 * 文件职责: 负责 AI 座席列表与摘要数据加载，以及新建、编辑、启停、删除动作。
 * 主要交互文件:
 * - ../AISeatsTab.tsx: 消费 rows、summary、error、busy 和动作方法。
 * - ../types.ts: 提供 AISeatsFormValues 和错误文案转换。
 * - ../../../api: 提供 list/create/patch/delete AI 座席接口。
 */

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
