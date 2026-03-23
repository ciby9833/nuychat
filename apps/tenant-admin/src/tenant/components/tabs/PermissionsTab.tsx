// 用于权限策略管理，展示不同角色的权限矩阵，并支持修改和保存
// 菜单路径：客户中心 -> 权限策略
// 作者：吴川
import { Button, Card, Space, Switch, Table, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";

import { listPermissionPolicies, updatePermissionPolicies } from "../../api";
import type { PermissionKey, PermissionPolicyResponse, PermissionRole } from "../../types";

type PolicyRow = {
  role: PermissionRole;
  values: Record<PermissionKey, boolean>;
};

const ROLE_LABEL: Record<PermissionRole, string> = {
  tenant_admin: "tenant_admin",
  admin: "admin",
  supervisor: "supervisor",
  senior_agent: "senior_agent",
  agent: "agent",
  readonly: "readonly"
};

export function PermissionsTab() {
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
      message.error((error as Error).message);
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
        message.info("没有变更");
        return;
      }
      await updatePermissionPolicies(updates);
      message.success(`已保存 ${updates.length} 项策略`);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="权限策略（D2）"
        extra={<Button type="primary" loading={saving} onClick={() => { void onSave(); }}>保存变更</Button>}
        loading={loading}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          支持角色：tenant_admin / supervisor / senior_agent / agent / readonly。此矩阵用于控制 Tenant Admin 能访问和修改的模块。
        </Typography.Paragraph>
        <Table<PolicyRow>
          rowKey="role"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1200 }}
          columns={[
            {
              title: "角色",
              dataIndex: "role",
              fixed: "left",
              width: 180,
              render: (role: PermissionRole) => <Tag color="blue">{ROLE_LABEL[role]}</Tag>
            },
            ...(data?.permissions ?? []).map((permission) => ({
              title: permission,
              key: permission,
              width: 160,
              render: (_: unknown, row: PolicyRow) => (
                <Switch
                  checked={row.values[permission]}
                  onChange={(checked) => onToggle(row.role, permission, checked)}
                />
              )
            }))
          ]}
        />
      </Card>
    </Space>
  );
}
