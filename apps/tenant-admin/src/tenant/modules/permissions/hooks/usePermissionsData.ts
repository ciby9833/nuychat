/**
 * 菜单路径与名称: 客户中心 -> Permissions / 权限策略
 * 文件职责: 负责权限策略数据加载、草稿态维护、矩阵行派生与保存逻辑。
 * 主要交互文件:
 * - ../PermissionsTab.tsx
 * - ../components/PermissionsMatrixTable.tsx
 * - ../../../api
 */

import { message } from "antd";
import { useEffect, useMemo, useState } from "react";

import { listPermissionPolicies, updatePermissionPolicies } from "../../../api";
import type { PermissionKey, PermissionPolicyResponse, PermissionRole, PolicyRow } from "../types";

export function usePermissionsData() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PermissionPolicyResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await listPermissionPolicies();
      setData(res);
      const nextDraft: Record<string, boolean> = {};
      for (const item of res.items) {
        nextDraft[`${item.role}:${item.permissionKey}`] = item.isAllowed;
      }
      setDraft(nextDraft);
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo<PolicyRow[]>(() => {
    if (!data) return [];
    return data.roles.map((role) => {
      const values = {} as Record<PermissionKey, boolean>;
      for (const permission of data.permissions) {
        values[permission] = Boolean(draft[`${role}:${permission}`]);
      }
      return { role, values };
    });
  }, [data, draft]);

  const onToggle = (role: PermissionRole, permission: PermissionKey, checked: boolean) => {
    setDraft((prev) => ({ ...prev, [`${role}:${permission}`]: checked }));
  };

  const onSave = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const updates: Array<{ role: string; permissionKey: string; isAllowed: boolean }> = [];
      for (const role of data.roles) {
        for (const permissionKey of data.permissions) {
          const key = `${role}:${permissionKey}`;
          const current = Boolean(draft[key]);
          const original = data.items.find((item) => item.role === role && item.permissionKey === permissionKey)?.isAllowed ?? false;
          if (current !== original) {
            updates.push({ role, permissionKey, isAllowed: current });
          }
        }
      }
      if (updates.length === 0) {
        void message.info("没有变更");
        return;
      }
      await updatePermissionPolicies(updates);
      void message.success(`已保存 ${updates.length} 项策略`);
      await load();
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return {
    loading,
    saving,
    data,
    rows,
    load,
    onToggle,
    onSave
  };
}
