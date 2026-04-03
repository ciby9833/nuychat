// 作用: 坐席与成员数据加载 hook
// 菜单路径: 系统设置 -> 坐席与成员管理
// 作者：吴川

import { message } from "antd";
import { useCallback, useEffect, useState } from "react";

import { listAgents, listMembers } from "../../../api";
import type { AgentProfile, MemberListItem } from "../../../types";

export function useAgentsData() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRows, memberRows] = await Promise.all([listAgents(), listMembers()]);
      setAgents(agentRows);
      setMembers(memberRows);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { agents, members, loading, load };
}
