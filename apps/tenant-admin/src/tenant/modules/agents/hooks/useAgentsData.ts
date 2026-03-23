// 作用: 坐席与成员数据加载 hook
// 菜单路径: 系统设置 -> 坐席与成员管理
// 作者：吴川

import { message } from "antd";
import { useCallback, useEffect, useState } from "react";

import { api, listAgents, listMembers } from "../../../api";
import type { AgentProfile, MemberListItem, SkillGroup } from "../../../types";

export function useAgentsData() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRows, memberRows, groupRows] = await Promise.all([
        listAgents(),
        listMembers(),
        api<SkillGroup[]>("/api/admin/skill-groups")
      ]);
      setAgents(agentRows);
      setMembers(memberRows);
      setGroups(groupRows);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { agents, members, groups, loading, load };
}
