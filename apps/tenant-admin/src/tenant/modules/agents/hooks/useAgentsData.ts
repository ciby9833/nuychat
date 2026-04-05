// 作用: 坐席与成员数据加载 hook
// 菜单路径: 系统设置 -> 坐席与成员管理
// 交互: 聚合成员、坐席、WA 账号列表，供管理端同一区域联动展示。

import { message } from "antd";
import { useCallback, useEffect, useState } from "react";

import { listAgents, listMembers, listWaAccounts } from "../../../api";
import type { AgentProfile, MemberListItem, WaAccountListItem } from "../../../types";

export function useAgentsData() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [waAccounts, setWaAccounts] = useState<WaAccountListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRows, memberRows, waAccountRows] = await Promise.all([
        listAgents(),
        listMembers(),
        listWaAccounts()
      ]);
      setAgents(agentRows);
      setMembers(memberRows);
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

  return { agents, members, waAccounts, loading, load };
}
