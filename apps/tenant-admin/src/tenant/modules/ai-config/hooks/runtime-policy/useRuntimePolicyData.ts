/**
 * 作用：负责 AI 运行策略宪法页的数据读取，只展示系统级边界信息，不再维护触发型规则。
 * 页面/菜单：租户管理端「AI 配置 > AI 运行策略」。
 */
import { useCallback, useEffect, useState } from "react";

import { getTenantAIRuntimePolicy } from "../../../../api";
import type { AIRuntimePolicy } from "../../../../types";

export function useRuntimePolicyData() {
  const [policy, setPolicy] = useState<AIRuntimePolicy | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await getTenantAIRuntimePolicy();
      setPolicy(next);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    policy,
    error,
    load
  };
}
