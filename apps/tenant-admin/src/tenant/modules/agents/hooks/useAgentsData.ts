// 作用: 坐席与成员数据加载 hook
// 菜单路径: 系统设置 -> 坐席与成员管理
// 交互: 聚合成员、坐席、WA 账号列表与 WA runtime 状态，供管理端同一区域联动展示。

import { message } from "antd";
import { useCallback, useEffect, useState } from "react";

import { getAdminWaRuntimeStatus, listAgents, listMembers, listWaAccounts } from "../../../api";
import type { AgentProfile, MemberListItem, WaAccountListItem, WaRuntimeStatus } from "../../../types";

export function useAgentsData() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [waAccounts, setWaAccounts] = useState<WaAccountListItem[]>([]);
  const [waRuntime, setWaRuntime] = useState<WaRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRows, memberRows, runtime] = await Promise.all([
        listAgents(),
        listMembers(),
        getAdminWaRuntimeStatus()
      ]);
      const waAccountRows = runtime.available ? await listWaAccounts() : [];
      setAgents(agentRows);
      setMembers(memberRows);
      setWaRuntime(runtime);
      setWaAccounts(waAccountRows);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { agents, members, waAccounts, waRuntime, loading, load };
}
